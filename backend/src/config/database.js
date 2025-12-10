const dotenv = require('dotenv');
dotenv.config();
const mongoose = require('mongoose');

const connectDB = async() => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
    } catch (err) {
        console.log('Database error', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;