import mongoose from 'mongoose';

const gameSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true
  },
  players: [{
    socketId: String,
    username: String,
    hand: Array,
    hasCalledUno: { type: Boolean, default: false }
  }],
  deck: [Object],
  discardPile: [Object],
  currentPlayer: Number,
  direction: { type: Number, default: 1 },
  currentColor: String,
  gameStatus: {
    type: String,
    enum: ['waiting', 'active', 'finished'],
    default: 'waiting'
  },
  winner: String,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Auto-delete after 24 hours
  }
});

export default mongoose.model('Game', gameSchema);
