import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { deckAPI, cardAPI } from '../../../services/api';
import '../../../styles/EditDeckModal.css';
import ViewCardItem from '../../ViewCardItem';
//todo: prices very inaccurate

/* ─────────────────────────────────────────
   Constants
───────────────────────────────────────── */
const SORT_OPTIONS = [
  { value: 'time',  label: 'Date added' },
  { value: 'alpha', label: 'Alphabetical' },
  { value: 'type',  label: 'Card type' },
];

const ZONES = [
  { key: 'startInPlay', apiKey: 'startInPlay', label: 'Start in Play' },
  { key: 'cards',       apiKey: 'mainDeck',    label: 'Main Deck' },
  { key: 'sideboard',   apiKey: 'sideboard',   label: 'Sideboard' },
];

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
const totalQty = (cards) =>
  (cards || []).reduce((s, c) => s + (c.quantity || 0), 0);

const mergeZone = (localCards, freshCards) => {
  const freshMap = new Map((freshCards || []).map(c => [c.scryfallId, c]));
  const merged = localCards
    .map(c => {
      const fresh = freshMap.get(c.scryfallId);
      if (!fresh) return null;
      return { ...c, ...fresh };
    })
    .filter(Boolean);
  const mergedIds = new Set(merged.map(c => c.scryfallId));
  (freshCards || []).forEach(c => {
    if (!mergedIds.has(c.scryfallId)) merged.push(c);
  });
  return merged;
};

