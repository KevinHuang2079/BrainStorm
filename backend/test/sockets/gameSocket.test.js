/**
 * gameSocket.test.js
 *
 * Tests the core socket event logic: action relay, state save/load,
 * reconnect sync, inactivity timer wiring, and auth middleware.
 *
 * Strategy: mock heavy I/O (Game model, cardCache, jwt) and test that
 * the right socket events are emitted with the right payloads.
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const jwt = require('jsonwebtoken');

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/models/Game');
jest.mock('../../src/models/User');
jest.mock('../../src/services/r2cardCache');

const Game = require('../../src/models/Game');
const User = require('../../src/models/User');
const cardCache = require('../../src/services/r2cardCache');

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const MOCK_CARD = {
    _id: 'card1',
    scryfallId: 'scry-abc',
    name: 'Lightning Bolt',
    imageUrl: 'http://img',
    position: { x: 0, y: 0 },
    isTapped: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(userId = 'user1') {
    return jwt.sign({ _id: userId }, process.env.JWT_SECRET);
}

/**
 * Builds a mock game whose instance-level populate() mutates scalar fields
 * (host, currentTurn) into full objects using the players array as a lookup.
 *
 * BUG FIX #8: populate() must be async (return a Promise) because saveAndPopulate
 * awaits it. The old synchronous mock returned a plain value, which caused the
 * chained awaits in saveAndPopulate to resolve to undefined — the handler then
 * threw and never emitted game:joined, causing test timeouts.
 */
function buildMockGame(overrides = {}) {
    const players = overrides.players ?? [
        { _id: 'user1', toString: () => 'user1', username: 'Alice' },
    ];

    const base = {
        _id: 'game1',
        name: 'Test Game',
        players,
        connectedPlayers: overrides.connectedPlayers ?? [{ toString: () => 'user1' }],
        host: overrides.host ?? { _id: 'user1', toString: () => 'user1', username: 'Alice' },
        status: overrides.status ?? 'waiting',
        maxPlayers: overrides.maxPlayers ?? 4,
        savedState: overrides.savedState ?? {},
        currentTurn: overrides.currentTurn ?? undefined,
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };

    // Instance-level populate used by saveAndPopulate().
    // Returns a Promise (async) so that `await game.populate(...)` works correctly
    // in all call sites. Resolves scalar id fields to their full player objects
    // via the players/connectedPlayers lookup — matching what Mongoose does.
    base.populate = jest.fn().mockImplementation(async function (field, _select) {
        const lookup = {};
        for (const arr of [this.players, this.connectedPlayers].filter(Array.isArray)) {
            for (const p of arr) {
                if (p?._id) lookup[p._id.toString()] = p;
            }
        }
        const val = this[field];
        if (val != null && typeof val !== 'object') {
            // scalar id — resolve to player object
            if (lookup[val.toString()]) this[field] = lookup[val.toString()];
        } else if (val != null && typeof val.toString === 'function' && !val.username) {
            // object with only toString (no username yet) — resolve
            const resolved = lookup[val.toString()];
            if (resolved) this[field] = resolved;
        }
        return this;  // must return `this` so chained awaits in saveAndPopulate work
    });

    if (!overrides.toObject) {
        base.toObject = jest.fn(() => ({ _id: 'game1', savedState: base.savedState }));
    }

    return base;
}

/**
 * Returns a mock query whose populate()/sort() chain returns itself and
 * resolves to resolvedValue when awaited.
 *
 * This is what Game.findById() returns. populateGame() chains .populate()
 * calls on this query object — NOT on the game instance. So we make this
 * query resolve to a game that already has its fields populated (i.e. full
 * player objects, not raw ids).
 */
function makePopulatableQuery(resolvedValue) {
    const query = {
        populate: jest.fn(),
        sort: jest.fn(),
        then: (onFulfilled, onRejected) =>
            Promise.resolve(resolvedValue).then(onFulfilled, onRejected),
        catch: (onRejected) =>
            Promise.resolve(resolvedValue).catch(onRejected),
    };
    query.populate.mockReturnValue(query);
    query.sort.mockReturnValue(query);
    return query;
}

