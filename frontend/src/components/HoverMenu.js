import { useRef, useEffect, useState } from 'react';

const useClickOutside = (isOpen, onClose) => {
    const ref = useRef(null);
    const closeTimeoutRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                closeTimeoutRef.current = setTimeout(() => {
                    onClose();
                }, 200);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, [isOpen, onClose]);

    return ref;
};

export const HoverMenu = ({ isOpen, onClose, children, position = 'top' }) => {
    const menuRef = useClickOutside(isOpen, onClose);
    const [adjustedPosition, setAdjustedPosition] = useState(position);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPositioned, setIsPositioned] = useState(false);
    const closeTimeoutRef = useRef(null);
    const parentRef = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            setIsPositioned(false);
            setOffset({ x: 0, y: 0 });
            return;
        }

        if (!menuRef.current || !parentRef.current) return;

        const adjustMenuPosition = () => {
            const menu = menuRef.current;
            const parent = parentRef.current;
            if (!menu || !parent) return;
            
            const menuRect = menu.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            const padding = 8;
            let newPosition = position;
            let offsetX = 0;
            let offsetY = 0;

            if (position === 'top' || position === 'bottom') {
                if (position === 'top' && menuRect.top < padding) {
                    newPosition = 'bottom';
                } else if (position === 'bottom' && menuRect.bottom > viewportHeight - padding) {
                    newPosition = 'top';
                }

                if (menuRect.left < padding) {
                    offsetX = padding - menuRect.left;
                } else if (menuRect.right > viewportWidth - padding) {
                    offsetX = (viewportWidth - padding) - menuRect.right;
                }
            }

            if (position === 'left' || position === 'right') {
                if (position === 'left' && menuRect.left < padding) {
                    newPosition = 'right';
                } else if (position === 'right' && menuRect.right > viewportWidth - padding) {
                    newPosition = 'left';
                }

                if (menuRect.top < padding) {
                    offsetY = padding - menuRect.top;
                } else if (menuRect.bottom > viewportHeight - padding) {
                    offsetY = (viewportHeight - padding) - menuRect.bottom;
                }
            }

            setAdjustedPosition(newPosition);
            setOffset({ x: offsetX, y: offsetY });
            setIsPositioned(true);
        };

        requestAnimationFrame(adjustMenuPosition);
    }, [isOpen, position, menuRef]);

    const handleMouseLeave = () => {
        closeTimeoutRef.current = setTimeout(() => {
            onClose();
        }, 300);
    };

    const handleMouseEnter = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };

    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, []);

    const positionClasses = {
        top: 'hover-menu-top',
        bottom: 'hover-menu-bottom',
        left: 'hover-menu-left',
        right: 'hover-menu-right',
    };

    return (
        <div 
            ref={parentRef} 
            onMouseEnter={handleMouseEnter} 
            onMouseLeave={handleMouseLeave}
            style={{ display: 'contents' }}
        >
            <ul 
                className={`hover-menu ${positionClasses[adjustedPosition]}`}
                ref={menuRef}
                style={{
                    visibility: isPositioned ? 'visible' : 'hidden',
                    position: 'absolute',
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                }}
            >
                {children}
            </ul>
            {(adjustedPosition === 'left' || adjustedPosition === 'right') && isPositioned && (
                <div
                    className="hover-menu-bridge"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                />
            )}
        </div>
    );
};

export const HoverMenuButton = ({ children, onClick, className = '' }) => {
    return (
        <li>
            <button className={`hover-menu-btn ${className}`} onClick={onClick}>
                {children}
            </button>
        </li>
    );
};

export const HoverMenuGroup = ({ label, children }) => {
    return (
        <li>
            <div className='hover-menu-group'>
                <span>{label}</span>
                <div className='hover-menu-group-content'>
                    {children}
                </div>
            </div>
        </li>
    );
};

export default HoverMenu;