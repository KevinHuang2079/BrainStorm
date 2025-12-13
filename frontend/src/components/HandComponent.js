import { useState, useEffect, useRef, useMemo } from 'react';
import { useCardActions } from '../contexts/cardActions';
import ViewCardItem from './ViewCardItem';
import CardActionsMenu from './CardActionsMenu';
import '../styles/HandComponent.css';

const HandComponent = ({ hand }) => {
    const { playCard, playCardFaceDown, moveCard } = useCardActions();
    const [selectedCard, setSelectedCard] = useState(null);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [containerWidth, setContainerWidth] = useState(1000);
    const handContentRef = useRef(null);

    useEffect(() => {
        const updateWidth = () => {
            if (handContentRef.current) {
                setContainerWidth(handContentRef.current.offsetWidth);
            }
        };
        
        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    const handleCardClick = (card, position) => {
        const adjustedPosition = {
            x: position.x + 10,
            y: position.y - 160
        };
        setSelectedCard(card);
        setMenuPosition(adjustedPosition);
    };

    const handlePlayCard = (card) => {
        playCard(card, 'hand');
        setSelectedCard(null);
    };

    const handlePlayCardFaceDown = (card) => {
        playCardFaceDown(card, 'hand');
        setSelectedCard(null);
    };

    const handleMoveToZone = (card, targetZone) => {
        moveCard(card, 'hand', targetZone);
        setSelectedCard(null);
    };

    const cardPositions = useMemo(() => {
        const totalCards = hand.length;
        if (totalCards === 0) return [];
        
        const cardWidthPx = 107.64;
        const padding = 20;
        const availableWidth = containerWidth - (2 * padding);
        
        const totalCardsWidth = totalCards * cardWidthPx;
        
        if (totalCardsWidth <= availableWidth) {
            const totalGapWidth = availableWidth - totalCardsWidth;
            const sidePadding = totalGapWidth / 2;
            
            return hand.map((_, index) => ({
                left: `${padding + sidePadding + (index * cardWidthPx) + (cardWidthPx / 2)}px`,
                bottom: '0'
            }));
        } else {
            const spacing = (availableWidth - cardWidthPx) / (totalCards - 1);
            
            return hand.map((_, index) => ({
                left: `${padding + (cardWidthPx / 2) + (index * spacing)}px`,
                bottom: '0'
            }));
        }
    }, [hand, containerWidth]); 

    return (
        <div className='hand-wrapper'>
            <div className='hand-section'>
                <div className='hand-content' ref={handContentRef}>
                    <span className='hand-count-display'>{hand.length}</span>
                    {hand.map((card, index) => {
                        const position = cardPositions[index] || { left: '50%', bottom: '0' };
                        return (
                            <ViewCardItem 
                                key={`${card._id}-${index}`}
                                card={card} 
                                onCardClick={handleCardClick}
                                className="hand-card-wrapper"
                            >
                                <div 
                                    className='hand-card'
                                    style={position}
                                >
                                    <img 
                                        className='hand-card-image' 
                                        src={card.imageUrl} 
                                        alt={card.name || 'Card'}
                                    />
                                </div>
                            </ViewCardItem>
                        );
                    })}
                </div>
            </div>
            <CardActionsMenu
                card={selectedCard}
                isOpen={!!selectedCard}
                position={menuPosition}
                onClose={() => setSelectedCard(null)}
                onPlayCard={handlePlayCard}
                onPlayCardFaceDown={handlePlayCardFaceDown}
                onMoveToZone={handleMoveToZone}
                currentZone='hand'
            />
        </div>
    );
};

export default HandComponent;