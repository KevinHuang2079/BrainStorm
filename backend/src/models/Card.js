const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        manaCost: {
            type: String,
            required: false,
        },
        type: {
            type: String,
            required: true,
        },
        textBox: {
            type: String,
            required: true,
        },
        expansion: {
            type: String,
            required: true,
        },
        power: {
            type: String,
            default: '',
        },
        toughness: {
            type: String,
            default: '',
        },
        priceValue: {
            type: Number,
            required: true,
        },
        imageUrl: {
            type: String,
            required: true,
        },
        altImageUrl: {  
            type: String,
            required: false,
            default: null
        },
        rarity: {
            type: String,
            required: true,
            enum: ['common', 'uncommon', 'rare', 'mythic'] 
        },
        collectorNumber: {
            type: String,
        },
        scryfallId: {
            type: String,
            unique: true,
            sparse: true 
        },
        currentFaceIndex: { type: Number, default: 0 }
    },
    {
        timestamps: true,
    }
);

const Card = mongoose.model('Card', cardSchema);
module.exports = Card;