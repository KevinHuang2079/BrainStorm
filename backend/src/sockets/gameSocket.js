const Game = require('../models/Game');
const jwt = require('jsonwebtoken');
const cardCache = require('../services/r2cardCache');

const gameActivityTimers = new Map();
const INACTIVITY_WARNING_TIME = 600000;
const INACTIVITY_CLOSE_TIME = 300000;

module.exports = (io) => {
    io.use(async (socket, next) => {
        const startTime = Date.now();
        try {
            const token = socket.handshake.auth.token;
            
            if (!token) {
                console.log('No token provided');
                return next(new Error('No token provided'));
            }
            
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            console.log('Decoded token:', decoded);
            socket.userId = decoded._id.toString();
            socket.username = decoded.username;
            
            if (!socket.userId) {
                console.error('No userId found in token. Token contents:', decoded);
                return next(new Error('Invalid token: missing userId'));
            }
            
            const duration = Date.now() - startTime;
            console.log(`[AUTH] ${socket.username} authenticated in ${duration}ms`);
            next();
        } catch (err) {
            console.error('Authentication error:', err.message);
            next(new Error('Authentication error: ' + err.message));
        }
    });

    function stripCardForStorage(card) {
        if (!card) return card;
        
        return {
            _id: card._id,
            scryfallId: card.scryfallId,
            position: card.position,
            zIndex: card.zIndex,
            isTapped: card.isTapped,
            isFaceDown: card.isFaceDown,
            currentFaceIndex: card.currentFaceIndex,
            counters: card.counters,
            isClone: card.isClone,
            isToken: card.isToken
        };
    }

    function stripCardArrayForStorage(cards) {
        if (!Array.isArray(cards)) return cards;
        return cards.map(card => stripCardForStorage(card));
    }

    function stripPlayerStateForStorage(playerState) {
        if (!playerState || typeof playerState !== 'object') return playerState;
        
        const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'facedown', 'sideboard'];
        const stripped = { ...playerState };
        
        for (const zone of zones) {
            if (stripped[zone]) {
                stripped[zone] = stripCardArrayForStorage(stripped[zone]);
            }
        }
        
        return stripped;
    }

    async function hydrateCard(card) {
        if (!card || !card.scryfallId) return card;
        
        const cardData = await cardCache.fetch(card.scryfallId);
        if (!cardData) return card;
        
        return {
            ...cardData,
            ...card,
            _id: card._id
        };
    }

    async function hydrateCardArray(cards) {
        if (!Array.isArray(cards) || cards.length === 0) return cards;
        
        const scryfallIds = cards.filter(card => card && card.scryfallId).map(card => card.scryfallId);
        if (scryfallIds.length === 0) return cards;
        
        const cardMap = await cardCache.batchFetch(scryfallIds);
        
        return cards.map(card => {
            if (card && card.scryfallId && cardMap[card.scryfallId]) {
                return {
                    ...cardMap[card.scryfallId],
                    ...card,
                    _id: card._id
                };
            }
            return card;
        });
    }

    async function hydratePlayerState(playerState) {
        if (!playerState || typeof playerState !== 'object') return playerState;
        
        const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'facedown', 'sideboard'];
        const hydrated = { ...playerState };
        
        for (const zone of zones) {
            if (hydrated[zone]) {
                hydrated[zone] = await hydrateCardArray(hydrated[zone]);
            }
        }
        
        return hydrated;
    }

    async function hydrateActionData(data) {
        if (!data) return data;
        
        if (Array.isArray(data)) {
            return await hydrateCardArray(data);
        }
        
        if (typeof data === 'object' && data.scryfallId) {
            return await hydrateCard(data);
        }
        
        return data;
    }

    function resetGameActivityTimer(gameId) {
        if (gameActivityTimers.has(gameId)) {
            const { warningTimer, closeTimer } = gameActivityTimers.get(gameId);
            clearTimeout(warningTimer);
            clearTimeout(closeTimer);
        }

        const warningTimer = setTimeout(() => {
            io.to(`game:${gameId}`).emit('game:inactivityWarning', {
                timeRemaining: INACTIVITY_CLOSE_TIME - INACTIVITY_WARNING_TIME
            });

            const closeTimer = setTimeout(async () => {
                try {
                    const game = await Game.findById(gameId);
                    if (game) {
                        io.to(`game:${gameId}`).emit('game:closedDueToInactivity');
                        await Game.findByIdAndDelete(gameId);
                        gameActivityTimers.delete(gameId);
                        const games = await getActiveGames();
                        io.emit('games:list', games);
                    }
                } catch (err) {
                    console.error('Error closing inactive game:', err);
                }
            }, INACTIVITY_CLOSE_TIME - INACTIVITY_WARNING_TIME);

            gameActivityTimers.set(gameId, { warningTimer, closeTimer });
        }, INACTIVITY_WARNING_TIME);

        gameActivityTimers.set(gameId, { warningTimer, closeTimer: null });
    }

    function clearGameActivityTimer(gameId) {
        if (gameActivityTimers.has(gameId)) {
            const { warningTimer, closeTimer } = gameActivityTimers.get(gameId);
            clearTimeout(warningTimer);
            if (closeTimer) clearTimeout(closeTimer);
            gameActivityTimers.delete(gameId);
        }
    }

    io.on('connection', async (socket) => {
        console.log('Client connected:', socket.id, 'User:', socket.username, 'ID:', socket.userId);
        
        const startTime = Date.now();
        const games = await getActiveGames();
        const duration = Date.now() - startTime;
        console.log(`[PERF] getActiveGames: ${duration}ms`);
        socket.emit('games:list', games);
        
        socket.on('game:create', async (gameData) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:create from ${socket.username}`);
                
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const dbStart = Date.now();
                const newGame = new Game({
                    name: gameData.name,
                    host: socket.userId,
                    players: [socket.userId],
                    connectedPlayers: [socket.userId],
                    format: gameData.format,
                    maxPlayers: gameData.maxPlayers || 4,
                    gameStarted: false
                });
                
                await newGame.save();
                const dbDuration = Date.now() - dbStart;
                console.log(`[PERF] game:create DB save: ${dbDuration}ms`);
                
                socket.join(`game:${newGame._id}`);
                
                resetGameActivityTimer(newGame._id.toString());
                
                const gamesStart = Date.now();
                const games = await getActiveGames();
                const gamesDuration = Date.now() - gamesStart;
                console.log(`[PERF] game:create getActiveGames: ${gamesDuration}ms`);
                io.emit('games:list', games);
                
                const populateStart = Date.now();
                const populatedGame = await Game.findById(newGame._id)
                    .populate('host', 'username')
                    .populate('players', 'username')
                    .populate('connectedPlayers', 'username')
                    .populate('currentTurn', 'username');
                const populateDuration = Date.now() - populateStart;
                console.log(`[PERF] game:create populate: ${populateDuration}ms`);
                    
                socket.emit('game:joined', populatedGame);
                
                const totalDuration = Date.now() - totalStart;
                console.log(`[PERF] game:create TOTAL: ${totalDuration}ms`);
            } catch (err) {
                console.error('Create game error:', err);
                socket.emit('error', { message: 'Failed to create game: ' + err.message });
            }
        });
        
        socket.on('game:join', async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:join ${gameId} from ${socket.username}`);
                
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const dbStart = Date.now();
                const game = await Game.findById(gameId)
                    .populate('players', 'username')
                    .populate('host', 'username')
                    .populate('connectedPlayers', 'username')
                    .populate('currentTurn', 'username');
                const dbDuration = Date.now() - dbStart;
                console.log(`[PERF] game:join DB query: ${dbDuration}ms`);
                
                if (!game) {
                    return socket.emit('error', { message: 'Game not found' });
                }
                
                const isAlreadyPlayer = game.players.some(p => p._id.toString() === socket.userId);
                const isConnected = game.connectedPlayers.some(p => p.toString() === socket.userId);
                
                if (!isAlreadyPlayer && game.players.length >= game.maxPlayers) {
                    return socket.emit('error', { message: 'Game is full' });
                }

                if (!isAlreadyPlayer && game.status === 'active') {
                    return socket.emit('error', { message: 'Game has already started' });
                }
                
                if (!isAlreadyPlayer) {
                    game.players.push(socket.userId);
                }
                
                if (!isConnected) {
                    game.connectedPlayers.push(socket.userId);
                }
                
                const saveStart = Date.now();
                await game.save();
                await game.populate('players', 'username');
                await game.populate('connectedPlayers', 'username');
                await game.populate('currentTurn', 'username');
                const saveDuration = Date.now() - saveStart;
                console.log(`[PERF] game:join save & populate: ${saveDuration}ms`);
                
                socket.join(`game:${gameId}`);
                
                resetGameActivityTimer(gameId);
                
                const gamesStart = Date.now();
                const games = await getActiveGames();
                const gamesDuration = Date.now() - gamesStart;
                console.log(`[PERF] game:join getActiveGames: ${gamesDuration}ms`);
                io.emit('games:list', games);
                
                let gameObject = game.toObject();

                if (gameObject.savedState) {
                    const hydrateStart = Date.now();
                    const hydratedSavedState = {};
                    for (const [playerId, playerState] of Object.entries(gameObject.savedState)) {
                        hydratedSavedState[playerId] = await hydratePlayerState(playerState);
                    }
                    gameObject.savedState = hydratedSavedState;
                    const hydrateDuration = Date.now() - hydrateStart;
                    console.log(`[PERF] game:join hydration: ${hydrateDuration}ms`);
                }
                
                socket.emit('game:joined', gameObject);
                
                if (!isAlreadyPlayer) {
                    socket.to(`game:${gameId}`).emit('game:playerJoined', gameObject);
                }
                
                socket.to(`game:${gameId}`).emit('game:requestSync', {
                    reason: isAlreadyPlayer ? 'player_reconnected' : 'player_joined',
                    playerId: socket.userId,
                    username: socket.username
                });
                
                const totalDuration = Date.now() - totalStart;
                console.log(`[PERF] game:join TOTAL: ${totalDuration}ms`);
            } catch (err) {
                console.error('Join game error:', err);
                socket.emit('error', { message: 'Failed to join game: ' + err.message });
            }
        });

        socket.on('game:action', async ({ gameId, action, data }) => {
            const totalStart = Date.now();
            try {
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const dbStart = Date.now();
                const game = await Game.findById(gameId);
                const dbDuration = Date.now() - dbStart;
                
                if (!game) {
                    return socket.emit('error', { message: 'Game not found' });
                }
                
                if (!game.players.some(p => p.toString() === socket.userId)) {
                    return socket.emit('error', { message: 'You are not in this game' });
                }

                resetGameActivityTimer(gameId);

                const allowedActions = [
                    'loadDeck',
                    'drawCard',
                    'play',
                    'move',
                    'repositionCard',
                    'toggleAltFace',
                    'tapCard',
                    'toggleFaceDown',
                    'shakeCard',
                    'shuffleLibrary',
                    'scoopDeck',
                    'addCounter',
                    'removeCounter',
                    'incrementCounter',
                    'cloneCard',
                    'rollDice',
                    'changeLifeTotal'
                ];

                if (!allowedActions.includes(action)) {
                    console.warn(`Unknown action '${action}' from ${socket.username}`);
                }

                const hydrateStart = Date.now();
                const hydratedData = await hydrateActionData(data);
                const hydrateDuration = Date.now() - hydrateStart;

                if (action === 'rollDice') {
                    io.to(`game:${gameId}`).emit('game:diceRolled', {
                        username: socket.username,
                        result: hydratedData.result,
                        sides: hydratedData.sides,
                        timestamp: Date.now()
                    });
                } else {
                    socket.to(`game:${gameId}`).emit('game:action', {
                        username: socket.username,
                        playerId: socket.userId,
                        action: action,
                        data: hydratedData,
                        timestamp: Date.now()
                    });
                }
                
                const totalDuration = Date.now() - totalStart;
                console.log(`[PERF] game:action ${action}: DB=${dbDuration}ms, Hydrate=${hydrateDuration}ms, TOTAL=${totalDuration}ms`);
                
            } catch (err) {
                console.error('Game action error:', err);
                socket.emit('error', { message: 'Failed to process action: ' + err.message });
            }
        });

        socket.on('game:startGame', async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:startGame ${gameId} from ${socket.username}`);
                
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const dbStart = Date.now();
                const game = await Game.findById(gameId)
                    .populate('host', 'username')
                    .populate('players', 'username')
                    .populate('connectedPlayers', 'username');
                const dbDuration = Date.now() - dbStart;
                console.log(`[PERF] game:startGame DB query: ${dbDuration}ms`);
                
                if (!game) {
                    return socket.emit('error', { message: 'Game not found' });
                }
                
                if (game.host._id.toString() !== socket.userId) {
                    return socket.emit('error', { message: 'Only the host can start the game' });
                }
                
                if (game.status === 'active') {
                    return socket.emit('error', { message: 'Game has already started' });
                }
                
                const randomIndex = Math.floor(Math.random() * game.players.length);
                const startingPlayer = game.players[randomIndex];
                
                game.currentTurn = startingPlayer._id;
                game.status = 'active';
                
                const saveStart = Date.now();
                await game.save();
                await game.populate('currentTurn', 'username');
                const saveDuration = Date.now() - saveStart;
                console.log(`[PERF] game:startGame save: ${saveDuration}ms`);
                
                resetGameActivityTimer(gameId);
                
                io.to(`game:${gameId}`).emit('game:started', {
                    game,
                    startingPlayer: startingPlayer.username
                });
                
                const totalDuration = Date.now() - totalStart;
                console.log(`[PERF] game:startGame TOTAL: ${totalDuration}ms`);
                
            } catch (err) {
                console.error('Start game error:', err);
                socket.emit('error', { message: 'Failed to start game: ' + err.message });
            }
        });

        socket.on('game:endTurn', async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:endTurn ${gameId} from ${socket.username}`);
                
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const dbStart = Date.now();
                const game = await Game.findById(gameId)
                    .populate('players', 'username')
                    .populate('currentTurn', 'username');
                const dbDuration = Date.now() - dbStart;
                console.log(`[PERF] game:endTurn DB query: ${dbDuration}ms`);
                
                if (!game) {
                    return socket.emit('error', { message: 'Game not found' });
                }
                
                if (game.status !== 'active') {
                    return socket.emit('error', { message: 'Game has not started yet' });
                }
                
                if (!game.players.some(p => p._id.toString() === socket.userId)) {
                    return socket.emit('error', { message: 'You are not in this game' });
                }
                
                if (game.currentTurn && game.currentTurn._id.toString() !== socket.userId) {
                    return socket.emit('error', { message: 'It is not your turn' });
                }
                
                const currentIndex = game.players.findIndex(p => p._id.toString() === socket.userId);
                const nextIndex = (currentIndex + 1) % game.players.length;
                const nextPlayer = game.players[nextIndex];
                
                game.currentTurn = nextPlayer._id;
                
                const saveStart = Date.now();
                await game.save();
                await game.populate('currentTurn', 'username');
                const saveDuration = Date.now() - saveStart;
                console.log(`[PERF] game:endTurn save: ${saveDuration}ms`);
                
                resetGameActivityTimer(gameId);
                
                io.to(`game:${gameId}`).emit('game:turnChanged', {
                    currentTurn: game.currentTurn,
                    username: game.currentTurn.username
                });
                
                const totalDuration = Date.now() - totalStart;
                console.log(`[PERF] game:endTurn TOTAL: ${totalDuration}ms`);
                
            } catch (err) {
                console.error('End turn error:', err);
                socket.emit('error', { message: 'Failed to end turn: ' + err.message });
            }
        });
        
        socket.on('game:leave', async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:leave ${gameId} from ${socket.username}`);
                
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const dbStart = Date.now();
                const game = await Game.findById(gameId);
                const dbDuration = Date.now() - dbStart;
                
                if (!game) return;
                
                game.players = game.players.filter(
                    p => p.toString() !== socket.userId
                );
                
                game.connectedPlayers = game.connectedPlayers.filter(
                    p => p.toString() !== socket.userId
                );
                
                if (game.currentTurn && game.currentTurn.toString() === socket.userId && game.players.length > 0) {
                    game.currentTurn = game.players[0];
                }
                
                if (game.host.toString() === socket.userId && game.players.length > 0) {
                    game.host = game.players[0];
                }
                
                if (game.players.length === 0) {
                    const deleteStart = Date.now();
                    await Game.findByIdAndDelete(gameId);
                    const deleteDuration = Date.now() - deleteStart;
                    console.log(`[PERF] game:leave delete: ${deleteDuration}ms`);
                    clearGameActivityTimer(gameId);
                } else {
                    const saveStart = Date.now();
                    await game.save();
                    await game.populate('players', 'username');
                    await game.populate('host', 'username');
                    await game.populate('connectedPlayers', 'username');
                    await game.populate('currentTurn', 'username');
                    const saveDuration = Date.now() - saveStart;
                    console.log(`[PERF] game:leave save: ${saveDuration}ms`);
                    
                    resetGameActivityTimer(gameId);
                    
                    socket.to(`game:${gameId}`).emit('game:playerLeft', {
                        game,
                        playerId: socket.userId,
                        username: socket.username
                    });

                    if (game.currentTurn) {
                        io.to(`game:${gameId}`).emit('game:turnChanged', {
                            currentTurn: game.currentTurn,
                            username: game.currentTurn.username
                        });
                    }
                }
                
                socket.leave(`game:${gameId}`);
                
                const gamesStart = Date.now();
                const games = await getActiveGames();
                const gamesDuration = Date.now() - gamesStart;
                console.log(`[PERF] game:leave getActiveGames: ${gamesDuration}ms`);
                io.emit('games:list', games);
                
                const totalDuration = Date.now() - totalStart;
                console.log(`[PERF] game:leave TOTAL: ${totalDuration}ms`);
            } catch (err) {
                console.error('Leave game error:', err);
            }
        });

        socket.on('game:syncState', async ({ gameId, gameState }) => {
            try {
                if (!socket.userId) return;
                
                const game = await Game.findById(gameId);
                if (!game || !game.players.some(p => p.toString() === socket.userId)) {
                    return;
                }
                
                socket.to(`game:${gameId}`).emit('game:stateUpdate', {
                    gameState,
                    senderId: socket.userId,
                    senderUsername: socket.username,
                    timestamp: Date.now()
                });
            } catch (err) {
                console.error('Sync state error:', err);
            }
        });
        
        socket.on('game:requestGameData', async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:requestGameData ${gameId}`);
                
                const dbStart = Date.now();
                const game = await Game.findById(gameId)
                    .populate('host', 'username')
                    .populate('players', 'username')
                    .populate('connectedPlayers', 'username')
                    .populate('currentTurn', 'username');
                const dbDuration = Date.now() - dbStart;
                console.log(`[PERF] game:requestGameData DB: ${dbDuration}ms`);
                
                if (!game) {
                    return socket.emit('error', { message: 'Game not found' });
                }
                
                socket.emit('game:data', game);
                
                const totalDuration = Date.now() - totalStart;
                console.log(`[PERF] game:requestGameData TOTAL: ${totalDuration}ms`);
            } catch (err) {
                console.error('Request game data error:', err);
                socket.emit('error', { message: 'Failed to fetch game data' });
            }
        });

        socket.on('game:saveState', async ({ gameId, playerId, playerState, gameState, clientTimestamp }) => {
            const totalStart = Date.now();
            try {
                if (!socket.userId) return;
                
                const dbStart = Date.now();
                const game = await Game.findById(gameId);
                const dbDuration = Date.now() - dbStart;
                
                if (!game) return;
                
                if (!game.players.some(p => p.toString() === socket.userId)) {
                    return;
                }
                
                const timestamp = clientTimestamp || Date.now();
                
                if (!game.savedState) {
                    game.savedState = {};
                }
                
                const stripStart = Date.now();
                if (gameState) {
                    Object.keys(gameState).forEach(pId => {
                        const existingState = game.savedState[pId];
                        const shouldUpdate = !existingState || 
                                        !existingState.lastUpdated || 
                                        timestamp > new Date(existingState.lastUpdated).getTime();
                        
                        if (shouldUpdate) {
                            const strippedState = stripPlayerStateForStorage(gameState[pId]);
                            game.savedState[pId] = {
                                ...strippedState,
                                lastUpdated: new Date(timestamp)
                            };
                        }
                    });
                }
                else if (playerId && playerState) {
                    if (playerId !== socket.userId) {
                        return socket.emit('game:stateSaved', {
                            success: false,
                            error: 'Can only save your own state'
                        });
                    }
                    
                    const existingPlayerState = game.savedState[playerId];
                    const shouldUpdate = !existingPlayerState || 
                                    !existingPlayerState.lastUpdated || 
                                    timestamp > new Date(existingPlayerState.lastUpdated).getTime();
                    
                    if (shouldUpdate) {
                        const strippedState = stripPlayerStateForStorage(playerState);
                        game.savedState[playerId] = {
                            ...strippedState,
                            lastUpdated: new Date(timestamp)
                        };
                    }
                }
                const stripDuration = Date.now() - stripStart;
                
                game.markModified('savedState');
                const saveStart = Date.now();
                await game.save();
                const saveDuration = Date.now() - saveStart;
                
                socket.emit('game:stateSaved', {
                    success: true,
                    timestamp: new Date(timestamp)
                });
                
                const totalDuration = Date.now() - totalStart;
                console.log(`[PERF] game:saveState: DB=${dbDuration}ms, Strip=${stripDuration}ms, Save=${saveDuration}ms, TOTAL=${totalDuration}ms`);
                
            } catch (err) {
                console.error('Save state error:', err);
                socket.emit('game:stateSaved', {
                    success: false,
                    error: err.message
                });
            }
        });
        
        socket.on('disconnect', async () => {
            const totalStart = Date.now();
            console.log('Client disconnected:', socket.id, 'User:', socket.username);
            
            if (!socket.userId) return;
            
            try {
                const dbStart = Date.now();
                const games = await Game.find({ players: socket.userId });
                const dbDuration = Date.now() - dbStart;
                console.log(`[PERF] disconnect find games: ${dbDuration}ms`);
                
                const saveStart = Date.now();
                for (const game of games) {
                    game.connectedPlayers = game.connectedPlayers.filter(
                        p => p.toString() !== socket.userId
                    );
                    
                    await game.save();
                    await game.populate('players', 'username');
                    await game.populate('host', 'username');
                    await game.populate('connectedPlayers', 'username');
                    
                    socket.to(`game:${game._id}`).emit('game:playerDisconnected', {
                        game,
                        playerId: socket.userId,
                        username: socket.username
                    });
                }
                const saveDuration = Date.now() - saveStart;
                console.log(`[PERF] disconnect update games: ${saveDuration}ms`);
                
                const gamesStart = Date.now();
                const activeGames = await getActiveGames();
                const gamesDuration = Date.now() - gamesStart;
                console.log(`[PERF] disconnect getActiveGames: ${gamesDuration}ms`);
                io.emit('games:list', activeGames);
                
                const totalDuration = Date.now() - totalStart;
                console.log(`[PERF] disconnect TOTAL: ${totalDuration}ms`);
            } catch (err) {
                console.error('Disconnect cleanup error:', err);
            }
        });
    });

    async function getActiveGames() {
        try {
            return await Game.find()
                .populate('host', 'username')
                .populate('players', 'username')
                .populate('connectedPlayers', 'username')
                .populate('currentTurn', 'username')
                .sort('-createdAt');
        } catch (err) {
            console.error('Error fetching games:', err);
            return [];
        }
    }
};