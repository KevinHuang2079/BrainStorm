require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const corsMiddleware = require('./middleware/cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');
const { initRedis } = require('./services/redisGameState');

const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/card');
const deckRoutes = require('./routes/deck');
const gameRoutes = require('./routes/game');

const app = express();
const PORT = process.env.PORT || 5002;

connectDB();

// middleware
app.use(corsMiddleware);
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// routes
app.use('/api/auth', authRoutes);
app.use('/api/card', cardRoutes);
app.use('/api/deck', deckRoutes);
app.use('/api/game', gameRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).send('ok');
});

const httpServer = http.createServer(app);

const corsOrigin =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : (process.env.CLIENT_URL || 'https://brainstorm.ink');

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

console.log('Socket.IO CORS origin:', corsOrigin);

require('./sockets/gameSocket')(io);

async function start() {
  await initRedis();

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server and socket running on port ${PORT}`);
    console.log('Socket.IO CORS origin:', corsOrigin);
    console.log('NODE_ENV:', process.env.NODE_ENV);
  });
}

start().catch(err => {
  console.error('[STARTUP] Failed to start server:', err);
  process.exit(1);
});