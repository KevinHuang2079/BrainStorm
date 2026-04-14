import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/ViewCardItem.css';
//todo, modify where its rendered (parents) so that it disappears on a click
//double-faced card (callous sell-sword // burn together) doesn't work (look at edge cases/nested images?)
const ViewCardItem = ({ card, children, onCardClick, style, className, isDragging }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [showPreview, setShowPreview] = useState(false);
  const containerRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isDragging) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      setIsHovered(false);
      setShowPreview(false);
    }
  }, [isDragging]);

  const handleMouseEnter = (e) => {
    if (isDragging || isInteractiveElement(e.target)) {
      return;
    }

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    hoverTimeoutRef.current = setTimeout(() => {
      if (!isDragging) {
        setIsHovered(true);
        setShowPreview(true);
        updatePosition(e);
      }
    }, 150);
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      if (showPreview) {
        setShowPreview(false);
        setIsHovered(false);
      }
      return;
    }

    if (isInteractiveElement(e.target)) {
      if (showPreview) {
        setShowPreview(false);
        setIsHovered(false);
      }
      return;
    }

    if (isHovered) {
      updatePosition(e);
    }
  };

  const handleMouseLeave = (e) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    const relatedTarget = e.relatedTarget;
    if (relatedTarget && relatedTarget instanceof Node && 
        containerRef.current?.contains(relatedTarget)) {
      return;
    }

    setIsHovered(false);
    setShowPreview(false);
};

  const handleClick = (e) => {
    if (isInteractiveElement(e.target)) {
      return;
    }

    e.stopPropagation();
    
    if (onCardClick) {
      const cardElement = containerRef.current.querySelector('.hand-card') || 
                          containerRef.current.querySelector('.hand-card-image');

      const rect = cardElement ? cardElement.getBoundingClientRect() : 
                                  containerRef.current.getBoundingClientRect();
      
      const menuWidth = 200;
      const viewportWidth = window.innerWidth;
      
      let x = rect.right + menuWidth + 20 < viewportWidth 
        ? rect.right + 10 
        : rect.left - menuWidth - 10;
      
      let y = e.clientY;
      
      onCardClick(card, { x, y });
    }

    setShowPreview(false);
  };

  const isInteractiveElement = (element) => {
    if (!element) return false;
    
    const tagName = element.tagName.toLowerCase();
    const isButton = tagName === 'button';
    const isInput = tagName === 'input';
    const isSelect = tagName === 'select';
    const hasButtonClass = element.classList.contains('count-button') || 
                          element.classList.contains('remove-button') ||
                          element.classList.contains('search-button');
    const hasInputClass = element.classList.contains('count-input');
    
    if (isButton || isInput || isSelect || hasButtonClass || hasInputClass) {
      return true;
    }

    if (element.parentElement && element.parentElement !== containerRef.current) {
      return isInteractiveElement(element.parentElement);
    }

    return false;
  };

  const updatePosition = (e) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = 300;
    const cardHeight = 420;
    const offset = 20;

    let x = e.clientX + offset;
    let y = e.clientY - cardHeight / 2;

    if (x + cardWidth > viewportWidth) {
      x = e.clientX - cardWidth - offset;
    }

    if (y < 10) {
      y = 10;
    } else if (y + cardHeight > viewportHeight - 10) {
      y = viewportHeight - cardHeight - 10;
    }

    setPosition({ x, y });
  };

  const getCardImage = () => {
    if (!card) return null;
    
    const faceIndex = card.currentFaceIndex || 0;
    
    if (card.card_faces && card.card_faces.length > 1) {
      return card.card_faces[faceIndex].image_uris?.normal || card.card_faces[faceIndex].image_uris?.large;
    }
    
    if (card.altImageUrl && faceIndex === 1) {
      return card.altImageUrl;
    }
    
    return card.imageUrl;
  };

  const cardImage = getCardImage();

  const portalContent = showPreview && !isDragging && cardImage && !card.isFaceDown && (
    <div 
      className="view-card-preview"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <img 
        src={cardImage} 
        alt={card.name}
        className="view-card-preview-image"
      />
    </div>
  );

  return (
    <>
     <div
        ref={containerRef}
        className={`view-card-container ${className || ''}`}
        style={style}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {children}
      </div>
      {createPortal(portalContent, document.body)}
    </>
  );
};

export default ViewCardItem;
