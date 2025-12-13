const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const scryfallService = require('../services/scryfallService');
const cardCache = require('../services/r2cardCache');
const { uploadCardToR2, cardExistsInR2 } = require('../services/r2client');

router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            name
        } = req.query;

        if (!name) {
            return res.json({
                cards: [],
                totalPages: 0,
                currentPage: page,
                total: 0,
                source: 'scryfall'
            });
        }

        const scryfallCards = await scryfallService.searchCards(name);
        
        const uploadPromises = scryfallCards.slice(0, limit).map(async (card) => {
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

        res.json({
            cards,
            totalPages: Math.ceil(cards.length / limit),
            currentPage: page,
            total: cards.length,
            source: 'scryfall'
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

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