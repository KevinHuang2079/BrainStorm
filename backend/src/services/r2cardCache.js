const { fetchCardFromR2, batchFetchCardsFromR2 } = require('./r2client');

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
        this.cache.set(scryfallId, {
            data: cardData,
            timestamp: Date.now(),
        });
    }

    async fetch(scryfallId) {
        const cached = this.get(scryfallId);
        if (cached) return cached;

        const cardData = await fetchCardFromR2(scryfallId);
        if (cardData) {
            this.set(scryfallId, cardData);
        }
        return cardData;
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
            const fetchedCards = await batchFetchCardsFromR2(uncachedIds);
            
            Object.entries(fetchedCards).forEach(([id, cardData]) => {
                this.set(id, cardData);
                result[id] = cardData;
            });
        }

        return result;
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