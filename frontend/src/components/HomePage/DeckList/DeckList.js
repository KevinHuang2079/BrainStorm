import { useState, useEffect, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { deckAPI } from '../../../services/api';
import {AuthContext} from '../../../contexts/auth';
import '../../../styles/DeckList.css';
import DeckItem from './DeckItem';
import CreateDeckModal from './CreateDeckModal';
import EditDeckModal from './EditDeckModal';

//todo: fix create new deck modal either use react portal or fixed height for decklist.
//todo: importing dual faced cards doesn't work (dusk/dawn)
//todo: fix what card gets chosen to be mvp not by price instead by idk yet
const DeckList = () => {
  const { user } = useContext(AuthContext);
  const [decks, setDecks] = useState([]);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const loadDecks = useCallback(async () => {
    try {
      const MAGIC_COLORS = new Set(["W","U","B","R","G"]);
      const fetchedDecks = await deckAPI.getMyDecks({ owner: user._id });
      const mvpsWithDeckIds = fetchedDecks.map(deck => {
        const mvp = (deck.cards || []).reduce((max,card) => {
          const price = Number(card.priceValue) || 0;
          const maxPrice = Number(max?.priceValue) || 0;
          return price > maxPrice ? card : max;
        }, null);
        const uniqueColorsOfDeck = Array.from(new Set(
          deck.cards.flatMap(card => {
            const symbols = card.manaCost?.match(/{([^}]+)}/g) || [];
            return symbols
              .map(s => s.replace(/[{}]/g, ""))
              .filter(s => MAGIC_COLORS.has(s));
          })
        )).sort();
        return { ...deck, mvpCard: mvp, uniqueColorsOfDeck };
      });
      setDecks(mvpsWithDeckIds);
    } catch {
    }
  }, [user._id]);

  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  const handleDeckClick = async (deck) => {
    try {
      const fullDeck = await deckAPI.getDeckById(deck._id);
      setSelectedDeck(fullDeck);
      setIsEditModalOpen(true);
    } catch {
    }
  };

  const handleDeleteDeck = async (deckId) => {
    await deckAPI.deleteDeck(deckId);
    setDecks(prev => prev.filter(deck => deck._id !== deckId));
    setIsEditModalOpen(false);
  }

  const handleCreateDeck = (newDeck) => {
    setDecks([newDeck, ...decks]);
    setSelectedDeck(newDeck);
    setIsEditModalOpen(true);
  };

  const handleUpdateDeck = (updatedDeck) => {
    setDecks(decks.map((d) => (d._id === updatedDeck._id ? updatedDeck : d)));
    setSelectedDeck(updatedDeck);
  };

  return (
    <div className="deck-list-container">
      <button
        className="create-deck-button"
        onClick={() => setIsCreateModalOpen(true)}
      >
        + Create New Deck
      </button>
      <div className="decks-grid">
        {decks.map((deck) => (
          <DeckItem
            key={deck._id}
            deck={deck}
            colors={deck.uniqueColorsOfDeck} 
            onClick={() => handleDeckClick(deck)}
          />
        ))}
      </div>
      {createPortal(
        <CreateDeckModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateDeck}
          existingNames={decks.map(d => d.name.toLowerCase())}  // add this
        />,
        document.body
      )}
      {createPortal(
        <EditDeckModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          deck={selectedDeck}
          onUpdate={handleUpdateDeck}
          onDelete={handleDeleteDeck}
        />,
        document.body
      )}
    </div>
  );
};

export default DeckList;