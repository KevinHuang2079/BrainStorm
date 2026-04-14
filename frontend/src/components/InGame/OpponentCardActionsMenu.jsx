import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCardActions } from '../../contexts/cardActions';

const OpponentCardActionsMenu = ({
    card,
    isOpen,
    position,
    onClose,
    currentZone,
    targetPlayerId,
}) => {
    const { shakeOpponentCard, cloneOpponentCard } = useCardActions();
    const menuRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        };
        // Use mousedown on next tick so the click that opened it doesn't immediately close it
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !card) return null;

    const handleShake = () => {
        shakeOpponentCard(card._id, targetPlayerId);
        onClose();
    };

    const handleClone = () => {
        cloneOpponentCard(card);
        onClose();
    };

    return createPortal(
        <ul
            ref={menuRef}
            style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                zIndex: 100000,
                margin: 0,
                padding: '4px 0',
                listStyle: 'none',
                background: '#1a1a2e',
                border: '1px solid rgba(201, 168, 76, 0.4)',
                borderRadius: '2px',
                minWidth: '160px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
            }}
        >
            <li>
                <button className="hover-menu-btn" onClick={handleClone}
                    style={{ width: '100%', textAlign: 'left' }}>
                    Clone to My Board
                </button>
            </li>
            {currentZone === 'battlefield' && (
                <li>
                    <button className="hover-menu-btn" onClick={handleShake}
                        style={{ width: '100%', textAlign: 'left' }}>
                        Shake
                    </button>
                </li>
            )}
        </ul>,
        document.body
    );
};

export default OpponentCardActionsMenu;