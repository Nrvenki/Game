import Game from '../models/Game.js';
import Player from '../models/Player.js';

// Get all active games
export const getActiveGames = async (req, res) => {
  try {
    const games = await Game.find({ gameStatus: 'active' })
      .select('roomCode players gameStatus')
      .limit(20);
    
    res.json({
      success: true,
      count: games.length,
      data: games
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get game statistics
export const getGameStats = async (req, res) => {
  try {
    const totalGames = await Game.countDocuments();
    const activeGames = await Game.countDocuments({ gameStatus: 'active' });
    const finishedGames = await Game.countDocuments({ gameStatus: 'finished' });
    const waitingGames = await Game.countDocuments({ gameStatus: 'waiting' });

    res.json({
      success: true,
      data: {
        totalGames,
        activeGames,
        finishedGames,
        waitingGames
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get player statistics
export const getPlayerStats = async (req, res) => {
  try {
    const { username } = req.params;
    
    let player = await Player.findOne({ username });
    
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found'
      });
    }

    const winRate = player.gamesPlayed > 0 
      ? ((player.gamesWon / player.gamesPlayed) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        username: player.username,
        gamesPlayed: player.gamesPlayed,
        gamesWon: player.gamesWon,
        winRate: `${winRate}%`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create or update player
export const createPlayer = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    let player = await Player.findOne({ username });

    if (!player) {
      player = await Player.create({ username });
    }

    res.json({
      success: true,
      data: player
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update player stats after game
export const updatePlayerStats = async (req, res) => {
  try {
    const { username, won } = req.body;

    const player = await Player.findOne({ username });

    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found'
      });
    }

    player.gamesPlayed += 1;
    if (won) {
      player.gamesWon += 1;
    }

    await player.save();

    res.json({
      success: true,
      data: player
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get leaderboard
export const getLeaderboard = async (req, res) => {
  try {
    const players = await Player.find()
      .sort({ gamesWon: -1, gamesPlayed: 1 })
      .limit(10);

    const leaderboard = players.map((player, index) => ({
      rank: index + 1,
      username: player.username,
      gamesWon: player.gamesWon,
      gamesPlayed: player.gamesPlayed,
      winRate: player.gamesPlayed > 0 
        ? ((player.gamesWon / player.gamesPlayed) * 100).toFixed(2)
        : 0
    }));

    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
