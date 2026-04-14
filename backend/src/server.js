require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const corsMiddleware = require('./middleware/cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');

const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/card');
const deckRoutes = require('./routes/deck');
const gameRoutes = require('./routes/game');

const app = express();
const PORT = process.env.PORT || 5002;

connectDB();

// middleware
app.use(corsMiddleware);   // first (handles preflight + credentials)
app.use(helmet());         // security headers
app.use(express.json());   // body parser
app.use(cookieParser());   // parse cookies

// routes
app.use('/api/auth', authRoutes);
app.use('/api/card', cardRoutes);
app.use('/api/deck', deckRoutes);
app.use('/api/game', gameRoutes);

const httpServer = http.createServer(app);

const corsOrigin =
  process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : (process.env.CLIENT_URL || 'https://brainstorm-mtg.pages.dev');

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

console.log('Socket.IO CORS origin:', corsOrigin);


require('./sockets/gameSocket')(io);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server and socket running on port ${PORT}`);
});