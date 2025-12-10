const mongoose = require('mongoose');
require('dotenv').config();

async function dropOldIndexes() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const gamesCollection = db.collection('games');

        const indexes = await gamesCollection.indexes();
        console.log('Current indexes:', indexes.map(idx => idx.name));

        const indexesToDrop = indexes
            .filter(idx => 
                idx.name.includes('gameState') || 
                idx.name.includes('battlefield') ||
                idx.name.includes('instanceId')
            )
            .map(idx => idx.name);

        if (indexesToDrop.length > 0) {
            console.log('Dropping indexes:', indexesToDrop);
            for (const indexName of indexesToDrop) {
                await gamesCollection.dropIndex(indexName);
                console.log(`Dropped index: ${indexName}`);
            }
        } else {
            console.log('No problematic indexes found');
        }

        console.log('Index cleanup complete');
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

dropOldIndexes();