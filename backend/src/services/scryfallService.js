const axios = require('axios');
const Card = require('../models/Card');

const SCRYFALL_API = 'https://api.scryfall.com';

class ScryfallService {
    async searchCards(searchTerm) {
        try {
            const response = await axios.get(
                `${SCRYFALL_API}/cards/search`,
                {
                    params: {
                        q: searchTerm,
                        order: 'name'
                    }
                }
            );
            
            return response.data.data.map(card => this.transformScryfallCard(card));
        } catch (error) {
            if (error.response?.status === 404) {
                return []; 
            }
            throw error;
        }
    }

    async getCardsBatch(cardNames = []) {
        if (!cardNames || cardNames.length === 0) {
            return { found: [], notFound: [] };
        }

        const BATCH_SIZE = 75;
        const allFoundCards = [];
        const allNotFound = [];
        
        for (let i = 0; i < cardNames.length; i += BATCH_SIZE) {
            const batch = cardNames.slice(i, i + BATCH_SIZE);
            
            try {
                const response = await axios.post(`${SCRYFALL_API}/cards/collection`, {
                    identifiers: batch.map(name => ({ name }))
                });
                
                const data = response.data;
                
                const transformedCards = (data.data || []).map(card => 
                    this.transformScryfallCard(card)
                );
                allFoundCards.push(...transformedCards);
                
                if (data.not_found && data.not_found.length > 0) {
                    const notFoundNames = data.not_found.map(nf => {
                        if (typeof nf === 'string') {
                            return nf;
                        } else if (nf.name) {
                            return nf.name;
                        } else if (nf.identifier?.name) {
                            return nf.identifier.name;
                        }
                        return 'Unknown';
                    });
                    allNotFound.push(...notFoundNames);
                }
                
                if (i + BATCH_SIZE < cardNames.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                console.error('Error fetching card batch:', error.message);
                allNotFound.push(...batch);
            }
        }
        
        return {
            found: allFoundCards,
            notFound: allNotFound
        };
    }

    async getCardByName(cardName) {
        try {
            const response = await axios.get(
                `${SCRYFALL_API}/cards/named`,
                {
                    params: {
                        fuzzy: cardName
                    }
                }
            );
            
            return this.transformScryfallCard(response.data);
        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            throw error;
        }
    }

    transformScryfallCard(scryfallCard) {
        const rarity = scryfallCard.rarity || 'common';
        
        let imageUrl = '';
        let altImageUrl = '';
        
        if (scryfallCard.image_uris?.normal) {
            imageUrl = scryfallCard.image_uris.normal;
        } else if (scryfallCard.card_faces?.length >= 1) {
            imageUrl = scryfallCard.card_faces[0]?.image_uris?.normal || '';
            if (scryfallCard.card_faces.length >= 2) {
                altImageUrl = scryfallCard.card_faces[1]?.image_uris?.normal || '';
            }
        }
        
        let textBox = scryfallCard.oracle_text || '';
        if (!textBox && scryfallCard.card_faces) {
            textBox = scryfallCard.card_faces
                .map(face => face.oracle_text)
                .filter(Boolean)
                .join('\n---\n');
        }
        
        let manaCost = scryfallCard.mana_cost || '';
        if (!manaCost && scryfallCard.card_faces?.[0]?.mana_cost) {
            manaCost = scryfallCard.card_faces[0].mana_cost;
        }
        if (!manaCost) {
            manaCost = '{0}';
        }
        
        const transformedCard = {
            name: scryfallCard.name,
            manaCost: manaCost,
            type: scryfallCard.type_line || 'Unknown',
            textBox: textBox,
            expansion: scryfallCard.set_name || 'Unknown',
            power: scryfallCard.power || '',
            toughness: scryfallCard.toughness || '',
            priceValue: parseFloat(scryfallCard.prices?.usd || '0') || 0,
            imageUrl: imageUrl,
            altImageUrl: altImageUrl,
            hasAlternateFace: !!(altImageUrl && altImageUrl.length > 0),
            rarity: rarity, 
            collectorNumber: scryfallCard.collector_number || '',
            scryfallId: scryfallCard.id,
            currentFaceIndex: 0,
            card_faces: scryfallCard.card_faces || null
        };
        
        return transformedCard;
    }

    async cacheCard(cardData) {
        try {
            const existingCard = await Card.findOne({
                name: cardData.name,
                expansion: cardData.expansion
            });

            if (existingCard) {
                if (existingCard.priceValue !== cardData.priceValue) {
                    existingCard.priceValue = cardData.priceValue;
                    await existingCard.save();
                }
                return existingCard;
            }

            const newCard = new Card(cardData);
            return await newCard.save();
        } catch (error) {
            console.error('Error caching card:', error);
            return null;
        }
    }

    async cacheCardsBatch(cardsData) {
        if (!cardsData || cardsData.length === 0) {
            return [];
        }

        try {
            const cardIdentifiers = cardsData.map(card => ({
                name: card.name,
                expansion: card.expansion
            }));

            const existingCards = await Card.find({
                $or: cardIdentifiers
            });

            const existingMap = new Map();
            existingCards.forEach(card => {
                const key = `${card.name}|${card.expansion}`;
                existingMap.set(key, card);
            });

            const cardsToUpdate = [];
            const cardsToInsert = [];

            cardsData.forEach(card => {
                const key = `${card.name}|${card.expansion}`;
                const existingCard = existingMap.get(key);
                
                if (existingCard) {
                    if (existingCard.priceValue !== card.priceValue) {
                        cardsToUpdate.push({
                            filter: { _id: existingCard._id },
                            update: { $set: { priceValue: card.priceValue } }
                        });
                    }
                } else {
                    cardsToInsert.push(card);
                }
            });

            if (cardsToUpdate.length > 0) {
                const bulkOps = cardsToUpdate.map(({ filter, update }) => ({
                    updateOne: { filter, update }
                }));
                await Card.bulkWrite(bulkOps);
            }

            let newCards = [];
            if (cardsToInsert.length > 0) {
                newCards = await Card.insertMany(cardsToInsert, { ordered: false });
            }

            const allCardIds = [
                ...existingCards.map(c => c._id),
                ...newCards.map(c => c._id)
            ];
            
            const allCards = await Card.find({ _id: { $in: allCardIds } });
            
            return allCards;
        } catch (err) {
            console.error('Error caching cards batch:', err);
            return cardsData;
        }
    }
}

module.exports = new ScryfallService();