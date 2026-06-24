//backend/src/sockets/gameSocket.js
const Game = require('../models/Game');
const jwt = require('jsonwebtoken');
const cardCache = require('../services/r2cardCache');

const User = require('../models/User');
const gameActivityTimers = new Map();
const INACTIVITY_WARNING_TIME = 1 * 60 * 1000; // 1 minute
const INACTIVITY_CLOSE_TIME = 5 * 60 * 1000;   // 5 minutes
// const INACTIVITY_WARNING_TIME = 23 * 60 * 60 * 1000; // 23 hours in ms
// const INACTIVITY_CLOSE_TIME = 24 * 60 * 60 * 1000;  // 24 hours in ms

const cookie = require('cookie');

module.exports = (io) => {

    // ─── Helpers ────────────────────────────────────────────────────────────────

    /** Applies the standard 4-field populate chain to a Mongoose query or document. */
    function populateGame(query) {
        return query
            .populate('host', 'username')
            .populate('players', 'username')
            .populate('connectedPlayers', 'username')
            .populate('currentTurn', 'username');
    }

    /** Saves a game document then re-populates all standard fields. */
    async function saveAndPopulate(game) {
        await game.save();
        await game.populate('players', 'username');
        await game.populate('host', 'username');
        await game.populate('connectedPlayers', 'username');
        await game.populate('currentTurn', 'username');
        return game;
    }

    /** Fetches the current active games list and broadcasts it to all clients. */
    async function broadcastGamesList() {
        const games = await getActiveGames();
        io.emit('games:list', games);
    }

    /**
     * Finds a game by ID and verifies the given userId is a player.
     * Throws descriptive errors on failure so callers can catch them uniformly.
     */
    async function findGameForPlayer(gameId, userId, { populate = false } = {}) {
        const query = populate ? populateGame(Game.findById(gameId)) : Game.findById(gameId);
        const game = await query;
        if (!game) throw new Error('Game not found');
        if (!game.players.some(p => p.toString() === userId)) {
            throw new Error('You are not in this game');
        }
        return game;
    }

    /**
     * Wraps a socket event handler to enforce authentication before it runs.
     * Usage: socket.on('event', authenticated(socket, async (data) => { ... }))
     */
    function authenticated(socket, handler) {
        return async (...args) => {
            if (!socket.userId) throw new Error('User not authenticated');
            return handler(...args);
        };
    }

    // ─── Card strip / hydrate ────────────────────────────────────────────────────

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
        return cards.map(stripCardForStorage);
    }

    // BUG FIX #3: Don't spread playerState first — only write zone keys when the
    // client sent a real array for them. This prevents undefined zone values from
    // ever reaching the DB and silently corrupting savedState on reads.
    function stripPlayerStateForStorage(playerState) {
        if (!playerState || typeof playerState !== 'object') return playerState;
        const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'facedown', 'sideboard'];
        const stripped = {};
        for (const zone of zones) {
            if (Array.isArray(playerState[zone])) {
                stripped[zone] = stripCardArrayForStorage(playerState[zone]);
            }
            // Intentionally skip undefined/null zones — don't store them at all
        }
        // Preserve non-zone scalar state
        return {
            ...stripped,
            lifeTotal: playerState.lifeTotal,
            customCounters: playerState.customCounters,
            poisonCounters: playerState.poisonCounters,
            commanderDamage: playerState.commanderDamage,
        };
    }

    async function hydrateCard(card) {
        if (!card || !card.scryfallId) return card;
        const cardData = await cardCache.fetch(card.scryfallId);
        if (!cardData) return card;
        return { ...cardData, ...card, _id: card._id };
    }

    async function hydrateCardArray(cards) {
        if (!Array.isArray(cards) || cards.length === 0) return cards;
        const scryfallIds = cards.filter(c => c?.scryfallId).map(c => c.scryfallId);
        if (scryfallIds.length === 0) return cards;
        const cardMap = await cardCache.batchFetch(scryfallIds);
        return cards.map(card =>
            card?.scryfallId && cardMap[card.scryfallId]
                ? { ...cardMap[card.scryfallId], ...card, _id: card._id }
                : card
        );
    }

    async function hydratePlayerState(playerState) {
        if (!playerState || typeof playerState !== 'object') return playerState;
        const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'facedown', 'sideboard'];
        const hydrated = { ...playerState };
        for (const zone of zones) {
            if (hydrated[zone]) hydrated[zone] = await hydrateCardArray(hydrated[zone]);
        }
        return hydrated;
    }

    async function hydrateActionData(data) {
        if (!data) return data;
        if (Array.isArray(data)) return hydrateCardArray(data);
        if (typeof data === 'object' && data.scryfallId) return hydrateCard(data);
        return data;
    }

    // ─── Inactivity timers ───────────────────────────────────────────────────────

    // BUG FIX #7: Use a mutable ref object stored once in the map so that
    // clearGameActivityTimer always sees the latest closeTimer value. The old
    // code stored { warningTimer, closeTimer: null } first, then called
    // gameActivityTimers.set() again inside the warning callback — but if
    // clearGameActivityTimer ran between those two sets it read the stale null
    // and could never cancel the close timer.
    function resetGameActivityTimer(gameId) {
        if (gameActivityTimers.has(gameId)) {
            const timers = gameActivityTimers.get(gameId);
            clearTimeout(timers.warningTimer);
            if (timers.closeTimer) clearTimeout(timers.closeTimer);
        }

        Game.findByIdAndUpdate(gameId, { lastActivityAt: new Date() }).catch(console.error);

        // Single mutable ref — set once, mutated in place so clearTimeout always
        // sees the correct handle regardless of when it's called.
        const timers = { warningTimer: null, closeTimer: null };
        gameActivityTimers.set(gameId, timers);
        io.to(`game:${gameId}`).emit('game:activityReset');

        timers.warningTimer = setTimeout(() => {
            console.log(`[INACTIVITY] Warning fired for game ${gameId}`);
            io.to(`game:${gameId}`).emit('game:inactivityWarning', {
                timeRemaining: INACTIVITY_CLOSE_TIME - INACTIVITY_WARNING_TIME,
                closesAt: Date.now() + (INACTIVITY_CLOSE_TIME - INACTIVITY_WARNING_TIME) 
            });

            timers.closeTimer = setTimeout(async () => {
                console.log(`[INACTIVITY] Close fired for game ${gameId}`);
                try {
                    const game = await Game.findById(gameId);
                    if (game) {
                        io.to(`game:${gameId}`).emit('game:closedDueToInactivity');
                        await Game.findByIdAndDelete(gameId);
                        gameActivityTimers.delete(gameId);
                        await broadcastGamesList();
                    }
                } catch (err) {
                    console.error('Error closing inactive game:', err);
                }
            }, INACTIVITY_CLOSE_TIME - INACTIVITY_WARNING_TIME);
        }, INACTIVITY_WARNING_TIME);
    }

    function clearGameActivityTimer(gameId) {
        if (gameActivityTimers.has(gameId)) {
            const timers = gameActivityTimers.get(gameId);
            clearTimeout(timers.warningTimer);
            if (timers.closeTimer) clearTimeout(timers.closeTimer);
            gameActivityTimers.delete(gameId);
        }
    }

    // ─── middleware ─────────────────────────────────────────────────────────
    
    io.use(async (socket, next) => {
        const startTime = Date.now();
        try {
            const cookies = cookie.parse(socket.handshake.headers.cookie || '');
            const token = cookies.token;
            if (!token) {
                console.log('No token provided');
                return next(new Error('No token provided'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log('Decoded token:', decoded);

            const user = await User.findById(decoded._id).lean();
            if (!user) return next(new Error('User not found'));
            
            socket.userId = decoded._id.toString();
            socket.username = user.username;

            console.log(`[AUTH] ${socket.username} authenticated in ${Date.now() - startTime}ms`);
            next();
        } catch (err) {
            console.error('Authentication error:', err.message);
            next(new Error('Authentication error: ' + err.message));
        }
    });

    // ─── Connection ──────────────────────────────────────────────────────────────

    io.on('connection', async (socket) => {
        console.log('Client connected:', socket.id, 'User:', socket.username, 'ID:', socket.userId);

        // BUG FIX #4: socket.io clears socket.rooms before the 'disconnect' event
        // fires, so [...socket.rooms].filter(...) always yields []. Track the rooms
        // this socket has joined in a local Set so disconnect cleanup is reliable.
        const joinedGameRooms = new Set();

        // ── game:create ──────────────────────────────────────────────────────────

        socket.on('game:create', authenticated(socket, async (gameData) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:create from ${socket.username}`);

                let t = Date.now();
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
                console.log(`[PERF] game:create DB save: ${Date.now() - t}ms`);

                socket.join(`game:${newGame._id}`);
                joinedGameRooms.add(`game:${newGame._id}`);
                resetGameActivityTimer(newGame._id.toString());

                t = Date.now();
                await broadcastGamesList();
                console.log(`[PERF] game:create getActiveGames: ${Date.now() - t}ms`);

                t = Date.now();
                const populatedGame = await populateGame(Game.findById(newGame._id));
                console.log(`[PERF] game:create populate: ${Date.now() - t}ms`);

                socket.emit('game:joined', populatedGame);
                console.log(`[PERF] game:create TOTAL: ${Date.now() - totalStart}ms`);
            } catch (err) {
                console.error('Create game error:', err);
                socket.emit('error', { message: 'Failed to create game: ' + err.message });
            }
        }));

        // ── game:join ────────────────────────────────────────────────────────────

        socket.on('game:join', authenticated(socket, async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:join ${gameId} from ${socket.username}`);

                let t = Date.now();
                const game = await populateGame(Game.findById(gameId));
                console.log(`[PERF] game:join DB query: ${Date.now() - t}ms`);

                if (!game) return socket.emit('error', { message: 'Game not found' });
                
                const isAlreadyPlayer = game.players.some(p => (p._id ?? p).toString() === socket.userId);

                if (!isAlreadyPlayer && game.players.length >= game.maxPlayers)
                    return socket.emit('error', { message: 'Game is full' });
                if (!isAlreadyPlayer && game.status === 'active')
                    return socket.emit('error', { message: 'Game has already started' });

                // BUG FIX #5: Use atomic $addToSet to avoid the fetch-mutate-save
                // race where two concurrent joins could overwrite each other. The
                // old code called findByIdAndUpdate then saveAndPopulate(freshGame),
                // meaning a second save() could clobber the first player's addition.
                await Game.findByIdAndUpdate(gameId, {
                    $addToSet: { 
                        connectedPlayers: socket.userId,
                        ...(!isAlreadyPlayer && { players: socket.userId })
                    }
                });

                t = Date.now();
                // Re-fetch after the atomic update — populate only, no extra save()
                const freshGame = await populateGame(Game.findById(gameId));
                // await freshGame.populate('players', 'username');
                // await freshGame.populate('host', 'username');
                // await freshGame.populate('connectedPlayers', 'username');
                // await freshGame.populate('currentTurn', 'username');
                console.log(`[PERF] game:join populate: ${Date.now() - t}ms`);

                socket.join(`game:${gameId}`);
                joinedGameRooms.add(`game:${gameId}`);
                resetGameActivityTimer(gameId);

                t = Date.now();
                await broadcastGamesList();
                console.log(`[PERF] game:join getActiveGames: ${Date.now() - t}ms`);

                let gameObject = freshGame.toObject();

                console.log('[SERVER JOIN] savedState exists?', !!gameObject.savedState);
                console.log('[SERVER JOIN] savedState keys:', gameObject.savedState ? Object.keys(gameObject.savedState) : []);
                console.log('[SERVER JOIN] joining userId:', socket.userId);
                console.log('[SERVER JOIN] their entry:', gameObject.savedState?.[socket.userId] ? 'EXISTS' : 'MISSING');
                if (gameObject.savedState?.[socket.userId]) {
                    const s = gameObject.savedState[socket.userId];
                    console.log('[SERVER JOIN] their state zones:', {
                        library: s.library?.length,
                        hand: s.hand?.length,
                        battlefield: s.battlefield?.length,
                        lastUpdated: s.lastUpdated
                    });
                }

                if (gameObject.savedState) {
                    t = Date.now();
                    const hydratedSavedState = {};
                    for (const [playerId, playerState] of Object.entries(gameObject.savedState)) {
                        hydratedSavedState[playerId] = await hydratePlayerState(playerState);
                    }
                    gameObject.savedState = hydratedSavedState;
                    console.log(`[PERF] game:join hydration: ${Date.now() - t}ms`);
                }
                
                console.log('BACKEND socket game:join event saved game:', gameObject);
                socket.emit('game:joined', gameObject);

                if (!isAlreadyPlayer) {
                    socket.to(`game:${gameId}`).emit('game:playerJoined', gameObject);
                }

                socket.to(`game:${gameId}`).emit('game:requestSync', {
                    reason: isAlreadyPlayer ? 'player_reconnected' : 'player_joined',
                    playerId: socket.userId,
                    username: socket.username
                });

                console.log(`[PERF] game:join TOTAL: ${Date.now() - totalStart}ms`);
            } catch (err) {
                console.error('Join game error:', err);
                socket.emit('error', { message: 'Failed to join game: ' + err.message });
            }
        }));

        // ── game:action ──────────────────────────────────────────────────────────

        socket.on('game:action', authenticated(socket, async ({ gameId, action, data }) => {
            const totalStart = Date.now();
            try {
                let t = Date.now();
                const game = await findGameForPlayer(gameId, socket.userId);
                const dbDuration = Date.now() - t;

                resetGameActivityTimer(gameId);

                const allowedActions = [
                    'loadDeck', 'drawCard', 'play', 'move', 'repositionCard',
                    'toggleAltFace', 'tapCard', 'toggleFaceDown', 'shakeCard',
                    'shuffleLibrary', 'scoopDeck', 'addCounter', 'removeCounter',
                    'incrementCounter', 'cloneCard', 'rollDice', 'changeLifeTotal',
                    'changeCounter', 'playFaceDown', 'moveToLibraryTop', 'moveToLibraryBottom', 
                    'mulligan'
                ];

                if (!allowedActions.includes(action)) {
                    console.warn(`Unknown action '${action}' from ${socket.username}`);
                }

                t = Date.now();
                const hydratedData = await hydrateActionData(data);
                const hydrateDuration = Date.now() - t;

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
                        action,
                        data: hydratedData,
                        timestamp: Date.now()
                    });
                }

                console.log(`[PERF] game:action ${action}: DB=${dbDuration}ms, Hydrate=${hydrateDuration}ms, TOTAL=${Date.now() - totalStart}ms`);
            } catch (err) {
                console.log(gameId, action, data);
                console.error('Game action error:', err);
                socket.emit('error', { message: 'Failed to process action: ' + err.message });
            }
        }));

        // ── game:startGame ───────────────────────────────────────────────────────

        socket.on('game:startGame', authenticated(socket, async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:startGame ${gameId} from ${socket.username}`);

                let t = Date.now();
                const game = await populateGame(Game.findById(gameId));
                console.log(`[PERF] game:startGame DB query: ${Date.now() - t}ms`);

                if (!game) return socket.emit('error', { message: 'Game not found' });

                if (game.host._id.toString() !== socket.userId)
                    return socket.emit('error', { message: 'Only the host can start the game' });

                if (game.status === 'active')
                    return socket.emit('error', { message: 'Game has already started' });

                const startingPlayer = game.players[Math.floor(Math.random() * game.players.length)];
                game.currentTurn = startingPlayer._id;
                game.status = 'active';

                t = Date.now();
                const populated = await saveAndPopulate(game);
                console.log(`[PERF] game:startGame save: ${Date.now() - t}ms`);

                resetGameActivityTimer(gameId);

                io.to(`game:${gameId}`).emit('game:started', {
                    game: populated,
                    startingPlayer: startingPlayer.username
                });

                console.log(`[PERF] game:startGame TOTAL: ${Date.now() - totalStart}ms`);
            } catch (err) {
                console.error('Start game error:', err);
                socket.emit('error', { message: 'Failed to start game: ' + err.message });
            }
        }));

        // ── game:endTurn ─────────────────────────────────────────────────────────

        socket.on('game:endTurn', authenticated(socket, async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:endTurn ${gameId} from ${socket.username}`);

                let t = Date.now();
                const game = await populateGame(Game.findById(gameId));
                console.log(`[PERF] game:endTurn DB query: ${Date.now() - t}ms`);

                if (!game) return socket.emit('error', { message: 'Game not found' });
                if (game.status !== 'active') return socket.emit('error', { message: 'Game has not started yet' });
                if (!game.players.some(p => p._id.toString() === socket.userId))
                    return socket.emit('error', { message: 'You are not in this game' });
                if (game.currentTurn && game.currentTurn._id.toString() !== socket.userId)
                    return socket.emit('error', { message: 'It is not your turn' });

                const currentIndex = game.players.findIndex(p => p._id.toString() === socket.userId);
                game.currentTurn = game.players[(currentIndex + 1) % game.players.length]._id;

                t = Date.now();
                const populated = await saveAndPopulate(game);
                console.log(`[PERF] game:endTurn save: ${Date.now() - t}ms`);

                resetGameActivityTimer(gameId);

                io.to(`game:${gameId}`).emit('game:turnChanged', {
                    currentTurn: populated.currentTurn,
                    username: populated.currentTurn.username
                });

                console.log(`[PERF] game:endTurn TOTAL: ${Date.now() - totalStart}ms`);
            } catch (err) {
                console.error('End turn error:', err);
                socket.emit('error', { message: 'Failed to end turn: ' + err.message });
            }
        }));

        // ── game:leave ───────────────────────────────────────────────────────────

        socket.on('game:leave', authenticated(socket, async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:leave ${gameId} from ${socket.username}`);
                let t = Date.now();
                const game = await Game.findById(gameId);
                console.log(`[PERF] game:leave DB query: ${Date.now() - t}ms`);

                if (!game) return;

                game.players = game.players.filter(p => p.toString() !== socket.userId);
                game.connectedPlayers = game.connectedPlayers.filter(p => p.toString() !== socket.userId);

                if (game.savedState?.[socket.userId]) {
                    delete game.savedState[socket.userId];
                    game.markModified('savedState');
                }

                // BUG FIX #6: Normalize currentTurn to a plain id string before
                // comparing — it may be a raw ObjectId or a populated object depending
                // on how the document was fetched, so check both forms.
                const currentTurnId = game.currentTurn?._id?.toString()
                    ?? game.currentTurn?.toString();
                if (currentTurnId === socket.userId && game.players.length > 0)
                    game.currentTurn = game.players[0];

                if (game.host.toString() === socket.userId && game.players.length > 0)
                    game.host = game.players[0];

                if (game.players.length === 0) {
                    t = Date.now();
                    await Game.findByIdAndDelete(gameId);
                    console.log(`[PERF] game:leave delete: ${Date.now() - t}ms`);
                    clearGameActivityTimer(gameId);
                } else {
                    t = Date.now();
                    const populated = await saveAndPopulate(game);
                    console.log(`[PERF] game:leave save: ${Date.now() - t}ms`);

                    resetGameActivityTimer(gameId);

                    io.to(`game:${gameId}`).emit('game:playerLeft', {
                        game: populated,
                        playerId: socket.userId,
                        username: socket.username
                    });

                    if (populated.currentTurn) {
                        io.to(`game:${gameId}`).emit('game:turnChanged', {
                            currentTurn: populated.currentTurn,
                            username: populated.currentTurn.username
                        });
                    }
                }

                socket.leave(`game:${gameId}`);
                joinedGameRooms.delete(`game:${gameId}`);

                t = Date.now();
                await broadcastGamesList();
                console.log(`[PERF] game:leave getActiveGames: ${Date.now() - t}ms`);

                console.log(`[PERF] game:leave TOTAL: ${Date.now() - totalStart}ms`);
            } catch (err) {
                console.error('Leave game error:', err);
            }
        }));

        // ── game:syncState ───────────────────────────────────────────────────────

        socket.on('game:syncState', async ({ gameId, gameState }) => {
            try {
                if (!socket.userId) return;
                await findGameForPlayer(gameId, socket.userId);
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

        // ── game:requestGameData ─────────────────────────────────────────────────

        socket.on('game:requestGameData', async ({ gameId }) => {
            const totalStart = Date.now();
            try {
                console.log(`[EVENT] game:requestGameData ${gameId}`);

                const t = Date.now();
                const game = await populateGame(Game.findById(gameId));
                console.log(`[PERF] game:requestGameData DB: ${Date.now() - t}ms`);

                if (!game) return socket.emit('error', { message: 'Game not found' });

                socket.emit('game:data', game);
                console.log(`[PERF] game:requestGameData TOTAL: ${Date.now() - totalStart}ms`);
            } catch (err) {
                console.error('Request game data error:', err);
                socket.emit('error', { message: 'Failed to fetch game data' });
            }
        });

        // ── game:saveState ───────────────────────────────────────────────────────

        socket.on('game:saveState', async ({ gameId, playerId, playerState, gameState, clientTimestamp }, ack) => {
            console.log('[SAVE STATE ENTRY] handler reached, userId:', socket.userId, 'gameId:', gameId);  // ← add this
            const totalStart = Date.now();
            try {
                if (!socket.userId) return;
                console.log('[SAVE STATE] received from:', socket.userId);
                console.log('[SAVE STATE] has gameState?', !!gameState, 'has playerState?', !!playerState);
                console.log('[SAVE STATE] clientTimestamp:', clientTimestamp);
                if (gameState) {
                    Object.entries(gameState).forEach(([pId, state]) => {
                        console.log(`[SAVE STATE] gameState entry ${pId}:`, {
                            library: state.library?.length,
                            hand: state.hand?.length,
                            battlefield: state.battlefield?.length
                        });
                    });
                }

                // BUG FIX #2: Reject saves with no timestamp rather than silently
                // falling back to Date.now(). The fallback meant any save with a
                // missing timestamp would always appear newer than stored state,
                // bypassing the stale-check and potentially overwriting good data
                // with undefined-zone garbage.
                if (!clientTimestamp || typeof clientTimestamp !== 'number' || clientTimestamp <= 0) {
                    console.warn('[SAVE STATE] rejected: missing or invalid clientTimestamp');
                    return socket.emit('game:stateSaved', {
                        success: false,
                        error: 'Missing clientTimestamp — client must send Date.now() with every save'
                    });
                }
                const timestamp = clientTimestamp;

                let t = Date.now();
                const game = await findGameForPlayer(gameId, socket.userId);
                console.log('[SAVE STATE] existing savedState keys:', Object.keys(game.savedState || {}));
                console.log('[SAVE STATE] existing entry for sender:', {
                    playerId: socket.userId,
                    lastUpdated: game.savedState[socket.userId]?.lastUpdated,
                    asMs: game.savedState[socket.userId]?.lastUpdated 
                        ? new Date(game.savedState[socket.userId].lastUpdated).getTime() 
                        : null
                });
                console.log('[SAVE STATE] clientTimestamp:', timestamp);
                const dbDuration = Date.now() - t;

                if (!game.savedState) game.savedState = {};

                const isNewer = (existingState) =>
                    !existingState?.lastUpdated ||
                    timestamp > new Date(existingState.lastUpdated).getTime();

                t = Date.now();
                if (gameState) {
                for (const [pId, state] of Object.entries(gameState)) {
                    const existing = game.savedState[pId];
                    const existingTs = existing?.lastUpdated 
                        ? new Date(existing.lastUpdated).getTime() 
                        : 0;
                    
                    console.log(`[SAVE STATE] ${pId}: incoming=${timestamp}, existing=${existingTs}, willSave=${timestamp >= existingTs}`);
                    
                    // Use >= not > so equal timestamps still save (handles same-ms edge case)
                    if (timestamp >= existingTs) {
                        game.savedState[pId] = {
                            ...stripPlayerStateForStorage(state),
                            lastUpdated: new Date(timestamp)
                        };
                    }
                }
            } else if (playerId && playerState) {
                if (playerId !== socket.userId) {
                    return socket.emit('game:stateSaved', { success: false, error: 'Can only save your own state' });
                }
                
                const existing = game.savedState[playerId];
                const existingTs = existing?.lastUpdated 
                    ? new Date(existing.lastUpdated).getTime() 
                    : 0;
                
                console.log(`[SAVE STATE] ${playerId}: incoming=${timestamp}, existing=${existingTs}, willSave=${timestamp >= existingTs}`);
                
                if (timestamp >= existingTs) {
                    game.savedState[playerId] = {
                        ...stripPlayerStateForStorage(playerState),
                        lastUpdated: new Date(timestamp)
                    };
                }
            }
                const stripDuration = Date.now() - t;

                game.markModified('savedState');
                t = Date.now();
                await game.save();
                const saveDuration = Date.now() - t;

                if (typeof ack === 'function') ack();
                socket.emit('game:stateSaved', { success: true, timestamp: new Date(timestamp) });
                console.log(`[PERF] game:saveState: DB=${dbDuration}ms, Strip=${stripDuration}ms, Save=${saveDuration}ms, TOTAL=${Date.now() - totalStart}ms`);
            } catch (err) {
                console.error('[SAVE STATE ERROR]', { gameId, userId: socket.userId, message: err.message, stack: err.stack });
                socket.emit('game:stateSaved', { success: false, error: err.message });
            }
        });

        // ── saveChatLog ───────────────────────────────────────────────────────────

        socket.on('game:saveChatLog', async ({ gameId, chatLog }) => {
            try {
                if (!socket.userId) return;
                await findGameForPlayer(gameId, socket.userId);
                const game = await Game.findById(gameId);
                if (!game) return;
                if (!game.savedState) game.savedState = {};
                game.savedState['_chatLog'] = chatLog;
                game.markModified('savedState');
                await game.save();
                socket.emit('game:chatLogSaved', { success: true });
            } catch (err) {
                console.error('Save chat log error:', err);
            }
        });

        // ── disconnect ───────────────────────────────────────────────────────────

        socket.on('disconnect', async () => {
            const totalStart = Date.now();
            console.log('[DISCONNECT] userId:', socket.userId, 'username:', socket.username);
            console.log('[DISCONNECT] tracked rooms:', [...joinedGameRooms]);

            if (!socket.userId) return;

            try {
                // BUG FIX #1 + #4: socket.io empties socket.rooms before this event
                // fires, so the original [...socket.rooms].filter() always yielded [].
                // We use our own joinedGameRooms Set which is maintained through
                // join/leave/create above.
                //
                // Additionally the original code called saveAndPopulate(game) after
                // mutating game.connectedPlayers in JS — if game was fetched without
                // savedState being modified, that save() would flush an empty savedState
                // to disk. Instead, use an atomic $pull so we never touch savedState.
                let t = Date.now();
                for (const room of joinedGameRooms) {
                    const gameId = room.replace('game:', '');

                    // Atomically remove from connectedPlayers — never touches savedState
                    await Game.findByIdAndUpdate(gameId, {
                        $pull: { connectedPlayers: socket.userId }
                    });

                    // Re-fetch the now-consistent document for the emit payload
                    const freshGame = await populateGame(Game.findById(gameId));
                    if (!freshGame) continue;

                    console.log('[DISCONNECT] savedState for this player:',
                        freshGame.savedState?.[socket.userId] ? 'EXISTS' : 'MISSING');

                    socket.to(room).emit('game:playerDisconnected', {
                        game: freshGame,
                        playerId: socket.userId,
                        username: socket.username,
                        savedState: freshGame.savedState?.[socket.userId]
                    });
                }
                console.log(`[PERF] disconnect update games: ${Date.now() - t}ms`);

                t = Date.now();
                await broadcastGamesList();
                console.log(`[PERF] disconnect getActiveGames: ${Date.now() - t}ms`);

                console.log(`[PERF] disconnect TOTAL: ${Date.now() - totalStart}ms`);
            } catch (err) {
                console.error('Disconnect cleanup error:', err);
            }
        });

        // Emit initial game list after registering all event handlers
        const startTime = Date.now();
        const games = await getActiveGames();
        console.log(`[PERF] getActiveGames: ${Date.now() - startTime}ms`);
        socket.emit('games:list', games);
    });

    // ─── Utilities ───────────────────────────────────────────────────────────────

    async function getActiveGames() {
        try {
            return await populateGame(Game.find()).sort('-createdAt');
        } catch (err) {
            console.error('Error fetching games:', err);
            return [];
        }
    }

    // BUG FIX #9: Expose a timer flush for test cleanup so Jest doesn't warn
    // about open handles. The 23-hour setTimeout registered by resetGameActivityTimer
    // keeps the process alive after each test suite. Only wired in test mode.
    if (process.env.NODE_ENV === 'test') {
        module.exports._clearAllTimers = () => {
            for (const timers of gameActivityTimers.values()) {
                clearTimeout(timers.warningTimer);
                if (timers.closeTimer) clearTimeout(timers.closeTimer);
            }
            gameActivityTimers.clear();
        };
    }
};

// BUG: reloading didn't populate player states
// FIXED: registering events before getting games means listeners weren't setup for when client sent out an event, so request dropped