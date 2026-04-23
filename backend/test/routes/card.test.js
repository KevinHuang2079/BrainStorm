/**
 * card.test.js
 *
 * Tests /cards/search, /cards/search-tokens, and /cards/:id routes.
 */

const request = require('supertest');
const express = require('express');

jest.mock('../../src/services/r2cardCache');
jest.mock('../../src/services/scryfallService');
jest.mock('../../src/services/r2client', () => ({
    uploadCardToR2: jest.fn().mockResolvedValue(undefined),
    cardExistsInR2: jest.fn().mockResolvedValue(true),
}));

const cardCache = require('../../src/services/r2cardCache');
const scryfallService = require('../../src/services/scryfallService');

const MOCK_CARD = { scryfallId: 'scry-abc', name: 'Lightning Bolt', imageUrl: 'http://img' };

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/cards', require('../../src/routes/card'));
    return app;
}

describe('GET /cards/search/:term', () => {
    test('returns array of cards from scryfall', async () => {
        scryfallService.searchCards = jest.fn().mockResolvedValue([MOCK_CARD]);

        const res = await request(buildApp()).get('/cards/search/bolt');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Lightning Bolt' })]));
    });

    test('returns empty array when scryfall returns nothing', async () => {
        scryfallService.searchCards = jest.fn().mockResolvedValue([]);

        const res = await request(buildApp()).get('/cards/search/zzznomatches');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe('GET /cards/search-tokens/:term', () => {
    test('passes t:token prefix to scryfall', async () => {
        scryfallService.searchCards = jest.fn().mockResolvedValue([]);

        await request(buildApp()).get('/cards/search-tokens/soldier');
        expect(scryfallService.searchCards).toHaveBeenCalledWith(expect.stringContaining('t:token'));
    });
});

describe('GET /cards/:id', () => {
    test('returns card from cache', async () => {
        cardCache.fetch = jest.fn().mockResolvedValue(MOCK_CARD);

        const res = await request(buildApp()).get('/cards/scry-abc');
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Lightning Bolt');
    });

    test('404 when card not in cache', async () => {
        cardCache.fetch = jest.fn().mockResolvedValue(null);

        const res = await request(buildApp()).get('/cards/nonexistent-id');
        expect(res.status).toBe(404);
    });
});