/**
 * Wires the standard Game static method mocks.
 * Game.findById returns a populatable query that resolves to mockGame.
 * Because populateGame() chains .populate() on the query (not the instance),
 * the game that comes out the other side is whatever mockGame already is —
 * so mockGame's fields must already be full objects, not scalar ids.
 */
function setupGameMocks(mockGame) {
    Game.findById = jest.fn().mockReturnValue(makePopulatableQuery(mockGame));
    Game.find = jest.fn().mockReturnValue(makePopulatableQuery([]));
    Game.findByIdAndUpdate = jest.fn().mockResolvedValue(undefined);
}

function createTestServer() {
    const httpServer = createServer();
    const io = new Server(httpServer);
    require('../../src/sockets/gameSocket')(io);
    return { httpServer, io };
}

function connectClient(port, userId) {
    return Client(`http://localhost:${port}`, {
        extraHeaders: { cookie: `token=${makeToken(userId)}` },
    });
}

// BUG FIX #9: Clear the module-level gameActivityTimers map after every test.
// The 23-hour setTimeout registered by resetGameActivityTimer keeps the Jest
// worker alive and produces "open handles" warnings. The _clearAllTimers helper
// is wired up in gameSocket.js when NODE_ENV === 'test'.
afterEach(() => {
    try {
        // Re-require to get the live module (Jest caches it)
        require('../../src/sockets/gameSocket')._clearAllTimers?.();
    } catch {
        // Module may not be loaded in every suite — safe to swallow
    }
});

// ── Auth middleware ───────────────────────────────────────────────────────────

describe('Socket auth middleware', () => {
    let httpServer, client;

    beforeEach((done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });
        setupGameMocks(buildMockGame());
        ({ httpServer } = createTestServer());
        httpServer.listen(done);
    });

    afterEach((done) => {
        client?.disconnect();
        httpServer.close(done);
    });

    test('rejects connection with no token', (done) => {
        const port = httpServer.address().port;
        client = Client(`http://localhost:${port}`);
        client.on('connect_error', (err) => {
            expect(err.message).toMatch(/No token provided/i);
            done();
        });
    });

    test('rejects connection with invalid token', (done) => {
        const port = httpServer.address().port;
        client = Client(`http://localhost:${port}`, {
            extraHeaders: { cookie: 'token=bad.token.here' },
        });
        client.on('connect_error', (err) => {
            expect(err.message).toMatch(/Authentication error/i);
            done();
        });
    });

    test('accepts connection with valid token', (done) => {
        const port = httpServer.address().port;
        client = connectClient(port, 'user1');
        client.on('connect', () => done());
        client.on('connect_error', done);
    });
});

// ── game:create ───────────────────────────────────────────────────────────────

describe('game:create', () => {
    let httpServer, client;

    beforeEach((done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });

        const mockGame = buildMockGame();
        Game.mockImplementation(() => mockGame);
        setupGameMocks(mockGame);

        ({ httpServer } = createTestServer());
        httpServer.listen(() => {
            client = connectClient(httpServer.address().port, 'user1');
            client.once('connect', done);
        });
    });

    afterEach((done) => {
        client.disconnect();
        httpServer.close(done);
    });

    test('emits game:joined on success', (done) => {
        client.once('game:joined', (game) => {
            expect(game).toBeDefined();
            done();
        });
        client.emit('game:create', { name: 'My Game', format: 'Commander', maxPlayers: 4 });
    });
});

// ── game:action relay ─────────────────────────────────────────────────────────

