const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const scryfallService = require('../services/scryfallService');
const cardCache = require('../services/r2cardCache');
const { uploadCardToR2, cardExistsInR2 } = require('../services/r2client');

//searchCards
router.get('/search/:term', async (req, res) => {
    try {
        const searchTerm = req.params.term;
        
        const scryfallCards = await scryfallService.searchCards(searchTerm);
        const uploadPromises = scryfallCards.map(async (card) => {
            try {
                const exists = await cardExistsInR2(card.scryfallId);
                if (!exists) {
                    await uploadCardToR2(card.scryfallId, card);
                }
                return card;
            } catch (error) {
                console.error(`Failed to upload card ${card.name}:`, error);
                return null;
            }
        });
        const cards = (await Promise.all(uploadPromises)).filter(Boolean);

        res.json(cards);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// searchTokens - separate from searchCards to avoid affecting deck import
router.get('/search-tokens/:term', async (req, res) => {
    try {
        const searchTerm = req.params.term;
        
        // Append Scryfall token filter to the query
        const scryfallCards = await scryfallService.searchCards(`t:token ${searchTerm}`);
        
        const uploadPromises = scryfallCards.map(async (card) => {
            try {
                const exists = await cardExistsInR2(card.scryfallId);
                if (!exists) {
                    await uploadCardToR2(card.scryfallId, card);
                }
                return card;
            } catch (error) {
                console.error(`Failed to upload token ${card.name}:`, error);
                return null;
            }
        });
        const cards = (await Promise.all(uploadPromises)).filter(Boolean);

        res.json(cards);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

//getCardById
router.get('/:id', async (req, res) => {
    try {
        const scryfallId = req.params.id;
        const card = await cardCache.fetch(scryfallId);
        
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        res.json(card);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;