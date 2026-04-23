//consolidate r2 client and scryfall service, look at fetch function, also backfill

const scryfallService = require('../services/scryfallService');
const { fetchCardFromR2, batchFetchCardsFromR2, uploadCardToR2 } = require('./r2client');

class CardCache {
    constructor() {
        this.cache = new Map();
        this.cacheDuration = 1000 * 60 * 60;
    }

    get(scryfallId) {
        const cached = this.cache.get(scryfallId);
        if (!cached) return null;

        //lazy clean cache
        if (Date.now() - cached.timestamp > this.cacheDuration) {
            this.cache.delete(scryfallId);
            return null;
        }

        return cached.data;
    }

    set(scryfallId, cardData) {
        this.cache.set(scryfallId, {
            data: cardData,
            timestamp: Date.now(),
        });
    }

    // -- fetches -- 
    //check node cache
    //cache misses go to r2
    //then add or update (cropped image missing) to r2
    async fetch(scryfallId) {
        const cached = this.get(scryfallId);
        if (cached) {
            // Backfill in background if crop is missing
            if (!cached.artCropUrl) this._backfillCropUrl(scryfallId, cached);
            return cached;
        }

        const cardData = await fetchCardFromR2(scryfallId);
        if (cardData) {
            if (!cardData.artCropUrl) this._backfillCropUrl(scryfallId, cardData);
            this.set(scryfallId, cardData);
            return cardData;
        }

        return null;
    }

    async batchFetch(scryfallIds) {
        const uniqueIds = [...new Set(scryfallIds)];
        const uncachedIds = [];
        const result = {};

        for (const id of uniqueIds) {
            const cached = this.get(id);
            if (cached) {
                result[id] = cached;
            } else {
                uncachedIds.push(id);
            }
        }

        if (uncachedIds.length > 0) {
            const fetchedCardsMap = await batchFetchCardsFromR2(uncachedIds);

            //list the stale entries
            const backfillPromises = [];
            Object.entries(fetchedCardsMap).forEach(([id, cardData]) => {
                if (!cardData.artCropUrl) {
                    backfillPromises.push(
                        this._backfillCropUrl(id, cardData).then(() => {
                            // Use updated cache entry if backfill succeeded
                            const updated = this.get(id);
                            result[id] = updated || cardData;
                        }).catch(() => {
                            result[id] = cardData;
                        })
                    );
                } else {
                    this.set(id, cardData);
                    result[id] = cardData;
                }
            });
            //promise changing all stale entries
            if (backfillPromises.length > 0) {
                await Promise.all(backfillPromises);
            }
        }

        return result;
    }

    // Fire-and-forget: re-fetches from Scryfall, updates R2 + node cache
    async _backfillCropUrl(scryfallId, existingData) {
        try {
            const freshCard = await scryfallService.getCardByName(existingData.name);
            if (!freshCard?.artCropUrl) return;

            //only pull artCropUrl from the fresh fetch; keep everything else from existing
            const updated = { ...existingData, artCropUrl: freshCard.artCropUrl };
            await uploadCardToR2(scryfallId, updated);
            this.set(scryfallId, updated);
        } catch (err) {
            console.error(`Failed to backfill artCropUrl for ${scryfallId}:`, err.message);
        }
    }

    clear() {
        this.cache.clear();
    }

    delete(scryfallId) {
        this.cache.delete(scryfallId);
    }
}

const cardCache = new CardCache();

module.exports = cardCache;