import { useState, useEffect, useContext } from 'react';
import { deckAPI } from '../services/api';
import {AuthContext} from '../contexts/auth';
import DeckItem from './DeckItem';
import CreateDeckModal from './CreateDeckModal';
import EditDeckModal from './EditDeckModal';
import '../styles/DeckList.css';

const DeckList = () => {
  const { user } = useContext(AuthContext);
  const [decks, setDecks] = useState([]);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    loadDecks();
  }, []);

//   useEffect(() => {
//     console.log('decks', decks);
//   });

  const loadDecks = async () => {
    try {
      const fetchedDecks = await deckAPI.getMyDecks({ owner: user._id });
      setDecks(fetchedDecks);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeckClick = async (deck) => {
    try {
      const fullDeck = await deckAPI.getDeckById(deck._id);
      setSelectedDeck(fullDeck);
      setIsEditModalOpen(true);
    } catch (error) {
      console.error(error);
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
            onClick={() => handleDeckClick(deck)}
          />
        ))}
      </div>
      <CreateDeckModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateDeck}
      />
      <EditDeckModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        deck={selectedDeck}
        onUpdate={handleUpdateDeck}
        onDelete={handleDeleteDeck}
      />
    </div>
  );
};

export default DeckList;