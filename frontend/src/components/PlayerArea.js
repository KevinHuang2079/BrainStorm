import { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../contexts/auth';
import { deckAPI } from '../services/api';
import { useCardActions } from '../contexts/cardActions';
import { HoverMenu, HoverMenuButton } from './HoverMenu';
import HandComponent from './HandComponent';
import ZoneViewingModal from './ZoneViewingModal';
import '../styles/PlayerArea.css';

const PlayerArea = ({ game, playerStates, onGameAction }) => {
    const { user } = useContext(AuthContext);
    const { drawCard, shuffleLibrary, loadDeck, scoopDeck, mulligan } = useCardActions();
    const [viewingZone, setViewingZone] = useState(null);

    const myPlayer = playerStates[user._id] || {
        hand: [],
        library: [],
        exile: [],
        graveyard: [],
        facedown: [],
        sideboard: [],
        lifeTotal: game?.format === 'commander' ? 40 : 20
    };
    const hand = myPlayer.hand;
    const library = myPlayer.library;
    const exile = myPlayer.exile;
    const graveyard = myPlayer.graveyard;
    const faceDownPile = myPlayer.facedown;
    const sideboard = myPlayer.sideboard;
    const lifeTotal = myPlayer.lifeTotal ?? (game?.format === 'commander' ? 40 : 20);


    const [myDecks, setMyDecks] = useState([]);
    const [changeDeckOpen, setChangeDeckOpen] = useState(false);
    const [currentDeckId, setCurrentDeckId] = useState(null);
    const [libActionsOpen, setLibActionsOpen] = useState(false);
    const [drawToZoneOpen, setDrawToZoneOpen] = useState(false);
    const [scryCount, setScryCount] = useState(1);
    const [mulliganCount, setMulliganCount] = useState(7);
    const [otherZonesOpen, setOtherZonesOpen] = useState(false);
    const [hasDeckLoaded, setHasDeckLoaded] = useState(false);
    const hasCheckedInitialState = useRef(false);

    const drawToWrapperRef = useRef(null);

    useEffect(() => {
        const fetchDecks = async () => {
            const decks = await deckAPI.getMyDecks();
            setMyDecks(decks);
        };
        fetchDecks();
    }, []);

    useEffect(() => {
        console.log('decks', myDecks);
    }, [myDecks]);

    useEffect(() => {
        if (library.length > 0) {
            setHasDeckLoaded(true);
        }
    }, [library.length]);

    useEffect(() => {
        if (library.length > 0) {
            setHasDeckLoaded(true);
            hasCheckedInitialState.current = true;
        }
    }, [library.length]);

    useEffect(() => {
        if (!hasCheckedInitialState.current && !hasDeckLoaded && library.length === 0 && !currentDeckId) {
            const timer = setTimeout(() => {
                if (library.length === 0) {
                    setChangeDeckOpen(true);
                    hasCheckedInitialState.current = true;
                }
            }, 500);
            
            return () => clearTimeout(timer);
        }
    }, [hasDeckLoaded, library.length, currentDeckId]);

    const shuffleArray = (array) => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const [drawToCounters, setDrawToCounters] = useState({
        hand: 1,
        exile: 1,
        graveyard: 1,
        facedown: 1
    });

    const handleDrawToZone = (zone) => {
        drawCard(drawToCounters[zone.key], zone.key);
        setDrawToCounters({ ...drawToCounters, [zone.key]: 1 });
        setDrawToZoneOpen(false);
    };

    const scryCards = (count = 1) => {
        if (library.length === 0) {
            alert('No cards left in library!');
            return;
        }
        const scried = library.slice(0, count);
        alert(`Top ${count} cards: ${scried.map(c => c.name || 'Unknown').join(', ')}`);
    };

    const shuffleDeck = () => {
        const shuffled = shuffleArray(library);
        shuffleLibrary(shuffled);
        setLibActionsOpen(false);
    };

    const handleMulligan = (count) => {
        if (hand.length === 0) {
            alert('No cards in hand to mulligan!');
            return;
        }
        mulligan(count);
        setLibActionsOpen(false);
    };

    const handleScoopDeck = () => {
        scoopDeck();
        setCurrentDeckId(null);
        setHasDeckLoaded(false);
        setChangeDeckOpen(true);
    };

    const handleDeckSelect = async (deckId) => {
        if (deckId === currentDeckId) {
            setChangeDeckOpen(false);
            return;
        }

        const fullDeck = await deckAPI.getDeckById(deckId);
        
        const cardsWithUniqueIds = fullDeck.cards.map((card, index) => ({
            ...card,
            _id: `${card._id}_${Date.now()}_${index}`,
            originalCardId: card._id
        }));
        
        const sideboardWithUniqueIds = (fullDeck.sideboard || []).map((card, index) => ({
            ...card,
            _id: `${card._id}_sb_${Date.now()}_${index}`,
            originalCardId: card._id
        }));
        
        const startInPlayWithUniqueIds = (fullDeck.startInPlay || []).map((card, index) => ({
            ...card,
            _id: `${card._id}_sip_${Date.now()}_${index}`,
            originalCardId: card._id
        }));
        
        const shuffledDeck = shuffleArray(cardsWithUniqueIds);
        loadDeck(shuffledDeck, sideboardWithUniqueIds, startInPlayWithUniqueIds);
        setCurrentDeckId(deckId);
        setHasDeckLoaded(true);
        setChangeDeckOpen(false);
    };

    const openZoneViewer = (zoneName) => {
        setViewingZone(zoneName);
        setOtherZonesOpen(false);
        setLibActionsOpen(false);
    };

    const handleLifeChange = (amount) => {
        onGameAction({
            action: 'changeLifeTotal',
            data: { amount }
        });
    };

    const zones = [
        { name: 'Hand', key: 'hand' },
        { name: 'Exile', key: 'exile' },
        { name: 'Graveyard', key: 'graveyard' },
        { name: 'Face Down Pile', key: 'facedown' },
        { name: 'Sideboard', key: 'sideboard' }
    ];

    const ChangeDeckModal = () => {
        return (
            <div className='change-deck-modal'>
                <div className='modal-overlay'>
                    <div className='modal-content'>
                        <h2>Select a Deck</h2>
                        <div className='deck-grid'>
                            {myDecks.map((deck) => (
                                <div 
                                    key={deck._id} 
                                    className='deck-card'
                                    onClick={() => handleDeckSelect(deck._id)}
                                >
                                    <h3>{deck.name}</h3>
                                    <p>{deck.cards.length} cards</p>
                                </div>
                            ))}
                        </div>
                        {hasDeckLoaded && (
                            <button 
                                className='modal-close-btn'
                                onClick={() => setChangeDeckOpen(false)}
                            >
                                Close
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const DrawToZoneSubmenu = () => {
        return (
            <HoverMenu 
                isOpen={drawToZoneOpen} 
                onClose={() => setDrawToZoneOpen(false)}
                position="right"
                className="draw-to-zone-submenu"
            >
                {zones.map(zone => (
                    <div 
                        key={zone.key} 
                        className='draw-zone-item'
                        onClick={() => handleDrawToZone(zone)}
                    >
                        <div className='draw-zone-click'>
                            {zone.name}
                        </div>
                        <div className='draw-zone-counter'>
                            <button 
                                className='counter-btn'
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawToCounters({...drawToCounters, [zone.key]: Math.max(1, drawToCounters[zone.key] - 1)});
                                }}
                            >
                                −
                            </button>
                            <span className='counter-value'>{drawToCounters[zone.key]}</span>
                            <button 
                                className='counter-btn'
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawToCounters({...drawToCounters, [zone.key]: drawToCounters[zone.key] + 1});
                                }}
                            >
                                +
                            </button>
                        </div>
                    </div>
                ))}
            </HoverMenu>
        );
    };

    const LibraryActionMenu = () => {
        return (
            <HoverMenu 
                isOpen={libActionsOpen} 
                onClose={() => setLibActionsOpen(false)}
                position="top"
            >
                <HoverMenuButton onClick={() => drawCard(1, 'hand')}>
                    Draw 1
                </HoverMenuButton>

                <div 
                    ref={drawToWrapperRef}
                    className='hover-menu-item-wrapper'
                    onMouseEnter={() => setDrawToZoneOpen(true)}
                    onMouseLeave={() => setDrawToZoneOpen(false)}
                    style={{ display: 'contents' }}
                >
                    <HoverMenuButton>
                        Draw
                    </HoverMenuButton>
                    {drawToZoneOpen && <DrawToZoneSubmenu />}
                </div>

                <div 
                    className='draw-zone-item'
                    onClick={() => scryCards(scryCount)}
                >
                    <div className='draw-zone-click'>
                        Scry
                    </div>
                    <div className='draw-zone-counter'>
                        <button 
                            className='counter-btn'
                            onClick={(e) => {
                                e.stopPropagation();
                                setScryCount(Math.max(1, scryCount - 1));
                            }}
                        >
                            −
                        </button>
                        <span className='counter-value'>{scryCount}</span>
                        <button 
                            className='counter-btn'
                            onClick={(e) => {
                                e.stopPropagation();
                                setScryCount(Math.min(library.length, scryCount + 1));
                            }}
                        >
                            +
                        </button>
                    </div>
                </div>

                <div 
                    className='draw-zone-item'
                    onClick={() => handleMulligan(mulliganCount)}
                >
                    <div className='draw-zone-click'>
                        Mulligan
                    </div>
                    <div className='draw-zone-counter'>
                        <button 
                            className='counter-btn'
                            onClick={(e) => {
                                e.stopPropagation();
                                setMulliganCount(Math.max(1, mulliganCount - 1));
                            }}
                        >
                            −
                        </button>
                        <span className='counter-value'>{mulliganCount}</span>
                        <button 
                            className='counter-btn'
                            onClick={(e) => {
                                e.stopPropagation();
                                setMulliganCount(mulliganCount + 1);
                            }}
                        >
                            +
                        </button>
                    </div>
                </div>

                <HoverMenuButton onClick={() => openZoneViewer('Library')}>
                    Find Card
                </HoverMenuButton>

                <HoverMenuButton onClick={shuffleDeck}>
                    Shuffle
                </HoverMenuButton>

                {hasDeckLoaded && (
                    <>
                        <HoverMenuButton onClick={() => setChangeDeckOpen(true)}>
                            Change Deck
                        </HoverMenuButton>

                        <HoverMenuButton onClick={handleScoopDeck} className='scoop-btn'>
                            Scoop Deck
                        </HoverMenuButton>
                    </>
                )}
            </HoverMenu>
        );
    };

    const LibraryComponent = () => {
        return (
            <div className='library-wrapper'>
                <div 
                    className='library-section' 
                    onClick={() => setLibActionsOpen(!libActionsOpen)}
                >
                    <div className='library-visual'>
                        <img src={require('../imgs/magic-card-backballs.png')} alt="Card back" />
                    </div>
                    <span className='library-card-count'>{library.length}</span>
                </div>
                {libActionsOpen && <LibraryActionMenu />}
            </div>
        );
    };

    const OtherZonesMenu = () => {
        return (
            <HoverMenu 
                isOpen={otherZonesOpen} 
                onClose={() => setOtherZonesOpen(false)}
                position="top"
            >
                <HoverMenuButton onClick={() => openZoneViewer('Exile')}>
                    Exile ({exile.length})
                </HoverMenuButton>

                <HoverMenuButton onClick={() => openZoneViewer('Graveyard')}>
                    Graveyard ({graveyard.length})
                </HoverMenuButton>

                <HoverMenuButton onClick={() => openZoneViewer('Facedown')}>
                    Face Down Pile ({faceDownPile.length})
                </HoverMenuButton>

                <HoverMenuButton onClick={() => openZoneViewer('Sideboard')}>
                    Sideboard ({sideboard.length})
                </HoverMenuButton>
            </HoverMenu>
        );
    };

    const OtherZonesComponent = () => {
        return (
            <div className='zones-wrapper'>
                <div 
                    className='zones-section' 
                    onClick={() => setOtherZonesOpen(!otherZonesOpen)}
                >
                    <div className='zones-content'>
                        <p className='zones-text'>Other Zones</p>
                    </div>
                </div>
                {otherZonesOpen && <OtherZonesMenu />}
            </div>
        );
    };

    const LifeTotalComponent = () => {
        const opponents = Object.values(playerStates).filter(p => p._id !== user._id);

        return (
            <div className='life-total-wrapper'>
                <div className='life-total-section'>
                    <div className='life-total-player'>
                        <button 
                            className='life-btn'
                            onClick={() => handleLifeChange(-1)}
                        >
                            −
                        </button>
                        <div className='life-total-display'>
                            <span className='life-total-value'>{lifeTotal}</span>
                            <span className='life-total-label'>Life</span>
                        </div>
                        <button 
                            className='life-btn'
                            onClick={() => handleLifeChange(1)}
                        >
                            +
                        </button>
                    </div>
                    {opponents.length > 0 && (
                        <div className='life-total-opponents'>
                            {opponents.map(opponent => (
                                <div key={opponent._id} className='opponent-life'>
                                    <span className='opponent-name'>{opponent.username}</span>
                                    <span className='opponent-life-value'>
                                        {opponent.lifeTotal ?? (game?.format === 'commander' ? 40 : 20)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className='player-area'>
            {changeDeckOpen && <ChangeDeckModal />}
            {viewingZone && (
                <ZoneViewingModal 
                    zoneName={viewingZone}
                    onClose={() => setViewingZone(null)}
                    playerStates={playerStates}
                    userId={user._id}
                />
            )}
            <HandComponent hand={hand} />
            <div className='right-section'>
                <LibraryComponent />
                <OtherZonesComponent />
                <LifeTotalComponent />
            </div>
        </div>
    );
};

export default PlayerArea;