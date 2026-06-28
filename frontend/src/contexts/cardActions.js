import { createContext, useContext, useCallback, useMemo, useRef, useEffect } from 'react';

const CardActionsContext = createContext();

export const CardActionsProvider = ({ children, onGameAction, playerStates, userId }) => {

    const playerStatesRef = useRef(playerStates);
    useEffect(() => { playerStatesRef.current = playerStates; }, [playerStates]);

    const userIdRef = useRef(userId);
    useEffect(() => { userIdRef.current = userId; }, [userId]);

    const drawCard = useCallback((count = 1, zone = 'hand') => {
        const myState = playerStatesRef.current[userIdRef.current];
        if (!myState || !myState.library || myState.library.length === 0) {
            alert('No cards left in library!');
            return;
        }
        const actualCount = Math.min(count, myState.library.length);
        const drawnCards = myState.library.slice(0, actualCount);
        onGameAction({ action: 'drawCard', data: { cards: drawnCards, zone } });
    }, [onGameAction]);

    const playCard = useCallback((card, fromZone, toZone = 'battlefield') => {
        onGameAction({ action: 'play', data: { card, fromZone, toZone } });
    }, [onGameAction]);

    const playCardFaceDown = useCallback((card, fromZone, toZone = 'battlefield') => {
        onGameAction({ action: 'playFaceDown', data: { card, fromZone, toZone } });
    }, [onGameAction]);

    const moveCard = useCallback((card, fromZone, toZone) => {
        onGameAction({ action: 'move', data: { card, fromZone, toZone } });
    }, [onGameAction]);

    const moveToLibraryTop = useCallback((card, fromZone) => {
        onGameAction({ action: 'moveToLibraryTop', data: { card, fromZone } });
    }, [onGameAction]);

    const moveToLibraryBottom = useCallback((card, fromZone) => {
        onGameAction({ action: 'moveToLibraryBottom', data: { card, fromZone } });
    }, [onGameAction]);

    const toggleAltFace = useCallback((cardId, zone) => {
        onGameAction({ action: 'toggleAltFace', data: { cardId, zone } });
    }, [onGameAction]);

    const tapCard = useCallback((cardId) => {
        const card = playerStatesRef.current[userIdRef.current]?.battlefield?.find(c => c._id === cardId);
        onGameAction({ action: 'tapCard', data: { cardId, extra: { isTapped: card ? !card.isTapped : true } } });
    }, [onGameAction]);

    const toggleFaceDown = useCallback((cardId) => {
        const card = playerStatesRef.current[userIdRef.current]?.battlefield?.find(c => c._id === cardId);
        onGameAction({ action: 'toggleFaceDown', data: { cardId, extra: { isFaceDown: card ? !card.isFaceDown : true } } });
    }, [onGameAction]);

    const shakeCard = useCallback((cardId) => {
        onGameAction({ action: 'shakeCard', data: { cardId } });
    }, [onGameAction]);

    const addCounter = useCallback((cardId) => {
        onGameAction({ action: 'addCounter', data: { cardId } });
    }, [onGameAction]);

    const removeCounter = useCallback((cardId, counterIndex) => {
        onGameAction({ action: 'removeCounter', data: { cardId, counterIndex } });
    }, [onGameAction]);

    const incrementCounter = useCallback((cardId, index, delta = 1) => {
        onGameAction({ action: 'incrementCounter', data: { cardId, counterIndex: index, delta } });
    }, [onGameAction]);

    const cloneCard = useCallback((card) => {
        const cloneId = `${card._id}_clone_${Date.now()}_${Math.random()}`;
        onGameAction({
            action: 'cloneCard',
            data: {
                card,
                cloneId,
                position: card.position
                    ? { x: card.position.x + 20, y: card.position.y + 20 }
                    : { x: 20, y: 20 }
            }
        });
    }, [onGameAction]);

    const shuffleLibrary = useCallback((shuffledCards) => {
        onGameAction({ action: 'shuffleLibrary', data: { cards: shuffledCards } });
    }, [onGameAction]);

    const loadDeck = useCallback((library, sideboard = [], startInPlay = []) => {
        onGameAction({ action: 'loadDeck', data: { library, sideboard, startInPlay } });
    }, [onGameAction]);

    const scoopDeck = useCallback(() => {
        onGameAction({ action: 'scoopDeck', data: {} });
    }, [onGameAction]);

    const rollDice = useCallback((sides, result) => {
        onGameAction({ action: 'rollDice', data: { sides, result } });
    }, [onGameAction]);

    const insertCard = useCallback((card) => {
        const tokenCard = {
            ...card,
            _id: `${card._id}_token_${Date.now()}_${Math.random()}`,
            isToken: true,
            originalCardId: card._id,
            position: { x: 0, y: 0 },
            zIndex: 1
        };
        onGameAction({ action: 'insertCard', data: { card: tokenCard } });
    }, [onGameAction]);

    const untapAll = useCallback(() => {
        onGameAction({ action: 'untapAll', data: {} });
    }, [onGameAction]);

    const mulligan = useCallback((count) => {
        onGameAction({ action: 'mulligan', data: { count } });
    }, [onGameAction]);

    const shakeOpponentCard = useCallback((cardId, targetPlayerId) => {
        onGameAction({ action: 'shakeOpponentCard', data: { cardId, targetPlayerId } });
    }, [onGameAction]);

    const cloneOpponentCard = useCallback((card) => {
        const cloneId = `${card._id}_clone_${Date.now()}`;
        const zIndex = (playerStatesRef.current[userIdRef.current]?.battlefield?.length || 0) + 1;
        onGameAction({
            action: 'cloneOpponentCard',
            data: {
                card,
                cloneId,
                position: { xPercent: 5, yPercent: 5 },
                zIndex
            }
        });
    }, [onGameAction]);

    const value = useMemo(() => ({
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
        shakeOpponentCard,
        cloneOpponentCard,
        playerStates,
        userId,
    }), [
        drawCard, playCard, playCardFaceDown, moveCard, moveToLibraryTop,
        moveToLibraryBottom, toggleAltFace, tapCard, toggleFaceDown, shakeCard,
        addCounter, removeCounter, incrementCounter, cloneCard, shuffleLibrary,
        loadDeck, scoopDeck, rollDice, insertCard, untapAll, mulligan,
        shakeOpponentCard, cloneOpponentCard,
        playerStates, userId,
    ]);

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