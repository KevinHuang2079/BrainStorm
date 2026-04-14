// middleware/cors.js
const cors = require('cors');

const isDevelopment = process.env.NODE_ENV === 'dev';

const corsOptions = {
  origin: isDevelopment ? 'http://localhost:3000' : (process.env.CLIENT_URL || 'https://brainstorm-mtg.pages.dev'),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = cors(corsOptions);