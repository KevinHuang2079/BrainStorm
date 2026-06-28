import React from 'react'
import { useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AuthContext } from '../../contexts/auth';
import { useCardActions } from '../../contexts/cardActions';
import ViewCardItem from '../ViewCardItem';
import CardActionsMenu from './CardActionsMenu';
import '../../styles/BattleField.css';
import TurnIndicator from './TurnIndicator';
import { Copy } from 'lucide-react';
import OpponentCardActionsMenu from './OpponentCardActionsMenu';
import OpponentHandComponent from './OpponentHandComponent';

import {
    DndContext,
    useSensor,
    useSensors,
    PointerSensor,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';

const CardCounterOverlay = ({ card }) => {
    const { addCounter, removeCounter, incrementCounter } = useCardActions();
    const counters = card.counters || [];
    const [editValues, setEditValues] = useState({});

    if (counters.length === 0) return null;

    const handleInputChange = (index, val) => {
        setEditValues(prev => ({ ...prev, [index]: val }));
    };

    const handleInputBlur = (index) => {
        const raw = editValues[index];
        if (raw === undefined || raw === '') {
            setEditValues(prev => { const n = {...prev}; delete n[index]; return n; });
            return;
        }
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed)) {
            // Calculate delta from current value and call incrementCounter that many times,
            // or use a direct-set action if you add one. For now, derive delta:
            const current = counters[index] ?? 1;
            const delta = parsed - current;
            if (delta !== 0) {
                // We'll dispatch via incrementCounter with a delta param
                incrementCounter(card._id, index, delta);
            }
        }
        setEditValues(prev => { const n = {...prev}; delete n[index]; return n; });
    };

    const handleDecrement = (e, index) => {
        e.preventDefault();
        e.stopPropagation();
        incrementCounter(card._id, index, -1);
    };

    const handleIncrement = (e, index) => {
        e.preventDefault();
        e.stopPropagation();
        incrementCounter(card._id, index, 1);
    };

    return (
        <div className="counter-overlay" onPointerDown={e => e.stopPropagation()}>
            {[...counters].reverse().map((counter, revIndex) => {
                const index = counters.length - 1 - revIndex;
                const displayVal = editValues[index] !== undefined ? editValues[index] : counter;
                return (
                    <div key={index} className="counter-row">
                        <button
                            className="counter-btn counter-btn--minus"
                            onClick={(e) => handleDecrement(e, index)}
                            onPointerDown={e => e.stopPropagation()}
                        >−</button>
                        <input
                            className="counter-input"
                            type="text"
                            inputMode="numeric"
                            value={displayVal}
                            onChange={e => handleInputChange(index, e.target.value)}
                            onBlur={() => handleInputBlur(index)}
                            onClick={e => e.stopPropagation()}
                            onPointerDown={e => e.stopPropagation()}
                        />
                        <button
                            className="counter-btn counter-btn--plus"
                            onClick={(e) => handleIncrement(e, index)}
                            onPointerDown={e => e.stopPropagation()}
                        >+</button>
                        <button
                            className="counter-remove-btn"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeCounter(card._id, index); }}
                            onPointerDown={e => e.stopPropagation()}
                        >×</button>
                    </div>
                );
            })}
        </div>
    );
};

