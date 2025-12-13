const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.ENDPOINT,
    credentials: {
        accessKeyId: process.env.CF_ACCESS_KEY_ID,
        secretAccessKey: process.env.CF_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = 'brainstormcards';

async function uploadCardToR2(scryfallId, cardData) {
    try {
        const key = `cards/${scryfallId}.json`;
        
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: JSON.stringify(cardData),
            ContentType: 'application/json',
        });

        await r2Client.send(command);
        return { success: true, key };
    } catch (error) {
        console.error(`Error uploading card ${scryfallId} to R2:`, error);
        throw error;
    }
}

async function fetchCardFromR2(scryfallId) {
    try {
        const key = `cards/${scryfallId}.json`;
        
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        const response = await r2Client.send(command);
        const bodyString = await streamToString(response.Body);
        const cardData = JSON.parse(bodyString);
        cardData._id = scryfallId;
        
        return cardData;
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            console.error(`Card ${scryfallId} not found in R2`);
            return null;
        }
        console.error(`Error fetching card ${scryfallId} from R2:`, error);
        throw error;
    }
}

async function batchFetchCardsFromR2(scryfallIds) {
    const uniqueIds = [...new Set(scryfallIds)];
    const fetchPromises = uniqueIds.map(id => 
        fetchCardFromR2(id)
            .then(card => {
                if (card) {
                    card._id = id;  
                }
                return { id, card };
            })
            .catch(error => ({ id, card: null, error }))
    );
    
    const results = await Promise.all(fetchPromises);
    
    const cardMap = {};
    results.forEach(({ id, card }) => {
        if (card) {
            cardMap[id] = card;
        }
    });
    
    return cardMap;
}

async function cardExistsInR2(scryfallId) {
    try {
        const key = `cards/${scryfallId}.json`;
        
        const command = new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        await r2Client.send(command);
        return true;
    } catch (error) {
        if (error.name === 'NotFound') {
            return false;
        }
        console.error(`Error checking card ${scryfallId} in R2:`, error);
        throw error;
    }
}

async function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
}

module.exports = {
    uploadCardToR2,
    fetchCardFromR2,
    batchFetchCardsFromR2,
    cardExistsInR2,
};