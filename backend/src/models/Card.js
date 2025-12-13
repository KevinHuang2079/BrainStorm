const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
    {
        scryfallId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        lastFetched: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true,
    }
);

const Card = mongoose.model('Card', cardSchema);
module.exports = Card;