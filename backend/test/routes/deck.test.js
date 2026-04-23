/**
 * deck.test.js
 *
 * Tests deck CRUD, card add/remove, and import endpoint.
 * Mocks Deck model, cardCache, scryfallService, and r2client.
 */

const request = require('supertest');
const express = require('express');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/models/Deck');
jest.mock('../../src/models/User');
jest.mock('../../src/services/r2cardCache');
jest.mock('../../src/services/scryfallService');
jest.mock('../../src/services/r2client', () => ({
    uploadCardToR2: jest.fn().mockResolvedValue(undefined),
    cardExistsInR2: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/middleware/auth', () => (req, _res, next) => {
    req.user = { _id: 'user1' };
    next();
});

const Deck = require('../../src/models/Deck');
const User = require('../../src/models/User');
const cardCache = require('../../src/services/r2cardCache');
const scryfallService = require('../../src/services/scryfallService');

// ── App setup ─────────────────────────────────────────────────────────────────

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/decks', require('../../src/routes/deck'));
    return app;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_CARD_DATA = {
    scryfallId: 'scry-abc',
    name: 'Lightning Bolt',
    imageUrl: 'http://img',
    manaCost: '{R}',
    type: 'Instant',
    priceValue: 1.5,
};

function buildMockDeck(overrides = {}) {
    return {
        _id: 'deck1',
        name: 'My Deck',
        owner: 'user1',
        cards: [],
        sideboard: [],
        startInPlay: [],
        format: 'Commander',
        priceValue: 0,
        toObject: jest.fn().mockReturnThis(),
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

// ── GET /decks/my-decks ───────────────────────────────────────────────────────

describe('GET /decks/my-decks', () => {
    test('returns hydrated deck list', async () => {
        const deck = buildMockDeck({ cards: [{ scryfallId: 'scry-abc', quantity: 1 }] });
        Deck.find = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([deck]) });
        cardCache.batchFetch = jest.fn().mockResolvedValue({ 'scry-abc': MOCK_CARD_DATA });

        const res = await request(buildApp()).get('/decks/my-decks');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

// ── GET /decks/:id ─────────────────────────────────────────────────────────────

describe('GET /decks/:id', () => {
    test('404 when deck not found', async () => {
        Deck.findById = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
        const res = await request(buildApp()).get('/decks/nonexistent');
        expect(res.status).toBe(404);
    });

    test('returns hydrated deck on success', async () => {
        const deck = buildMockDeck();
        Deck.findById = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(deck) });
        cardCache.batchFetch = jest.fn().mockResolvedValue({});

        const res = await request(buildApp()).get('/decks/deck1');
        expect(res.status).toBe(200);
        expect(res.body._id).toBe('deck1');
    });
});

// ── POST /decks ───────────────────────────────────────────────────────────────

describe('POST /decks', () => {
    test('400 when name or format missing', async () => {
        const res = await request(buildApp()).post('/decks').send({ name: 'My Deck' });
        expect(res.status).toBe(400);
    });

    test('201 on valid creation', async () => {
        const savedDeck = buildMockDeck({ _id: 'deck1' });
        Deck.mockImplementation(() => ({
            ...savedDeck,
            save: jest.fn().mockResolvedValue(savedDeck),
        }));
        Deck.findById = jest.fn().mockResolvedValue(savedDeck);
        cardCache.batchFetch = jest.fn().mockResolvedValue({});
        User.findByIdAndUpdate = jest.fn().mockResolvedValue(undefined);

        const res = await request(buildApp()).post('/decks').send({
            name: 'My Deck',
            format: 'Commander',
            cards: [],
        });

        expect(res.status).toBe(201);
    });
});

// ── PATCH /decks/:id ──────────────────────────────────────────────────────────

describe('PATCH /decks/:id', () => {
    test('403 when not owner', async () => {
        Deck.findById = jest.fn().mockResolvedValue(buildMockDeck({ owner: 'otherUser' }));
        const res = await request(buildApp()).patch('/decks/deck1').send({ name: 'Renamed' });
        expect(res.status).toBe(403);
    });

    test('200 on authorized update', async () => {
        const deck = buildMockDeck({ owner: 'user1' });
        Deck.findById = jest.fn().mockResolvedValue(deck);
        Deck.findByIdAndUpdate = jest.fn().mockResolvedValue(deck);
        cardCache.batchFetch = jest.fn().mockResolvedValue({});

        const res = await request(buildApp()).patch('/decks/deck1').send({ name: 'Renamed' });
        expect(res.status).toBe(200);
    });
});

// ── POST /decks/:id/cards/:cardId ─────────────────────────────────────────────

describe('POST /decks/:id/cards/:cardId', () => {
    test('404 when card not in cache', async () => {
        const deck = buildMockDeck({ owner: 'user1' });
        Deck.findById = jest.fn().mockResolvedValue(deck);
        cardCache.fetch = jest.fn().mockResolvedValue(null); // not found

        const res = await request(buildApp())
            .post('/decks/deck1/cards/scry-missing')
            .send({ zone: 'mainDeck', quantity: 1 });

        expect(res.status).toBe(404);
    });

    test('adds card to mainDeck', async () => {
        const deck = buildMockDeck({ owner: 'user1', cards: [] });
        Deck.findById = jest
            .fn()
            .mockResolvedValueOnce(deck)        // for the route handler
            .mockResolvedValueOnce(deck);        // for calculateDeckPrice re-fetch
        cardCache.fetch = jest.fn().mockResolvedValue(MOCK_CARD_DATA);
        cardCache.batchFetch = jest.fn().mockResolvedValue({ 'scry-abc': MOCK_CARD_DATA });

        const res = await request(buildApp())
            .post('/decks/deck1/cards/scry-abc')
            .send({ zone: 'mainDeck', quantity: 2 });

        expect(res.status).toBe(200);
        // Deck.save should have been called
        expect(deck.save).toHaveBeenCalled();
    });
});

// ── POST /decks/:id/import ────────────────────────────────────────────────────

describe('POST /decks/:id/import', () => {
    test('adds found cards, reports not-found', async () => {
        const deck = buildMockDeck({ owner: 'user1', cards: [] });
        Deck.findById = jest.fn().mockResolvedValue(deck);
        cardCache.batchFetch = jest.fn().mockResolvedValue({ 'scry-abc': MOCK_CARD_DATA });

        scryfallService.getCardsBatch = jest.fn().mockResolvedValue({
            found: [MOCK_CARD_DATA],
            notFound: ['Fake Card'],
        });

        const res = await request(buildApp())
            .post('/decks/deck1/import')
            .send({ decklist: '4 Lightning Bolt\n1 Fake Card' });

        expect(res.status).toBe(200);
        expect(res.body.addedCards.length).toBeGreaterThan(0);
        expect(res.body.invalidCards).toContain('Fake Card');
    });

    test('403 when not owner', async () => {
        Deck.findById = jest.fn().mockResolvedValue(buildMockDeck({ owner: 'otherUser' }));
        const res = await request(buildApp())
            .post('/decks/deck1/import')
            .send({ decklist: '1 Lightning Bolt' });
        expect(res.status).toBe(403);
    });
});

// ── DELETE /decks/:id ─────────────────────────────────────────────────────────

describe('DELETE /decks/:id', () => {
    test('403 when not owner', async () => {
        Deck.findById = jest.fn().mockResolvedValue(buildMockDeck({ owner: 'otherUser' }));
        const res = await request(buildApp()).delete('/decks/deck1');
        expect(res.status).toBe(403);
    });

    test('200 on successful delete', async () => {
        Deck.findById = jest.fn().mockResolvedValue(buildMockDeck({ owner: 'user1' }));
        Deck.findByIdAndDelete = jest.fn().mockResolvedValue(undefined);
        User.findByIdAndUpdate = jest.fn().mockResolvedValue(undefined);

        const res = await request(buildApp()).delete('/decks/deck1');
        expect(res.status).toBe(200);
        expect(Deck.findByIdAndDelete).toHaveBeenCalledWith('deck1');
    });
});