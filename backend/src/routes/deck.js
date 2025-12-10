const express = require('express');
const router = express.Router();
const Deck = require('../models/Deck');
const User = require('../models/User');
const Card = require('../models/Card');
const auth = require('../middleware/auth');
const scryfallService = require('../services/scryfallService');

const calculateDeckPrice = async (deckId) => {
    const deck = await Deck.findById(deckId).populate('cards');
    if (!deck) return 0;
    
    const totalPrice = deck.cards.reduce((total, card) => {
        return total + (card.priceValue || 0);
    }, 0);
    
    deck.priceValue = totalPrice;
    await deck.save();
    return totalPrice;
};

const normalizeCardName = (name) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/['']/g, "'")
        .replace(/[""]/g, '"')
        .replace(/—/g, '-')
        .replace(/æ/g, 'ae');
};

router.get('/', auth, async (req, res) => {
    try {
        const { format, owner } = req.query;
        const query = {};

        if (format) query.format = format;
        if (owner) query.owner = owner;

        const decks = await Deck.find(query)
            .populate('owner', 'username avatarUrl')
            .populate('cards')
            .populate('sideboard')
            .populate('startInPlay')
            .sort({ createdAt: -1 });

        res.json(decks);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/my-decks', auth, async (req, res) => {
    try {
        const decks = await Deck.find({ owner: req.user._id })
            .populate('cards')
            .populate('sideboard')
            .populate('startInPlay')
            .sort({ updatedAt: -1 });

        res.json(decks);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const deck = await Deck.findById(req.params.id)
            .populate('owner', 'username avatarUrl')
            .populate('cards')
            .populate('sideboard')
            .populate('startInPlay');

        if (!deck) {
            return res.status(404).json({ message: 'Deck not found' });
        }

        res.json(deck);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', auth, async (req, res) => {
    try {
        const { name, cards, format } = req.body;

        if (!name || !format) {
            return res.status(400).json({ message: 'Name and format are required' });
        }

        const newDeck = new Deck({
            name,
            owner: req.user._id,
            cards: cards || [],
            sideboard: [],
            startInPlay: [],
            format,
            priceValue: 0
        });

        const savedDeck = await newDeck.save();

        if (cards && cards.length > 0) {
            await calculateDeckPrice(savedDeck._id);
        }

        await User.findByIdAndUpdate(
            req.user._id,
            { $push: { currentDecks: savedDeck._id } }
        );

        const populatedDeck = await Deck.findById(savedDeck._id)
            .populate('cards')
            .populate('sideboard')
            .populate('startInPlay');

        res.status(201).json(populatedDeck);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.patch('/:id', auth, async (req, res) => {
    try {
        const deck = await Deck.findById(req.params.id);

        if (!deck) {
            return res.status(404).json({ message: 'Deck not found' });
        }

        if (deck.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to edit this deck' });
        }

        const updatedDeck = await Deck.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        )
            .populate('cards')
            .populate('sideboard')
            .populate('startInPlay');

        if (req.body.cards) {
            await calculateDeckPrice(updatedDeck._id);
            const recalculatedDeck = await Deck.findById(updatedDeck._id)
                .populate('cards')
                .populate('sideboard')
                .populate('startInPlay');
            return res.json(recalculatedDeck);
        }

        res.json(updatedDeck);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/:id/cards/:cardId', auth, async (req, res) => {
    try {
        const { zone = 'mainDeck' } = req.body;
        const deck = await Deck.findById(req.params.id);

        if (!deck) {
            return res.status(404).json({ message: 'Deck not found' });
        }

        if (deck.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to edit this deck' });
        }

        const card = await Card.findById(req.params.cardId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        if (zone === 'sideboard') {
            deck.sideboard.push(req.params.cardId);
        } else if (zone === 'startInPlay') {
            deck.startInPlay.push(req.params.cardId);
        } else {
            deck.cards.push(req.params.cardId);
        }
        
        await deck.save();

        await calculateDeckPrice(deck._id);

        const updatedDeck = await Deck.findById(deck._id)
            .populate('cards')
            .populate('sideboard')
            .populate('startInPlay');

        res.json(updatedDeck);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/:id/import', auth, async(req, res) => {
    try {
        const { decklist } = req.body;
        console.log('Importing decklist for deck:', req.params.id);
        
        const deck = await Deck.findById(req.params.id);
        if (!deck) {
            return res.status(404).json({ message: 'Deck not found' });
        }
        if (deck.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to edit deck' });
        }
        
        const lines = decklist.split('\n').map(line => line.trim()).filter(Boolean);
        const parsedLines = [];
        
        for (const line of lines) {
            const match = line.match(/^(\d+)x?\s+(.+)$/i);
            if (match) {
                const quantity = parseInt(match[1]);
                const name = match[2].trim();
                if (quantity > 0 && name) {
                    parsedLines.push({ 
                        quantity, 
                        name,
                        originalLine: line 
                    });
                }
            } else {
                const name = line.trim();
                if (name) {
                    parsedLines.push({ 
                        quantity: 1, 
                        name,
                        originalLine: line 
                    });
                }
            }
        }
        
        console.log('Parsed lines:', parsedLines);
        
        const uniqueCardNames = [...new Set(parsedLines.map(p => p.name))];
        console.log('Fetching cards from Scryfall:', uniqueCardNames);
        
        const scryfallResult = await scryfallService.getCardsBatch(uniqueCardNames);
        console.log('Scryfall found:', scryfallResult.found.length, 'Not found:', scryfallResult.notFound.length);
        
        const cachedCards = await scryfallService.cacheCardsBatch(scryfallResult.found);
        console.log('Cached cards:', cachedCards.length);
        
        const cardMap = new Map();
        cachedCards.forEach(card => {
            if (card && card.name) {
                const normalizedName = normalizeCardName(card.name);
                cardMap.set(normalizedName, card);
            }
        });
        
        console.log('Card map entries:', Array.from(cardMap.keys()));
        
        let validPrice = deck.priceValue || 0;
        const addedCards = []; 
        const failedCards = [];
        
        for (const parsedLine of parsedLines) {
            const normalizedName = normalizeCardName(parsedLine.name);
            const card = cardMap.get(normalizedName);
            
            console.log(`Looking for "${parsedLine.name}" (normalized: "${normalizedName}"):`, card ? 'FOUND' : 'NOT FOUND');
            
            if (card) {
                for (let i = 0; i < parsedLine.quantity; i++) {
                    deck.cards.push(card._id);
                    validPrice += (card.priceValue || 0);
                }
                addedCards.push({ 
                    name: card.name,
                    quantity: parsedLine.quantity 
                });
                console.log(`Added ${parsedLine.quantity}x ${card.name}`);
            } else {
                failedCards.push(parsedLine.name);
                console.log(`Failed to add: ${parsedLine.name}`);
            }
        }
        
        deck.priceValue = validPrice;
        await deck.save();
        
        const updatedDeck = await Deck.findById(deck._id)
            .populate('cards')
            .populate('sideboard')
            .populate('startInPlay');
        
        console.log('Import complete. Added:', addedCards.length, 'Failed:', failedCards.length, 'Not found:', scryfallResult.notFound.length);
    
        res.json({ 
            addedCards: addedCards,
            invalidCards: scryfallResult.notFound,
            failedCards: failedCards, 
            updatedDeck: updatedDeck
        });
    } catch (err) {
        console.error('Import error:', err);
        res.status(500).json({ message: err.message });
    }
});

router.delete('/:id/cards/:cardId', auth, async (req, res) => {
    try {
        const { zone = 'mainDeck' } = req.body;
        const deck = await Deck.findById(req.params.id);

        if (!deck) {
            return res.status(404).json({ message: 'Deck not found' });
        }

        if (deck.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to edit this deck' });
        }

        let cardIndex;
        if (zone === 'sideboard') {
            cardIndex = deck.sideboard.findIndex(c => c.toString() === req.params.cardId);
            if (cardIndex > -1) {
                deck.sideboard.splice(cardIndex, 1);
            }
        } else if (zone === 'startInPlay') {
            cardIndex = deck.startInPlay.findIndex(c => c.toString() === req.params.cardId);
            if (cardIndex > -1) {
                deck.startInPlay.splice(cardIndex, 1);
            }
        } else {
            cardIndex = deck.cards.findIndex(c => c.toString() === req.params.cardId);
            if (cardIndex > -1) {
                deck.cards.splice(cardIndex, 1);
            }
        }
        
        await deck.save();
        await calculateDeckPrice(deck._id);

        const updatedDeck = await Deck.findById(deck._id)
            .populate('cards')
            .populate('sideboard')
            .populate('startInPlay');

        res.json(updatedDeck);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const deck = await Deck.findById(req.params.id);

        if (!deck) {
            return res.status(404).json({ message: 'Deck not found' });
        }

        if (deck.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to delete this deck' });
        }

        await Deck.findByIdAndDelete(req.params.id);

        await User.findByIdAndUpdate(
            req.user._id,
            { $pull: { currentDecks: req.params.id } }
        );

        res.json({ message: 'Deck deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id/stats', auth, async (req, res) => {
    try {
        const deck = await Deck.findById(req.params.id)
            .populate('cards');

        if (!deck) {
            return res.status(404).json({ message: 'Deck not found' });
        }

        const stats = {
            totalCards: deck.cards.length,
            totalPrice: deck.priceValue,
            cardTypes: {},
            manaCurve: {}
        };

        deck.cards.forEach(card => {
            stats.cardTypes[card.type] = (stats.cardTypes[card.type] || 0) + 1;
            
            const cmc = card.manaCost.length;
            stats.manaCurve[cmc] = (stats.manaCurve[cmc] || 0) + 1;
        });

        res.json(stats);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;