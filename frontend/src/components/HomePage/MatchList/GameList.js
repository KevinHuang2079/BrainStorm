import { useState, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../../../contexts/webSocket';
import { AuthContext } from '../../../contexts/auth';
import GameRoomItem from './GameRoomItem';
import '../../../styles/GameList.css';

const FORMATS = ['Commander', 'Standard', 'Modern', 'Legacy', 'Vintage', 'Casual'];

const GameList = () => {
  const [games, setGames] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGameData, setNewGameData] = useState({ name: '', format: 'Commander', maxPlayers: 4 });
  const { socket } = useWebSocket();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  
  useEffect(() => {
    if (!socket) return;
    const handleGamesList = (gamesList) => {
      setGames(Array.from(new Map(gamesList.map(g => [g._id, g])).values()));
    };
    const handleGameJoined = (game) => navigate(`/game/${game._id}`);
    socket.on('games:list', handleGamesList);
    socket.on('game:joined', handleGameJoined);
    return () => {
      socket.off('games:list', handleGamesList);
      socket.off('game:joined', handleGameJoined);
    };
  }, [socket, navigate]);

  const handleCreateGame = () => {
    if (!socket || !newGameData.name.trim()) return;
    socket.emit('game:create', newGameData);
    setShowCreateModal(false);
    setNewGameData({ name: '', format: 'Commander', maxPlayers: 4 });
  };

  const handleJoinGame  = (gameId) => socket?.emit('game:join',  { gameId });
  const handleLeaveGame = (gameId) => socket?.emit('game:leave', { gameId });

  const closeModal = () => setShowCreateModal(false);

  return (
    <div className="gl-container">

      <div className="gl-header">
        <span className="gl-section-label">Active Games</span>
        <button className="gl-create-btn" onClick={() => setShowCreateModal(true)}>
          + New Game
        </button>
      </div>

      {games.length === 0 ? (
        <div className="gl-empty">
          <span className="gl-empty-icon">⚔</span>
          <p>No active games — create one to begin.</p>
        </div>
      ) : (
        <div className="gl-list">
          {games.map(game => (
            <GameRoomItem
              key={game._id}
              game={game}
              currentUser={user}
              onJoin={() => handleJoinGame(game._id)}
              onLeave={() => handleLeaveGame(game._id)}
            />
          ))}
        </div>

      )}

      {showCreateModal && createPortal(
        <div className="gl-overlay" onClick={closeModal}>
          <div className="gl-panel" onClick={(e) => e.stopPropagation()}>

            <div className="gl-modal-header">
              <span className="gl-eyebrow">New Game</span>
              <button className="gl-close" onClick={closeModal} aria-label="Close">✕</button>
            </div>

            <div className="gl-modal-body">
              <div className="gl-field">
                <label className="gl-label" htmlFor="game-name">Game Name</label>
                <input
                  id="game-name"
                  type="text"
                  className="gl-input"
                  placeholder="e.g. Friday Night EDH"
                  value={newGameData.name}
                  onChange={(e) => setNewGameData({ ...newGameData, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateGame()}
                  autoFocus
                />
              </div>

              <div className="gl-field">
                <label className="gl-label" htmlFor="game-format">Format</label>
                <select
                  id="game-format"
                  className="gl-select"
                  value={newGameData.format}
                  onChange={(e) => setNewGameData({ ...newGameData, format: e.target.value })}
                >
                  {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div className="gl-field">
                <label className="gl-label" htmlFor="game-players">Max Players</label>
                <select
                  id="game-players"
                  className="gl-select"
                  value={newGameData.maxPlayers}
                  onChange={(e) => setNewGameData({ ...newGameData, maxPlayers: parseInt(e.target.value) })}
                >
                  {[2, 3, 4].map(n => <option key={n} value={n}>{n} Players</option>)}
                </select>
              </div>
            </div>

            <div className="gl-modal-footer">
              <button className="gl-cancel-btn" onClick={closeModal}>Cancel</button>
              <button
                className="gl-submit-btn"
                onClick={handleCreateGame}
                disabled={!newGameData.name.trim()}
              >
                Create Game
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default GameList;