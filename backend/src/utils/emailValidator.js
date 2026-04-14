const validateEmail = async (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email) {
        return {
            valid: false,
            reason: 'Email is required',
            suggestion: null
        };
    }

    if (!emailRegex.test(email)) {
        return {
            valid: false,
            reason: 'Invalid email format',
            suggestion: 'Please enter a valid email address (e.g., user@example.com)'
        };
    }

    const [localPart, domain] = email.split('@');
    
    if (localPart.length > 64) {
        return {
            valid: false,
            reason: 'Email local part too long',
            suggestion: 'The part before @ should be 64 characters or less'
        };
    }

    if (domain.length > 255) {
        return {
            valid: false,
            reason: 'Email domain too long',
            suggestion: 'The domain should be 255 characters or less'
        };
    }

    const disposableDomains = [
        'tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com',
        'mailinator.com', 'maildrop.cc', 'trashmail.com', 'fakeinbox.com'
    ];

    if (disposableDomains.includes(domain.toLowerCase())) {
        return {
            valid: false,
            reason: 'Disposable email addresses are not allowed',
            suggestion: 'Please use a permanent email address'
        };
    }

    return {
        valid: true,
        reason: null,
        suggestion: null
    };
};

module.exports = {
    validateEmail
};