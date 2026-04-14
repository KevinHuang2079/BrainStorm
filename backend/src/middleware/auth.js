const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ message: 'Access denied: Invalid token' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        //issue where old user had select is email verified and wouldn't authorize users without this field. 
        const user = await User.findById(decoded._id);
        
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        
        req.user = user;
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