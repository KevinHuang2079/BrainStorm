const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,  
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
        },
        avatarUrl: {
            type: String,
            required: false,
            default: 'https://avatars.githubusercontent.com/u/0?v=4',
        },
        gamesJoined: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Game'
            }
        ],
        currentDecks: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Deck'
            }
        ],
        friends: [
            {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
            }
        ]
    },
    {
        timestamps: true,
    }
);

const User = mongoose.model('User', userSchema);
module.exports = User;