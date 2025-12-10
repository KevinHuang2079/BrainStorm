const Game = require('../models/Game');
const jwt = require('jsonwebtoken');

const gameActivityTimers = new Map();
const INACTIVITY_WARNING_TIME = 600000; // 10 minutes
const INACTIVITY_CLOSE_TIME = 300000;   // 5 minutes after warning


module.exports = (io) => {
    io.use(async (socket, next) => {
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
            
            console.log('Authenticated:', socket.userId, socket.username);
            next();
        } catch (err) {
            console.error('Authentication error:', err.message);
            next(new Error('Authentication error: ' + err.message));
        }
    });

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
        
        const games = await getActiveGames();
        socket.emit('games:list', games);
        
        socket.on('game:create', async (gameData) => {
            try {
                console.log('Creating game for user:', socket.userId);
                
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
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
                
                socket.join(`game:${newGame._id}`);
                
                resetGameActivityTimer(newGame._id.toString());
                
                const games = await getActiveGames();
                io.emit('games:list', games);
                
                const populatedGame = await Game.findById(newGame._id)
                    .populate('host', 'username')
                    .populate('players', 'username')
                    .populate('connectedPlayers', 'username')
                    .populate('currentTurn', 'username');
                console.log('populatedgame', populatedGame);
                    
                socket.emit('game:joined', populatedGame);
            } catch (err) {
                console.error('Create game error:', err);
                socket.emit('error', { message: 'Failed to create game: ' + err.message });
            }
        });
        
        socket.on('game:join', async ({ gameId }) => {
            try {
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const game = await Game.findById(gameId)
                    .populate('players', 'username')
                    .populate('host', 'username')
                    .populate('connectedPlayers', 'username')
                    .populate('currentTurn', 'username');
                
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
                
                await game.save();
                await game.populate('players', 'username');
                await game.populate('connectedPlayers', 'username');
                await game.populate('currentTurn', 'username');
                
                socket.join(`game:${gameId}`);
                
                resetGameActivityTimer(gameId);
                
                const games = await getActiveGames();
                io.emit('games:list', games);
                
                const gameObject = game.toObject();
                
                socket.emit('game:joined', gameObject);
                
                if (!isAlreadyPlayer) {
                    socket.to(`game:${gameId}`).emit('game:playerJoined', gameObject);
                }
                
                socket.to(`game:${gameId}`).emit('game:requestSync', {
                    reason: isAlreadyPlayer ? 'player_reconnected' : 'player_joined',
                    playerId: socket.userId,
                    username: socket.username
                });
            } catch (err) {
                console.error('Join game error:', err);
                socket.emit('error', { message: 'Failed to join game: ' + err.message });
            }
        });

        socket.on('game:action', async ({ gameId, action, data }) => {
            try {
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const game = await Game.findById(gameId);
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

                if (action === 'rollDice') {
                    io.to(`game:${gameId}`).emit('game:diceRolled', {
                        username: socket.username,
                        result: data.result,
                        sides: data.sides,
                        timestamp: Date.now()
                    });
                } else {
                    socket.to(`game:${gameId}`).emit('game:action', {
                        username: socket.username,
                        playerId: socket.userId,
                        action: action,
                        data: data,
                        timestamp: Date.now()
                    });
                }
                
                console.log(`Action '${action}' from ${socket.username} echoed to game ${gameId}`);
                
            } catch (err) {
                console.error('Game action error:', err);
                socket.emit('error', { message: 'Failed to process action: ' + err.message });
            }
        });

        socket.on('game:startGame', async ({ gameId }) => {
            try {
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const game = await Game.findById(gameId)
                    .populate('host', 'username')
                    .populate('players', 'username')
                    .populate('connectedPlayers', 'username');
                
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
                
                await game.save();
                await game.populate('currentTurn', 'username');
                
                resetGameActivityTimer(gameId);
                
                io.to(`game:${gameId}`).emit('game:started', {
                    game,
                    startingPlayer: startingPlayer.username
                });
                
                console.log(`Game ${gameId} started. First turn: ${startingPlayer.username}`);
                
            } catch (err) {
                console.error('Start game error:', err);
                socket.emit('error', { message: 'Failed to start game: ' + err.message });
            }
        });

        socket.on('game:endTurn', async ({ gameId }) => {
            try {
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const game = await Game.findById(gameId)
                    .populate('players', 'username')
                    .populate('currentTurn', 'username');
                
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
                await game.save();
                await game.populate('currentTurn', 'username');
                
                resetGameActivityTimer(gameId);
                
                io.to(`game:${gameId}`).emit('game:turnChanged', {
                    currentTurn: game.currentTurn,
                    username: game.currentTurn.username
                });
                
                console.log(`Turn passed from ${socket.username} to ${game.currentTurn.username}`);
                
            } catch (err) {
                console.error('End turn error:', err);
                socket.emit('error', { message: 'Failed to end turn: ' + err.message });
            }
        });
        
        socket.on('game:leave', async ({ gameId }) => {
            try {
                if (!socket.userId) {
                    throw new Error('User not authenticated');
                }
                
                const game = await Game.findById(gameId);
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
                    await Game.findByIdAndDelete(gameId);
                    clearGameActivityTimer(gameId);
                } else {
                    await game.save();
                    await game.populate('players', 'username');
                    await game.populate('host', 'username');
                    await game.populate('connectedPlayers', 'username');
                    await game.populate('currentTurn', 'username');
                    
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
                
                const games = await getActiveGames();
                io.emit('games:list', games);
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
            try {
                const game = await Game.findById(gameId)
                    .populate('host', 'username')
                    .populate('players', 'username')
                    .populate('connectedPlayers', 'username')
                    .populate('currentTurn', 'username');
                console.log('requestGameData: game', game)
                if (!game) {
                    return socket.emit('error', { message: 'Game not found' });
                }
                
                socket.emit('game:data', game);
            } catch (err) {
                console.error('Request game data error:', err);
                socket.emit('error', { message: 'Failed to fetch game data' });
            }
        });

        socket.on('game:saveState', async ({ gameId, playerId, playerState, gameState, clientTimestamp }) => {
            try {
                if (!socket.userId) return;
                
                const game = await Game.findById(gameId);
                if (!game) return;
                
                if (!game.players.some(p => p.toString() === socket.userId)) {
                    return;
                }
                
                const timestamp = clientTimestamp || Date.now();
                
                if (!game.savedState) {
                    game.savedState = {};
                }
                
                if (gameState) {
                    Object.keys(gameState).forEach(pId => {
                        const existingState = game.savedState[pId];
                        const shouldUpdate = !existingState || 
                                        !existingState.lastUpdated || 
                                        timestamp > new Date(existingState.lastUpdated).getTime();
                        
                        if (shouldUpdate) {
                            game.savedState[pId] = {
                                ...gameState[pId],
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
                        game.savedState[playerId] = {
                            ...playerState,
                            lastUpdated: new Date(timestamp)
                        };
                    }
                }
                
                game.markModified('savedState');
                await game.save();
                
                console.log('State saved for player:', socket.username, 'in game:', gameId);
                
                socket.emit('game:stateSaved', {
                    success: true,
                    timestamp: new Date(timestamp)
                });
                
            } catch (err) {
                console.error('Save state error:', err);
                socket.emit('game:stateSaved', {
                    success: false,
                    error: err.message
                });
            }
        });
        
        socket.on('disconnect', async () => {
            console.log('Client disconnected:', socket.id, 'User:', socket.username);
            
            if (!socket.userId) return;
            
            try {
                const games = await Game.find({ players: socket.userId });
                
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
                
                const activeGames = await getActiveGames();
                io.emit('games:list', activeGames);
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