import { useState, useMemo } from 'react';
import { useCardActions } from '../contexts/cardActions';
import ViewCardItem from './ViewCardItem';
import CardActionsMenu from './CardActionsMenu';
import '../styles/ZoneViewingModal.css';

const ZoneViewingModal = ({ zoneName, onClose, playerStates, userId }) => {
  const cardActions = useCardActions();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedCard, setSelectedCard] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const zoneKey = zoneName.toLowerCase().replace(/\s+/g, '');
  const cards = playerStates[userId]?.[zoneKey] || [];

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
    setSelectedCard(card);
    setMenuPosition(position);
  };

  return (
    <div className='zone-modal-overlay'>
      <div className='zone-modal-content'>
        <div className='zone-modal-header'>
          <h2>{zoneName} ({filteredCards.length})</h2>
          <button 
            className='zone-modal-close-btn'
            onClick={onClose}
          >
            ✕
          </button>
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
                onCardClick={handleCardClick}
              >
                <div className='zone-card-item'>
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
        </div>
      </div>

      <CardActionsMenu
        card={selectedCard}
        isOpen={!!selectedCard}
        position={menuPosition}
        onClose={() => setSelectedCard(null)}
        currentZone={zoneKey}
      />
    </div>
  );
};

export default ZoneViewingModal;