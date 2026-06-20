import { useState, useEffect, useRef, useMemo } from 'react';
import cardBack from '../../imgs/magic-card-backballs.png';
import '../../styles/OpponentHandComponent.css';

const OpponentHandComponent = ({ hand = [] }) => {
    const [containerWidth, setContainerWidth] = useState(1000);
    const handContentRef = useRef(null);

    useEffect(() => {
        const updateWidth = () => {
            if (handContentRef.current) {
                setContainerWidth(handContentRef.current.offsetWidth);
            }
        };

        updateWidth();

        const resizeObserver = new ResizeObserver(updateWidth);
        if (handContentRef.current) {
            resizeObserver.observe(handContentRef.current);
        }

        window.addEventListener('resize', updateWidth);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateWidth);
        };
    }, []);

    const cardPositions = useMemo(() => {
        const totalCards = hand.length;
        if (totalCards === 0) return [];

        const cardWidthPx = 40;  // was 107.64
        const padding = 20;
        const availableWidth = containerWidth - padding * 2;
        const totalCardsWidth = totalCards * cardWidthPx;

        if (totalCardsWidth <= availableWidth) {
            const sidePadding = (availableWidth - totalCardsWidth) / 2;
            return hand.map((_, index) => ({
                left: `${padding + sidePadding + index * cardWidthPx}px`,
                top: '0',
            }));
        } else {
            const spacing = (availableWidth - cardWidthPx) / (totalCards - 1);
            return hand.map((_, index) => ({
                left: `${padding + index * spacing}px`,
                top: '0',
            }));
        }
    }, [hand, containerWidth]);

    return (
        <div className="opponent-hand-section">
            <div className="opponent-hand-content" ref={handContentRef}>
                <span className="opponent-hand-count">{hand.length}</span>
                {hand.map((card, index) => {
                    const position = cardPositions[index] || { left: '50%', top: '0' };
                    return (
                        <div
                            key={`${card._id}-${index}`}
                            className="opponent-hand-card-wrapper"
                            style={position}
                        >
                            <div className="opponent-hand-card">
                                <img
                                    className="opponent-hand-card-image"
                                    src={cardBack}
                                    alt="Opponent card"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default OpponentHandComponent;