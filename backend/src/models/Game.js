const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    format: {
        type: String,
        enum: ['Commander', 'Standard', 'Modern', 'Legacy', 'Vintage', 'Casual'],
        default: 'Commander'
    },
    maxPlayers: {
        type: Number,
        required: true,
        min: 2,
        max: 4,
        default: 4
    },
    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    connectedPlayers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    host: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    currentTurn: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['waiting', 'active', 'completed'],
        default: 'waiting'
    },
    savedState: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    lastStateSave: {
        type: Date,
        default: null
    },
    lastStateSavedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    lastActivityAt: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    }
});

gameSchema.index({ lastActivityAt: 1 });
gameSchema.index({ status: 1, createdAt: -1 });
gameSchema.index({ 'players': 1 });
gameSchema.index({ lastStateSave: 1 }); 

module.exports = mongoose.model('Game', gameSchema);