import React from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCardActions } from '../../contexts/cardActions';
import { HoverMenu, HoverMenuButton } from './HoverMenu';

const CardActionsMenu = React.memo(({card, isOpen, position, onClose,currentZone}) => {
    const { playCard, playCardFaceDown, moveCard, toggleAltFace, tapCard, toggleFaceDown, shakeCard, addCounter } = useCardActions();
    
    if (!isOpen || !card) return null;

    const handlePlayCard = () => {
        playCard(card, currentZone);
        onClose();
    };

    const handlePlayCardFaceDown = () => {
        playCardFaceDown(card, currentZone);
        onClose();
    };

    const handleMoveToZone = (targetZone) => {
        moveCard(card, currentZone, targetZone);
        onClose();
    };

    const handleToggleAltFace = () => {
        toggleAltFace(card._id, currentZone);
        onClose();
    };

    const handleTapCard = () => {
        tapCard(card._id);
        onClose();
    };

    const handleToggleFaceDown = () => {
        toggleFaceDown(card._id);
        onClose();
    };

    const handleShakeCard = () => {
        shakeCard(card._id);
        onClose();
    };

    const hasAlternateFace = card.altImageUrl || (card.card_faces && card.card_faces.length > 1);

    return createPortal(
        <div
            className="card-actions-menu"
            style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                zIndex: 100000,
                height: 0,  
                width: 0,   
            }}
        >
            <HoverMenu isOpen={true} onClose={onClose} position="bottom">
                {currentZone !== 'battlefield' && (
                    <>
                        <HoverMenuButton onClick={handlePlayCard}>
                            Play Card
                        </HoverMenuButton>
                        <HoverMenuButton onClick={handlePlayCardFaceDown}>
                            Play Face Down
                        </HoverMenuButton>
                    </>
                )}
                
                {currentZone === 'battlefield' && hasAlternateFace && (
                    <>
                    <HoverMenuButton onClick={handleToggleAltFace}>
                        Alt Face
                    </HoverMenuButton>
                    </>
                )}

                {currentZone === 'battlefield' && (
                    <>
                        <HoverMenuButton onClick={handleTapCard}>
                            {card.isTapped ? 'Untap' : 'Tap'}
                        </HoverMenuButton>
                        <HoverMenuButton onClick={() => { addCounter(card._id); onClose(); }}>
                            Add Counter
                        </HoverMenuButton>
                        
                        <HoverMenuButton onClick={handleToggleFaceDown}>
                            {card.isFaceDown ? 'Face Up' : 'Face Down'}
                        </HoverMenuButton>
                        
                        <HoverMenuButton onClick={handleShakeCard}>
                            Shake
                        </HoverMenuButton>
                    </>
                )}
                
                <MoveToSubmenu 
                    card={card}
                    onMoveToZone={handleMoveToZone}
                    currentZone={currentZone}
                    onClose={onClose}
                />
            </HoverMenu>
        </div>,
        document.body
    );
}, (prevProps, nextProps) => {
    return prevProps.isOpen === nextProps.isOpen &&
           prevProps.card?._id === nextProps.card?._id &&
           prevProps.card?.isTapped === nextProps.card?.isTapped &&
           prevProps.card?.isFaceDown === nextProps.card?.isFaceDown &&
           prevProps.position.x === nextProps.position.x &&
           prevProps.position.y === nextProps.position.y;
});

const MoveToSubmenu = ({ card, onMoveToZone, currentZone, onClose }) => {
    const [submenuOpen, setSubmenuOpen] = useState(false);
    const { moveToLibraryTop, moveToLibraryBottom } = useCardActions();
    
    const zones = ['hand', 'battlefield', 'graveyard', 'exile', 'facedown', 'sideboard'];
    const availableZones = zones.filter(zone => zone !== currentZone);

    const getZoneDisplayName = (zone) => {
        if (zone === 'facedown') return 'Face Down Pile';
        if (zone === 'sideboard') return 'Sideboard';
        return zone.charAt(0).toUpperCase() + zone.slice(1);
    };

    const handleLibraryTop = () => {
        moveToLibraryTop(card, currentZone);
        setSubmenuOpen(false);
        onClose();
    };

    const handleLibraryBottom = () => {
        moveToLibraryBottom(card, currentZone);
        setSubmenuOpen(false);
        onClose();
    };

    return (
        <li 
            className="hover-menu-item-wrapper"
            onMouseEnter={() => setSubmenuOpen(true)}
            onMouseLeave={() => setSubmenuOpen(false)}
        >
            <button className="hover-menu-btn">
                Move To →
            </button>
            {submenuOpen && (
                <HoverMenu isOpen={true} onClose={() => {}} position="right">
                    {availableZones.map(zone => (
                        <HoverMenuButton 
                            key={zone}
                            onClick={() => {
                                onMoveToZone(zone);
                                setSubmenuOpen(false);
                            }}
                        >
                            {getZoneDisplayName(zone)}
                        </HoverMenuButton>
                    ))}
                    <HoverMenuButton onClick={handleLibraryTop}>
                        Deck Top
                    </HoverMenuButton>
                    <HoverMenuButton onClick={handleLibraryBottom}>
                        Deck Bottom
                    </HoverMenuButton>
                </HoverMenu>
            )}
        </li>
    );
};

export default CardActionsMenu;