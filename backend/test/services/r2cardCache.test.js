/**
 * r2cardCache.test.js
 *
 * Tests in-memory cache hit/miss, batchFetch, TTL expiry,
 * and backfill trigger logic. Mocks r2client and scryfallService
 * so no real network calls are made.
 */

jest.mock('../../src/services/r2client');
jest.mock('../../src/services/scryfallService');

const { fetchCardFromR2, batchFetchCardsFromR2, uploadCardToR2 } = require('../../src/services/r2client');
const scryfallService = require('../../src/services/scryfallService');

// Re-require the cache fresh for each test suite so internal Map is clean
function freshCache() {
    jest.resetModules();
    jest.mock('../../src/services/r2client');
    jest.mock('../../src/services/scryfallService');
    return require('../../src/services/r2cardCache');
}

const CARD_WITH_CROP = {
    scryfallId: 'scry-abc',
    name: 'Lightning Bolt',
    imageUrl: 'http://img/normal.jpg',
    artCropUrl: 'http://img/art.jpg',
};

const CARD_NO_CROP = {
    scryfallId: 'scry-xyz',
    name: 'Counterspell',
    imageUrl: 'http://img/normal2.jpg',
    artCropUrl: '',
};

// ── fetch ─────────────────────────────────────────────────────────────────────

describe('CardCache.fetch', () => {
    let cache;

    beforeEach(() => {
        cache = freshCache();
        const { fetchCardFromR2: r2fetch } = require('../../src/services/r2client');
        r2fetch.mockReset();
    });

    test('returns cached value on second call (no R2 hit)', async () => {
        const { fetchCardFromR2: r2fetch } = require('../../src/services/r2client');
        r2fetch.mockResolvedValue(CARD_WITH_CROP);

        await cache.fetch('scry-abc');
        const result = await cache.fetch('scry-abc');

        expect(result.name).toBe('Lightning Bolt');
        expect(r2fetch).toHaveBeenCalledTimes(1); // only one R2 call total
    });

    test('returns null when not in cache and R2 returns nothing', async () => {
        const { fetchCardFromR2: r2fetch } = require('../../src/services/r2client');
        r2fetch.mockResolvedValue(null);

        const result = await cache.fetch('missing-id');
        expect(result).toBeNull();
    });

    test('triggers backfill when artCropUrl is missing', async () => {
        const { fetchCardFromR2: r2fetch } = require('../../src/services/r2client');
        const { uploadCardToR2: r2upload } = require('../../src/services/r2client');
        const scryfall = require('../../src/services/scryfallService');

        r2fetch.mockResolvedValue(CARD_NO_CROP);
        scryfall.getCardByName = jest.fn().mockResolvedValue({ ...CARD_NO_CROP, artCropUrl: 'http://new-art.jpg' });
        r2upload.mockResolvedValue(undefined);

        await cache.fetch('scry-xyz');

        // Give the fire-and-forget backfill time to run
        await new Promise(r => setTimeout(r, 50));

        expect(scryfall.getCardByName).toHaveBeenCalledWith('Counterspell');
        expect(r2upload).toHaveBeenCalled();
    });
});

// ── batchFetch ────────────────────────────────────────────────────────────────

describe('CardCache.batchFetch', () => {
    let cache;

    beforeEach(() => {
        cache = freshCache();
    });

    test('deduplicates ids before fetching', async () => {
        const { batchFetchCardsFromR2: r2batch } = require('../../src/services/r2client');
        r2batch.mockResolvedValue({ 'scry-abc': CARD_WITH_CROP });

        const result = await cache.batchFetch(['scry-abc', 'scry-abc', 'scry-abc']);
        expect(r2batch).toHaveBeenCalledWith(['scry-abc']); // deduplicated to 1
        expect(result['scry-abc'].name).toBe('Lightning Bolt');
    });

    test('serves cached ids without hitting R2', async () => {
        const { batchFetchCardsFromR2: r2batch } = require('../../src/services/r2client');
        r2batch.mockResolvedValue({});

        // Prime the cache
        cache.set('scry-abc', CARD_WITH_CROP);

        const result = await cache.batchFetch(['scry-abc']);
        expect(r2batch).not.toHaveBeenCalled();
        expect(result['scry-abc'].name).toBe('Lightning Bolt');
    });

    test('returns result map with all requested ids', async () => {
        const { batchFetchCardsFromR2: r2batch } = require('../../src/services/r2client');
        r2batch.mockResolvedValue({
            'scry-abc': CARD_WITH_CROP,
            'scry-xyz': CARD_NO_CROP,
        });

        const result = await cache.batchFetch(['scry-abc', 'scry-xyz']);
        expect(Object.keys(result)).toHaveLength(2);
    });
});

// ── TTL expiry ────────────────────────────────────────────────────────────────

describe('CardCache TTL', () => {
    test('expired entry is evicted and re-fetched from R2', async () => {
        const cache = freshCache();
        const { fetchCardFromR2: r2fetch } = require('../../src/services/r2client');
        r2fetch.mockResolvedValue(CARD_WITH_CROP);

        // Manually insert an expired entry
        cache.cache.set('scry-abc', {
            data: CARD_WITH_CROP,
            timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago — past 1hr TTL
        });

        await cache.fetch('scry-abc');
        expect(r2fetch).toHaveBeenCalledTimes(1); // re-fetched because expired
    });
});

// ── clear / delete ────────────────────────────────────────────────────────────

describe('CardCache clear/delete', () => {
    test('clear() empties the entire cache', () => {
        const cache = freshCache();
        cache.set('scry-abc', CARD_WITH_CROP);
        cache.set('scry-xyz', CARD_NO_CROP);
        cache.clear();
        expect(cache.get('scry-abc')).toBeNull();
    });

    test('delete() removes only the specified entry', () => {
        const cache = freshCache();
        cache.set('scry-abc', CARD_WITH_CROP);
        cache.set('scry-xyz', CARD_NO_CROP);
        cache.delete('scry-abc');
        expect(cache.get('scry-abc')).toBeNull();
        expect(cache.get('scry-xyz')).not.toBeNull();
    });
});