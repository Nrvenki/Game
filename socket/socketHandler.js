import Game from '../models/Game.js';

const activeGames = new Map();
const gameTimers = new Map();
const turnTimers = new Map();

const COLORS = ['red', 'blue', 'green', 'yellow'];
const NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SPECIAL_CARDS = ['skip', 'reverse', 'draw2'];
const WILD_CARDS = ['wild', 'wild4'];

const GAME_TIME_LIMIT = 150000; // 2:30 minutes
const NORMAL_TURN_TIME = 20000; // 20 seconds
const FAST_TURN_TIME = 10000; // 10 seconds
const FAST_MODE_THRESHOLD = 60000; // 1 minute

function createDeck() {
  const deck = [];
  
  COLORS.forEach(color => {
    deck.push({ color, value: '0', type: 'number' });
    NUMBERS.slice(1).forEach(num => {
      deck.push({ color, value: num, type: 'number' });
      deck.push({ color, value: num, type: 'number' });
    });
    
    SPECIAL_CARDS.forEach(special => {
      deck.push({ color, value: special, type: 'special' });
      deck.push({ color, value: special, type: 'special' });
    });
  });
  
  WILD_CARDS.forEach(wild => {
    for (let i = 0; i < 4; i++) {
      deck.push({ color: 'black', value: wild, type: 'wild' });
    }
  });
  
  return shuffleDeck(deck);
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawCards(deck, count) {
  return deck.splice(0, count);
}

function canPlayCard(card, topCard, currentColor) {
  if (card.type === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function clearTurnTimer(roomCode) {
  const timer = turnTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(roomCode);
  }
}

function clearGameTimer(roomCode) {
  const timer = gameTimers.get(roomCode);
  if (timer) {
    clearInterval(timer);
    gameTimers.delete(roomCode);
  }
}

function startGameTimer(io, roomCode, game) {
  clearGameTimer(roomCode);
  
  game.gameTimeRemaining = GAME_TIME_LIMIT;
  game.gameStartTime = Date.now();

  const interval = setInterval(() => {
    game.gameTimeRemaining -= 1000;

    if (game.gameTimeRemaining <= 0) {
      clearInterval(interval);
      gameTimers.delete(roomCode);
      
      const winner = game.players.reduce((min, player) => 
        player.hand.length < min.hand.length ? player : min
      );
      
      game.gameStatus = 'finished';
      io.to(roomCode).emit('game-over', { 
        winner: winner.username,
        reason: 'Time Up! Winner by least cards.'
      });
      
      activeGames.delete(roomCode);
      clearTurnTimer(roomCode);
      return;
    }

    io.to(roomCode).emit('game-time-update', {
      timeRemaining: game.gameTimeRemaining,
      isFastMode: game.gameTimeRemaining < FAST_MODE_THRESHOLD
    });

  }, 1000);

  gameTimers.set(roomCode, interval);
}

function startTurnTimer(io, roomCode, game) {
  clearTurnTimer(roomCode);
  
  const turnTimeLimit = game.gameTimeRemaining < FAST_MODE_THRESHOLD 
    ? FAST_TURN_TIME 
    : NORMAL_TURN_TIME;

  let turnTimeRemaining = turnTimeLimit;

  io.to(roomCode).emit('turn-timer-start', {
    timeRemaining: turnTimeRemaining,
    isFastMode: game.gameTimeRemaining < FAST_MODE_THRESHOLD
  });

  const turnInterval = setInterval(() => {
    turnTimeRemaining -= 1000;

    io.to(roomCode).emit('turn-time-update', {
      timeRemaining: turnTimeRemaining
    });

    if (turnTimeRemaining <= 0) {
      clearInterval(turnInterval);
      turnTimers.delete(roomCode);
      autoDrawAndPassTurn(io, roomCode, game);
    }
  }, 1000);

  turnTimers.set(roomCode, turnInterval);
}

function autoDrawAndPassTurn(io, roomCode, game) {
  const currentPlayer = game.players[game.currentPlayer];
  
  if (game.deck.length === 0) {
    const topCard = game.discardPile.pop();
    game.deck = shuffleDeck([...game.discardPile]);
    game.discardPile = [topCard];
  }

  const drawnCard = game.deck.shift();
  currentPlayer.hand.push(drawnCard);

  io.to(currentPlayer.socketId).emit('auto-draw-timeout', { 
    card: drawnCard 
  });
  
  io.to(currentPlayer.socketId).emit('hand-update', { 
    hand: currentPlayer.hand 
  });

  io.to(roomCode).emit('player-timeout', { 
    username: currentPlayer.username 
  });

  game.currentPlayer = (game.currentPlayer + game.direction + game.players.length) % game.players.length;
  
  io.to(roomCode).emit('turn-change', {
    currentPlayer: game.currentPlayer,
    username: game.players[game.currentPlayer].username
  });

  io.to(roomCode).emit('players-update', {
    players: game.players.map(p => ({
      username: p.username,
      cardCount: p.hand.length
    }))
  });

  startTurnTimer(io, roomCode, game);
}

export function initializeSocket(io) {
  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    socket.on('join-room', async ({ roomCode, username }) => {
      try {
        let game = activeGames.get(roomCode);
        
        if (!game) {
          const deck = createDeck();
          game = {
            roomCode,
            players: [],
            deck,
            discardPile: [],
            currentPlayer: 0,
            direction: 1,
            currentColor: null,
            gameStatus: 'waiting',
            gameTimeRemaining: GAME_TIME_LIMIT,
            gameStartTime: null
          };
          activeGames.set(roomCode, game);
        }

        if (game.players.length >= 4) {
          socket.emit('room-full');
          return;
        }

        if (game.gameStatus === 'active') {
          socket.emit('game-already-started');
          return;
        }

        const player = {
          socketId: socket.id,
          username,
          hand: [],
          hasCalledUno: false
        };
        
        game.players.push(player);
        socket.join(roomCode);
        
        io.to(roomCode).emit('player-joined', {
          players: game.players.map(p => ({ 
            username: p.username, 
            cardCount: p.hand.length 
          })),
          gameStatus: game.gameStatus
        });

        socket.emit('joined-successfully', { 
          roomCode, 
          playerCount: game.players.length 
        });
        
      } catch (error) {
        console.error('Join room error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('start-game', ({ roomCode }) => {
      const game = activeGames.get(roomCode);
      
      if (!game || game.players.length < 2) {
        socket.emit('error', { message: 'Need at least 2 players' });
        return;
      }

      game.players.forEach(player => {
        player.hand = drawCards(game.deck, 7);
      });

      let firstCard;
      do {
        firstCard = game.deck.shift();
      } while (firstCard.type === 'wild');
      
      game.discardPile.push(firstCard);
      game.currentColor = firstCard.color;
      game.gameStatus = 'active';

      const gameDoc = new Game({
        roomCode: game.roomCode,
        players: game.players,
        deck: game.deck,
        discardPile: game.discardPile,
        currentPlayer: game.currentPlayer,
        direction: game.direction,
        currentColor: game.currentColor,
        gameStatus: game.gameStatus
      });
      gameDoc.save();

      game.players.forEach((player) => {
        io.to(player.socketId).emit('game-started', {
          hand: player.hand,
          topCard: firstCard,
          currentColor: game.currentColor,
          currentPlayer: game.currentPlayer,
          players: game.players.map(p => ({
            username: p.username,
            cardCount: p.hand.length
          })),
          gameTimeLimit: GAME_TIME_LIMIT,
          normalTurnTime: NORMAL_TURN_TIME,
          fastTurnTime: FAST_TURN_TIME
        });
      });

      io.to(roomCode).emit('turn-change', {
        currentPlayer: game.currentPlayer,
        username: game.players[game.currentPlayer].username
      });

      startGameTimer(io, roomCode, game);
      startTurnTimer(io, roomCode, game);
    });

    socket.on('play-card', ({ roomCode, cardIndex, chosenColor }) => {
      const game = activeGames.get(roomCode);
      if (!game) return;

      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== game.currentPlayer) {
        socket.emit('error', { message: 'Not your turn!' });
        return;
      }

      const player = game.players[playerIndex];
      const card = player.hand[cardIndex];
      const topCard = game.discardPile[game.discardPile.length - 1];

      if (!canPlayCard(card, topCard, game.currentColor)) {
        socket.emit('error', { message: 'Invalid card!' });
        return;
      }

      player.hand.splice(cardIndex, 1);
      game.discardPile.push(card);
      
      if (card.type === 'wild') {
        game.currentColor = chosenColor || COLORS[0];
      } else {
        game.currentColor = card.color;
      }

      if (player.hand.length === 1) {
        player.hasCalledUno = false;
      }

      if (player.hand.length === 0) {
        game.gameStatus = 'finished';
        clearGameTimer(roomCode);
        clearTurnTimer(roomCode);
        
        io.to(roomCode).emit('game-over', { 
          winner: player.username,
          reason: 'All cards played!'
        });
        activeGames.delete(roomCode);
        return;
      }

      let skipNext = false;
      let drawCount = 0;

      if (card.value === 'skip') {
        skipNext = true;
      } else if (card.value === 'reverse') {
        game.direction *= -1;
        if (game.players.length === 2) skipNext = true;
      } else if (card.value === 'draw2') {
        drawCount = 2;
        skipNext = true;
      } else if (card.value === 'wild4') {
        drawCount = 4;
        skipNext = true;
      }

      let nextPlayerIndex = (game.currentPlayer + game.direction + game.players.length) % game.players.length;
      
      if (drawCount > 0) {
        const nextPlayer = game.players[nextPlayerIndex];
        const drawnCards = drawCards(game.deck, drawCount);
        nextPlayer.hand.push(...drawnCards);
        
        io.to(nextPlayer.socketId).emit('cards-drawn', { 
          cards: drawnCards,
          count: drawCount
        });
      }

      if (skipNext) {
        game.currentPlayer = (nextPlayerIndex + game.direction + game.players.length) % game.players.length;
      } else {
        game.currentPlayer = nextPlayerIndex;
      }

      io.to(roomCode).emit('card-played', {
        playedCard: card,
        currentColor: game.currentColor,
        players: game.players.map(p => ({
          username: p.username,
          cardCount: p.hand.length
        }))
      });

      io.to(roomCode).emit('turn-change', {
        currentPlayer: game.currentPlayer,
        username: game.players[game.currentPlayer].username
      });

      game.players.forEach(p => {
        io.to(p.socketId).emit('hand-update', { hand: p.hand });
      });

      startTurnTimer(io, roomCode, game);
    });

    // NEW: Draw card with instant play option
    socket.on('draw-card', ({ roomCode }) => {
      const game = activeGames.get(roomCode);
      if (!game) return;

      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== game.currentPlayer) return;

      const player = game.players[playerIndex];
      
      if (game.deck.length === 0) {
        const topCard = game.discardPile.pop();
        game.deck = shuffleDeck([...game.discardPile]);
        game.discardPile = [topCard];
      }

      const drawnCard = game.deck.shift();
      player.hand.push(drawnCard);

      const topCard = game.discardPile[game.discardPile.length - 1];
      const canPlay = canPlayCard(drawnCard, topCard, game.currentColor);
      
      // Send drawn card with play/keep options
      socket.emit('card-drawn-with-options', { 
        card: drawnCard,
        canPlay: canPlay,
        drawnCardIndex: player.hand.length - 1
      });

      socket.emit('hand-update', { 
        hand: player.hand
      });

      io.to(roomCode).emit('players-update', {
        players: game.players.map(p => ({
          username: p.username,
          cardCount: p.hand.length
        }))
      });

      // Don't auto-pass turn - wait for player decision
    });

    // NEW: Keep drawn card and pass turn
    socket.on('keep-drawn-card', ({ roomCode }) => {
      const game = activeGames.get(roomCode);
      if (!game) return;

      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== game.currentPlayer) return;

      // Pass turn
      game.currentPlayer = (game.currentPlayer + game.direction + game.players.length) % game.players.length;
      
      io.to(roomCode).emit('turn-change', {
        currentPlayer: game.currentPlayer,
        username: game.players[game.currentPlayer].username
      });

      startTurnTimer(io, roomCode, game);
    });

    socket.on('call-uno', ({ roomCode }) => {
      const game = activeGames.get(roomCode);
      if (!game) return;

      const player = game.players.find(p => p.socketId === socket.id);
      if (player && player.hand.length === 1) {
        player.hasCalledUno = true;
        io.to(roomCode).emit('uno-called', { username: player.username });
      }
    });

    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.id}`);
      
      activeGames.forEach((game, roomCode) => {
        const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          const username = game.players[playerIndex].username;
          game.players.splice(playerIndex, 1);
          
          if (game.players.length === 0) {
            activeGames.delete(roomCode);
            clearGameTimer(roomCode);
            clearTurnTimer(roomCode);
          } else {
            io.to(roomCode).emit('player-left', { 
              username,
              players: game.players.map(p => ({
                username: p.username,
                cardCount: p.hand.length
              }))
            });
          }
        }
      });
    });
  });
}