describe('game:action relay', () => {
    let httpServer, client1, client2;

    beforeEach((done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });

        const mockGame = buildMockGame({
            players: [
                { _id: 'user1', toString: () => 'user1', username: 'Alice' },
                { _id: 'user2', toString: () => 'user2', username: 'Bob' },
            ],
        });

        setupGameMocks(mockGame);
        cardCache.fetch = jest.fn().mockResolvedValue(MOCK_CARD);
        cardCache.batchFetch = jest.fn().mockResolvedValue({ 'scry-abc': MOCK_CARD });

        ({ httpServer } = createTestServer());
        httpServer.listen(() => {
            const port = httpServer.address().port;
            client1 = connectClient(port, 'user1');
            client2 = connectClient(port, 'user2');

            let connected = 0;
            const onConnect = () => { if (++connected === 2) done(); };
            client1.once('connect', onConnect);
            client2.once('connect', onConnect);
        });
    });

    afterEach((done) => {
        client1.disconnect();
        client2.disconnect();
        httpServer.close(done);
    });

    test('relays play action to other player in same game', (done) => {
        client1.emit('game:join', { gameId: 'game1' });
        client2.emit('game:join', { gameId: 'game1' });

        client2.once('game:action', ({ action, playerId }) => {
            expect(action).toBe('play');
            expect(playerId).toBe('user1');
            done();
        });

        setTimeout(() => {
            client1.emit('game:action', { gameId: 'game1', action: 'play', data: MOCK_CARD });
        }, 100);
    });

    test('does NOT relay rollDice as game:action — emits game:diceRolled instead', (done) => {
        client1.emit('game:join', { gameId: 'game1' });
        client2.emit('game:join', { gameId: 'game1' });

        let gotAction = false;
        client2.on('game:action', () => { gotAction = true; });

        client2.once('game:diceRolled', ({ result, sides }) => {
            expect(typeof result).toBe('number');
            expect(gotAction).toBe(false);
            done();
        });

        setTimeout(() => {
            client1.emit('game:action', {
                gameId: 'game1',
                action: 'rollDice',
                data: { result: 6, sides: 6 },
            });
        }, 100);
    });

    test('emits error when player is not in game', (done) => {
        const mockGameNoPlayer = buildMockGame({
            players: [{ _id: 'user2', toString: () => 'user2', username: 'Bob' }],
        });
        Game.findById = jest.fn().mockReturnValue(makePopulatableQuery(mockGameNoPlayer));

        client1.once('error', ({ message }) => {
            expect(message).toMatch(/not in this game/i);
            done();
        });

        client1.emit('game:action', { gameId: 'game1', action: 'drawCard', data: {} });
    });

    test('relays stateUpdate to other players in room', (done) => {
        client1.emit('game:join', { gameId: 'game1' });
        client2.emit('game:join', { gameId: 'game1' });

        client2.once('game:stateUpdate', ({ senderId, gameState }) => {
            expect(senderId).toBe('user1');
            expect(gameState).toBeDefined();
            done();
        });

        setTimeout(() => {
            client1.emit('game:syncState', {
                gameId: 'game1',
                gameState: { user1: { hand: [], battlefield: [] } },
            });
        }, 100);
    });
});

// ── game:saveState ────────────────────────────────────────────────────────────

