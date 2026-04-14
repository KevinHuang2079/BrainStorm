import React, { useState } from 'react';
import { LogOut, Dices, Plus, Zap, MessageSquare } from 'lucide-react';
import { HoverMenu, HoverMenuButton } from './HoverMenu';
import { useCardActions } from '../../contexts/cardActions';
import { cardAPI } from '../../services/api';
import '../../styles/LeftRail.css';

//todo: be able to toggle left rail
const LeftRail = ({ isCollapsed, onLeaveGame, onRollDice, onUntapAll, onToggleChat, chatOpen }) => {
    const [diceMenuOpen, setDiceMenuOpen] = useState(false);
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [customDiceValue, setCustomDiceValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const { playCard } = useCardActions();
    const [searchMode, setSearchMode] = useState('card'); // 'card' | 'token'


    const closeModal = () => {
        setSearchModalOpen(false);
        setSearchTerm('');
        setSearchResults([]);
        setSearchMode('card'); 
    };

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;
        setIsSearching(true);
        try {
            const results = searchMode === 'token'
                ? await cardAPI.searchTokens(searchTerm)
                : await cardAPI.searchCards(searchTerm);
            setSearchResults(results);
        } catch (error) {
            console.error('[LeftRail] Search error:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleRollDice = (sides) => {
        const result = Math.floor(Math.random() * sides) + 1;
        if (onRollDice) {
            onRollDice(result, sides);
        }
        setDiceMenuOpen(false);
    };

    const handleCustomDiceRoll = () => {
        const sides = parseInt(customDiceValue);
        if (sides > 0 && sides <= 9999) {
            handleRollDice(sides);
            setCustomDiceValue('');
        }
    };

    const handleInsertCard = async (card) => {
        const transformedCard = {
            _id: `${card.id || card._id || card.scryfallId}_${Date.now()}_token`,
            scryfallId: card.scryfallId || card.id,
            originalCardId: card._id,
            name: card.name,
            imageUrl: card.imageUrl,
            altImageUrl: card.altImageUrl,
            card_faces: card.card_faces,
            isToken: true
        };
        
        if (playCard) {
            playCard(transformedCard, 'hand', 'battlefield');
        }
        setSearchModalOpen(false);
        setSearchTerm('');
        setSearchResults([]);
    };

    const DiceMenu = () => {
        return (
            <HoverMenu 
                menuId="left-rail-dice"
                isOpen={diceMenuOpen} 
                onClose={() => setDiceMenuOpen(false)}
                position="right"
            >
                <HoverMenuButton onClick={() => handleRollDice(6)}>
                    D6
                </HoverMenuButton>
                <HoverMenuButton onClick={() => handleRollDice(20)}>
                    D20
                </HoverMenuButton>
                <div className='custom-dice-wrapper'>
                    <input
                        type="number"
                        min="1"
                        max="9999"
                        value={customDiceValue}
                        onChange={(e) => setCustomDiceValue(e.target.value)}
                        placeholder="Custom"
                        className='custom-dice-input'
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button 
                        onClick={handleCustomDiceRoll}
                        disabled={!customDiceValue || parseInt(customDiceValue) < 1}
                        className='custom-dice-roll-btn'
                    >
                        Roll
                    </button>
                </div>
            </HoverMenu>
        );
    };

    const SearchCardModal = () => {
        if (!searchModalOpen) return null;

        return (
            <div className="search-modal-overlay" onClick={closeModal}>
                <div className="search-modal-content" onClick={(e) => e.stopPropagation()}>
                    <button className="search-modal-close" onClick={closeModal}>✕</button>
                    <h2 className="search-modal-title">Insert Card/Token</h2>
                    <div className="search-mode-toggle">
                        <button
                            className={`toggle-btn${searchMode === 'card' ? ' active' : ''}`}
                            onClick={() => { setSearchMode('card'); setSearchResults([]); }}
                        >
                            Cards
                        </button>
                        <button
                            className={`toggle-btn${searchMode === 'token' ? ' active' : ''}`}
                            onClick={() => { setSearchMode('token'); setSearchResults([]); }}
                        >
                            Tokens
                        </button>
                    </div>
                    <div className="search-modal-body">
                        <div className="search-bar">
                            <input
                                type="text"
                                placeholder="Card name"
                                className="search-input"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                autoFocus
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
                                <div 
                                    key={card._id || card.scryfallId}
                                    className="card-item"
                                    onClick={() => handleInsertCard(card)}
                                >
                                    <img src={card.imageUrl} alt={card.name} className="card-image" />
                                    <div className="card-info">
                                        <p className="card-name">{card.name}</p>
                                        <p className="card-price">${card.priceValue?.toFixed(2) || '0.00'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <aside className={`left-rail${isCollapsed ? ' left-rail--collapsed' : ''}`}>
                <div className="left-rail-content">
                    <div className="left-rail-button-wrapper">
                        {!isCollapsed && (
                            <>
                            <button 
                                className="leave-game-button"
                                onClick={onLeaveGame}
                                title="Leave Game"
                                data-label="Leave Game"
                            >
                                <LogOut size={20} />
                                <span className="button-label">Leave Game</span>
                            </button>

                            <button 
                                className="left-rail-button dice-button"
                                onClick={() => setDiceMenuOpen(!diceMenuOpen)}
                                title="Roll Dice"
                                data-label="Roll Dice"
                            >
                                <Dices size={20} />
                                <span className="button-label">Roll Dice</span>
                            </button>
                            {diceMenuOpen && <DiceMenu />}

                            <button 
                                className="left-rail-button insert-card-button"
                                onClick={() => setSearchModalOpen(true)}
                                title="Insert Card/Token"
                                data-label="Insert Card"
                            >
                                <Plus size={20} />
                                <span className="button-label">Insert Card</span>
                            </button>

                            <button 
                                className="left-rail-button untap-all-button"
                                onClick={onUntapAll}
                                title="Untap All"
                                data-label="Untap All"
                            >
                                <Zap size={20} />
                                <span className="button-label">Untap All</span>
                            </button>

                            <button
                                className={`left-rail-button chat-button${chatOpen ? ' active' : ''}`}
                                onClick={onToggleChat}
                                title="Game Log"
                                data-label="Game Log"
                            >
                                <MessageSquare size={20} />
                                <span className="button-label">Game Log</span>
                            </button>
                            </>
                        )}
                    </div>
                </div>
            </aside>
            <SearchCardModal />
        </>
    );
};

export default LeftRail;