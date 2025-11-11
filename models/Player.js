import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  gamesPlayed: {
    type: Number,
    default: 0
  },
  gamesWon: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Player', playerSchema);
