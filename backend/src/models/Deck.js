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
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Card',
            }
        ],
        format: {
            type: String,
            required: true,
        },
        sideboard: [{ 
            type: mongoose.Schema.Types.ObjectId, ref: 'Card' 
        }],
        startInPlay: [{ 
            type: mongoose.Schema.Types.ObjectId, ref: 'Card' 
        }]
    },
    {
        timestamps: true,
    }
);

deckSchema.virtual('calculatedPrice').get(function() {
    if (!this.cards || this.cards.length === 0) return 0;
    return this.cards.reduce((total, card) => {
        return total + (card.priceValue || 0);
    }, 0);
});

deckSchema.methods.updatePrice = async function() {
    await this.populate('cards');
    this.priceValue = this.calculatedPrice;
    return this.save();
};

deckSchema.set('toJSON', { virtuals: true });
deckSchema.set('toObject', { virtuals: true });

const Deck = mongoose.model('Deck', deckSchema);
module.exports = Deck;