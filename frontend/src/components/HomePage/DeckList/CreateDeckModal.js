import { useState, useContext } from 'react';
import { deckAPI } from '../../../services/api';
import { AuthContext } from '../../../contexts/auth';
import '../../../styles/CreateDeckModal.css';

const FORMATS = ['Standard', 'Modern', 'Commander', 'Legacy', 'Vintage', 'Pioneer', 'Pauper'];

const CreateDeckModal = ({ isOpen, onClose, onCreate, existingNames = [] }) => {
  const { user } = useContext(AuthContext);
  const [deckName, setDeckName] = useState('');
  const [format, setFormat] = useState('Standard');

  const isDuplicate = existingNames.includes(deckName.trim().toLowerCase());

  const handleCreate = async () => {
    if (!deckName.trim()) return;
    try {
      const newDeck = await deckAPI.createDeck({
        name: deckName,
        format,
        cards: [],
        owner: user._id,
      });
      onCreate(newDeck);
      setDeckName('');
      setFormat('Standard');
      onClose();
    } catch {
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cdm-overlay" onClick={onClose}>
      <div className="cdm-panel" onClick={(e) => e.stopPropagation()}>

        <div className="cdm-header">
          <span className="cdm-eyebrow">New Deck</span>
          <button className="cdm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cdm-body">
          <div className="cdm-field">
            <label className="cdm-label" htmlFor="deck-name">Deck Name</label>
            <input
              id="deck-name"
              type="text"
              placeholder="e.g. Jeskai Control"
              className={`cdm-input${isDuplicate ? ' cdm-input--error' : ''}`}
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            {isDuplicate && (
              <span className="cdm-error-hint">You already have a deck with this name.</span>
            )}
          </div>

          <div className="cdm-field">
            <label className="cdm-label" htmlFor="deck-format">Format</label>
            <select
              id="deck-format"
              className="cdm-select"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        <button
          className="cdm-create-btn"
          onClick={handleCreate}
          disabled={!deckName.trim() || isDuplicate}
        >
          Create Deck
        </button>

      </div>
    </div>
  );
};

export default CreateDeckModal;