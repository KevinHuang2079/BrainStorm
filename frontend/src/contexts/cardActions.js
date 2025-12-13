import { createContext, useContext } from 'react';

const CardActionsContext = createContext();

export const CardActionsProvider = ({ children, onGameAction, playerStates, userId }) => {
    const drawCard = (count = 1, zone = 'hand') => {
        const myState = playerStates[userId];
        if (!myState || !myState.library || myState.library.length === 0) {
            alert('No cards left in library!');
            return;
        }

        const actualCount = Math.min(count, myState.library.length);
        const drawnCards = myState.library.slice(0, actualCount);

        onGameAction({
            action: 'drawCard',
            data: { cards: drawnCards, zone }
        });
    };

    const playCard = (card, fromZone, toZone = 'battlefield') => {
        onGameAction({
            action: 'play',
            data: { card, fromZone, toZone }
        });
    };

    const playCardFaceDown = (card, fromZone, toZone = 'battlefield') => {
        onGameAction({
            action: 'playFaceDown',
            data: { card, fromZone, toZone }
        });
    };

    const moveCard = (card, fromZone, toZone) => {
        onGameAction({
            action: 'move',
            data: { card, fromZone, toZone }
        });
    };

    const moveToLibraryTop = (card, fromZone) => {
        onGameAction({
            action: 'moveToLibraryTop',
            data: { card, fromZone }
        });
    };

    const moveToLibraryBottom = (card, fromZone) => {
        onGameAction({
            action: 'moveToLibraryBottom',
            data: { card, fromZone }
        });
    };

    const toggleAltFace = (cardId, zone) => {
        onGameAction({
            action: 'toggleAltFace',
            data: { cardId, zone }
        });
    };

    const tapCard = (cardId) => {
        onGameAction({
            action: 'tapCard',
            data: { cardId }
        });
    };

    const toggleFaceDown = (cardId) => {
        onGameAction({
            action: 'toggleFaceDown',
            data: { cardId }
        });
    };

    const shakeCard = (cardId) => {
        onGameAction({
            action: 'shakeCard',
            data: { cardId }
        });
    };

    const addCounter = (cardId) => {
        onGameAction({
            action: 'addCounter',
            data: { cardId }
        });
    };

    const removeCounter = (cardId, counterIndex) => {
        onGameAction({
            action: 'removeCounter',
            data: { cardId, counterIndex }
        });
    };

    const incrementCounter = (cardId, counterIndex) => {
        onGameAction({
            action: 'incrementCounter',
            data: { cardId, counterIndex }
        });
    };

    const cloneCard = (card) => {
        const cloneId = `${card._id}_clone_${Date.now()}_${Math.random()}`;
        onGameAction({
            action: 'cloneCard',
            data: {
                card,
                cloneId,
                position: card.position ? {
                    x: card.position.x + 20,
                    y: card.position.y + 20
                } : { x: 20, y: 20 }
            }
        });
    };

    const shuffleLibrary = (shuffledCards) => {
        onGameAction({
            action: 'shuffleLibrary',
            data: { cards: shuffledCards }
        });
    };

    const loadDeck = (library, sideboard = [], startInPlay = []) => {
        onGameAction({
            action: 'loadDeck',
            data: { library, sideboard, startInPlay }
        });
    };

    const scoopDeck = () => {
        onGameAction({
            action: 'scoopDeck',
            data: {}
        });
    };

    const rollDice = (sides, result) => {
        onGameAction({
            action: 'rollDice',
            data: { sides, result }
        });
    };

    const insertCard = (card) => {
        const tokenCard = {
            ...card,
            _id: `${card._id}_token_${Date.now()}_${Math.random()}`,
            isToken: true,
            originalCardId: card._id,
            position: { x: 0, y: 0 },
            zIndex: 1
        };

        onGameAction({
            action: 'insertCard',
            data: { card: tokenCard }
        });
    };

    const untapAll = () => {
        onGameAction({
            action: 'untapAll',
            data: {}
        });
    };
    const mulligan = (count) => {
        onGameAction({
            action: 'mulligan',
            data: { count }
        });
    };

    const value = {
        drawCard,
        playCard,
        playCardFaceDown,
        moveCard,
        moveToLibraryTop,
        moveToLibraryBottom,
        toggleAltFace,
        tapCard,
        toggleFaceDown,
        shakeCard,
        addCounter,
        removeCounter,
        incrementCounter,
        cloneCard,
        shuffleLibrary,
        loadDeck,
        scoopDeck,
        rollDice,
        insertCard,
        untapAll,
        mulligan,
        playerStates,
        userId
    };

    return (
        <CardActionsContext.Provider value={value}>
            {children}
        </CardActionsContext.Provider>
    );
};

export const useCardActions = () => {
    const context = useContext(CardActionsContext);
    if (!context) {
        throw new Error('useCardActions must be used within CardActionsProvider');
    }
    return context;
};