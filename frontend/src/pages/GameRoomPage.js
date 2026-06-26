import React from 'react';
import '../styles/GameRoomPage.css';

import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/auth';
import { useWebSocket } from '../contexts/webSocket';
import { CardActionsProvider } from '../contexts/cardActions';

import PlayerArea from '../components/InGame/PlayerArea';
import BattleField from '../components/InGame/BattleField';
import OpponentArea from '../components/InGame/OpponentArea';


import LeftRail from '../components/InGame/LeftRail';
import ChatLog from '../components/InGame/ChatLog';
import cardBack from '../imgs/magic-card-backballs.png';



const GameRoomPage = () => {
    const { gameId } = useParams(); 
    const { socket } = useWebSocket();
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    const [game, setGame] = useState(null);
    const messagesEndRef = useRef(null);

    const [playerStates, setPlayerStates] = useState({});
    const syncTimeoutRef = useRef(null);

    const [showInactivityWarning, setShowInactivityWarning] = useState(false);
    const [inactivityCountdown, setInactivityCountdown] = useState(5);
    const inactivityCountdownIntervalRef = useRef(null);

    const [diceResult, setDiceResult] = useState(null);

    const roundTripTimers = useRef({});

    const [chatLog, setChatLog] = useState([]);
    const [showChat, setShowChat] = useState(false);
    const currentTurnNumberRef = useRef(0);

    const [railOpen, setRailOpen] = useState(true);
    const isJoinedRef = useRef(false);
    const joinCountRef = useRef(0);

    
    const handleActivityReset = () => {
        resetActivityTimer();
    };

    const stripCardForStorage = useCallback((card) => {
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
    }, []);

    const stripCardArrayForStorage = useCallback((cards) => {
        if (!Array.isArray(cards)) return cards;
        return cards.map(card => stripCardForStorage(card));
    }, [stripCardForStorage]);

    const stripPlayerStateForStorage = useCallback((playerState) => {
        if (!playerState || typeof playerState !== 'object') return playerState;

        const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'facedown', 'sideboard'];
        const stripped = { ...playerState };

        for (const zone of zones) {
            if (stripped[zone]) {
                stripped[zone] = stripCardArrayForStorage(stripped[zone]);
            }
        }

        return {
            ...stripped,
            lifeTotal: playerState.lifeTotal,
            customCounters: playerState.customCounters,
            poisonCounters: playerState.poisonCounters,
            commanderDamage: playerState.commanderDamage,
        };
    }, [stripCardArrayForStorage]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, []);

    useEffect(() => {
        console.log(playerStates);
    },[playerStates])

    useEffect(() => {
        if (!game) return;
        
        setPlayerStates(prevStates => {
            const updatedStates = {...prevStates};
            let hasChanges = false;

            game.players.forEach(player => {
                if (!updatedStates[player._id]) {
                    hasChanges = true;
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

    const shuffleArray = useCallback((array) => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }, []);

    const handleLocalAction = useCallback(({ username, action, data, timestamp, playerId }) => {
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
                case 'changeCounter': {
                    const { counterType, amount } = data;

                    if (counterType.startsWith('custom_new:')) {
                        const name = counterType.replace('custom_new:', '');
                        const existing = playerState.customCounters || [];
                        updated[playerId] = {
                            ...playerState,
                            customCounters: [...existing, { name, value: 0 }]
                        };
                    } else if (counterType.startsWith('custom_')) {
                        const idx = parseInt(counterType.replace('custom_', ''), 10);
                        const newCustom = (playerState.customCounters || []).map((c, i) =>
                            i === idx ? { ...c, value: Math.max(0, c.value + amount) } : c
                        );
                        updated[playerId] = { ...playerState, customCounters: newCustom };
                    } else {
                        updated[playerId] = {
                            ...playerState,
                            [counterType]: Math.max(0, (playerState[counterType] ?? 0) + amount)
                        };
                    }
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
                case 'shakeOpponentCard': {
                    const { cardId, targetPlayerId } = data;
                    const targetState = updated[targetPlayerId];
                    if (!targetState) break;

                    const newBattlefield = targetState.battlefield.map(card =>
                        card._id === cardId ? { ...card, isShaking: true } : card
                    );
                    updated[targetPlayerId] = { ...targetState, battlefield: newBattlefield };

                    setTimeout(() => {
                        setPlayerStates(prev => {
                            const reset = { ...prev };
                            if (!reset[targetPlayerId]) return prev;
                            reset[targetPlayerId] = {
                                ...reset[targetPlayerId],
                                battlefield: reset[targetPlayerId].battlefield.map(card =>
                                    card._id === cardId ? { ...card, isShaking: false } : card
                                )
                            };
                            return reset;
                        });
                    }, 200);
                    break;
                }

                case 'cloneOpponentCard': {
                    const actingPlayerId = playerId;
                    const actingState = updated[actingPlayerId];
                    if (!actingState) break;

                    const clonedCard = {
                        ...data.card,
                        _id: data.cloneId,
                        isClone: true,
                        position: data.position || { x: 20, y: 20 },
                        zIndex: data.zIndex || (actingState.battlefield?.length || 0) + 1
                    };
                    updated[actingPlayerId] = {
                        ...actingState,
                        battlefield: [...(actingState.battlefield || []), clonedCard]
                    };
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
                            newCounters[counterIndex] = (newCounters[counterIndex] ?? 1) + (data.delta ?? 1);
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
                    console.log('unhandled action:', action);
            }

            return updated;
        });
    }, [game?.format, shuffleArray]);

    const handleLocalActionRef = useRef(handleLocalAction);
    useEffect(() => {
        handleLocalActionRef.current = handleLocalAction;
    }, [handleLocalAction]);

    // -- socket handling -- 
    useEffect(() => {
        console.log('[GAME EFFECT] fired', { 
            hasSocket: !!socket, 
            socketConnected: socket?.connected,
            gameId 
        });

        if (!socket || !gameId) return;

        const handleGameJoined = (gameData) => {
            console.log('[REJOIN] game:joined #', ++joinCountRef.current, 
                'savedState keys:', Object.keys(gameData.savedState || {}),
                'myEntry:', gameData.savedState?.[user._id] ? 'EXISTS' : 'MISSING'
            );

            const joinDuration = Date.now() - roundTripTimers.current['game:join'];
            console.log(`[CLIENT PERF] game:join round-trip: ${joinDuration}ms`);
            delete roundTripTimers.current['game:join'];

            //set local game state
            setGame(gameData);
            isJoinedRef.current = true;

            //set local player states 
            setPlayerStates(prev => {
                const updated = { ...prev };

                gameData.players.forEach(player => {
                    const saved = gameData.savedState?.[player._id];
                    if (saved) { //check for saved state
                        updated[player._id] = {
                            ...updated[player._id],
                            ...saved,
                            _id: player._id,
                            username: player.username,
                        };
                    } else if (!updated[player._id]) { //else initiate empty player
                        const startingLife = gameData.format === 'commander' ? 40 : 20;
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
                            lifeTotal: startingLife,
                        };
                    }
                });

                const savedLog = gameData.savedState?.['_chatLog'];
                if (savedLog && Array.isArray(savedLog)) {
                    setChatLog(savedLog);
                }
                return updated;
            });
        };

        const handlePlayerJoined = (updatedGame) => {
            setGame(updatedGame);
        };

        const handlePlayerLeft = ({ game: updatedGame, playerId }) => {
            setGame(updatedGame);
            setPlayerStates(prev => {
                const updated = { ...prev };
                const key = Object.keys(updated).find(k => k.toString() === playerId.toString());
                if (key) delete updated[key];
                return updated;
            });
        };

        const handlePlayerDisconnected = ({ game: updatedGame, playerId, savedState }) => {
            setGame(updatedGame);
            setPlayerStates(prev => ({
                ...prev,
                [playerId]: {
                    ...savedState,
                }
            }));
        };

        // ── game:stateSnapshot ────────────────────────────────────────────────────
        // Authoritative full-state push from the server after every DB write.
        // Replaces the old game:requestSync → game:syncState → game:stateUpdate
        // peer-to-peer flow. We apply every player's state except our own — our
        // local optimistic update is always fresher than the round-tripped DB value.
        const handleStateSnapshot = ({ savedState }) => {
        if (!savedState) return;

        setPlayerStates(prev => {
            const updated = { ...prev };
            for (const [playerId, state] of Object.entries(savedState)) {
                if (playerId === '_chatLog') continue;
                if (playerId === user._id) continue;
                if (!state) continue;

                // Only update if incoming cards appear hydrated (have a name field)
                // to avoid overwriting good state with cache-miss stripped cards
                const battlefield = state.battlefield ?? [];
                const isHydrated = battlefield.length === 0 || battlefield[0]?.name;
                
                if (!isHydrated && updated[playerId]?.battlefield?.length > 0) {
                    // Keep existing hydrated state, only update non-zone scalars
                    updated[playerId] = {
                        ...updated[playerId],
                        lifeTotal: state.lifeTotal ?? updated[playerId].lifeTotal,
                        customCounters: state.customCounters ?? updated[playerId].customCounters,
                        poisonCounters: state.poisonCounters ?? updated[playerId].poisonCounters,
                        commanderDamage: state.commanderDamage ?? updated[playerId].commanderDamage,
                    };
                } else {
                    updated[playerId] = {
                        ...state,
                        _id: state._id ?? playerId,
                        username: updated[playerId]?.username ?? state.username,
                    };
                }
            }
            return updated;
        });
    };

        const handleGameActionFromSocket = (payload) => {
            const processStart = Date.now();

            handleLocalActionRef.current(payload);

            if (payload.playerId !== user._id) {
                setChatLog(prev => [...prev, {
                    type: 'action',
                    username: payload.username,
                    action: payload.action,
                    cardName: payload.data?.card?.name || null,
                    extra: payload.data?.extra ?? null,
                    turn: currentTurnNumberRef.current,
                    timestamp: Date.now()
                }]);
            }

            console.log(`[CLIENT PERF] game:action ${payload.action} processing: ${Date.now() - processStart}ms`);
        };

        const handleTurnChanged = ({ currentTurn, username }) => {
            if (roundTripTimers.current['game:endTurn']) {
                const duration = Date.now() - roundTripTimers.current['game:endTurn'];
                console.log(`[CLIENT PERF] game:endTurn round-trip: ${duration}ms`);
                delete roundTripTimers.current['game:endTurn'];
            }

            currentTurnNumberRef.current += 1;
            const newTurn = currentTurnNumberRef.current;

            setChatLog(prev => [...prev, {
                type: 'turn-divider',
                turn: newTurn,
                username,
                timestamp: Date.now()
            }]);

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

            currentTurnNumberRef.current = 1;

            setChatLog([{
                type: 'turn-divider',
                turn: 1,
                username: startingPlayer?.username || '',
                timestamp: Date.now()
            }]);

            socket.emit('game:saveChatLog', { gameId, chatLog: [] });
            setGame(updatedGame);
        };

        const handleDiceRolled = ({ username, result, sides }) => {
            setDiceResult({ username, result, sides });
            setTimeout(() => setDiceResult(null), 3000);

            setChatLog(prev => [...prev, {
                type: 'action',
                username,
                action: 'rollDice',
                cardName: null,
                extra: { result, sides },
                turn: currentTurnNumberRef.current,
                timestamp: Date.now()
            }]);
        };

        const handleInactivityWarning = ({ timeRemaining, closesAt }) => {
            setShowInactivityWarning(true);

            if (inactivityCountdownIntervalRef.current) {
                clearInterval(inactivityCountdownIntervalRef.current);
            }

            const tick = () => {
                const secondsLeft = Math.max(0, Math.round((closesAt - Date.now()) / 1000));
                setInactivityCountdown(secondsLeft);
                if (secondsLeft <= 0) {
                    clearInterval(inactivityCountdownIntervalRef.current);
                }
            };

            tick();
            inactivityCountdownIntervalRef.current = setInterval(tick, 1000);
        };

        const handleGameClosed = () => {
            if (inactivityCountdownIntervalRef.current) {
                clearInterval(inactivityCountdownIntervalRef.current);
            }
            navigate('/home');
        };
        
        // -- listeners -- 
        socket.on('game:joined', handleGameJoined);
        socket.on('game:playerJoined', handlePlayerJoined);
        socket.on('game:playerLeft', handlePlayerLeft);
        socket.on('game:playerDisconnected', handlePlayerDisconnected);
        socket.on('game:stateSnapshot', handleStateSnapshot);   // ← new authoritative handler
        socket.on('game:action', handleGameActionFromSocket);
        socket.on('game:turnChanged', handleTurnChanged);
        socket.on('game:started', handleGameStarted);
        socket.on('game:diceRolled', handleDiceRolled);
        socket.on('game:inactivityWarning', handleInactivityWarning);
        socket.on('game:closedDueToInactivity', handleGameClosed);
        socket.on('game:activityReset', handleActivityReset);

        let hasJoined = false;
        const handleConnect = () => {
            if (hasJoined) return;
            hasJoined = true;
            roundTripTimers.current['game:join'] = Date.now();
            socket.emit('game:join', { gameId });
        };
        socket.on('connect', handleConnect);
        if (socket.connected) {
            handleConnect();
        }

        // -- clean up -- 
        return () => {
            socket.off('game:joined', handleGameJoined);
            socket.off('game:playerJoined', handlePlayerJoined);
            socket.off('game:playerLeft', handlePlayerLeft);
            socket.off('game:playerDisconnected', handlePlayerDisconnected);
            socket.off('game:stateSnapshot', handleStateSnapshot);
            socket.off('game:action', handleGameActionFromSocket);
            socket.off('game:turnChanged', handleTurnChanged);
            socket.off('game:started', handleGameStarted);
            socket.off('game:diceRolled', handleDiceRolled);
            socket.off('game:inactivityWarning', handleInactivityWarning);
            socket.off('game:closedDueToInactivity', handleGameClosed);
            socket.off('connect', handleConnect);
            socket.off('game:activityReset', handleActivityReset);
            
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
            if (inactivityCountdownIntervalRef.current) {
                clearInterval(inactivityCountdownIntervalRef.current);
            }
        };
    }, [socket, gameId, user._id, navigate]);

    useEffect(() => {
        if (!socket || !gameId || !playerStates[user._id]) return;

        socket.on('game:stateSaved', ({ success, timestamp }) => {
            if (roundTripTimers.current['game:saveState']) {
                const duration = Date.now() - roundTripTimers.current['game:saveState'];
                console.log(`[CLIENT PERF] game:saveState round-trip: ${duration}ms`);
                delete roundTripTimers.current['game:saveState'];
            }
        });

        return () => {
            socket.off('game:stateSaved');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, gameId, user._id, stripPlayerStateForStorage]);

    const handleStartGame = useCallback(() => {
        if (socket && game && game.host._id === user._id) {
            socket.emit('game:startGame', { gameId: game._id });
            roundTripTimers.current['game:startGame'] = Date.now();
            resetActivityTimer();
        }
    }, [socket, game, user._id, resetActivityTimer]);

    const handleEndTurn = useCallback(() => {
        if (socket && game) {
            socket.emit('game:endTurn', { gameId: game._id });
            roundTripTimers.current['game:endTurn'] = Date.now();
            resetActivityTimer();
        }
    }, [socket, game, resetActivityTimer]);

    const handleGameAction = useCallback((actionData) => {
        if (!socket || !gameId) return;
        console.log('handleGameAction:', actionData);

        resetActivityTimer();

        const actionPayload = {
            username: user.username,
            playerId: user._id,
            action: actionData.action,
            data: actionData.data || actionData,
            timestamp: Date.now()
        };

        // 1. Apply optimistically to local state immediately (no flicker for the acting player)
        handleLocalAction(actionPayload);

        // 2. Compute chat extra data against pre-action state
        const myState = playerStates[user._id];
        let extra = null;
        if (actionData.action === 'tapCard') {
            const card = myState?.battlefield?.find(c => c._id === actionData.data?.cardId);
            extra = { isTapped: card ? !card.isTapped : true };
        } else if (actionData.action === 'toggleFaceDown') {
            const card = myState?.battlefield?.find(c => c._id === actionData.data?.cardId);
            extra = { isFaceDown: card ? !card.isFaceDown : true };
        } else if (actionData.action === 'changeLifeTotal') {
            const current = myState?.lifeTotal ?? (game?.format === 'commander' ? 40 : 20);
            extra = { from: current, to: current + (actionData.data?.amount ?? 0) };
        } else if (actionData.action === 'changeCounter') {
            const { counterType, amount } = actionData.data || {};
            const current = myState?.[counterType] ?? 0;
            extra = { counterType, from: current, to: current + (amount ?? 0) };
        } else if (actionData.action === 'drawCard') {
            extra = { count: actionData.data?.cards?.length ?? 1 };
        } else if (actionData.action === 'mulligan') {
            extra = { count: actionData.data?.count };
        }

        setChatLog(prev => [...prev, {
            type: 'action',
            username: user.username,
            action: actionData.action,
            cardName: actionData.data?.card?.name || null,
            extra,
            turn: currentTurnNumberRef.current,
            timestamp: Date.now()
        }]);

        // 3. Tell other clients about the action (for their optimistic update)
        socket.emit('game:action', {
            gameId: game._id,
            action: actionData.action,
            data: actionData.data || actionData
        });

        // 4. Persist to DB — the server will broadcast game:stateSnapshot to the
        //    whole room after the write succeeds, reconciling everyone's state.
        setTimeout(() => {
            setPlayerStates(current => {
                const myState = current[user._id];
                if (!myState || !isJoinedRef.current) return current;
                
                const stripped = stripPlayerStateForStorage(myState);
                const saveTimestamp = Date.now();
                
                roundTripTimers.current['game:saveState'] = saveTimestamp;
                socket.emit('game:saveState', {
                    gameId,
                    playerId: user._id,
                    playerState: stripped,
                    clientTimestamp: saveTimestamp
                });
                return current;
            });
        }, 0);

        setChatLog(current => {
            socket.emit('game:saveChatLog', { gameId, chatLog: current });
            return current;
        });
    }, [socket, gameId, game, user, resetActivityTimer, handleLocalAction, stripPlayerStateForStorage]);

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
        resetActivityTimer();
    }, [user._id, resetActivityTimer]);

    const leaveGame = useCallback(() => {
        setPlayerStates(prev => {
            const updated = { ...prev };
            delete updated[user._id];
            return updated;
        });
        socket.emit('game:leave', { gameId });
        navigate(`/home`);
    }, [socket, gameId, user._id, navigate]);

    // ── Loading state ──
    if (!game) {
        return (
            <div className="game-room-loading">
                <div className="loading-spinner" />
                <p>Entering...</p>
            </div>
        );
    }

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;900&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
            `}</style>

            <div className="game-room-page">

                {showInactivityWarning && (
                    <div className="inactivity-warning-banner">
                        <div className="inactivity-warning-content">
                            <span className="warning-icon">⚠</span>
                            <span className="warning-text">
                                Closing in <strong>{inactivityCountdown}s</strong> due to inactivity — perform any action to continue
                            </span>
                        </div>
                    </div>
                )}

                <div className="game-room-content">
                    <CardActionsProvider onGameAction={handleGameAction} playerStates={playerStates} userId={user._id}>
                        <div className="game-area-wrapper">
                             <LeftRail
                                isCollapsed={!railOpen}
                                onLeaveGame={leaveGame}
                                onRollDice={handleRollDice}
                                onUntapAll={handleUntapAll}
                                onToggleChat={() => setShowChat(prev => !prev)}
                                chatOpen={showChat}
                            />
                            <ChatLog
                                messages={chatLog}
                                isOpen={showChat}
                            />
                            <div className="game-area">
                                <button
                                    className="rail-toggle-tab"
                                    onClick={() => setRailOpen(prev => !prev)}
                                    title={railOpen ? 'Hide panel' : 'Show panel'}
                                >
                                    <svg viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        {railOpen
                                            ? <polyline points="6,2 2,5 6,8" strokeLinecap="round" strokeLinejoin="round"/>
                                            : <polyline points="4,2 8,5 4,8" strokeLinecap="round" strokeLinejoin="round"/>
                                        }
                                    </svg>
                                </button>
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
                         <OpponentArea
                            game={game}
                            playerStates={playerStates}
                        />

                        <PlayerArea 
                            game={game} 
                            playerStates={playerStates}
                            onGameAction={handleGameAction}
                        />
                    </CardActionsProvider>
                </div>
            </div>
        </>
    );
};

export default GameRoomPage;



// Todo:
// - I want to be able to see tokens from scryfall search result.
// - Should be able to drag cards from hand to battlefield.
// - Thin highlight show whos turn it is. 
// - Click and hold to highlight cards on battlefield. (Select Many)
//submenus disappear too quick (then so do their parent menus), stay until player clicks off
//inserted cards (outside deck) disappear from game if you disconnect because not added to players deck and not loaded on re-enter
//



//todo: state drift concern, handle with sequence numbers and checksums 
//idea is to move from client authoritative to server authoritative, but with sequence numbers for actions too




//view card item should be removed when in a game and instead pull up the card img off to top right of the screen enlarged
// Arrows / targeting indicators 
//cards in the opponents hand should be shown (kind of like the fanned out version of the player zone hand we have but instead with card backs populating), should only be the other player (if 2 players in lobby) or the opponents who's turn it is, if its our turn then it doens't show anything





//move analyzer (eventually, fix up chat log first)




//BUG: joining player has a populated state but not rendered => The opponent area rendered only when both conditions were true simultaneously: Object.keys(playerStates).length === 2 && playerCount === 2 (battlefield.js)
//ROOTCAUSE: playerStates and playerCount come from two different state objects — playerStates (updated via socket sync) and game (updated via setGame). When p2 joins, their state arrives via game:syncState → handleStateUpdate, which updates playerStates but not game. So playerCount (from game.players.length) was still 1 while playerStates already had 2 entries — the condition was never satisfied, so the opponent area never mounted.
//FIXED: Derive opponent rendering entirely from playerStates alone — the single source of truth that's actually live:
//LESSON: When two state objects can represent the same reality but update independently, never use them together in a render condition






//ISSUE: same save state log when a player joins is seen 4 times?
//ATTEMPTED: Re-emission of game:join event (remounts of the component from useEffect dependencies), 1 came from handle local action (game actions cause remount of socket?)
//also used a has joined flag per mounting of the socket and component so that only one connect event/game:join event per mount
//websocket context also changed socket state to socket ref to get stable across re-renders cause by isConnected/error state changes 





//issue:
// submenu for cards can clip outside the view port

