/**
 * emailValidator.test.js
 *
 * Tests all branches of validateEmail: missing, format invalid,
 * local-part too long, domain too long, disposable, and valid.
 */

const { validateEmail } = require('../../src/utils/emailValidator');

describe('validateEmail', () => {
    test('invalid when email is empty/falsy', async () => {
        const result = await validateEmail('');
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/required/i);
    });

    test('invalid for bad format (no @)', async () => {
        const result = await validateEmail('notanemail');
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/format/i);
    });

    test('invalid for bad format (no domain)', async () => {
        const result = await validateEmail('user@');
        expect(result.valid).toBe(false);
    });

    test('invalid when local part exceeds 64 chars', async () => {
        const longLocal = 'a'.repeat(65) + '@example.com';
        const result = await validateEmail(longLocal);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/local part too long/i);
    });

    test('invalid when domain exceeds 255 chars', async () => {
        const longDomain = 'user@' + 'a'.repeat(256) + '.com';
        const result = await validateEmail(longDomain);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/domain too long/i);
    });

    test.each([
        'tempmail.com',
        'throwaway.email',
        '10minutemail.com',
        'guerrillamail.com',
        'mailinator.com',
        'maildrop.cc',
        'trashmail.com',
        'fakeinbox.com',
    ])('rejects disposable domain: %s', async (domain) => {
        const result = await validateEmail(`user@${domain}`);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/disposable/i);
    });

    test('valid for a normal email', async () => {
        const result = await validateEmail('alice@example.com');
        expect(result.valid).toBe(true);
        expect(result.reason).toBeNull();
    });

    test('valid for email with subdomains', async () => {
        const result = await validateEmail('user@mail.company.org');
        expect(result.valid).toBe(true);
    });

    test('suggestion is null for valid email', async () => {
        const result = await validateEmail('bob@gmail.com');
        expect(result.suggestion).toBeNull();
    });
});