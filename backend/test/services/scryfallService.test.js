/**
 * scryfallService.test.js
 *
 * Tests card transformation, batch fetching, and error handling.
 * Mocks axios so no real HTTP calls are made.
 */

jest.mock('axios');

const axios = require('axios');
const scryfallService = require('../../src/services/scryfallService');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SINGLE_FACE_RAW = {
    id: 'scry-abc',
    name: 'Lightning Bolt',
    mana_cost: '{R}',
    type_line: 'Instant',
    oracle_text: 'Deal 3 damage to any target.',
    set_name: 'Alpha',
    rarity: 'common',
    collector_number: '161',
    power: '',
    toughness: '',
    prices: { usd: '2.50' },
    image_uris: {
        normal: 'http://img/normal.jpg',
        art_crop: 'http://img/art.jpg',
        border_crop: 'http://img/border.jpg',
    },
};

const DOUBLE_FACE_RAW = {
    id: 'scry-dfv',
    name: 'Delver of Secrets // Insectile Aberration',
    type_line: 'Creature — Human Wizard',
    set_name: 'Innistrad',
    rarity: 'uncommon',
    collector_number: '51',
    prices: { usd: '1.00' },
    card_faces: [
        {
            name: 'Delver of Secrets',
            mana_cost: '{U}',
            oracle_text: 'At the beginning of your upkeep...',
            image_uris: { normal: 'http://f0.jpg', art_crop: 'http://f0-art.jpg', border_crop: '' },
        },
        {
            name: 'Insectile Aberration',
            mana_cost: '',
            oracle_text: 'Flying.',
            image_uris: { normal: 'http://f1.jpg', art_crop: 'http://f1-art.jpg', border_crop: '' },
        },
    ],
};

// ── transformScryfallCard ─────────────────────────────────────────────────────

describe('transformScryfallCard', () => {
    test('maps single-face card fields correctly', () => {
        const card = scryfallService.transformScryfallCard(SINGLE_FACE_RAW);

        expect(card.scryfallId).toBe('scry-abc');
        expect(card.name).toBe('Lightning Bolt');
        expect(card.manaCost).toBe('{R}');
        expect(card.imageUrl).toBe('http://img/normal.jpg');
        expect(card.artCropUrl).toBe('http://img/art.jpg');
        expect(card.priceValue).toBe(2.5);
        expect(card.hasAlternateFace).toBe(false);
    });

    test('maps double-face card: imageUrl = face0, altImageUrl = face1', () => {
        const card = scryfallService.transformScryfallCard(DOUBLE_FACE_RAW);

        expect(card.imageUrl).toBe('http://f0.jpg');
        expect(card.altImageUrl).toBe('http://f1.jpg');
        expect(card.artCropUrl).toBe('http://f0-art.jpg');
        expect(card.altArtCropUrl).toBe('http://f1-art.jpg');
        expect(card.hasAlternateFace).toBe(true);
    });

    test('falls back manaCost to {0} when missing', () => {
        const raw = { ...SINGLE_FACE_RAW, mana_cost: '', image_uris: { normal: '' } };
        const card = scryfallService.transformScryfallCard(raw);
        expect(card.manaCost).toBe('{0}');
    });

    test('priceValue defaults to 0 when price missing', () => {
        const raw = { ...SINGLE_FACE_RAW, prices: {} };
        const card = scryfallService.transformScryfallCard(raw);
        expect(card.priceValue).toBe(0);
    });

    test('sets currentFaceIndex to 0', () => {
        const card = scryfallService.transformScryfallCard(SINGLE_FACE_RAW);
        expect(card.currentFaceIndex).toBe(0);
    });
});

// ── searchCards ───────────────────────────────────────────────────────────────

describe('searchCards', () => {
    test('returns transformed array on success', async () => {
        axios.get.mockResolvedValue({ data: { data: [SINGLE_FACE_RAW] } });

        const cards = await scryfallService.searchCards('bolt');
        expect(cards).toHaveLength(1);
        expect(cards[0].name).toBe('Lightning Bolt');
    });

    test('returns empty array on 404 from Scryfall', async () => {
        axios.get.mockRejectedValue({ response: { status: 404 } });
        const cards = await scryfallService.searchCards('zzznomatches');
        expect(cards).toEqual([]);
    });

    test('throws on non-404 error', async () => {
        axios.get.mockRejectedValue({ response: { status: 503 } });
        await expect(scryfallService.searchCards('bolt')).rejects.toBeDefined();
    });
});

// ── getCardByName ─────────────────────────────────────────────────────────────

describe('getCardByName', () => {
    test('returns transformed card on success', async () => {
        axios.get.mockResolvedValue({ data: SINGLE_FACE_RAW });
        const card = await scryfallService.getCardByName('Lightning Bolt');
        expect(card.scryfallId).toBe('scry-abc');
    });

    test('returns null on 404', async () => {
        axios.get.mockRejectedValue({ response: { status: 404 } });
        const card = await scryfallService.getCardByName('Nonexistent Card');
        expect(card).toBeNull();
    });
});

// ── getCardsBatch ─────────────────────────────────────────────────────────────

describe('getCardsBatch', () => {
    beforeEach(() => jest.clearAllMocks());
    test('returns empty results for empty input', async () => {
        const result = await scryfallService.getCardsBatch([]);
        expect(result.found).toHaveLength(0);
        expect(result.notFound).toHaveLength(0);
    });

    test('maps found and not_found from Scryfall response', async () => {
        axios.post.mockResolvedValue({
            data: {
                data: [SINGLE_FACE_RAW],
                not_found: [{ name: 'Fake Card' }],
            },
        });

        const result = await scryfallService.getCardsBatch(['Lightning Bolt', 'Fake Card']);
        expect(result.found).toHaveLength(1);
        expect(result.found[0].name).toBe('Lightning Bolt');
        expect(result.notFound).toContain('Fake Card');
    });

    test('puts entire batch in notFound on network error', async () => {
        axios.post.mockRejectedValue(new Error('Network error'));
        const result = await scryfallService.getCardsBatch(['Card A', 'Card B']);
        expect(result.notFound).toEqual(expect.arrayContaining(['Card A', 'Card B']));
    });

    test('batches in groups of 75', async () => {
        // 76 cards → two API calls
        const names = Array.from({ length: 76 }, (_, i) => `Card ${i}`);
        axios.post.mockResolvedValue({ data: { data: [], not_found: [] } });

        await scryfallService.getCardsBatch(names);
        expect(axios.post).toHaveBeenCalledTimes(2);
    });
});