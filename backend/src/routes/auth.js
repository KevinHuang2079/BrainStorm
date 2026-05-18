const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { validateEmail } = require('../utils/emailValidator');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const crypto = require('crypto');
const { sendPasswordRecovery } = require('../services/emailService');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
        return ipKeyGenerator(req) + ':' + (req.body.email || '');
    }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
        return ipKeyGenerator(req) + ':' + (req.body.email || '');
    }
});

const isProduction = process.env.NODE_ENV === 'prod';

const cookieOptions = {
    httpOnly: true,
    secure: isProduction,           // false on localhost (HTTP), true on Render (HTTPS)
    sameSite: isProduction ? 'none' : 'lax',  // 'none' needs secure, 'lax' works for localhost
    maxAge: 1000 * 60 * 60 * 24 * 7
};

router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!email || !password || !username) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const emailValidation = await validateEmail(email);
        if (!emailValidation.valid) {
            return res.status(400).json({
                message: emailValidation.reason,
                suggestion: emailValidation.suggestion
            });
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
            { _id: savedUser._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, cookieOptions);

        res.status(201).json({
            user: {
                _id: savedUser._id,
                username: savedUser.username,
                email: savedUser.email,
                avatarUrl: savedUser.avatarUrl,
            },
            message: "Registration successful."
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const matchingPassword = await bcrypt.compare(password, user.password);
        if (!matchingPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not defined');

        const token = jwt.sign(
            { _id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, cookieOptions);

        res.status(200).json({
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

router.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
    });
    res.json({ message: 'Logged out' });
});

//user requests for reset link to be emailed
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });


        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(400).json({ message: 'User not registered' });

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        user.resetToken = hashedToken;
        user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();

        await sendPasswordRecovery(user.email, rawToken); // send the RAW token in the link
        return res.status(200).json({ message: 'Link sent.' });
    } catch (err) {
        console.error('forgot-password error:', err);
        res.status(500).json({ message: err.message });
    }
});

//user submits the code they received
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ message: 'Token and new password are required' });

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            resetToken: hashedToken,
            resetTokenExpiry: { $gt: new Date() }, // not expired
        }).select('+password');

        if (!user) return res.status(400).json({ message: 'Reset link is invalid or has expired' });

        const bcrypt = require('bcrypt');
        user.password = await bcrypt.hash(newPassword, 12);
        user.resetToken = null;
        user.resetTokenExpiry = null;
        await user.save();

        res.status(200).json({ message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/me', authMiddleware, (req, res) => {
    res.json({ user: req.user });
});

module.exports = router;