import express from 'express';
import {
  getActiveGames,
  getGameStats,
  getPlayerStats,
  createPlayer,
  updatePlayerStats,
  getLeaderboard
} from '../controllers/gameController.js';

const router = express.Router();

router.get('/active', getActiveGames);
router.get('/stats', getGameStats);
router.get('/leaderboard', getLeaderboard);
router.get('/player/:username', getPlayerStats);
router.post('/player', createPlayer);
router.put('/player/stats', updatePlayerStats);

export default router;
