const cors = require('cors');

const corsOptions = {
    origin: process.env.CORS_OPTION || 'http://localhost:3000',
    credentials: true,
};

module.exports = cors(corsOptions);