describe('game:saveState', () => {
    let httpServer, client, mockGame;

    beforeEach((done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });

        mockGame = buildMockGame();
        mockGame.savedState = {};
        mockGame.save = jest.fn().mockResolvedValue(undefined);

        setupGameMocks(mockGame);

        ({ httpServer } = createTestServer());
        httpServer.listen(() => {
            client = connectClient(httpServer.address().port, 'user1');
            client.once('connect', done);
        });
    });

    afterEach((done) => {
        client.disconnect();
        httpServer.close(done);
    });

    test('persists playerState and acks success', (done) => {
        client.once('game:stateSaved', ({ success }) => {
            expect(success).toBe(true);
            expect(mockGame.save).toHaveBeenCalled();
            done();
        });

        client.emit('game:saveState', {
            gameId: 'game1',
            playerId: 'user1',
            playerState: {
                library: [{ _id: 'c1', scryfallId: 'scry-abc' }],
                hand: [],
                battlefield: [],
                lifeTotal: 40,
            },
            clientTimestamp: Date.now(),
        });
    });

    test("rejects saving another player's state", (done) => {
        client.once('game:stateSaved', ({ success, error }) => {
            expect(success).toBe(false);
            expect(error).toMatch(/own state/i);
            done();
        });

        client.emit('game:saveState', {
            gameId: 'game1',
            playerId: 'user2',
            playerState: { hand: [] },
            clientTimestamp: Date.now(),
        });
    });

    // BUG FIX #2: saveState with no clientTimestamp must now be rejected rather
    // than silently accepting it. Update test to expect failure.
    test('rejects save with missing clientTimestamp', (done) => {
        client.once('game:stateSaved', ({ success, error }) => {
            expect(success).toBe(false);
            expect(error).toMatch(/clientTimestamp/i);
            done();
        });

        client.emit('game:saveState', {
            gameId: 'game1',
            playerId: 'user1',
            playerState: { hand: [MOCK_CARD] },
            // intentionally omit clientTimestamp
        });
    });

    test('newer timestamp overwrites older savedState', (done) => {
        const old = Date.now() - 10000;
        mockGame.savedState['user1'] = { hand: [], lastUpdated: new Date(old) };

        client.once('game:stateSaved', ({ success }) => {
            expect(success).toBe(true);
            expect(mockGame.savedState['user1'].lastUpdated).toBeDefined();
            done();
        });

        client.emit('game:saveState', {
            gameId: 'game1',
            playerId: 'user1',
            playerState: { hand: [MOCK_CARD], lifeTotal: 35 },
            clientTimestamp: Date.now(),
        });
    });

    test('stale timestamp does NOT overwrite fresher savedState', (done) => {
        const future = Date.now() + 99999;
        mockGame.savedState['user1'] = {
            hand: [{ _id: 'oldcard', scryfallId: 'scry-old' }],
            lastUpdated: new Date(future),
        };

        client.once('game:stateSaved', () => {
            const entry = mockGame.savedState['user1'];
            expect(entry.hand[0].scryfallId).toBe('scry-old');
            done();
        });

        client.emit('game:saveState', {
            gameId: 'game1',
            playerId: 'user1',
            playerState: { hand: [MOCK_CARD] },
            clientTimestamp: Date.now() - 5000,
        });
    });

    test('bulk gameState save persists all player entries', (done) => {
        client.once('game:stateSaved', ({ success }) => {
            expect(success).toBe(true);
            expect(mockGame.savedState['user1']).toBeDefined();
            expect(mockGame.savedState['user2']).toBeDefined();
            done();
        });

        client.emit('game:saveState', {
            gameId: 'game1',
            gameState: {
                user1: { hand: [], battlefield: [], lifeTotal: 40 },
                user2: { hand: [], battlefield: [], lifeTotal: 40 },
            },
            clientTimestamp: Date.now(),
        });
    });
});

// ── game:leave ────────────────────────────────────────────────────────────────

describe('game:leave', () => {
    let httpServer, client;

    beforeEach((done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });

        // BUG FIX #10: Use makePopulatableQuery consistently so the mock works
        // even if game:leave is ever refactored to use populateGame().
        Game.find = jest.fn().mockReturnValue(makePopulatableQuery([]));

        ({ httpServer } = createTestServer());
        httpServer.listen(() => {
            client = connectClient(httpServer.address().port, 'user1');
            client.once('connect', done);
        });
    });

    afterEach((done) => {
        client.disconnect();
        httpServer.close(done);
    });

    test('deletes game when last player leaves', (done) => {
        const mockGame = buildMockGame({
            players: [{ _id: 'user1', toString: () => 'user1', username: 'Alice' }],
            connectedPlayers: [{ toString: () => 'user1' }],
            host: { toString: () => 'user1' },
            currentTurn: { toString: () => 'user1' },
        });

        // BUG FIX #10: Use makePopulatableQuery instead of mockResolvedValue
        Game.findById = jest.fn().mockReturnValue(makePopulatableQuery(mockGame));
        Game.findByIdAndDelete = jest.fn().mockResolvedValue(undefined);

        client.emit('game:leave', { gameId: 'game1' });

        setTimeout(() => {
            expect(Game.findByIdAndDelete).toHaveBeenCalledWith('game1');
            done();
        }, 300);
    });

    test('reassigns host when host leaves', (done) => {
        const player2 = { _id: 'user2', toString: () => 'user2', username: 'Bob' };
        const mockGame = buildMockGame({
            players: [
                { _id: 'user1', toString: () => 'user1', username: 'Alice' },
                player2,
            ],
            connectedPlayers: [{ toString: () => 'user1' }, player2],
            host: { toString: () => 'user1' },
        });

        // BUG FIX #10: Use makePopulatableQuery instead of mockResolvedValue
        Game.findById = jest.fn().mockReturnValue(makePopulatableQuery(mockGame));

        client.emit('game:leave', { gameId: 'game1' });

        setTimeout(() => {
            expect(mockGame.host.toString()).toBe('user2');
            done();
        }, 300);
    });
});

