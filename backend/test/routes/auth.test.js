/**
 * auth.test.js
 *
 * Tests register, login, logout, forgot-password, and reset-password
 * routes. Mocks bcrypt, jwt, and User model so no real DB is needed.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/models/User');
jest.mock('../../src/services/emailService', () => ({
    sendPasswordRecovery: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utils/emailValidator', () => ({
    validateEmail: jest.fn().mockResolvedValue({ valid: true, reason: null, suggestion: null }),
}));

const User = require('../../src/models/User');
const { validateEmail } = require('../../src/utils/emailValidator');
const { sendPasswordRecovery } = require('../../src/services/emailService');

process.env.JWT_SECRET = 'test-secret';

// ── App setup ─────────────────────────────────────────────────────────────────

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(require('cookie-parser')());
    app.use('/auth', require('../../src/routes/auth'));
    return app;
}

// ── Register ──────────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
    let app;

    beforeEach(() => {
        app = buildApp();
        User.findOne = jest.fn().mockResolvedValue(null); // no existing user
        User.prototype.save = jest.fn().mockResolvedValue(undefined);
        User.mockImplementation((data) => ({
            ...data,
            _id: 'newUserId',
            save: jest.fn().mockResolvedValue({ _id: 'newUserId', ...data }),
        }));
    });

    test('201 on valid registration', async () => {
        const res = await request(app).post('/auth/register').send({
            username: 'alice',
            email: 'alice@example.com',
            password: 'password123',
        });
        expect(res.status).toBe(201);
        expect(res.body.user.username).toBe('alice');
        expect(res.headers['set-cookie']).toBeDefined(); // token cookie set
    });

    test('400 when fields missing', async () => {
        const res = await request(app).post('/auth/register').send({ username: 'alice' });
        expect(res.status).toBe(400);
    });

    test('409 when user already exists', async () => {
        User.findOne = jest.fn().mockResolvedValue({ _id: 'existing' });
        const res = await request(app).post('/auth/register').send({
            username: 'alice',
            email: 'alice@example.com',
            password: 'password123',
        });
        expect(res.status).toBe(409);
    });

    test('400 when email validation fails', async () => {
        validateEmail.mockResolvedValueOnce({ valid: false, reason: 'Disposable email', suggestion: null });
        const res = await request(app).post('/auth/register').send({
            username: 'alice',
            email: 'alice@tempmail.com',
            password: 'password123',
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/disposable/i);
    });
});

// ── Login ─────────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
    let app;

    beforeEach(() => {
        app = buildApp();
    });

    test('200 + token cookie on valid credentials', async () => {
        const bcrypt = require('bcrypt');
        const hashed = await bcrypt.hash('correctpassword', 10);

        User.findOne = jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: 'user1',
                username: 'alice',
                email: 'alice@example.com',
                password: hashed,
                avatarUrl: null,
            }),
        });

        const res = await request(app).post('/auth/login').send({
            email: 'alice@example.com',
            password: 'correctpassword',
        });

        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('alice');
        expect(res.headers['set-cookie']).toBeDefined();
    });

    test('401 on wrong password', async () => {
        const bcrypt = require('bcrypt');
        const hashed = await bcrypt.hash('correctpassword', 10);

        User.findOne = jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: 'user1',
                email: 'alice@example.com',
                password: hashed,
            }),
        });

        const res = await request(app).post('/auth/login').send({
            email: 'alice@example.com',
            password: 'wrongpassword',
        });

        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/invalid credentials/i);
    });

    test('401 when user not found', async () => {
        User.findOne = jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue(null),
        });

        const res = await request(app).post('/auth/login').send({
            email: 'nobody@example.com',
            password: 'password',
        });

        expect(res.status).toBe(401);
    });
});

// ── Logout ────────────────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
    test('clears token cookie', async () => {
        const app = buildApp();
        const res = await request(app).post('/auth/logout');
        expect(res.status).toBe(200);
        // Cookie should be cleared (set with empty or maxAge=0)
        const cookies = res.headers['set-cookie'] || [];
        expect(cookies.some((c) => c.startsWith('token=;') || c.includes('Expires='))).toBe(true);
    });
});

// ── Forgot password ───────────────────────────────────────────────────────────

describe('POST /auth/forgot-password', () => {
    let app;

    beforeEach(() => {
        app = buildApp();
    });

    test('200 and sends email for valid user', async () => {
        const mockUser = {
            _id: 'user1',
            email: 'alice@example.com',
            resetToken: null,
            resetTokenExpiry: null,
            save: jest.fn().mockResolvedValue(undefined),
        };
        User.findOne = jest.fn().mockResolvedValue(mockUser);

        const res = await request(app).post('/auth/forgot-password').send({ email: 'alice@example.com' });

        expect(res.status).toBe(200);
        expect(sendPasswordRecovery).toHaveBeenCalled();
        expect(mockUser.resetToken).not.toBeNull();  // hashed token was stored
        expect(mockUser.save).toHaveBeenCalled();
    });

    test('400 when email not registered', async () => {
        User.findOne = jest.fn().mockResolvedValue(null);
        const res = await request(app).post('/auth/forgot-password').send({ email: 'nobody@example.com' });
        expect(res.status).toBe(400);
    });

    test('400 when email field missing', async () => {
        const res = await request(app).post('/auth/forgot-password').send({});
        expect(res.status).toBe(400);
    });
});

// ── Reset password ────────────────────────────────────────────────────────────

describe('POST /auth/reset-password', () => {
    let app;

    beforeEach(() => {
        app = buildApp();
    });

    test('200 and clears reset token on valid token', async () => {
        const crypto = require('crypto');
        const rawToken = 'validrawtoken';
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        const mockUser = {
            password: 'oldhash',
            resetToken: hashedToken,
            resetTokenExpiry: new Date(Date.now() + 60000),
            save: jest.fn().mockResolvedValue(undefined),
        };

        User.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

        const res = await request(app).post('/auth/reset-password').send({
            token: rawToken,
            newPassword: 'newpassword123',
        });

        expect(res.status).toBe(200);
        expect(mockUser.resetToken).toBeNull();
        expect(mockUser.resetTokenExpiry).toBeNull();
        expect(mockUser.save).toHaveBeenCalled();
    });

    test('400 when token is invalid or expired', async () => {
        User.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

        const res = await request(app).post('/auth/reset-password').send({
            token: 'badtoken',
            newPassword: 'newpassword123',
        });

        expect(res.status).toBe(400);
    });

    test('400 when fields missing', async () => {
        const res = await request(app).post('/auth/reset-password').send({ token: 'abc' });
        expect(res.status).toBe(400);
    });
});