/* ─────────────────────────────────────────
   SortableCardRow
───────────────────────────────────────── */
const SortableCardRow = ({ card, zone, onIncrement, onDecrement, onRemoveAll, isDraggingOver }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `${zone}:${card.scryfallId}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <ViewCardItem card={card}>
      <div
        ref={setNodeRef}
        style={style}
        className={`deck-card-item${isDraggingOver ? ' drag-over' : ''}`}
      >
        <span className="drag-handle" {...attributes} {...listeners} title="Drag to reorder or move zone">⠿</span>

        <div className="card-info">
          <p className="card-name">{card.name}</p>
          <p className="card-price">${card.priceValue?.toFixed(2) || '0.00'}</p>
        </div>

        <div className="card-count-controls">
          <button className="count-button" onClick={() => onDecrement(card.scryfallId, zone)} disabled={card.quantity <= 1}>−</button>
          <span className="count-display">{card.quantity}</span>
          <button className="count-button" onClick={() => onIncrement(card.scryfallId, zone)}>+</button>
        </div>

        <button className="remove-button" onClick={() => onRemoveAll(card.scryfallId, zone)}>Remove</button>
      </div>
    </ViewCardItem>
  );
};

/* ─────────────────────────────────────────
   DroppableZone
───────────────────────────────────────── */
const DroppableZone = ({ zoneKey, label, cards, deckSearchTerm, sortOrder, activeId, onIncrement, onDecrement, onRemoveAll }) => {
  const { setNodeRef, isOver } = useDroppable({ id: zoneKey });

  const filteredCards = useMemo(() => {
    if (!deckSearchTerm.trim()) return cards;
    const term = deckSearchTerm.toLowerCase();
    return cards.filter(c => c.name?.toLowerCase().includes(term));
  }, [cards, deckSearchTerm]);

  const sortedCards = useMemo(() => {
    const arr = [...filteredCards];
    if (sortOrder === 'alpha') arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortOrder === 'type') arr.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
    return arr;
  }, [filteredCards, sortOrder]);

  const ids = sortedCards.map(c => `${zoneKey}:${c.scryfallId}`);
  const count = totalQty(cards);

  return (
    <div className="zone-section">
      <div className="zone-header">
        <span className="zone-label">{label}</span>
        <span className="zone-count">{count}</span>
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`zone-cards${isOver ? ' zone-drag-over' : ''}`} data-zone={zoneKey}>
          {sortedCards.map(card => (
            <SortableCardRow
              key={card.scryfallId}
              card={card}
              zone={zoneKey}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              onRemoveAll={onRemoveAll}
              isDraggingOver={activeId && activeId !== `${zoneKey}:${card.scryfallId}`}
            />
          ))}

          {sortedCards.length === 0 && (
            <div className="zone-empty">
              {deckSearchTerm ? `No cards match "${deckSearchTerm}"` : `Drop cards here`}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
};

/* ─────────────────────────────────────────
   DragOverlayCard
───────────────────────────────────────── */
const DragOverlayCard = ({ card }) => {
  if (!card) return null;
  return (
    <div className="deck-card-item drag-ghost">
      <span className="drag-handle">⠿</span>
      <div className="card-info">
        <p className="card-name">{card.name}</p>
        <p className="card-price">${card.priceValue?.toFixed(2) || '0.00'}</p>
      </div>
      <span className="count-display ghost-qty">{card.quantity}</span>
    </div>
  );
};

/* ─────────────────────────────────────────
   EditDeckModal
───────────────────────────────────────── */
const EditDeckModal = ({ isOpen, onClose, deck, onUpdate, onDelete }) => {
  const [searchTerm, setSearchTerm]         = useState('');
  const [searchResults, setSearchResults]   = useState([]);
  const [currentDeck, setCurrentDeck]       = useState(deck);
  const [isSearching, setIsSearching]       = useState(false);
  const [deckFormat, setDeckFormat]         = useState(deck?.format || 'Standard');
  const [importText, setImportText]         = useState('');
  const [isImporting, setIsImporting]       = useState(false);
  const [importErrors, setImportErrors]     = useState([]);
  const [showImport, setShowImport]         = useState(false);
  const [deckSearchTerm, setDeckSearchTerm] = useState('');
  const [sortOrder, setSortOrder]           = useState('time');

  const [localCards, setLocalCards]               = useState([]);
  const [localSideboard, setLocalSideboard]       = useState([]);
  const [localStartInPlay, setLocalStartInPlay]   = useState([]);

  const [activeId, setActiveId] = useState(null);

  const pendingRef = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    if (!deck) return;
    setCurrentDeck(deck);
    setDeckFormat(deck.format || 'Standard');
    setLocalCards(deck.cards || []);
    setLocalSideboard(deck.sideboard || []);
    setLocalStartInPlay(deck.startInPlay || []);
  }, [deck]);

  const applyFreshDeck = useCallback((freshDeck) => {
    setCurrentDeck(freshDeck);
    setLocalCards(prev => mergeZone(prev, freshDeck.cards));
    setLocalSideboard(prev => mergeZone(prev, freshDeck.sideboard));
    setLocalStartInPlay(prev => mergeZone(prev, freshDeck.startInPlay));
    onUpdate(freshDeck);
  }, [onUpdate]);

  const getZoneSetter = useCallback((zoneKey) => {
    if (zoneKey === 'cards') return setLocalCards;
    if (zoneKey === 'sideboard') return setLocalSideboard;
    return setLocalStartInPlay;
  }, []);

  const getZoneSnapshot = useCallback((zoneKey) => {
    if (zoneKey === 'cards') return localCards;
    if (zoneKey === 'sideboard') return localSideboard;
    return localStartInPlay;
  }, [localCards, localSideboard, localStartInPlay]);

  const parseId = (id) => {
    if (!id) return {};
    const idx = id.indexOf(':');
    return { zoneKey: id.slice(0, idx), scryfallId: id.slice(idx + 1) };
  };

  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const { zoneKey: fromZone, scryfallId } = parseId(active.id);

    const ZONE_KEYS = new Set(ZONES.map(z => z.key));
    const toZone = ZONE_KEYS.has(over.id) ? over.id : parseId(over.id).zoneKey;

    if (!toZone) return;

    if (fromZone === toZone) {
      getZoneSetter(fromZone)(prev => {
        const ids = prev.map(c => `${fromZone}:${c.scryfallId}`);
        const oldIdx = ids.indexOf(active.id);
        const newIdx = ids.indexOf(over.id);
        return oldIdx !== -1 && newIdx !== -1 ? arrayMove(prev, oldIdx, newIdx) : prev;
      });
    } else {
      const card = getZoneSnapshot(fromZone).find(c => c.scryfallId === scryfallId);
      if (!card) return;

      getZoneSetter(fromZone)(prev => prev.filter(c => c.scryfallId !== scryfallId));
      getZoneSetter(toZone)(prev => [...prev, { ...card }]);

      const fromApiZone = ZONES.find(z => z.key === fromZone)?.apiKey;
      const toApiZone   = ZONES.find(z => z.key === toZone)?.apiKey;

      const deckSnapshot = currentDeck;

      (async () => {
        try {
          await deckAPI.removeCardFromDeck(deckSnapshot._id, scryfallId, fromApiZone, card.quantity);
          await deckAPI.addCardToDeck(deckSnapshot._id, scryfallId, toApiZone, card.quantity);
          const freshDeck = await deckAPI.getDeckById(deckSnapshot._id);
          applyFreshDeck(freshDeck);
        } catch {
          applyFreshDeck(deckSnapshot);
        }
      })();
    }
  };

  const activeCard = useMemo(() => {
    if (!activeId) return null;
    const { zoneKey, scryfallId } = parseId(activeId);
    return getZoneSnapshot(zoneKey)?.find(c => c.scryfallId === scryfallId) || null;
  }, [activeId, localCards, localSideboard, localStartInPlay]);

  const handleIncrement = async (scryfallId, zoneKey) => {
    const apiZone = ZONES.find(z => z.key === zoneKey)?.apiKey;
    getZoneSetter(zoneKey)(prev => prev.map(c =>
      c.scryfallId === scryfallId ? { ...c, quantity: c.quantity + 1 } : c
    ));
    pendingRef.current += 1;
    const reqId = pendingRef.current;
    try {
      const fresh = await deckAPI.addCardToDeck(currentDeck._id, scryfallId, apiZone, 1);
      if (reqId === pendingRef.current) applyFreshDeck(fresh);
    } catch {
      if (reqId === pendingRef.current) applyFreshDeck(currentDeck);
    }
  };

  const handleDecrement = async (scryfallId, zoneKey) => {
    const apiZone = ZONES.find(z => z.key === zoneKey)?.apiKey;
    getZoneSetter(zoneKey)(prev => prev.map(c =>
      c.scryfallId === scryfallId ? { ...c, quantity: c.quantity - 1 } : c
    ));
    pendingRef.current += 1;
    const reqId = pendingRef.current;
    try {
      const fresh = await deckAPI.removeCardFromDeck(currentDeck._id, scryfallId, apiZone);
      if (reqId === pendingRef.current) applyFreshDeck(fresh);
    } catch {
      if (reqId === pendingRef.current) applyFreshDeck(currentDeck);
    }
  };

  const handleRemoveAll = async (scryfallId, zoneKey) => {
    const apiZone = ZONES.find(z => z.key === zoneKey)?.apiKey;
    const card = getZoneSnapshot(zoneKey).find(c => c.scryfallId === scryfallId);
    if (!card) return;

    getZoneSetter(zoneKey)(prev => prev.filter(c => c.scryfallId !== scryfallId));
    pendingRef.current += 1;
    const reqId = pendingRef.current;
    try {
      await deckAPI.removeCardFromDeck(currentDeck._id, scryfallId, apiZone, card.quantity);
      const fresh = await deckAPI.getDeckById(currentDeck._id);
      if (reqId === pendingRef.current) applyFreshDeck(fresh);
    } catch {
      if (reqId === pendingRef.current) applyFreshDeck(currentDeck);
    }
  };

  const handleAddCard = async (card) => {
    try {
      const fresh = await deckAPI.addCardToDeck(currentDeck._id, card.scryfallId, 'mainDeck', 1);
      applyFreshDeck(fresh);
    } catch {
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setIsSearching(true);
    try {
      const results = await cardAPI.searchCards(searchTerm);
      setSearchResults(results);
    } catch {
    } finally {
      setIsSearching(false);
    }
  };

  const handleFormatChange = async (newFormat) => {
    try {
      const fresh = await deckAPI.updateDeck(currentDeck._id, { format: newFormat });
      setDeckFormat(newFormat);
      applyFreshDeck(fresh);
    } catch {
    }
  };

  const handleImportDeck = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    setImportErrors([]);
    try {
      const results = await deckAPI.importDeck(currentDeck._id, importText);
      applyFreshDeck(results.updatedDeck);
      const errors = [];
      if (results.invalidCards?.length)
        results.invalidCards.forEach(n => errors.push({ line: n, error: 'Card not found in Scryfall database' }));
      if (results.failedCards?.length)
        results.failedCards.forEach(n => errors.push({ line: n, error: 'Failed to add card to deck' }));
      setImportErrors(errors);
      setImportText('');
      setShowImport(false);
    } catch (err) {
      setImportErrors([{ line: 'Import failed', error: err.response?.data?.message || err.message }]);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen || !currentDeck) return null;

  const totalDeckCards = totalQty(localCards) + totalQty(localSideboard) + totalQty(localStartInPlay);

  return (
    <div className="edit-modal-overlay">
      <div className="edit-modal-content">

        <div className="edit-modal-header">
          <h2 className="edit-modal-title">{currentDeck.name}</h2>
          <button className="edit-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="edit-modal-body">

          <div className="edit-modal-search-section">
            <span className="section-title">Search Cards</span>

            <div className="search-bar">
              <input
                type="text"
                placeholder="Card name…"
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className="search-button" onClick={handleSearch} disabled={isSearching}>
                {isSearching ? 'Searching…' : 'Search'}
              </button>
            </div>

            <div className="search-results">
              {searchResults.map((card) => (
                <ViewCardItem key={card._id} card={card}>
                  <div className="card-item" onClick={() => handleAddCard(card)}>
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
              <button className="import-toggle-button" onClick={() => setShowImport(!showImport)}>
                {showImport ? 'Hide Import' : 'Import Decklist'}
              </button>
              {showImport && (
                <div className="import-container">
                  <textarea
                    className="import-textarea"
                    placeholder={"3 Brainstorm\n4 Lightning Bolt\n20 Island"}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={6}
                  />
                  <button className="import-button" onClick={handleImportDeck} disabled={isImporting || !importText.trim()}>
                    {isImporting ? 'Importing…' : 'Import'}
                  </button>
                </div>
              )}
            </div>

            {importErrors.length > 0 && (
              <div className="import-errors">
                <div className="errors-header">
                  <h4 className="errors-title">Errors ({importErrors.length})</h4>
                  <button className="clear-errors-button" onClick={() => setImportErrors([])}>Clear</button>
                </div>
                <div className="errors-list">
                  {importErrors.map((err, i) => (
                    <div key={i} className="error-item">
                      <p className="error-line">{err.line}</p>
                      <p className="error-message">{err.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="edit-modal-deck-section">

            <div className="deck-header">
              <span className="section-title">Cards ({totalDeckCards})</span>
              <div className="format-selector">
                <label htmlFor="format-select">Format</label>
                <select
                  id="format-select"
                  className="format-dropdown"
                  value={deckFormat}
                  onChange={(e) => handleFormatChange(e.target.value)}
                >
                  {['Standard', 'Modern', 'Legacy', 'Vintage', 'Commander', 'Pioneer', 'Pauper'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="deck-total">${currentDeck.priceValue?.toFixed(2) || '0.00'}</p>

            <div className="deck-controls">
              <input
                type="text"
                placeholder="Filter cards…"
                className="deck-search-input"
                value={deckSearchTerm}
                onChange={(e) => setDeckSearchTerm(e.target.value)}
              />
              <select className="sort-dropdown" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="zones-scroll">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {ZONES.map(({ key, label }) => (
                  <DroppableZone
                    key={key}
                    zoneKey={key}
                    label={label}
                    cards={getZoneSnapshot(key)}
                    deckSearchTerm={deckSearchTerm}
                    sortOrder={sortOrder}
                    activeId={activeId}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    onRemoveAll={handleRemoveAll}
                  />
                ))}

                <DragOverlay dropAnimation={{ duration: 160, easing: 'ease' }}>
                  <DragOverlayCard card={activeCard} />
                </DragOverlay>
              </DndContext>
            </div>

            <button className="delete-deck-button" onClick={() => onDelete(deck._id)}>
              Delete Deck
            </button>

          </div>
        </div>
      </div>
    </div>
  );
};

export default EditDeckModal;