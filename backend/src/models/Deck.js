const mongoose = require('mongoose');

const cardEntrySchema = new mongoose.Schema({
  scryfallId: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 }
}, { _id: false });

const deckSchema = new mongoose.Schema({
  name: { type: String, required: true },
  priceValue: { type: Number, default: 0 },
  owner: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  cards: [cardEntrySchema],
  sideboard: [cardEntrySchema],
  startInPlay: [cardEntrySchema],
  format: { type: String, required: true }
}, { timestamps: true });

// Constraints and indexes
deckSchema.index({ owner: 1, name: 1 }, { unique: true });
deckSchema.index({ owner: 1 });
deckSchema.index({ format: 1 });
deckSchema.index({ owner: 1, createdAt: -1 });

const Deck = mongoose.model('Deck', deckSchema);
module.exports = Deck;