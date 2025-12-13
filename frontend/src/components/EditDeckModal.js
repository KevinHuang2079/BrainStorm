import { useState, useEffect } from 'react';
import { deckAPI, cardAPI } from '../services/api';
import '../styles/EditDeckModal.css';
import ViewCardItem from '../components/ViewCardItem';

const EditDeckModal = ({ isOpen, onClose, deck, onUpdate, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentDeck, setCurrentDeck] = useState(deck);
  const [isSearching, setIsSearching] = useState(false);
  const [deckFormat, setDeckFormat] = useState(deck?.format || 'Standard');
  const [cardCounts, setCardCounts] = useState({});
  const [cardOrder, setCardOrder] = useState([]);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [showImport, setShowImport] = useState(false);


  useEffect(() => {
    setCurrentDeck(deck);
    setDeckFormat(deck?.format || 'Standard');
    
    const counts = recalculateCardCounts(deck);
    setCardCounts(counts);
    
    const order = extractCardOrder(deck);
    setCardOrder(order);
  }, [deck]);

  const recalculateCardCounts = (deckData) => {
    if (!deckData?.cards) return {};
    
    const counts = {};
    deckData.cards.forEach(card => {
        const scryfallId = card.scryfallId || card;
        counts[scryfallId] = (counts[scryfallId] || 0) + 1;
    });
    return counts;
};

  const extractCardOrder = (deckData) => {
      if (!deckData?.cards) return [];
      
      const seen = new Set();
      const order = [];
      
      deckData.cards.forEach(card => {
          const scryfallId = card.scryfallId || card;
          if (!seen.has(scryfallId)) {
              seen.add(scryfallId);
              order.push(scryfallId);
          }
      });
      
      return order;
  };

  const handleAddCard = async (card) => {
      try {
          const updatedDeck = await deckAPI.addCardToDeck(currentDeck._id, card.scryfallId);
          setCurrentDeck(updatedDeck);
          
          const counts = recalculateCardCounts(updatedDeck);
          setCardCounts(counts);
          
          if (!cardOrder.includes(card.scryfallId)) {
              setCardOrder(prev => [...prev, card.scryfallId]);
          }
          
          onUpdate(updatedDeck);
      } catch (error) {
          console.error('Add card error:', error);
      }
  };

  const handleCountChange = async (scryfallId, newCount) => {
      const currentCount = cardCounts[scryfallId] || 0;
      const diff = newCount - currentCount;

      if (diff === 0) return;

      try {
          if (diff > 0) {
              for (let i = 0; i < diff; i++) {
                  await deckAPI.addCardToDeck(currentDeck._id, scryfallId);
              }
          } else if (diff < 0) {
              for (let i = 0; i < Math.abs(diff); i++) {
                  await deckAPI.removeCardFromDeck(currentDeck._id, scryfallId);
              }
          }

          const updatedDeck = await deckAPI.getDeckById(currentDeck._id);
          setCurrentDeck(updatedDeck);
          
          const counts = recalculateCardCounts(updatedDeck);
          setCardCounts(counts);
          
          if (newCount === 0) {
              setCardOrder(prev => prev.filter(id => id !== scryfallId));
          }
          
          onUpdate(updatedDeck);
      } catch (error) {
          console.error('Count change error:', error);
      }
  };

  const handleRemoveAll = async (scryfallId) => {
      const currentCount = cardCounts[scryfallId] || 0;
      if (currentCount === 0) return;

      try {
          for (let i = 0; i < currentCount; i++) {
              await deckAPI.removeCardFromDeck(currentDeck._id, scryfallId);
          }

          const updatedDeck = await deckAPI.getDeckById(currentDeck._id);
          setCurrentDeck(updatedDeck);
          
          const counts = recalculateCardCounts(updatedDeck);
          setCardCounts(counts);
          
          setCardOrder(prev => prev.filter(id => id !== scryfallId));
          
          onUpdate(updatedDeck);
      } catch (error) {
          console.error('Remove all error:', error);
      }
  };

  const getOrderedUniqueCards = () => {
      if (!currentDeck?.cards) return [];
      
      const cardMap = new Map();
      currentDeck.cards.forEach(card => {
          const scryfallId = card.scryfallId || card;
          if (!cardMap.has(scryfallId)) {
              cardMap.set(scryfallId, card);
          }
      });
      
      return cardOrder
          .map(scryfallId => cardMap.get(scryfallId))
          .filter(card => card != null);
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    try {
      const results = await cardAPI.searchCards(searchTerm);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleFormatChange = async (newFormat) => {
    try {
      const updatedDeck = await deckAPI.updateDeck(currentDeck._id, { format: newFormat });
      setDeckFormat(newFormat);
      setCurrentDeck(updatedDeck);
      onUpdate(updatedDeck);
    } catch (error) {
      console.error('Format change error:', error);
    }
  };

  const handleImportDeck = async () => {
    if (!importText.trim()) return;

    setIsImporting(true);
    setImportErrors([]);

    try {
      const results = await deckAPI.importDeck(currentDeck._id, importText);
      console.log('Import results:', results);
      
      const updatedDeck = results.updatedDeck;
      setCurrentDeck(updatedDeck);
      
      const counts = recalculateCardCounts(updatedDeck);
      setCardCounts(counts);
      
      const order = extractCardOrder(updatedDeck);
      setCardOrder(order);
      
      onUpdate(updatedDeck);
      
      if (results.invalidCards && results.invalidCards.length > 0) {
        const errors = results.invalidCards.map(cardName => ({
          line: cardName,
          error: 'Card not found in Scryfall database'
        }));
        setImportErrors(errors);
      }
      
      if (results.failedCards && results.failedCards.length > 0) {
        const failedErrors = results.failedCards.map(cardName => ({
          line: cardName,
          error: 'Failed to add card to deck'
        }));
        setImportErrors(prev => [...prev, ...failedErrors]);
      }
      
      setImportText('');
      setShowImport(false);
    } catch (error) {
      console.error('Import error:', error);
      setImportErrors([{
        line: 'Import failed',
        error: error.response?.data?.message || error.message
      }]);
    } finally {
      setIsImporting(false);
    }
  };

  const getTotalCardCount = () => {
    return Object.values(cardCounts).reduce((sum, count) => sum + count, 0);
  };

  if (!isOpen || !currentDeck) return null;

  return (
    <div className="edit-modal-overlay">
      <div className="edit-modal-content">
        <button className="edit-modal-close" onClick={onClose}>✕</button>
        <h2 className="edit-modal-title">{currentDeck.name}</h2>
        <div className="edit-modal-body">
          <div className="edit-modal-search-section">
            <h3 className="section-title">Search Cards</h3>
            <div className="search-bar">
              <input
                type="text"
                placeholder="Card name"
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button 
                className="search-button" 
                onClick={handleSearch} 
                disabled={isSearching}
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <div className="search-results">
              {searchResults.map((card) => (
                <ViewCardItem card={card}>
                  <div 
                    key={card._id}  
                    className="card-item"
                    onClick={() => handleAddCard(card)}
                  >
                    <img src={card.imageUrl} alt={card.name} className="card-image" />
                    <div className="card-info">
                      <p className="card-name">{card.name}</p>
                      <p className="card-price">${card.priceValue?.toFixed(2) || '0.00'}</p>
                    </div>
                  </div>
                </ViewCardItem>
              ))}
            </div>

            <div className="import-section">
              <button 
                className="import-toggle-button"
                onClick={() => setShowImport(!showImport)}
              >
                {showImport ? 'Hide Import' : 'Import Decklist'}
              </button>
              
              {showImport && (
                <div className="import-container">
                  <textarea
                    className="import-textarea"
                    placeholder="Format:&#10;3 Brainstorm&#10;4 Lightning Bolt&#10;20 Island"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={10}
                  />
                  <button
                    className="import-button"
                    onClick={handleImportDeck}
                    disabled={isImporting || !importText.trim()}
                  >
                    {isImporting ? 'Importing...' : 'Import'}
                  </button>
                </div>
              )}
            </div>

            {importErrors.length > 0 && (
              <div className="import-errors">
                <div className="errors-header">
                  <h4 className="errors-title">Import Errors ({importErrors.length})</h4>
                  <button 
                    className="clear-errors-button"
                    onClick={() => setImportErrors([])}
                  >
                    Clear
                  </button>
                </div>
                <div className="errors-list">
                  {importErrors.map((error, index) => (
                    <div key={index} className="error-item">
                      <p className="error-line">{error.line}</p>
                      <p className="error-message">{error.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="edit-modal-deck-section">
            <button className="delete-deck-button" onClick={() => onDelete(deck._id)}>
              Delete Deck
            </button>
            <div className="deck-header">
              <h3 className="section-title">
                Cards ({getTotalCardCount()})
              </h3>
              <div className="format-selector">
                <label htmlFor="format-select">Format:</label>
                <select 
                  id="format-select"
                  className="format-dropdown"
                  value={deckFormat}
                  onChange={(e) => handleFormatChange(e.target.value)}
                >
                  <option value="Standard">Standard</option>
                  <option value="Modern">Modern</option>
                  <option value="Legacy">Legacy</option>
                  <option value="Vintage">Vintage</option>
                  <option value="Commander">Commander</option>
                  <option value="Pioneer">Pioneer</option>
                  <option value="Pauper">Pauper</option>
                </select>
              </div>
            </div>
            <p className="deck-total">
              Total: ${currentDeck.priceValue?.toFixed(2) || '0.00'}
            </p>
            <div className="deck-cards">
              {getOrderedUniqueCards().map((card) => (
                <ViewCardItem key={card._id} card={card}>
                  <div className="deck-card-item">
                    <div className="card-info">
                      <p className="card-name">{card.name}</p>
                      <p className="card-price">${card.priceValue?.toFixed(2) || '0.00'}</p>
                    </div>
                    <div className="card-count-controls">
                      <button 
                        className="count-button"
                        onClick={() => handleCountChange(card._id, (cardCounts[card._id] || 0) - 1)}
                        disabled={!cardCounts[card._id] || cardCounts[card._id] === 0}
                      >
                        -
                      </button>
                      <span className="count-display">{cardCounts[card._id] || 0}</span>
                      <button 
                        className="count-button"
                        onClick={() => handleCountChange(card._id, (cardCounts[card._id] || 0) + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button 
                      className="remove-button" 
                      onClick={() => handleRemoveAll(card._id)}
                    >
                      Remove All
                    </button>
                  </div>
                </ViewCardItem>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditDeckModal;