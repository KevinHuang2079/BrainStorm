import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../contexts/webSocket';
import {AuthContext} from '../contexts/auth';
import GameRoomItem from './GameRoomItem';
import '../styles/GameList.css';

const GameList = () => {
    const [games, setGames] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newGameData, setNewGameData] = useState({
        name: '',
        format: 'Commander',
        maxPlayers: 4
    });
    const { socket } = useWebSocket();
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    useEffect(() => {
        if (!socket) return;

        const handleGamesList = (gamesList) => {
            const uniqueGames = Array.from(
                new Map(gamesList.map(game => [game._id, game])).values()
            );
            setGames(uniqueGames);
        };

        const handleGameJoined = (game) => {
            navigate(`/game/${game._id}`);
        };

        socket.on('games:list', handleGamesList);
        socket.on('game:joined', handleGameJoined);

        return () => {
            socket.off('games:list', handleGamesList);
            socket.off('game:joined', handleGameJoined);
        };
    }, [socket, navigate]);

    const handleCreateGame = (e) => {
        e.preventDefault();
        if (!socket || !newGameData.name.trim()) return;

        socket.emit('game:create', newGameData);
        setShowCreateModal(false);
        setNewGameData({ name: '', format: 'Commander', maxPlayers: 4 });
    };

    const handleJoinGame = (gameId) => {
        if (!socket) return;
        socket.emit('game:join', { gameId });
    };

    const handleLeaveGame = (gameId) => {
        if (!socket) return;
        socket.emit('game:leave', { gameId });
    };

    return (
        <div className='GameList-container'>
            <div className='GameList-header'>
                <h1>Active Games</h1>
                <button 
                    className='btn-primary'
                    onClick={() => setShowCreateModal(true)}
                >
                    Create Game
                </button>
            </div>

            {games.length === 0 ? (
                <div className='GameList-empty'>
                    <p>No active games. Create one to get started!</p>
                </div>
            ) : (
                <div className='GameList-grid'>
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

            {showCreateModal && (
                <div className='game-list-modal-overlay' onClick={() => setShowCreateModal(false)}>
                    <div className='game-list-modal-content' onClick={(e) => e.stopPropagation()}>
                        <h2>Create New Game</h2>
                        <form onSubmit={handleCreateGame}>
                            <div className='form-group'>
                                <label>Game Name</label>
                                <input
                                    type='text'
                                    value={newGameData.name}
                                    onChange={(e) => setNewGameData({
                                        ...newGameData,
                                        name: e.target.value
                                    })}
                                    placeholder='Enter game name'
                                    required
                                />
                            </div>

                            <div className='form-group'>
                                <label>Format</label>
                                <select
                                    value={newGameData.format}
                                    onChange={(e) => setNewGameData({
                                        ...newGameData,
                                        format: e.target.value
                                    })}
                                >
                                    <option value='Commander'>Commander</option>
                                    <option value='Standard'>Standard</option>
                                    <option value='Modern'>Modern</option>
                                    <option value='Legacy'>Legacy</option>
                                    <option value='Vintage'>Vintage</option>
                                    <option value='Casual'>Casual</option>
                                </select>
                            </div>

                            <div className='form-group'>
                                <label>Max Players</label>
                                <select
                                    value={newGameData.maxPlayers}
                                    onChange={(e) => setNewGameData({
                                        ...newGameData,
                                        maxPlayers: parseInt(e.target.value)
                                    })}
                                >
                                    <option value={2}>2 Players</option>
                                    <option value={3}>3 Players</option>
                                    <option value={4}>4 Players</option>
                                </select>
                            </div>

                            <div className='modal-actions'>
                                <button 
                                    type='button' 
                                    className='btn-secondary'
                                    onClick={() => setShowCreateModal(false)}
                                >
                                    Cancel
                                </button>
                                <button type='submit' className='btn-primary'>
                                    Create Game
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameList;