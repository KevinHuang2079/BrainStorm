// r2cardCache.js - add Scryfall fallback + retry logic

const scryfallService = require('../services/scryfallService');
const { fetchCardFromR2, batchFetchCardsFromR2, uploadCardToR2 } = require('./r2client');

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

    async fetch(scryfallId) {
        const cached = this.get(scryfallId);
        if (cached) {
            console.log(`[CACHE] in-memory hit: ${scryfallId} (${cached.name ?? 'unnamed'})`);
            if (!cached.artCropUrl) this._backfillCropUrl(scryfallId, cached);
            return cached;
        }

        console.log(`[CACHE] in-memory miss: ${scryfallId} — checking R2...`);
        const r2Card = await fetchCardFromR2(scryfallId).catch((err) => {
            console.warn(`[R2] fetch error for ${scryfallId}:`, err.message);
            return null;
        });

        if (r2Card) {
            console.log(`[R2] hit: ${scryfallId} (${r2Card.name ?? 'unnamed'})`);
            if (!r2Card.artCropUrl) this._backfillCropUrl(scryfallId, r2Card);
            this.set(scryfallId, r2Card);
            return r2Card;
        }

        console.warn(`[R2] miss: ${scryfallId} — falling back to Scryfall...`);
        try {
            const scryfallCard = await withRetry(() =>
                scryfallService.getCardByScryfallId(scryfallId)
            );
            if (scryfallCard) {
                console.log(`[SCRYFALL] fetched: ${scryfallId} (${scryfallCard.name ?? 'unnamed'})`);
                this.set(scryfallId, scryfallCard);
                uploadCardToR2(scryfallId, scryfallCard).catch(err =>
                    console.error(`[R2 UPLOAD] failed for ${scryfallId}:`, err.message)
                );
                return scryfallCard;
            } else {
                console.error(`[SCRYFALL] returned null for ${scryfallId} — card will be unhydrated`);
            }
        } catch (err) {
            console.error(`[SCRYFALL FALLBACK] failed for ${scryfallId}:`, err.message);
        }

        return null;
    }

    async batchFetch(scryfallIds) {
        const uniqueIds = [...new Set(scryfallIds)];
        const result = {};
        const uncachedIds = [];

        for (const id of uniqueIds) {
            const cached = this.get(id);
            if (cached) {
                result[id] = cached;
            } else {
                uncachedIds.push(id);
            }
        }

        console.log(
            `[CACHE] batchFetch: ${uniqueIds.length} unique ids — ` +
            `${uniqueIds.length - uncachedIds.length} in-memory hits, ` +
            `${uncachedIds.length} misses`
        );
        if (uncachedIds.length > 0) {
            console.log(`[CACHE] in-memory misses:`, uncachedIds);
        }

        if (uncachedIds.length === 0) return result;

        const r2Map = await batchFetchCardsFromR2(uncachedIds).catch((err) => {
            console.error(`[R2] batchFetch error:`, err.message);
            return {};
        });

        const stillMissing = [];
        for (const id of uncachedIds) {
            if (r2Map[id]) {
                const card = r2Map[id];
                console.log(`[R2] batch hit: ${id} (${card.name ?? 'unnamed'})`);
                this.set(id, card);
                result[id] = card;
                if (!card.artCropUrl) this._backfillCropUrl(id, card);
            } else {
                console.warn(`[R2] batch miss: ${id}`);
                stillMissing.push(id);
            }
        }

        if (stillMissing.length > 0) {
            console.warn(
                `[CACHE MISS] ${stillMissing.length} cards not in R2 or memory, ` +
                `fetching from Scryfall:`, stillMissing
            );
            try {
                const { found } = await withRetry(() =>
                    scryfallService.getCardsBatchByScryfallIds(stillMissing)
                );

                const foundIds = new Set(found.map(c => c.scryfallId));
                const notFound = stillMissing.filter(id => !foundIds.has(id));
                if (notFound.length > 0) {
                    console.error(
                        `[SCRYFALL BATCH] ${notFound.length} ids returned nothing — ` +
                        `these cards will be unhydrated:`, notFound
                    );
                }

                const toUpload = [];
                for (const card of found) {
                    if (card.scryfallId) {
                        console.log(`[SCRYFALL] batch fetched: ${card.scryfallId} (${card.name ?? 'unnamed'})`);
                        this.set(card.scryfallId, card);
                        result[card.scryfallId] = card;
                        toUpload.push(card);
                    } else {
                        console.warn(`[SCRYFALL] card returned without scryfallId:`, card);
                    }
                }

                Promise.all(
                    toUpload.map(card =>
                        uploadCardToR2(card.scryfallId, card).catch(err =>
                            console.error(`[R2 UPLOAD] failed for ${card.scryfallId}:`, err.message)
                        )
                    )
                );
            } catch (err) {
                console.error('[SCRYFALL BATCH FALLBACK] failed:', err.message);
                console.error('[SCRYFALL BATCH FALLBACK] these ids will be unhydrated:', stillMissing);
            }
        }

        const hydratedCount = Object.keys(result).length;
        const missCount = uniqueIds.length - hydratedCount;
        console.log(
            `[CACHE] batchFetch complete: ${hydratedCount}/${uniqueIds.length} hydrated` +
            (missCount > 0 ? `, ${missCount} still unhydrated` : '')
        );

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