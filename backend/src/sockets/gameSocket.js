//backend/src/sockets/gameSocket.js
const Game = require('../models/Game');
const jwt = require('jsonwebtoken');
const cardCache = require('../services/r2cardCache');
const redis = require('../services/redisGameState');

const User = require('../models/User');

// Inactivity timeouts are now driven by Redis key expiry + keyspace notifications.
// The warning/close sequence is still managed in-process (setTimeout) but the
// mutable ref object lives here so clearGameActivityTimer always sees the latest handle.
const gameActivityTimers = new Map();
const INACTIVITY_WARNING_MS = 1 * 60 * 1000;
const INACTIVITY_CLOSE_MS   = 5 * 60 * 1000;
const cookie = require('cookie');

// ─── Mongo flush debounce ────────────────────────────────────────────────────
// Mongo writes are deferred 30 s after the last save. They're also triggered
// eagerly on turn end, disconnect, and game close (see those handlers).
const mongoFlushTimers = new Map();
const MONGO_FLUSH_DEBOUNCE_MS = 30_000;

module.exports = (io) => {

    // ─── Helpers ────────────────────────────────────────────────────────────────
    async function flushStateToMongo(gameId) {
        const stripped = await redis.getStrippedGameState(gameId);
        if (!stripped) return;

        try {
            await Game.findByIdAndUpdate(gameId, { $set: { savedState: stripped } });
            console.log(`[MONGO FLUSH] flushed game ${gameId}`);
        } catch (err) {
            console.error('[MONGO FLUSH ERROR]', err);
        }
    }

    function scheduleMongoFlush(gameId) {
        if (mongoFlushTimers.has(gameId)) {
            clearTimeout(mongoFlushTimers.get(gameId));
        }

        mongoFlushTimers.set(
            gameId,
            setTimeout(async () => {
                mongoFlushTimers.delete(gameId);
                await flushStateToMongo(gameId);
            }, MONGO_FLUSH_DEBOUNCE_MS)
        );
    }

    function cancelMongoFlush(gameId) {
        if (mongoFlushTimers.has(gameId)) {
            clearTimeout(mongoFlushTimers.get(gameId));
            mongoFlushTimers.delete(gameId);
        }
    }

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
        const cardMap = await cardCache.batchFetch(scryfallIds); //scryfallids: hydrated card info
        return cards.map(card =>
            card?.scryfallId && cardMap[card.scryfallId]
                ? { ...cardMap[card.scryfallId], ...card, _id: card._id }
                : card
        );
    }

    async function hydratePlayerState(playerState) {
        if (!playerState || typeof playerState !== 'object') {
            console.log(`[BACKEND] Hydrate Player State not an object`);
            return playerState;
        }
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

    /**
     * Hydrates all player states in a savedState map and broadcasts them to the
     * game room as a game:stateSnapshot event. This is the single authoritative
     * state push — replaces all peer-to-peer game:syncState / game:stateUpdate flow.
     */
    async function broadcastStateSnapshot(gameId, strippedState) {
        if (!strippedState || Object.keys(strippedState).length === 0) return;

        const t = Date.now();

        // Try the hydrated Redis cache first (avoids R2 round-trips on every action)
        let hydratedState = await redis.getHydratedGameState(gameId);

        if (!hydratedState) {
            // Cache miss — hydrate from R2 and write back to Redis
            hydratedState = {};
            for (const [playerId, playerState] of Object.entries(strippedState)) {
                if (playerId === '_chatLog') { hydratedState[playerId] = playerState; continue; }
                const h = await hydratePlayerState(playerState);
                hydratedState[playerId] = h;
                await redis.saveHydratedPlayerState(gameId, playerId, h);
            }
        } else {
            // Merge in the _chatLog scalar (not stored in the hydrated hash)
            if (strippedState['_chatLog']) hydratedState['_chatLog'] = strippedState['_chatLog'];
        }

        console.log(`[PERF] broadcastStateSnapshot: ${Date.now() - t}ms`);
        io.to(`game:${gameId}`).emit('game:stateSnapshot', { savedState: hydratedState, timestamp: Date.now() });
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
                        cancelMongoFlush(gameId);
                        await flushStateToMongo(gameId);
                        await Game.findByIdAndDelete(gameId);
                        await redis.deleteGame(gameId);
                        gameActivityTimers.delete(gameId);
                        await broadcastGamesList();
                    }
                } catch (err) {
                    console.error('Error closing inactive game:', err);
                }
            }, INACTIVITY_CLOSE_MS - INACTIVITY_WARNING_MS);
        }, INACTIVITY_WARNING_MS);
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
        const joinedGameRooms = new Set(); //joined games for this client

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

                await Game.findByIdAndUpdate(gameId, {
                    $addToSet: { 
                        connectedPlayers: socket.userId,
                        ...(!isAlreadyPlayer && { players: socket.userId })
                    }
                });

                t = Date.now();
                const freshGame = await populateGame(Game.findById(gameId));
                console.log(`[PERF] game:join populate: ${Date.now() - t}ms`);

                socket.join(`game:${gameId}`);
                // Track membership in Redis for fast game:action auth checks
                await redis.addPlayerToGame(gameId, socket.userId);
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

                // Prefer Redis (fast, already hydrated) — fall back to Mongo + R2 on cold start
                t = Date.now();
                let hydratedJoinState = await redis.getHydratedGameState(gameId);

                if (hydratedJoinState) {
                    console.log(`[PERF] game:join hydrated state from Redis: ${Date.now() - t}ms`);
                    gameObject.savedState = hydratedJoinState;
                } else if (gameObject.savedState) {
                    const hydratedSavedState = {};

                    for (const [playerId, playerState] of Object.entries(gameObject.savedState)) {
                        if (playerId === '_chatLog') { 
                            hydratedSavedState[playerId] = playerState; 
                            continue; 
                        }

                        const h = await hydratePlayerState(playerState);
                        hydratedSavedState[playerId] = h;

                        // Seed Redis hydrated cache and stripped state from Mongo data
                        await redis.saveHydratedPlayerState(gameId, playerId, h);
                        await redis.saveStrippedPlayerState(
                            gameId,
                            playerId,
                            playerState,
                            playerState.lastUpdated 
                                ? new Date(playerState.lastUpdated).getTime() 
                                : Date.now()
                        );
                        await redis.addPlayerToGame(gameId, playerId);
                    }

                    gameObject.savedState = hydratedSavedState;
                    console.log(`[PERF] game:join hydrated state from Mongo+R2 (Redis miss): ${Date.now() - t}ms`);
                }

                socket.emit('game:joined', gameObject); // give this client his info 
                if (game.savedState && Object.keys(game.savedState).length > 0) { // give other clients his info
                    await broadcastStateSnapshot(gameId, game.savedState);
                }

                // No longer emit game:requestSync — the joining player's state comes
                // from the DB snapshot already included in game:joined above. Other
                // players in the room will receive a game:stateSnapshot whenever the
                // rejoining player next saves their state via game:saveState.
                if (!isAlreadyPlayer) {
                    socket.to(`game:${gameId}`).emit('game:playerJoined', gameObject);
                }

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
                const isMember = await redis.isPlayerInGame(gameId, socket.userId);
                if (!isMember) {
                    return socket.emit('error', { message: 'You are not in this game' });
                }

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
                    // Broadcast the action event so other clients can apply it
                    // optimistically to their local state while the DB write
                    // (triggered by the acting client's game:saveState) is in flight.
                    socket.to(`game:${gameId}`).emit('game:action', {
                        username: socket.username,
                        playerId: socket.userId,
                        action,
                        data: hydratedData,
                        timestamp: Date.now()
                    });
                }

                console.log(`[PERF] game:action ${action}: Hydrate=${hydrateDuration}ms, TOTAL=${Date.now() - totalStart}ms`);
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
                // Eager Mongo flush on turn end (natural checkpoint)
                cancelMongoFlush(gameId);
                await flushStateToMongo(gameId);

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
                    cancelMongoFlush(gameId);
                    await flushStateToMongo(gameId);
                    await Game.findByIdAndDelete(gameId);
                    await redis.deleteGame(gameId);
                    console.log(`[PERF] game:leave delete: ${Date.now() - t}ms`);
                    clearGameActivityTimer(gameId);
                } else {
                    t = Date.now();

                    await redis.removePlayerFromGame(gameId, socket.userId);
                    await redis.deletePlayerFromState(gameId, socket.userId);
                    await redis.deleteHydratedPlayerState(gameId, socket.userId);
                    cancelMongoFlush(gameId);
                    await flushStateToMongo(gameId);
                    scheduleMongoFlush(gameId); // restart debounce for remaining players
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
        // REMOVED: Peer-to-peer state sync is replaced by DB-authoritative
        // game:stateSnapshot broadcasts triggered by game:saveState writes.
        // This handler is kept as a no-op stub so old clients don't hard-error,
        // but it does nothing. Remove entirely once all clients are updated.
        socket.on('game:syncState', () => {
            // intentionally empty — DB is now the source of truth
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
            console.log('[SAVE STATE ENTRY] handler reached, userId:', socket.userId, 'gameId:', gameId);
            const totalStart = Date.now();
            try {
                if (!socket.userId) return;
                console.log('[SAVE STATE] received from:', socket.userId);
                console.log('[SAVE STATE] has gameState?', !!gameState, 'has playerState?', !!playerState);
                console.log('[SAVE STATE] clientTimestamp:', clientTimestamp);

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

                // Auth: Redis membership check (Mongo fallback if Redis cold)
                const isMember = await redis.isPlayerInGame(gameId, socket.userId);

                if (!isMember) {
                    // Slow-path: confirm via Mongo in case Redis was just cold-started
                    const game = await findGameForPlayer(gameId, socket.userId); // throws if not found

                    // Seed Redis so next save is fast
                    await redis.addPlayerToGame(gameId, socket.userId);
                }

                let t = Date.now();

                t = Date.now();
                // ── Write to Redis immediately ──────────────────────────────────
                const strippedStateMap = {};

                if (gameState) {
                    for (const [pId, state] of Object.entries(gameState)) {
                        const existingRaw = await redis.getStrippedGameState(gameId);
                        const existingTs = existingRaw?.[pId]?.lastUpdated
                            ? new Date(existingRaw[pId].lastUpdated).getTime() : 0;

                        if (timestamp >= existingTs) {
                            const stripped = stripPlayerStateForStorage(state);
                            await redis.saveStrippedPlayerState(gameId, pId, stripped, timestamp);
                            await redis.deleteHydratedPlayerState(gameId, pId); // invalidate stale hydrated entry
                            strippedStateMap[pId] = stripped;
                        }
                    }
                } else if (playerId && playerState) {
                    if (playerId !== socket.userId)
                        return socket.emit('game:stateSaved', { success: false, error: 'Can only save your own state' });

                    const existingRaw = await redis.getStrippedGameState(gameId);
                    const existingTs = existingRaw?.[playerId]?.lastUpdated
                        ? new Date(existingRaw[playerId].lastUpdated).getTime() : 0;

                    if (timestamp >= existingTs) {
                        const stripped = stripPlayerStateForStorage(playerState);
                        await redis.saveStrippedPlayerState(gameId, playerId, stripped, timestamp);
                        await redis.deleteHydratedPlayerState(gameId, playerId);
                        strippedStateMap[playerId] = stripped;
                    }
                }

                const stripDuration = Date.now() - t;

                if (typeof ack === 'function') ack();
                socket.emit('game:stateSaved', { success: true, timestamp: new Date(timestamp) });

                // Broadcast using freshest Redis state (all players, not just the one that just saved)
                const fullStripped = await redis.getStrippedGameState(gameId);
                await broadcastStateSnapshot(gameId, fullStripped ?? strippedStateMap);

                // Debounced Mongo flush — actual DB write happens 30 s after last action
                scheduleMongoFlush(gameId);

                console.log(`[PERF] game:saveState: Strip=${stripDuration}ms, TOTAL=${Date.now() - totalStart}ms (Mongo deferred)`);
            } catch (err) {
                console.error('[SAVE STATE ERROR]', { gameId, userId: socket.userId, message: err.message, stack: err.stack });
                socket.emit('game:stateSaved', { success: false, error: err.message });
            }
        });

        // ── saveChatLog ───────────────────────────────────────────────────────────

        socket.on('game:saveChatLog', async ({ gameId, chatLog }) => {
            try {
                if (!socket.userId) return;
                const isMember = await redis.isPlayerInGame(gameId, socket.userId);
                if (!isMember) return;
                await redis.saveChatLog(gameId, chatLog);
                socket.emit('game:chatLogSaved', { success: true });
                // No state snapshot needed for chat-only saves — chat is not
                // part of the player state broadcasted to opponents.
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
                    
                    // Flush Redis → Mongo eagerly on disconnect
                    cancelMongoFlush(gameId);
                    await flushStateToMongo(gameId);

                    await redis.removePlayerFromGame(gameId, socket.userId);
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
                        // savedState: freshGame.savedState?.[socket.userId]
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
            for (const t of mongoFlushTimers.values()) clearTimeout(t);
            mongoFlushTimers.clear();
        };
    }
};