// ── card strip / hydrate round-trip ───────────────────────────────────────────

describe('stripCardForStorage / hydrateCard (internal logic)', () => {
    test('only metadata fields survive strip (no imageUrl)', (done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });

        const fullCard = {
            _id: 'c1',
            scryfallId: 'scry-abc',
            imageUrl: 'http://cdn/img.jpg',
            name: 'Fireball',
            position: { x: 10, y: 20 },
            isTapped: true,
            counters: {},
        };

        const mockGame = buildMockGame();
        mockGame.savedState = {};
        mockGame.save = jest.fn().mockImplementation(function () {
            const stored = this.savedState?.['user1'];
            if (stored?.battlefield?.[0]) {
                expect(stored.battlefield[0].imageUrl).toBeUndefined();
                expect(stored.battlefield[0].scryfallId).toBe('scry-abc');
                expect(stored.battlefield[0].isTapped).toBe(true);
            }
            return Promise.resolve();
        }.bind(mockGame));

        setupGameMocks(mockGame);

        const { httpServer } = createTestServer();
        httpServer.listen(() => {
            const client = connectClient(httpServer.address().port, 'user1');
            client.once('connect', () => {
                client.once('game:stateSaved', () => {
                    client.disconnect();
                    httpServer.close(done);
                });

                client.emit('game:saveState', {
                    gameId: 'game1',
                    playerId: 'user1',
                    playerState: {
                        battlefield: [fullCard],
                        hand: [],
                        library: [],
                        lifeTotal: 40,
                    },
                    clientTimestamp: Date.now(),
                });
            });
        });
    });
});

// ── game:join — reconnect hydration ───────────────────────────────────────────

describe('game:join — reconnect hydration', () => {
    let httpServer, client;

    beforeEach((done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });

        const strippedCard = { _id: 'c1', scryfallId: 'scry-abc', isTapped: false };
        const savedState = {
            user1: { battlefield: [strippedCard], hand: [], library: [], lastUpdated: new Date() },
        };

        const mockGame = buildMockGame({ savedState });
        mockGame.toObject = jest.fn().mockReturnValue({ _id: 'game1', savedState });

        setupGameMocks(mockGame);
        cardCache.batchFetch = jest.fn().mockResolvedValue({ 'scry-abc': MOCK_CARD });

        ({ httpServer } = createTestServer());
        httpServer.listen(() => {
            client = connectClient(httpServer.address().port, 'user1');
            client.once('connect', done);
        });
    });

    afterEach((done) => {
        client.disconnect();
        httpServer.close(done);
    });

    test('hydrates savedState cards when rejoining', (done) => {
        client.once('game:joined', (game) => {
            const bf = game.savedState?.user1?.battlefield;
            expect(bf?.[0]?.name).toBe('Lightning Bolt');
            done();
        });
        client.emit('game:join', { gameId: 'game1' });
    });
});

// ── game:startGame ────────────────────────────────────────────────────────────

