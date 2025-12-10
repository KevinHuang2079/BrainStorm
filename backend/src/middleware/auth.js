const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ message: 'No authentication token, access denied' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        req.user = { _id: decoded._id };
        
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Token is invalid' });
        }
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token has expired' });
        }
        res.status(401).json({ message: 'Authentication failed' });
    }
};

module.exports = auth;