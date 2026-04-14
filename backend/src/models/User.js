const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false,
    },
    avatarUrl: {
        type: String,
        default: null
    },
    gamesJoined: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game'
    }],
    currentDecks: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deck'
    }],
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    resetToken: {
        type: String,
        default: null,
    },
    resetTokenExpiry: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);