describe('game:startGame', () => {
    let httpServer, client;

    beforeEach((done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });

        ({ httpServer } = createTestServer());
        httpServer.listen(() => {
            client = connectClient(httpServer.address().port, 'user1');
            client.once('connect', done);
        });
    });

    afterEach((done) => {
        client.disconnect();
        httpServer.close(done);
    });

    test('non-host cannot start game', (done) => {
        const mockGame = buildMockGame({
            host: { _id: 'user2', toString: () => 'user2', username: 'Bob' },
            status: 'waiting',
        });
        setupGameMocks(mockGame);

        client.once('error', ({ message }) => {
            expect(message).toMatch(/only the host/i);
            done();
        });
        client.emit('game:startGame', { gameId: 'game1' });
    });

    test('cannot start already-active game', (done) => {
        const mockGame = buildMockGame({ status: 'active' });
        setupGameMocks(mockGame);

        client.once('error', ({ message }) => {
            expect(message).toMatch(/already started/i);
            done();
        });
        client.emit('game:startGame', { gameId: 'game1' });
    });

    test('emits game:started with a valid startingPlayer username', (done) => {
        const mockGame = buildMockGame({
            status: 'waiting',
            players: [{ _id: 'user1', toString: () => 'user1', username: 'Alice' }],
        });
        setupGameMocks(mockGame);

        client.once('game:started', ({ startingPlayer }) => {
            expect(typeof startingPlayer).toBe('string');
            expect(startingPlayer.length).toBeGreaterThan(0);
            done();
        });
        client.emit('game:startGame', { gameId: 'game1' });
    });
});

// ── game:endTurn ──────────────────────────────────────────────────────────────

describe('game:endTurn', () => {
    let httpServer, client;

    beforeEach((done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });

        ({ httpServer } = createTestServer());
        httpServer.listen(() => {
            client = connectClient(httpServer.address().port, 'user1');
            client.once('connect', done);
        });
    });

    afterEach((done) => {
        client.disconnect();
        httpServer.close(done);
    });

    test("rejects ending turn when it's not your turn", (done) => {
        const mockGame = buildMockGame({
            status: 'active',
            currentTurn: { _id: 'user2', toString: () => 'user2', username: 'Bob' },
        });
        setupGameMocks(mockGame);

        client.once('error', ({ message }) => {
            expect(message).toMatch(/not your turn/i);
            done();
        });
        client.emit('game:endTurn', { gameId: 'game1' });
    });

    test('advances turn to next player in order', (done) => {
        const player1 = { _id: 'user1', toString: () => 'user1', username: 'Alice' };
        const player2 = { _id: 'user2', toString: () => 'user2', username: 'Bob' };
        const mockGame = buildMockGame({
            status: 'active',
            currentTurn: player1,
            players: [player1, player2],
            connectedPlayers: [player1, player2],
        });
        setupGameMocks(mockGame);

        client.once('game:turnChanged', ({ username }) => {
            expect(username).toBe('Bob');
            done();
        });
        client.emit('game:endTurn', { gameId: 'game1' });
    });
});

// ── inactivity timer ──────────────────────────────────────────────────────────

describe('inactivity timer', () => {
    let httpServer, client, port;

    // We do NOT call jest.useFakeTimers() in beforeEach because fake timers
    // also intercept socket.io-client's internal network I/O, causing the
    // handshake to hang. Instead we switch to fake timers only after the
    // client is fully connected.
    beforeEach((done) => {
        User.findById = jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ username: 'Alice' }),
        });
        setupGameMocks(buildMockGame());

        ({ httpServer } = createTestServer());
        httpServer.listen(0, () => {
            port = httpServer.address().port;
            client = connectClient(port, 'user1');
            client.once('connect', done);
        });
    });

    afterEach((done) => {
        // Always restore real timers first so Jest's own teardown infra works.
        jest.useRealTimers();
        client.disconnect();
        // Give socket.io a tick to process the disconnect before closing.
        setImmediate(() => httpServer.close(done));
    });

    test('emits game:inactivityWarning after warning threshold', (done) => {
        client.once('game:inactivityWarning', ({ timeRemaining }) => {
            expect(timeRemaining).toBeGreaterThan(0);
            // Restore real timers before calling done so afterEach cleanup works.
            jest.useRealTimers();
            done();
        });

        // Join fires resetGameActivityTimer on the server, registering the
        // 23-hour setTimeout. We wait for game:joined (which confirms the join
        // handler completed and the timer is registered) before switching to
        // fake timers and advancing the clock.
        client.once('game:joined', () => {
            jest.useFakeTimers();
            jest.advanceTimersByTime(23 * 60 * 60 * 1000 + 1000);
        });

        client.emit('game:join', { gameId: 'game1' });
    });
});