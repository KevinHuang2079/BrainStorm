import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/auth';
import { useWebSocket } from '../contexts/webSocket';
import '../styles/GameRoomPage.css';
import PlayerArea from '../components/PlayerArea';
import BattleField from '../components/BattleField';
import { CardActionsProvider } from '../contexts/cardActions';
import LeftRail from '../components/LeftRail';
import cardBack from '../imgs/magic-card-backballs.png';

const GameRoomPage = () => {
    const { gameId } = useParams(); 
    const { socket } = useWebSocket();
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    const [game, setGame] = useState(null);
    const [messages, setMessages] = useState([]);
    const messagesEndRef = useRef(null);

    const [playerStates, setPlayerStates] = useState({});
    const autoSaveIntervalRef = useRef(null);
    const syncTimeoutRef = useRef(null);

    const [showInactivityWarning, setShowInactivityWarning] = useState(false);
    const [inactivityCountdown, setInactivityCountdown] = useState(5);
    const inactivityCountdownIntervalRef = useRef(null);

    const [diceResult, setDiceResult] = useState(null);

    const roundTripTimers = useRef({});

    useEffect(() => {
        console.log('playerStates', playerStates);
    })

    const stripCardForStorage = (card) => {
        if (!card) return card;
        
        return {
            _id: card._id,
            scryfallId: card.scryfallId,
            position: card.position,
            zIndex: card.zIndex,
            isTapped: card.isTapped,
            isFaceDown: card.isFaceDown,
            currentFaceIndex: card.currentFaceIndex,
            counters: card.counters,
            isClone: card.isClone,
            isToken: card.isToken
        };
    };

    const stripCardArrayForStorage = (cards) => {
        if (!Array.isArray(cards)) return cards;
        return cards.map(card => stripCardForStorage(card));
    };

    const stripPlayerStateForStorage = (playerState) => {
        if (!playerState || typeof playerState !== 'object') return playerState;
        
        const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'facedown', 'sideboard'];
        const stripped = { ...playerState };
        
        for (const zone of zones) {
            if (stripped[zone]) {
                stripped[zone] = stripCardArrayForStorage(stripped[zone]);
            }
        }
        
        return stripped;
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (!game) return;
        
        setPlayerStates(prevStates => {
            const updatedStates = {...prevStates};
            let hasChanges = false;

            game.players.forEach(player => {
                if (!updatedStates[player._id]) {
                    hasChanges = true;
                    const isConnected = game.connectedPlayers?.some(cp => cp._id === player._id) || false;
                    const startingLife = game.format === 'commander' ? 40 : 20;
                    updatedStates[player._id] = {
                        _id: player._id,
                        username: player.username,
                        library: [],
                        hand: [],
                        battlefield: [],
                        graveyard: [],
                        exile: [],
                        facedown: [],
                        sideboard: [],
                        lifeTotal: startingLife,
                        isDisconnected: !isConnected
                    };
                }
            });

            return hasChanges ? updatedStates : prevStates;
        });
    }, [game]);

    const resetActivityTimer = useCallback(() => {
        setShowInactivityWarning(false);
        if (inactivityCountdownIntervalRef.current) {
            clearInterval(inactivityCountdownIntervalRef.current);
        }
    }, []);

    useEffect(() => {
        if (!socket || !gameId) return;
        
        const joinStart = Date.now();
        socket.emit('game:join', { gameId });
        roundTripTimers.current['game:join'] = joinStart;

        const handleGameJoined = (gameData) => {
            const joinDuration = Date.now() - roundTripTimers.current['game:join'];
            console.log(`[CLIENT PERF] game:join round-trip: ${joinDuration}ms`);
            delete roundTripTimers.current['game:join'];

            const processStart = Date.now();
            setGame(gameData);

            setPlayerStates(prev => {
                const updated = { ...prev };
                
                gameData.players.forEach(player => {
                    const isConnected = gameData.connectedPlayers?.some(cp => cp._id === player._id) || false;
                    
                    if (!updated[player._id]) {
                        updated[player._id] = {
                            _id: player._id,
                            username: player.username,
                            library: [],
                            hand: [],
                            battlefield: [],
                            graveyard: [],
                            exile: [],
                            facedown: [],
                            sideboard: [],
                            isDisconnected: !isConnected
                        };
                    } else {
                        updated[player._id].isDisconnected = !isConnected;
                    }
                });

                if (gameData.savedState) {
                    Object.keys(gameData.savedState).forEach(playerId => {
                        if (updated[playerId]) {
                            const savedPlayerState = gameData.savedState[playerId];
                            updated[playerId] = {
                                ...updated[playerId],
                                library: savedPlayerState.library || [],
                                hand: savedPlayerState.hand || [],
                                battlefield: savedPlayerState.battlefield || [],
                                graveyard: savedPlayerState.graveyard || [],
                                exile: savedPlayerState.exile || [],
                                facedown: savedPlayerState.facedown || [],
                                sideboard: savedPlayerState.sideboard || [],
                                isDisconnected: updated[playerId].isDisconnected
                            };
                        }
                    });
                }

                return updated;
            });

            const processDuration = Date.now() - processStart;
            console.log(`[CLIENT PERF] game:joined processing: ${processDuration}ms`);
        };

        const handlePlayerJoined = (updatedGame) => {
            setGame(updatedGame);
        };

        const handlePlayerLeft = ({ game: updatedGame, playerId, username }) => {
            setGame(updatedGame);
            
            setPlayerStates(prev => {
                const updated = { ...prev };
                delete updated[playerId];
                return updated;
            });
        };

        const handlePlayerDisconnected = ({ game: updatedGame, playerId, username }) => {
            setGame(updatedGame);
            
            setPlayerStates(prev => ({
                ...prev,
                [playerId]: {
                    ...prev[playerId],
                    isDisconnected: true
                }
            }));
        };

        const handleRequestSync = ({ reason, playerId, username }) => {
            clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = setTimeout(() => {
                setPlayerStates(currentStates => {
                    socket.emit('game:syncState', {
                        gameId,
                        gameState: currentStates
                    });
                    return currentStates; 
                });
            }, 100);
        };
        
        const handleStateUpdate = ({ gameState, senderId, senderUsername }) => {
            const processStart = Date.now();
            setPlayerStates(prev => {
                const updated = { ...prev };
                
                Object.keys(gameState).forEach(playerId => {
                    if (playerId !== user._id && playerId !== user._id.toString()) {
                        updated[playerId] = gameState[playerId];
                    }
                });
                
                return updated;
            });
            const processDuration = Date.now() - processStart;
            console.log(`[CLIENT PERF] stateUpdate processing: ${processDuration}ms`);
        };

        const handleGameActionFromSocket = (payload) => {
            const processStart = Date.now();
            handleLocalAction(payload);
            const processDuration = Date.now() - processStart;
            console.log(`[CLIENT PERF] game:action ${payload.action} processing: ${processDuration}ms`);
        };

        const handleTurnChanged = ({ currentTurn, username }) => {
            if (roundTripTimers.current['game:endTurn']) {
                const duration = Date.now() - roundTripTimers.current['game:endTurn'];
                console.log(`[CLIENT PERF] game:endTurn round-trip: ${duration}ms`);
                delete roundTripTimers.current['game:endTurn'];
            }

            setGame(prev => ({
                ...prev,
                currentTurn
            }));
        };

        const handleGameStarted = ({ game: updatedGame, startingPlayer }) => {
            if (roundTripTimers.current['game:startGame']) {
                const duration = Date.now() - roundTripTimers.current['game:startGame'];
                console.log(`[CLIENT PERF] game:startGame round-trip: ${duration}ms`);
                delete roundTripTimers.current['game:startGame'];
            }

            setGame(updatedGame);
        };

        const handleDiceRolled = ({ username, result, sides }) => {
            setDiceResult({ username, result, sides });
            setTimeout(() => setDiceResult(null), 3000);
        };

        const handleInactivityWarning = ({ timeRemaining }) => {
            setShowInactivityWarning(true);
            setInactivityCountdown(Math.floor(timeRemaining / 1000));
            
            if (inactivityCountdownIntervalRef.current) {
                clearInterval(inactivityCountdownIntervalRef.current);
            }
            
            inactivityCountdownIntervalRef.current = setInterval(() => {
                setInactivityCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(inactivityCountdownIntervalRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        };

        const handleGameClosed = () => {
            if (inactivityCountdownIntervalRef.current) {
                clearInterval(inactivityCountdownIntervalRef.current);
            }
            navigate('/home');
        };

        socket.on('game:joined', handleGameJoined);
        socket.on('game:playerJoined', handlePlayerJoined);
        socket.on('game:playerLeft', handlePlayerLeft);
        socket.on('game:playerDisconnected', handlePlayerDisconnected);
        socket.on('game:requestSync', handleRequestSync);
        socket.on('game:stateUpdate', handleStateUpdate);
        socket.on('game:action', handleGameActionFromSocket);
        socket.on('game:turnChanged', handleTurnChanged);
        socket.on('game:started', handleGameStarted);
        socket.on('game:diceRolled', handleDiceRolled);
        socket.on('game:inactivityWarning', handleInactivityWarning);
        socket.on('game:closedDueToInactivity', handleGameClosed);

        return () => {
            socket.off('game:joined', handleGameJoined);
            socket.off('game:playerJoined', handlePlayerJoined);
            socket.off('game:playerLeft', handlePlayerLeft);
            socket.off('game:playerDisconnected', handlePlayerDisconnected);
            socket.off('game:requestSync', handleRequestSync);
            socket.off('game:stateUpdate', handleStateUpdate);
            socket.off('game:action', handleGameActionFromSocket);
            socket.off('game:turnChanged', handleTurnChanged);
            socket.off('game:started', handleGameStarted);
            socket.off('game:diceRolled', handleDiceRolled);
            socket.off('game:inactivityWarning', handleInactivityWarning);
            socket.off('game:closedDueToInactivity', handleGameClosed);
            
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
            if (inactivityCountdownIntervalRef.current) {
                clearInterval(inactivityCountdownIntervalRef.current);
            }
        };
    }, [socket, gameId, user._id, user.username, navigate]);

    useEffect(() => {
        if (!socket || !gameId || !playerStates[user._id]) return;

        autoSaveIntervalRef.current = setInterval(() => {
            const saveStart = Date.now();
            const strippedState = stripPlayerStateForStorage(playerStates[user._id]);
            socket.emit('game:saveState', {
                gameId,
                playerId: user._id,
                playerState: strippedState,
                clientTimestamp: Date.now()
            });
            roundTripTimers.current['game:saveState'] = saveStart;
        }, 30000);

        socket.on('game:stateSaved', ({ success, timestamp }) => {
            if (roundTripTimers.current['game:saveState']) {
                const duration = Date.now() - roundTripTimers.current['game:saveState'];
                console.log(`[CLIENT PERF] game:saveState round-trip: ${duration}ms`);
                delete roundTripTimers.current['game:saveState'];
            }
        });

        return () => {
            if (autoSaveIntervalRef.current) {
                clearInterval(autoSaveIntervalRef.current);
            }
            socket.off('game:stateSaved');
        };
    }, [socket, gameId, playerStates, user._id]);

    useEffect(() => {
        const saveStateBeforeUnload = () => {
            if (socket && gameId && playerStates[user._id]) {
                const strippedStates = {};
                Object.keys(playerStates).forEach(playerId => {
                    strippedStates[playerId] = stripPlayerStateForStorage(playerStates[playerId]);
                });
                
                socket.emit('game:saveState', {
                    gameId,
                    gameState: strippedStates,
                    clientTimestamp: Date.now()
                });
            }
        };

        window.addEventListener('beforeunload', saveStateBeforeUnload);

        return () => {
            saveStateBeforeUnload();
            window.removeEventListener('beforeunload', saveStateBeforeUnload);
        };
    }, [socket, gameId, playerStates, user._id]);

    const handleStartGame = useCallback(() => {
        if (socket && game && game.host._id === user._id) {
            const startTime = Date.now();
            socket.emit('game:startGame', {
                gameId: game._id
            });
            roundTripTimers.current['game:startGame'] = startTime;
            resetActivityTimer();
        }
    }, [socket, game, user._id, resetActivityTimer]);

    const handleEndTurn = useCallback(() => {
        if (socket && game) {
            const startTime = Date.now();
            socket.emit('game:endTurn', {
                gameId: game._id
            });
            roundTripTimers.current['game:endTurn'] = startTime;
            resetActivityTimer();
        }
    }, [socket, game, resetActivityTimer]);

    const handleGameAction = useCallback((actionData) => {
        if (!socket || !gameId) return;
        
        resetActivityTimer();
        
        const actionStart = Date.now();
        
        const actionPayload = {
            username: user.username,
            playerId: user._id,
            action: actionData.action,
            data: actionData.data || actionData,
            timestamp: Date.now()
        };
        
        handleLocalAction(actionPayload);
        
        socket.emit('game:action', {
            gameId: game._id,
            action: actionData.action,
            data: actionData.data || actionData
        });

        const emitDuration = Date.now() - actionStart;
        console.log(`[CLIENT PERF] game:action ${actionData.action} emit: ${emitDuration}ms`);
    }, [socket, gameId, game, user, resetActivityTimer]);

    const handleRepositionCard = useCallback((cardId, newPosition, newZIndex) => {
        handleGameAction({
            action: 'repositionCard',
            data: { cardId, position: newPosition, zIndex: newZIndex }
        });
    }, [handleGameAction]);

    const handleRollDice = useCallback((result, sides) => {
        if (!socket || !gameId) return;
        
        resetActivityTimer();
        
        setDiceResult({ username: user.username, result, sides });
        setTimeout(() => setDiceResult(null), 3000);

        socket.emit('game:action', {
            gameId: game._id,
            action: 'rollDice',
            data: { result, sides }
        });
    }, [socket, gameId, game, user.username, resetActivityTimer]);

    const handleUntapAll = useCallback(() => {
        const untapStart = Date.now();
        setPlayerStates(prev => {
            const updated = { ...prev };
            if (updated[user._id]) {
                updated[user._id] = {
                    ...updated[user._id],
                    battlefield: updated[user._id].battlefield.map(card => ({
                        ...card,
                        isTapped: false
                    }))
                };
            }
            return updated;
        });
        const untapDuration = Date.now() - untapStart;
        console.log(`[CLIENT PERF] untapAll processing: ${untapDuration}ms`);
        resetActivityTimer();
    }, [user._id, resetActivityTimer]);

    const leaveGame = useCallback(() => {
        if (socket && gameId && playerStates[user._id]) {
            const strippedStates = {};
            Object.keys(playerStates).forEach(playerId => {
                strippedStates[playerId] = stripPlayerStateForStorage(playerStates[playerId]);
            });
            
            socket.emit('game:saveState', {
                gameId,
                gameState: strippedStates,
                clientTimestamp: Date.now()
            });
        }
        socket.emit('game:leave', { gameId });
        navigate(`/home`);
    }, [socket, gameId, playerStates, user._id, navigate]);

    const shuffleArray = (array) => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const handleLocalAction = ({ username, action, data, timestamp, playerId }) => {
        if (action === 'rollDice') {
            setDiceResult({ username, result: data.result, sides: data.sides });
            setTimeout(() => setDiceResult(null), 3000);
            return;
        }

        setPlayerStates(prev => {
            const updated = { ...prev };
            const playerState = updated[playerId];
            
            if (!playerState) {
                return prev;
            }

            switch (action) {
                case 'changeLifeTotal': {
                    const { amount } = data;
                    const currentLife = playerState.lifeTotal ?? (game?.format === 'commander' ? 40 : 20);
                    updated[playerId] = {
                        ...playerState,
                        lifeTotal: currentLife + amount
                    };
                    break;
                }

                case 'loadDeck':
                    updated[playerId] = {
                        ...playerState,
                        library: data.library || [],
                        hand: [],
                        battlefield: data.startInPlay || [],
                        graveyard: [],
                        exile: [],
                        facedown: [],
                        sideboard: data.sideboard || []
                    };
                    break;

                case 'drawCard': {
                    const { cards, zone } = data;
                    const cardsWithPositions = cards.map((card, index) => ({
                        ...card,
                        currentFaceIndex: card.currentFaceIndex || 0,
                        position: card.position || { 
                            x: (playerState[zone]?.length || 0) * 120 + index * 120, 
                            y: 0 
                        }
                    }));
                    
                    updated[playerId] = {
                        ...playerState,
                        library: (playerState.library || []).slice(cards.length),
                        [zone]: [...(playerState[zone] || []), ...cardsWithPositions]
                    };
                    break;
                }

                case 'mulligan': {
                    const { count } = data;
                    const handCards = playerState.hand || [];
                    const libraryCards = playerState.library || [];
                    
                    const newLibrary = [...libraryCards, ...handCards];
                    const shuffledLibrary = shuffleArray(newLibrary);
                    
                    const newHand = shuffledLibrary.slice(0, count).map(card => ({
                        ...card,
                        currentFaceIndex: card.currentFaceIndex || 0
                    }));
                    const remainingLibrary = shuffledLibrary.slice(count);
                    
                    updated[playerId] = {
                        ...playerState,
                        hand: newHand,
                        library: remainingLibrary
                    };
                    break;
                }

                case 'play': {
                    const { card, fromZone, toZone } = data;
                    const from = fromZone.toLowerCase();
                    const to = toZone || 'battlefield';
                    
                    const cardWithPosition = to === 'battlefield' && !card.position
                        ? { 
                            ...card,
                            currentFaceIndex: card.currentFaceIndex || 0,
                            position: { 
                                x: (playerState[to]?.length || 0) * 120, 
                                y: 0 
                            },
                            zIndex: (playerState[to]?.length || 0) + 1
                        }
                        : { ...card, currentFaceIndex: card.currentFaceIndex || 0 };
                    
                    updated[playerId] = {
                        ...playerState,
                        [from]: (playerState[from] || []).filter(c => c._id !== card._id),
                        [to]: [...(playerState[to] || []), cardWithPosition]
                    };
                    break;
                }

                case 'playFaceDown': {
                    const { card, fromZone, toZone } = data;
                    const from = fromZone.toLowerCase();
                    const to = toZone || 'battlefield';
                    
                    const cardWithPosition = to === 'battlefield'
                        ? { 
                            ...card,
                            currentFaceIndex: card.currentFaceIndex || 0,
                            isFaceDown: true,
                            position: card.position || { 
                                x: (playerState[to]?.length || 0) * 120, 
                                y: 0 
                            },
                            zIndex: (playerState[to]?.length || 0) + 1
                        }
                        : { ...card, currentFaceIndex: card.currentFaceIndex || 0, isFaceDown: true };
                    
                    updated[playerId] = {
                        ...playerState,
                        [from]: (playerState[from] || []).filter(c => c._id !== card._id),
                        [to]: [...(playerState[to] || []), cardWithPosition]
                    };
                    break;
                }

                case 'move': {
                    const { card, fromZone, toZone } = data;
                    const from = fromZone.toLowerCase();
                    const to = toZone.toLowerCase();
                    
                    if ((card.isClone || card.isToken) && from === 'battlefield') {
                        updated[playerId] = {
                            ...playerState,
                            [from]: (playerState[from] || []).filter(c => c._id !== card._id)
                        };
                    } else {
                        const cardWithPosition = to === 'battlefield' && !card.position
                            ? { 
                                ...card,
                                currentFaceIndex: card.currentFaceIndex || 0,
                                position: { 
                                    x: (playerState[to]?.length || 0) * 120, 
                                    y: 0 
                                },
                                zIndex: (playerState[to]?.length || 0) + 1
                            }
                            : { ...card, currentFaceIndex: card.currentFaceIndex || 0 };
                        
                        updated[playerId] = {
                            ...playerState,
                            [from]: (playerState[from] || []).filter(c => c._id !== card._id),
                            [to]: [...(playerState[to] || []), cardWithPosition]
                        };
                    }
                    break;
                }

                case 'moveToLibraryTop': {
                    const { card, fromZone } = data;
                    const from = fromZone.toLowerCase();
                    
                    if ((card.isClone || card.isToken) && from === 'battlefield') {
                        updated[playerId] = {
                            ...playerState,
                            [from]: (playerState[from] || []).filter(c => c._id !== card._id)
                        };
                    } else {
                        updated[playerId] = {
                            ...playerState,
                            [from]: (playerState[from] || []).filter(c => c._id !== card._id),
                            library: [{ ...card, currentFaceIndex: card.currentFaceIndex || 0 }, ...(playerState.library || [])]
                        };
                    }
                    break;
                }

                case 'moveToLibraryBottom': {
                    const { card, fromZone } = data;
                    const from = fromZone.toLowerCase();
                    
                    if ((card.isClone || card.isToken) && from === 'battlefield') {
                        updated[playerId] = {
                            ...playerState,
                            [from]: (playerState[from] || []).filter(c => c._id !== card._id)
                        };
                    } else {
                        updated[playerId] = {
                            ...playerState,
                            [from]: (playerState[from] || []).filter(c => c._id !== card._id),
                            library: [...(playerState.library || []), { ...card, currentFaceIndex: card.currentFaceIndex || 0 }]
                        };
                    }
                    break;
                }

                case 'repositionCard': {
                    const { cardId, position, zIndex } = data;
                    const newBattlefield = playerState.battlefield.map(card =>
                        card._id === cardId 
                            ? { ...card, position, zIndex }
                            : card
                    );

                    updated[playerId] = {
                        ...playerState,
                        battlefield: newBattlefield
                    };
                    break;
                }

                case 'toggleAltFace': {
                    const { cardId, zone } = data;
                    const targetZone = zone.toLowerCase();
                    const newZone = (playerState[targetZone] || []).map(card => {
                        if (card._id === cardId) {
                            const hasAltFace = card.altImageUrl || (card.card_faces && card.card_faces.length > 1);
                            if (hasAltFace) {
                                const currentIndex = card.currentFaceIndex ?? 0;
                                const nextIndex = currentIndex === 0 ? 1 : 0;
                                return { ...card, currentFaceIndex: nextIndex };
                            }
                        }
                        return card;
                    });

                    updated[playerId] = {
                        ...playerState,
                        [targetZone]: newZone
                    };
                    break;
                }

                case 'tapCard': {
                    const { cardId } = data;
                    const newBattlefield = playerState.battlefield.map(card => {
                        if (card._id === cardId) {
                            return { ...card, isTapped: !card.isTapped };
                        }
                        return card;
                    });

                    updated[playerId] = {
                        ...playerState,
                        battlefield: newBattlefield
                    };
                    break;
                }

                case 'toggleFaceDown': {
                    const { cardId } = data;
                    const newBattlefield = playerState.battlefield.map(card => {
                        if (card._id === cardId) {
                            return { ...card, isFaceDown: !card.isFaceDown };
                        }
                        return card;
                    });

                    updated[playerId] = {
                        ...playerState,
                        battlefield: newBattlefield
                    };
                    break;
                }

                case 'shakeCard': {
                    const { cardId } = data;
                    const newBattlefield = playerState.battlefield.map(card =>
                        card._id === cardId 
                            ? { ...card, isShaking: true }
                            : card
                    );

                    updated[playerId] = {
                        ...playerState,
                        battlefield: newBattlefield
                    };

                    setTimeout(() => {
                        setPlayerStates(prev => {
                            const resetShake = { ...prev };
                            resetShake[playerId] = {
                                ...resetShake[playerId],
                                battlefield: resetShake[playerId].battlefield.map(card =>
                                    card._id === cardId 
                                        ? { ...card, isShaking: false }
                                        : card
                                )
                            };
                            return resetShake;
                        });
                    }, 200);
                    break;
                }

                case 'addCounter': {
                    const { cardId } = data;
                    const newBattlefield = playerState.battlefield.map(card => {
                        if (card._id === cardId) {
                            const currentCounters = card.counters || [];
                            return { ...card, counters: [...currentCounters, 1] };
                        }
                        return card;
                    });

                    updated[playerId] = {
                        ...playerState,
                        battlefield: newBattlefield
                    };
                    break;
                }

                case 'removeCounter': {
                    const { cardId, counterIndex } = data;
                    const newBattlefield = playerState.battlefield.map(card => {
                        if (card._id === cardId && card.counters) {
                            const newCounters = card.counters.filter((_, idx) => idx !== counterIndex);
                            if (newCounters.length === 0) {
                                const { counters, ...rest } = card;
                                return rest;
                            }
                            return { ...card, counters: newCounters };
                        }
                        return card;
                    });

                    updated[playerId] = {
                        ...playerState,
                        battlefield: newBattlefield
                    };
                    break;
                }

                case 'incrementCounter': {
                    const { cardId, counterIndex } = data;
                    const newBattlefield = playerState.battlefield.map(card => {
                        if (card._id === cardId && card.counters) {
                            const newCounters = [...card.counters];
                            newCounters[counterIndex] = (newCounters[counterIndex] || 1) + 1;
                            return { ...card, counters: newCounters };
                        }
                        return card;
                    });

                    updated[playerId] = {
                        ...playerState,
                        battlefield: newBattlefield
                    };
                    break;
                }

                case 'cloneCard': {
                    const { card, cloneId } = data;
                    const clonedCard = {
                        ...card,
                        _id: cloneId,
                        isClone: true,
                        position: data.position || {
                            x: (card.position?.x || 0) + 20,
                            y: (card.position?.y || 0) + 20
                        },
                        zIndex: data.zIndex || (playerState.battlefield?.length || 0) + 1
                    };

                    updated[playerId] = {
                        ...playerState,
                        battlefield: [...(playerState.battlefield || []), clonedCard]
                    };
                    break;
                }

                case 'shuffleLibrary':
                    updated[playerId] = {
                        ...playerState,
                        library: data.cards || []
                    };
                    break;

                case 'scoopDeck':
                    updated[playerId] = {
                        ...playerState,
                        library: [],
                        hand: [],
                        battlefield: [],
                        graveyard: [],
                        exile: [],
                        facedown: [],
                        sideboard: []
                    };
                    break;
                    
                default : 
                    console.log('penisbob:', action);
            }

            return updated;
        });
    };

    if (!game) {
        return (
            <div className="game-room-loading">
                <div className="loading-spinner"></div>
                <p>Loading game...</p>
            </div>
        );
    }

    return (
        <div className="game-room-page">
            {showInactivityWarning && (
                <div className="inactivity-warning-banner">
                    <div className="inactivity-warning-content">
                        <span className="warning-icon">⚠️</span>
                        <span className="warning-text">
                            Game will close in <strong>{inactivityCountdown}s</strong> due to inactivity. Perform any action to continue.
                        </span>
                    </div>
                </div>
            )}

            <div className="game-room-content">
                <CardActionsProvider onGameAction={handleGameAction} playerStates={playerStates} userId={user._id}>
                    <div className="game-area-wrapper">
                        <LeftRail 
                            onLeaveGame={leaveGame}
                            onRollDice={handleRollDice}
                            onUntapAll={handleUntapAll}
                        />
                        <div className="game-area">
                            <BattleField 
                                game={game}
                                playerStates={playerStates}
                                onRepositionCard={handleRepositionCard}
                                onEndTurn={handleEndTurn}
                                onStartGame={handleStartGame}
                                deckBackImage={cardBack}
                                diceResult={diceResult}
                            />
                        </div>
                    </div>

                    <PlayerArea 
                        game={game} 
                        playerStates={playerStates}
                        onGameAction={handleGameAction}
                    />
                </CardActionsProvider>
            </div>
        </div>
    );
};

export default GameRoomPage;

// GamePage Stuff:
// - I want to be able to see tokens from scryfall search result.
// - I want to see number of cards in opponents hands.
// - Should be able to drag cards from hand to battlefield.
// - Thin white highlight to the player whos turn it is. 
// - Click and hold to highlight cards on battlefield. (Select Many)

// need to be able to look at other player's other zones 
// should see other players card counts