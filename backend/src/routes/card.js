const express = require('express');
const router = express.Router();
const Card = require('../models/Card');
const auth = require('../middleware/auth');
const scryfallService = require('../services/scryfallService');

router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            type, 
            expansion, 
            name,
            manaCost,
            useScryfallFallback = false
        } = req.query;

        const query = {};
        if (type) query.type = new RegExp(type, 'i');
        if (expansion) query.expansion = new RegExp(expansion, 'i');
        if (name) query.name = new RegExp(name, 'i');
        if (manaCost) query.manaCost = manaCost;

        let cards = await Card.find(query)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ name: 1 });

        const count = await Card.countDocuments(query);

        if (cards.length === 0 && name && useScryfallFallback) {
            const scryfallCards = await scryfallService.searchCards(name);
            const cachedCards = await Promise.all(
                scryfallCards.slice(0, limit).map(card => 
                    scryfallService.cacheCard(card)
                )
            );
            cards = cachedCards.filter(card => card !== null);
        }

        res.json({
            cards,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            total: count,
            source: cards.length > 0 && cards[0].scryfallId ? 'scryfall' : 'local'
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/search/:term', async (req, res) => {
    try {
        const searchTerm = req.params.term;

        let cards = await Card.find({
            name: new RegExp(searchTerm, 'i')
        }).limit(50);

        if (cards.length === 0) {
            const scryfallCards = await scryfallService.searchCards(searchTerm);
            
            const cachedCards = await Promise.all(
                scryfallCards.map(card => scryfallService.cacheCard(card))
            );

            cards = cachedCards.filter(card => card !== null);
        }

        res.json(cards);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const card = await Card.findById(req.params.id);
        
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        res.json(card);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', auth, async (req, res) => {
    try {
        const {
            name,
            manaCost,
            type,
            textBox,
            expansion,
            power,
            toughness,
            imageUrl
        } = req.body;

        if (!name || !manaCost || !type || !textBox || !expansion || !imageUrl) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const newCard = new Card({
            name,
            manaCost,
            type,
            textBox,
            expansion,
            power: power || '',
            toughness: toughness || '',
            imageUrl
        });

        const savedCard = await newCard.save();
        res.status(201).json(savedCard);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.patch('/:id', auth, async (req, res) => {
    try {
        const updatedCard = await Card.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!updatedCard) {
            return res.status(404).json({ message: 'Card not found' });
        }

        res.json(updatedCard);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const deletedCard = await Card.findByIdAndDelete(req.params.id);

        if (!deletedCard) {
            return res.status(404).json({ message: 'Card not found' });
        }

        res.json({ message: 'Card deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;