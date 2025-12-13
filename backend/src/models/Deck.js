const mongoose = require('mongoose');

const deckSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        priceValue: {
            type: Number,
            default: 0,
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId, 
            required: true,
            ref: 'User'
        },
        cards: [
            {
                type: String
            }
        ],
        format: {
            type: String,
            required: true,
        },
        sideboard: [{ 
            type: String
        }],
        startInPlay: [{ 
            type: String
        }]
    },
    {
        timestamps: true,
    }
);

const Deck = mongoose.model('Deck', deckSchema);
module.exports = Deck;