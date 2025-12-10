const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const User = require('../models/User');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
    try {
        const { status, format } = req.query;
        const query = {};

        if (status) query.status = status;
        if (format) query.format = format;

        const games = await Game.find(query)
            .populate('host', 'username avatarUrl')
            .populate('players', 'username avatarUrl')
            .populate('winner', 'username avatarUrl')
            .sort({ createdAt: -1 });

        res.json(games);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Get user's games
router.get('/my-games', auth, async (req, res) => {
    try {
        const games = await Game.find({
            $or: [
                { host: req.user._id },
                { players: req.user._id }
            ]
        })
        .populate('host', 'username avatarUrl')
        .populate('players', 'username avatarUrl')
        .populate('winner', 'username avatarUrl')
        .sort({ createdAt: -1 });

        res.json(games);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get single game by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id)
            .populate('host', 'username avatarUrl')
            .populate('players', 'username avatarUrl')
            .populate('winner', 'username avatarUrl');

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        res.json(game);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get game state only (lightweight endpoint)
router.get('/:id/state', auth, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id)
            .select('savedState lastStateSave lastStateSavedBy')
            .populate('lastStateSavedBy', 'username');

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        res.json({
            savedState: game.savedState,
            lastStateSave: game.lastStateSave,
            lastStateSavedBy: game.lastStateSavedBy
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create new game
router.post('/', auth, async (req, res) => {
    try {
        const { name, format, maxPlayers } = req.body;

        if (!name || !format) {
            return res.status(400).json({ message: 'Name and format are required' });
        }

        const newGame = new Game({
            name,
            host: req.user._id,
            players: [req.user._id],
            format,
            maxPlayers: maxPlayers || 4,
            status: 'waiting'
        });

        const savedGame = await newGame.save();

        // Add game to user's gamesJoined
        await User.findByIdAndUpdate(
            req.user._id,
            { $push: { gamesJoined: savedGame._id } }
        );

        const populatedGame = await Game.findById(savedGame._id)
            .populate('host', 'username avatarUrl')
            .populate('players', 'username avatarUrl');

        res.status(201).json(populatedGame);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Join a game
router.post('/:id/join', auth, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        if (game.status !== 'waiting') {
            return res.status(400).json({ message: 'Game has already started or completed' });
        }

        if (game.players.length >= game.maxPlayers) {
            return res.status(400).json({ message: 'Game is full' });
        }

        if (game.players.includes(req.user._id)) {
            return res.status(400).json({ message: 'You have already joined this game' });
        }

        game.players.push(req.user._id);
        await game.save();

        // Add game to user's gamesJoined
        await User.findByIdAndUpdate(
            req.user._id,
            { $push: { gamesJoined: game._id } }
        );

        const updatedGame = await Game.findById(game._id)
            .populate('host', 'username avatarUrl')
            .populate('players', 'username avatarUrl');

        res.json(updatedGame);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Leave a game
router.post('/:id/leave', auth, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        if (game.status !== 'waiting') {
            return res.status(400).json({ message: 'Cannot leave a game in progress' });
        }

        if (!game.players.includes(req.user._id)) {
            return res.status(400).json({ message: 'You are not in this game' });
        }

        // If host leaves, delete the game
        if (game.host.toString() === req.user._id) {
            await Game.findByIdAndDelete(req.params.id);
            
            // Remove game from all players' gamesJoined
            await User.updateMany(
                { _id: { $in: game.players } },
                { $pull: { gamesJoined: game._id } }
            );

            return res.json({ message: 'Game deleted (host left)' });
        }

        // Remove player from game
        game.players = game.players.filter(p => p.toString() !== req.user._id);
        await game.save();

        // Remove game from user's gamesJoined
        await User.findByIdAndUpdate(
            req.user._id,
            { $pull: { gamesJoined: game._id } }
        );

        const updatedGame = await Game.findById(game._id)
            .populate('host', 'username avatarUrl')
            .populate('players', 'username avatarUrl');

        res.json(updatedGame);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Start a game
router.post('/:id/start', auth, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        if (game.host.toString() !== req.user._id) {
            return res.status(403).json({ message: 'Only the host can start the game' });
        }

        if (game.status !== 'waiting') {
            return res.status(400).json({ message: 'Game has already started' });
        }

        if (game.players.length < 2) {
            return res.status(400).json({ message: 'Need at least 2 players to start' });
        }

        game.status = 'in-progress';
        game.startedAt = new Date();
        await game.save();

        const updatedGame = await Game.findById(game._id)
            .populate('host', 'username avatarUrl')
            .populate('players', 'username avatarUrl');

        res.json(updatedGame);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Complete a game
router.post('/:id/complete', auth, async (req, res) => {
    try {
        const { winnerId } = req.body;
        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        if (game.host.toString() !== req.user._id) {
            return res.status(403).json({ message: 'Only the host can complete the game' });
        }

        if (game.status !== 'in-progress') {
            return res.status(400).json({ message: 'Game is not in progress' });
        }

        game.status = 'completed';
        game.completedAt = new Date();
        
        if (winnerId) {
            if (!game.players.includes(winnerId)) {
                return res.status(400).json({ message: 'Winner must be a player in the game' });
            }
            game.winner = winnerId;
        }

        await game.save();

        const updatedGame = await Game.findById(game._id)
            .populate('host', 'username avatarUrl')
            .populate('players', 'username avatarUrl')
            .populate('winner', 'username avatarUrl');

        res.json(updatedGame);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Save game state (for periodic auto-saves from clients)
router.post('/:id/save-state', auth, async (req, res) => {
    try {
        const { gameState } = req.body;
        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        // Verify user is in the game
        if (!game.players.some(p => p.toString() === req.user._id)) {
            return res.status(403).json({ message: 'You are not in this game' });
        }

        // Update the saved state
        game.savedState = gameState;
        game.lastStateSave = new Date();
        game.lastStateSavedBy = req.user._id;

        await game.save();

        res.json({
            message: 'Game state saved successfully',
            lastStateSave: game.lastStateSave,
            lastStateSavedBy: req.user._id
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update game (general purpose)
router.patch('/:id', auth, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        // Verify user is host or in the game
        const isHost = game.host.toString() === req.user._id;
        const isPlayer = game.players.some(p => p.toString() === req.user._id);

        if (!isHost && !isPlayer) {
            return res.status(403).json({ message: 'Not authorized to update this game' });
        }

        // Prevent direct modification of certain fields
        const { players, host, createdAt, ...allowedUpdates } = req.body;

        const updatedGame = await Game.findByIdAndUpdate(
            req.params.id,
            allowedUpdates,
            { new: true, runValidators: true }
        )
        .populate('host', 'username avatarUrl')
        .populate('players', 'username avatarUrl')
        .populate('winner', 'username avatarUrl');

        res.json(updatedGame);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete a game
router.delete('/:id', auth, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        if (game.host.toString() !== req.user._id) {
            return res.status(403).json({ message: 'Only the host can delete the game' });
        }

        await Game.findByIdAndDelete(req.params.id);

        // Remove game from all players' gamesJoined
        await User.updateMany(
            { _id: { $in: game.players } },
            { $pull: { gamesJoined: game._id } }
        );

        res.json({ message: 'Game deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;