const DraggableCard = React.memo(({ card, position, onCardClick, containerDimensions, cardScale, zIndex, deckBackImage }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging,
    } = useDraggable({ 
        id: card._id,
        data: { card, currentPosition: position }
    });

    const getCardDimensions = () => {
        if (!containerDimensions.width || !containerDimensions.height) {
            return { width: 90, height: 126 };
        }
        
        const baseWidth = Math.min(
            containerDimensions.width * cardScale.widthPercent,
            containerDimensions.height * cardScale.heightPercent / 1.4
        );
        
        const cardWidth = Math.max(40, Math.min(baseWidth, 120));
        const cardHeight = Math.round(cardWidth * 1.4);
        
        return { width: cardWidth, height: cardHeight };
    };

    const { width: cardWidth, height: cardHeight } = getCardDimensions();

    let pixelPosition = {
        x: (position.xPercent / 100) * containerDimensions.width,
        y: (position.yPercent / 100) * containerDimensions.height
    };

    pixelPosition = {
        x: Math.max(0, Math.min(pixelPosition.x, containerDimensions.width - cardWidth)),
        y: Math.max(0, Math.min(pixelPosition.y, containerDimensions.height - cardHeight))
    };

    let constrainedTransform = transform;
    if (transform && isDragging && containerDimensions.width) {
        const newX = pixelPosition.x + transform.x;
        const newY = pixelPosition.y + transform.y;
        
        const constrainedX = Math.max(0, Math.min(newX, containerDimensions.width - cardWidth));
        const constrainedY = Math.max(0, Math.min(newY, containerDimensions.height - cardHeight));
        
        constrainedTransform = {
            x: constrainedX - pixelPosition.x,
            y: constrainedY - pixelPosition.y
        };
    }

    const isTapped = card.isTapped || false;
    const isShaking = card.isShaking || false;
    const isFaceDown = card.isFaceDown || false;

    const style = {
        position: 'absolute',
        left: `${pixelPosition.x}px`,
        top: `${pixelPosition.y}px`,
        transform: constrainedTransform ? `translate3d(${constrainedTransform.x}px, ${constrainedTransform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: isDragging ? 10000 : zIndex,
        width: `${cardWidth}px`,
        height: `${cardHeight}px`,
    };

    const getCardImage = () => {
        if (isFaceDown) {
            return deckBackImage || 'https://via.placeholder.com/200x280?text=Card+Back';
        }

        const faceIndex = card.currentFaceIndex !== undefined ? card.currentFaceIndex : 0;
        
        if (card.card_faces && card.card_faces.length > 1 && faceIndex === 1) {
            return card.card_faces[1].image_uris?.normal || card.card_faces[1].image_uris?.large || card.imageUrl;
        }
        
        if (card.altImageUrl && faceIndex === 1) {
            return card.altImageUrl;
        }
        
        return card.imageUrl;
    };

    const cardWithFaceDownFlag = {
        ...card,
        isFaceDown: isFaceDown
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            {...attributes} 
            {...listeners}
            className={`draggable-card-wrapper ${isTapped ? 'tapped' : ''} ${isShaking ? 'shaking' : ''}`}
        >
            <ViewCardItem 
                card={cardWithFaceDownFlag}
                onCardClick={onCardClick}
                className="battlefield-card"
                isDragging={isDragging}
            >
                <div className='battlefield-card' style={{ width: '100%', height: '100%', position: 'relative', overflow: 'visible' }}>
                    <img 
                        className='battlefield-card-image' 
                        src={getCardImage()} 
                        alt={card.name || 'Card'}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                    />
                    {card.isClone && (
                        <div className="clone-indicator">
                            <Copy size={12} />
                        </div>
                    )}
                   <CardCounterOverlay card={card} />
                </div>
            </ViewCardItem>
        </div>
    );
}, (prev, next) => {
    return prev.card === next.card &&
           prev.position === next.position &&
           prev.zIndex === next.zIndex;
});

const StaticCard = ({ card, position, containerDimensions, cardScale, zIndex, deckBackImage, onCardClick }) => {

    const handlePointerUp = (e) => {
        if (onCardClick) {
            const rect = e.currentTarget.getBoundingClientRect();
            onCardClick(card, { x: rect.right, y: rect.top });
        }
    };
    const getCardDimensions = () => {
        if (!containerDimensions.width || !containerDimensions.height) {
            return { width: 90, height: 126 };
        }
        
        const baseWidth = Math.min(
            containerDimensions.width * cardScale.widthPercent,
            containerDimensions.height * cardScale.heightPercent / 1.4
        );
        
        const cardWidth = Math.max(40, Math.min(baseWidth, 120));
        const cardHeight = Math.round(cardWidth * 1.4);
        
        return { width: cardWidth, height: cardHeight };
    };

    const { width: cardWidth, height: cardHeight } = getCardDimensions();

    let pixelPosition = {
        x: (position.xPercent / 100) * containerDimensions.width,
        y: (position.yPercent / 100) * containerDimensions.height
    };

    pixelPosition = {
        x: Math.max(0, Math.min(pixelPosition.x, containerDimensions.width - cardWidth)),
        y: Math.max(0, Math.min(pixelPosition.y, containerDimensions.height - cardHeight))
    };

    const isTapped = card.isTapped || false;
    const isShaking = card.isShaking || false;
    const isFaceDown = card.isFaceDown || false;

    const style = {
        position: 'absolute',
        left: `${pixelPosition.x}px`,
        top: `${pixelPosition.y}px`,
        width: `${cardWidth}px`,
        height: `${cardHeight}px`,
        zIndex: zIndex,
    };

    const getCardImage = () => {
        if (isFaceDown) {
            return deckBackImage || 'https://via.placeholder.com/200x280?text=Card+Back';
        }

        const faceIndex = card.currentFaceIndex !== undefined ? card.currentFaceIndex : 0;
        
        if (card.card_faces && card.card_faces.length > 1 && faceIndex === 1) {
            return card.card_faces[1].image_uris?.normal || card.card_faces[1].image_uris?.large || card.imageUrl;
        }
        
        if (card.altImageUrl && faceIndex === 1) {
            return card.altImageUrl;
        }
        
        return card.imageUrl;
    };

    const cardWithFaceDownFlag = {
        ...card,
        isFaceDown: isFaceDown
    };

    const counters = card.counters || [];

    return (
        <div 
            style={style} 
            className={`static-card-wrapper ${isTapped ? 'tapped' : ''} ${isShaking ? 'shaking' : ''}`}
            onPointerUp={handlePointerUp}
        >
            <ViewCardItem 
                card={cardWithFaceDownFlag}
                className="battlefield-card"
            >
                <div className='battlefield-card' style={{ width: '100%', height: '100%', position: 'relative', overflow: 'visible' }}>
                    <img 
                        className='battlefield-card-image' 
                        src={getCardImage()} 
                        alt={card.name || 'Card'}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                    />
                    {card.isClone && (
                        <div className="clone-indicator">
                            <Copy size={12} />
                        </div>
                    )}
                    {counters.length > 0 && (
                        <div className="counters-container">
                            {counters.map((counter, index) => (
                                <div 
                                    key={index}
                                    className="card-counter"
                                >
                                    {counter}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </ViewCardItem>
        </div>
    );
};

const BattleField = ({ game, playerStates, onRepositionCard, onEndTurn, onStartGame, deckBackImage, diceResult }) => {
    const { user } = useContext(AuthContext);
    const { moveCard } = useCardActions();
    const playerCount = game?.players?.length || 1;
    const [selectedOpponentCard, setSelectedOpponentCard] = useState(null);
    const [opponentMenuPosition, setOpponentMenuPosition] = useState({ x: 0, y: 0 });
    const [selectedOpponentPlayerId, setSelectedOpponentPlayerId] = useState(null);

    const currentUserId = user._id;
    const myBattlefield = useMemo(
        () => playerStates[user._id]?.battlefield || [],
        [playerStates, user._id]
    );

    const [selectedCard, setSelectedCard] = useState(null);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
    const [cardZIndices, setCardZIndices] = useState({});
    const zIndexCounterRef = useRef(51);
    
    const [opponentDimensions, setOpponentDimensions] = useState({});
    const [quadrantDimensions, setQuadrantDimensions] = useState({});
    
    const handleClose = useCallback(() => setSelectedCard(null), []);

    const [cardScale] = useState({
        widthPercent: 0.08,
        heightPercent: 0.25
    });
    
    const containerRef = useRef(null);
    const opponentRefs = useRef({});
    const quadrantRefs = useRef({});

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    useEffect(() => {
        setCardZIndices(prev => {
            const updated = { ...prev };
            let hasChanges = false;

            myBattlefield.forEach(card => {
                if (!(card._id in updated)) {
                    updated[card._id] = Math.max(51, card.zIndex || 0) || zIndexCounterRef.current++;
                    hasChanges = true;
                }
            });

            Object.keys(updated).forEach(cardId => {
                if (!myBattlefield.find(c => c._id === cardId)) {
                    delete updated[cardId];
                    hasChanges = true;
                }
            });

            return hasChanges ? updated : prev;
        });
    }, [myBattlefield]);

    const pixelToPercent = (pixelPos, containerDims) => {
        if (!containerDims.width || !containerDims.height) {
            return { xPercent: 0, yPercent: 0 };
        }
        return {
            xPercent: (pixelPos.x / containerDims.width) * 100,
            yPercent: (pixelPos.y / containerDims.height) * 100
        };
    };

    const percentToPixel = (percentPos, containerDims) => {
        return {
            x: (percentPos.xPercent / 100) * containerDims.width,
            y: (percentPos.yPercent / 100) * containerDims.height
        };
    };

    const normalizeCardPosition = (card, containerDims) => {
        if (!card.position) {
            return { xPercent: 0, yPercent: 0 };
        }
        
        if ('xPercent' in card.position && 'yPercent' in card.position) {
            return card.position;
        }
        
        if ('x' in card.position && 'y' in card.position) {
            return pixelToPercent(card.position, containerDims);
        }
        
        return { xPercent: 0, yPercent: 0 };
    };

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                setContainerDimensions({ width: clientWidth, height: clientHeight });
            }
        };

        updateDimensions();
        
        const resizeObserver = new ResizeObserver(updateDimensions);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        window.addEventListener('resize', updateDimensions);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateDimensions);
        };
    }, []);

    useEffect(() => {
        const updateOpponentDimensions = () => {
            const newDimensions = {};
            Object.keys(opponentRefs.current).forEach(playerId => {
                const ref = opponentRefs.current[playerId];
                if (ref) {
                    newDimensions[playerId] = {
                        width: ref.clientWidth,
                        height: ref.clientHeight
                    };
                }
            });
            setOpponentDimensions(newDimensions);
        };

        updateOpponentDimensions();

        const resizeObserver = new ResizeObserver(updateOpponentDimensions);
        Object.values(opponentRefs.current).forEach(ref => {
            if (ref) resizeObserver.observe(ref);
        });

        window.addEventListener('resize', updateOpponentDimensions);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateOpponentDimensions);
        };
    }, [playerStates]);

    useEffect(() => {
        const updateQuadrantDimensions = () => {
            const newDimensions = {};
            Object.keys(quadrantRefs.current).forEach(playerId => {
                const ref = quadrantRefs.current[playerId];
                if (ref) {
                    newDimensions[playerId] = {
                        width: ref.clientWidth,
                        height: ref.clientHeight
                    };
                }
            });
            setQuadrantDimensions(newDimensions);
        };

        updateQuadrantDimensions();

        const resizeObserver = new ResizeObserver(updateQuadrantDimensions);
        Object.values(quadrantRefs.current).forEach(ref => {
            if (ref) resizeObserver.observe(ref);
        });

        window.addEventListener('resize', updateQuadrantDimensions);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateQuadrantDimensions);
        };
    }, [playerStates]);

    const getLayoutClass = () => {
        if (opponents.length <= 1) return 'two-player-layout';
        if (opponents.length === 2) return 'three-player-layout';
        return 'four-player-layout';
    };
    const handleCardClick = useCallback((card, position) => {
        setSelectedCard(card);
        setMenuPosition(position);
    }, []);

    const handleMoveToZone = (card, targetZone) => {
        moveCard(card, 'battlefield', targetZone);
        setSelectedCard(null);
    };

    const getCardDimensions = () => {
        if (!containerDimensions.width || !containerDimensions.height) {
            return { width: 90, height: 126 };
        }
        
        const baseWidth = Math.min(
            containerDimensions.width * cardScale.widthPercent,
            containerDimensions.height * cardScale.heightPercent / 1.4
        );
        
        const cardWidth = Math.max(40, Math.min(baseWidth, 120));
        const cardHeight = Math.round(cardWidth * 1.4);
        
        return { width: cardWidth, height: cardHeight };
    };

    const handleDragEnd = (event) => {
        const { active, delta } = event;

        if (!delta || (delta.x === 0 && delta.y === 0)) {
            return;
        }

        const card = myBattlefield.find(c => c._id === active.id);
        if (!card) {
            return;
        }

        const currentPercentPos = normalizeCardPosition(card, containerDimensions);
        
        const currentPixelPos = percentToPixel(currentPercentPos, containerDimensions);
        
        const newPixelPos = {
            x: currentPixelPos.x + delta.x,
            y: currentPixelPos.y + delta.y
        };

        const { width: cardWidth, height: cardHeight } = getCardDimensions();
        
        const constrainedPixelPos = {
            x: Math.max(0, Math.min(newPixelPos.x, containerDimensions.width - cardWidth)),
            y: Math.max(0, Math.min(newPixelPos.y, containerDimensions.height - cardHeight))
        };

        const newPercentPos = pixelToPercent(constrainedPixelPos, containerDimensions);

        const newZIndex = zIndexCounterRef.current++;
        setCardZIndices(prev => ({
            ...prev,
            [active.id]: newZIndex
        }));

        onRepositionCard(active.id, newPercentPos, newZIndex);
    };

    if (!game || !user) {
        return <div className="battlefield-loading">Loading battlefield...</div>;
    }

    const opponents = Object.values(playerStates).filter(p => p._id !== currentUserId);

    return (
        <div className={`battlefield-wrapper ${getLayoutClass()}`}>
            {opponents.length >= 2 && (
                <div className='shared-battlefield-area'>
                    <div
                        className='quadrant-grid'
                        style={{ gridTemplateColumns: `repeat(${opponents.length}, 1fr)` }}
                    >
                        {opponents.slice(0, 3).map((player, idx) => {   // cap at 3 opponents = 4-player game
                            const dims = quadrantDimensions[player._id] || { width: 0, height: 0 };
                            return (
                                <div key={player._id} className={`quadrant quadrant-${idx + 1}`}>
                                    <div className='quadrant-label'>{player.username}</div>
                                    <OpponentHandComponent hand={player.hand ?? []} />
                                    <div
                                        ref={el => quadrantRefs.current[player._id] = el}
                                        className='quadrant-cards'
                                    >
                                        {(player.battlefield || []).map(card => {
                                            const position = normalizeCardPosition(card, dims);
                                            const zIndex = Math.max(100, card.zIndex || 1);
                                            return (
                                                <StaticCard
                                                    key={card._id}
                                                    card={card}
                                                    position={position}
                                                    containerDimensions={dims}
                                                    cardScale={cardScale}
                                                    zIndex={zIndex}
                                                    deckBackImage={deckBackImage}
                                                    onCardClick={(c, pos) => {
                                                        setSelectedOpponentCard(c);
                                                        setOpponentMenuPosition(pos);
                                                        setSelectedOpponentPlayerId(player._id);
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {opponents.length === 1 && (
                <div className='opponent-battlefield-area'>
                    {opponents.map(player => {
                        const dims = opponentDimensions[player._id] || { width: 0, height: 0 };
                        return (
                            <div key={player._id} className='opponent-board'>
                                <div className='opponent-label'>{player.username}</div>
                                <OpponentHandComponent hand={player.hand ?? []} />
                                <div
                                    ref={el => opponentRefs.current[player._id] = el}
                                    style={{ position: 'relative', width: '100%', height: '100%' }}
                                >
                                    {(player.battlefield || []).map(card => {
                                        const position = normalizeCardPosition(card, dims);
                                        const zIndex = Math.max(100, card.zIndex || 1);
                                        return (
                                            <StaticCard
                                                key={card._id}
                                                card={card}
                                                position={position}
                                                containerDimensions={dims}
                                                cardScale={cardScale}
                                                zIndex={zIndex}
                                                deckBackImage={deckBackImage}
                                                onCardClick={(c, pos) => {
                                                    setSelectedOpponentCard(c);
                                                    setOpponentMenuPosition(pos);
                                                    setSelectedOpponentPlayerId(player._id);
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <TurnIndicator 
                game={game}
                currentTurn={game.currentTurn}
                onEndTurn={onEndTurn}
                onStartGame={onStartGame}
                diceResult={diceResult}
            />

            <div className='personal-battlefield-area'>
                <div className='personal-battlefield-label'>
                    Your Battlefield 
                </div>
                <DndContext
                    sensors={sensors}
                    onDragEnd={handleDragEnd}
                >
                    <div 
                        ref={containerRef}
                        className='personal-battlefield-cards'
                    >
                        {myBattlefield.map(card => {
                            const position = normalizeCardPosition(card, containerDimensions);
                            const zIndex = cardZIndices[card._id] || card.zIndex || 1;
                            return (
                                <DraggableCard
                                    key={card._id}
                                    card={card}
                                    position={position}
                                    onCardClick={handleCardClick}
                                    containerDimensions={containerDimensions}
                                    cardScale={cardScale}
                                    zIndex={zIndex}
                                    deckBackImage={deckBackImage}
                                />
                            );
                        })}
                    </div>
                </DndContext>
            </div>

            <CardActionsMenu
                card={selectedCard}
                isOpen={!!selectedCard}
                position={menuPosition}
                onClose={() => handleClose ()}
                onMoveToZone={handleMoveToZone}
                currentZone='battlefield'
            />
            <OpponentCardActionsMenu
                card={selectedOpponentCard}
                isOpen={!!selectedOpponentCard}
                position={opponentMenuPosition}
                onClose={() => setSelectedOpponentCard(null)}
                currentZone="battlefield"
                targetPlayerId={selectedOpponentPlayerId}
            />
        </div>
    );
};

export default BattleField;