import { useState, useMemo } from 'react';
import ViewCardItem from '../ViewCardItem';
import CardActionsMenu from './CardActionsMenu';
import '../../styles/ZoneViewingModal.css';
import OpponentCardActionsMenu from './OpponentCardActionsMenu';

const ZoneViewingModal = ({ zoneName, onClose, playerStates, userId, readOnly = false, isOpponent = false, targetPlayerId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedCard, setSelectedCard] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  // Support both "Graveyard" display name → "graveyard" key, and raw keys like "graveyard"
  const zoneKey = useMemo(() => {
    const raw = zoneName.toLowerCase().replace(/\s+/g, '');
    // Map display names used by OpponentStrip to the actual state keys
    const keyMap = {
      facedown: 'facedown',
      faceddown: 'facedown',
    };
    return keyMap[raw] ?? raw;
  }, [zoneName]);

  const cards = useMemo(() => {
    return playerStates[userId]?.[zoneKey] || [];
  }, [playerStates, userId, zoneKey]);

  const cardTypes = useMemo(() => {
    const types = new Set();
    cards.forEach(card => {
      const type = card.type?.split('—')[0].trim().toLowerCase();
      if (type) types.add(type);
    });
    return Array.from(types).sort();
  }, [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const matchesSearch = card.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const cardMainType = card.type?.split('—')[0].trim().toLowerCase();
      const matchesType = selectedType === 'all' || cardMainType === selectedType;
      return matchesSearch && matchesType;
    });
  }, [cards, searchTerm, selectedType]);

  const handleCardClick = (card, position) => {
    // was: if (readOnly && !isOpponent) return;
    // This correctly blocks readOnly non-opponent, but make sure isOpponent
    // cards can always open the menu
    if (readOnly && !isOpponent) return;
    setSelectedCard(card);
    setMenuPosition(position);
};

// And in the return — remove the menu from INSIDE .zone-modal-cards
// and keep only ONE menu instance OUTSIDE it:
return (
    <div className='zone-modal-overlay'>
      <div className='zone-modal-content'>
        <div className='zone-modal-header'>
          <h2>
            {zoneName} ({filteredCards.length})
            {readOnly && <span className='zone-modal-readonly-badge'>view only</span>}
          </h2>
          <button className='zone-modal-close-btn' onClick={onClose}>✕</button>
        </div>

        <div className='zone-modal-controls'>
          <input
            type='text'
            placeholder='Search cards...'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className='zone-search-input'
          />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className='zone-type-filter'
          >
            <option value='all'>All Types</option>
            {cardTypes.map(type => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className='zone-modal-cards'>
          {filteredCards.length > 0 ? (
            filteredCards.map((card, index) => (
              <ViewCardItem
                key={`${card._id}-${index}`}
                card={card}
                onCardClick={(!readOnly || isOpponent) ? handleCardClick : undefined}
                style={(readOnly && !isOpponent) ? { cursor: 'default' } : undefined}
              >
                <div className={`zone-card-item ${(readOnly && !isOpponent) ? 'zone-card-item--readonly' : ''}`}>
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className='zone-card-image'
                  />
                </div>
              </ViewCardItem>
            ))
          ) : (
            <div className='zone-modal-empty'>No cards found</div>
          )}
          {/* ✅ NO menus inside here */}
        </div>
      </div>

      {/* ✅ Single menu instance, outside .zone-modal-content */}
      {isOpponent ? (
        <OpponentCardActionsMenu
            card={selectedCard}
            isOpen={!!selectedCard}
            position={menuPosition}
            onClose={() => setSelectedCard(null)}
            currentZone={zoneKey}
            targetPlayerId={targetPlayerId}
        />
      ) : !readOnly && (
        <CardActionsMenu
            card={selectedCard}
            isOpen={!!selectedCard}
            position={menuPosition}
            onClose={() => setSelectedCard(null)}
            currentZone={zoneKey}
        />
      )}
    </div>
  );
};

export default ZoneViewingModal;