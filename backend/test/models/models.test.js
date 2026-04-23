/**
 * models.test.js
 *
 * Light schema validation tests for User, Game, and Deck models.
 * Uses mongodb-memory-server for an in-process Mongo instance.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await mongoose.connection.dropDatabase();
});

// ── User ──────────────────────────────────────────────────────────────────────

describe('User model', () => {
    let User;

    beforeAll(() => {
        User = require('../../src/models/User');
    });

    beforeEach(async () => {          
        await User.syncIndexes();
    });

    test('saves valid user', async () => {
        const user = new User({ username: 'alice', email: 'alice@example.com', password: 'hashed' });
        const saved = await user.save();
        expect(saved._id).toBeDefined();
        expect(saved.username).toBe('alice');
    });

    test('requires username', async () => {
        const user = new User({ email: 'alice@example.com', password: 'hash' });
        await expect(user.save()).rejects.toThrow();
    });

    test('requires email', async () => {
        const user = new User({ username: 'alice', password: 'hash' });
        await expect(user.save()).rejects.toThrow();
    });

    test('requires password', async () => {
        const user = new User({ username: 'alice', email: 'alice@example.com' });
        await expect(user.save()).rejects.toThrow();
    });

    test('enforces unique username', async () => {
        await new User({ username: 'alice', email: 'a1@x.com', password: 'h' }).save();
        const dup = new User({ username: 'alice', email: 'a2@x.com', password: 'h' });
        await expect(dup.save()).rejects.toThrow();
    });

    test('password field is not selected by default', async () => {
        await new User({ username: 'bob', email: 'bob@x.com', password: 'secret' }).save();
        const found = await User.findOne({ username: 'bob' });
        expect(found.password).toBeUndefined();
    });

    test('avatarUrl defaults to null', async () => {
        const user = await new User({ username: 'charlie', email: 'c@x.com', password: 'h' }).save();
        expect(user.avatarUrl).toBeNull();
    });
});

// ── Game ──────────────────────────────────────────────────────────────────────

describe('Game model', () => {
    let Game, hostId;

    beforeAll(() => {
        Game = require('../../src/models/Game');
        hostId = new mongoose.Types.ObjectId();
    });

    test('saves valid game', async () => {
        const game = new Game({ name: 'Test Game', host: hostId, players: [hostId], maxPlayers: 4 });
        const saved = await game.save();
        expect(saved._id).toBeDefined();
        expect(saved.status).toBe('waiting');
    });

    test('requires name', async () => {
        const game = new Game({ host: hostId, players: [hostId], maxPlayers: 4 });
        await expect(game.save()).rejects.toThrow();
    });

    test('requires host', async () => {
        const game = new Game({ name: 'Game', players: [hostId], maxPlayers: 4 });
        await expect(game.save()).rejects.toThrow();
    });

    test('maxPlayers min=2, max=4 enforced', async () => {
        const tooFew = new Game({ name: 'G', host: hostId, players: [hostId], maxPlayers: 1 });
        await expect(tooFew.save()).rejects.toThrow();

        const tooMany = new Game({ name: 'G', host: hostId, players: [hostId], maxPlayers: 5 });
        await expect(tooMany.save()).rejects.toThrow();
    });

    test('status defaults to waiting', async () => {
        const game = await new Game({ name: 'G', host: hostId, players: [hostId], maxPlayers: 4 }).save();
        expect(game.status).toBe('waiting');
    });

    test('rejects invalid format', async () => {
        const game = new Game({ name: 'G', host: hostId, players: [hostId], maxPlayers: 4, format: 'InvalidFormat' });
        await expect(game.save()).rejects.toThrow();
    });
});

// ── Deck ──────────────────────────────────────────────────────────────────────

describe('Deck model', () => {
    let Deck, ownerId;

    beforeAll(() => {
        Deck = require('../../src/models/Deck');
        ownerId = new mongoose.Types.ObjectId();
    });

    beforeEach(async () => {          
        await Deck.syncIndexes();
    });



    test('saves valid deck', async () => {
        const deck = new Deck({ name: 'My Deck', owner: ownerId, format: 'Commander' });
        const saved = await deck.save();
        expect(saved._id).toBeDefined();
        expect(saved.priceValue).toBe(0);
    });

    test('requires name', async () => {
        const deck = new Deck({ owner: ownerId, format: 'Commander' });
        await expect(deck.save()).rejects.toThrow();
    });

    test('requires owner', async () => {
        const deck = new Deck({ name: 'Deck', format: 'Commander' });
        await expect(deck.save()).rejects.toThrow();
    });

    test('requires format', async () => {
        const deck = new Deck({ name: 'Deck', owner: ownerId });
        await expect(deck.save()).rejects.toThrow();
    });

    test('enforces unique name per owner', async () => {
        await new Deck({ name: 'Aggro', owner: ownerId, format: 'Standard' }).save();
        const dup = new Deck({ name: 'Aggro', owner: ownerId, format: 'Standard' });
        await expect(dup.save()).rejects.toThrow();
    });

    test('card entry requires scryfallId and quantity >= 1', async () => {
        const deck = new Deck({
            name: 'Bad Deck',
            owner: ownerId,
            format: 'Commander',
            cards: [{ scryfallId: 'abc', quantity: 0 }], // quantity 0 should fail
        });
        await expect(deck.save()).rejects.toThrow();
    });

    test('different owner can have same deck name', async () => {
        const other = new mongoose.Types.ObjectId();
        await new Deck({ name: 'Aggro', owner: ownerId, format: 'Standard' }).save();
        const deck2 = new Deck({ name: 'Aggro', owner: other, format: 'Standard' });
        await expect(deck2.save()).resolves.toBeDefined();
    });
});