const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const auth = require('../middleware/auth');

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!email || !password || !username) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(409).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            avatarUrl: null,
            gamesJoined: [],
            currentDecks: [],
            friends: [],
        });

        const savedUser = await newUser.save();
        
        const token = jwt.sign(
            {
                _id: savedUser._id,
                username: savedUser.username
            },
            process.env.JWT_SECRET || 'secret_sauce_and_balls_Schwein09*',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            user: { 
                _id: savedUser._id,
                username: savedUser.username,
                email: savedUser.email,
                avatarUrl: savedUser.avatarUrl,
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: 'Email not registered' });
        }

        const matchingPassword = await bcrypt.compare(password, user.password);
        if (!matchingPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { 
                _id: user._id,
                username: user.username
            },
            process.env.JWT_SECRET || 'secret_sauce_and_balls_Schwein09*',
            { expiresIn: '7d' }
        );

        res.status(200).json({
            token,
            user: { 
                _id: user._id,
                username: user.username,
                email: user.email,
                avatarUrl: user.avatarUrl,
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;