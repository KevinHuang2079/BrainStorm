// r2cardCache.js - add Scryfall fallback + retry logic

const scryfallService = require('../services/scryfallService');
const { fetchCardFromR2, batchFetchCardsFromR2, uploadCardToR2 } = require('./r2client');

// Retry a fn up to maxAttempts with exponential backoff on 503
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 500) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const status = err.response?.status;
            const isRetryable = status === 503 || status === 429 || status >= 500;
            if (!isRetryable || attempt === maxAttempts) throw err;
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            console.warn(`[RETRY] attempt ${attempt} failed (${status}), retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

class CardCache {
    constructor() {
        this.cache = new Map();
        this.cacheDuration = 1000 * 60 * 60;
    }

    get(scryfallId) {
        const cached = this.cache.get(scryfallId);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this.cacheDuration) {
            this.cache.delete(scryfallId);
            return null;
        }
        return cached.data;
    }

    set(scryfallId, cardData) {
        this.cache.set(scryfallId, { data: cardData, timestamp: Date.now() });
    }

    // Single card: R2 → Scryfall fallback → upload to R2
    async fetch(scryfallId) {
        const cached = this.get(scryfallId);
        if (cached) {
            if (!cached.artCropUrl) this._backfillCropUrl(scryfallId, cached);
            return cached;
        }

        const r2Card = await fetchCardFromR2(scryfallId).catch(() => null);
        if (r2Card) {
            if (!r2Card.artCropUrl) this._backfillCropUrl(scryfallId, r2Card);
            this.set(scryfallId, r2Card);
            return r2Card;
        }

        // R2 miss — fetch from Scryfall by scryfallId
        try {
            const scryfallCard = await withRetry(() =>
                scryfallService.getCardByScryfallId(scryfallId)
            );
            if (scryfallCard) {
                this.set(scryfallId, scryfallCard);
                // Upload to R2 in background so future fetches are fast
                uploadCardToR2(scryfallId, scryfallCard).catch(err =>
                    console.error(`[R2 UPLOAD] failed for ${scryfallId}:`, err.message)
                );
                return scryfallCard;
            }
        } catch (err) {
            console.error(`[SCRYFALL FALLBACK] failed for ${scryfallId}:`, err.message);
        }

        return null;
    }

    // Batch: R2 → Scryfall batch fallback → upload misses to R2
    async batchFetch(scryfallIds) {
        const uniqueIds = [...new Set(scryfallIds)];
        const result = {};
        const uncachedIds = [];

        for (const id of uniqueIds) {
            const cached = this.get(id);
            if (cached) result[id] = cached;
            else uncachedIds.push(id);
        }

        if (uncachedIds.length === 0) return result;

        // Try R2 first
        const r2Map = await batchFetchCardsFromR2(uncachedIds).catch(() => ({}));
        const stillMissing = [];

        for (const id of uncachedIds) {
            if (r2Map[id]) {
                const card = r2Map[id];
                this.set(id, card);
                result[id] = card;
                if (!card.artCropUrl) this._backfillCropUrl(id, card);
            } else {
                stillMissing.push(id);
            }
        }

        // Scryfall fallback for anything not in R2
        if (stillMissing.length > 0) {
            console.log(`[CACHE MISS] ${stillMissing.length} cards not in R2, fetching from Scryfall`);
            try {
                // getCardsBatch accepts scryfallIds — add this method to scryfallService (see below)
                const { found } = await withRetry(() =>
                    scryfallService.getCardsBatchByScryfallIds(stillMissing)
                );

                const toUpload = [];
                for (const card of found) {
                    if (card.scryfallId) {
                        this.set(card.scryfallId, card);
                        result[card.scryfallId] = card;
                        toUpload.push(card);
                    }
                }

                // Upload new cards to R2 in background
                Promise.all(
                    toUpload.map(card =>
                        uploadCardToR2(card.scryfallId, card).catch(err =>
                            console.error(`[R2 UPLOAD] failed for ${card.scryfallId}:`, err.message)
                        )
                    )
                );
            } catch (err) {
                console.error('[SCRYFALL BATCH FALLBACK] failed:', err.message);
            }
        }

        return result;
    }

    async _backfillCropUrl(scryfallId, existingData) {
        try {
            const freshCard = await scryfallService.getCardByName(existingData.name);
            if (!freshCard?.artCropUrl) return;
            const updated = { ...existingData, artCropUrl: freshCard.artCropUrl };
            await uploadCardToR2(scryfallId, updated);
            this.set(scryfallId, updated);
        } catch (err) {
            console.error(`Failed to backfill artCropUrl for ${scryfallId}:`, err.message);
        }
    }

    clear() { this.cache.clear(); }
    delete(scryfallId) { this.cache.delete(scryfallId); }
}

module.exports = new CardCache();