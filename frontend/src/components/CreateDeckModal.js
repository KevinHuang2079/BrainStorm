import { useState, useContext } from 'react';
import { deckAPI } from '../services/api';
import {AuthContext} from '../contexts/auth';
import '../styles/CreateDeckModal.css';

const CreateDeckModal = ({ isOpen, onClose, onCreate }) => {
  const { user } = useContext(AuthContext);
  const [deckName, setDeckName] = useState('');
  const [format, setFormat] = useState('Standard');

  const handleCreate = async () => {
    if (!deckName.trim()) return;
    
    try {
      const newDeck = await deckAPI.createDeck({
        name: deckName,
        format: format,
        cards: [],
        owner: user._id,
      });
      onCreate(newDeck);
      setDeckName('');
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="deck-modal-overlay">
      <div className="deck-modal-content">
        <button className="deck-modal-close" onClick={onClose}>✕</button>
        <h2 className="deck-modal-title">Create New Deck</h2>
        <input
          type="text"
          placeholder="Deck Name"
          className="deck-modal-input"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
        />
        <select 
          className="deck-modal-select"
          value={format} 
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="Standard">Standard</option>
          <option value="Modern">Modern</option>
          <option value="Commander">Commander</option>
          <option value="Legacy">Legacy</option>
          <option value="Vintage">Vintage</option>
        </select>
        <button className="deck-modal-button" onClick={handleCreate}>
          Create Deck
        </button>
      </div>
    </div>
  );
};

export default CreateDeckModal;