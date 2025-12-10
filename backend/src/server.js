require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const corsMiddleware = require('./middleware/cors');
const connectDB = require('./config/database');

const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/card');
const deckRoutes = require('./routes/deck');
const gameRoutes = require('./routes/game');

const app = express();
const PORT = process.env.PORT || 5002;

connectDB();

// middleware
app.use(express.json());
app.use(corsMiddleware);

// routes
app.use('/api/auth', authRoutes);
app.use('/api/card', cardRoutes);
app.use('/api/deck', deckRoutes);
app.use('/api/game', gameRoutes);

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

require('./sockets/gameSocket')(io);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server and socket running on port ${PORT}`);
});