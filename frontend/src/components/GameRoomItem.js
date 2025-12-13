import { useState, useMemo } from 'react';
import '../styles/GameRoomItem.css';

const GameRoomItem = ({ game, currentUser, onJoin, onLeave }) => {
    const [showConfirmLeave, setShowConfirmLeave] = useState(false);
    
    const uniquePlayers = useMemo(() => {
        if (!game.players) return [];
        const seen = new Set();
        return game.players.filter(player => {
            if (!player?._id) return false;
            const id = player._id.toString();
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }, [game.players]);
    
    const isInGame = uniquePlayers.some(p => p._id === currentUser?._id);
    const isFull = uniquePlayers.length >= game.maxPlayers;

    const getStatusColor = () => {
        if (isFull) return 'status-full';
        if (uniquePlayers.length === 1) return 'status-waiting';
        return 'status-active';
    };

    const getStatusText = () => {
        if (isFull) return 'Full';
        if (uniquePlayers.length === 1) return 'Waiting';
        return 'In Progress';
    };

    const handleJoinAction = () => {
        if (isInGame) {
            onJoin();
        } else if (!isFull) {
            onJoin();
        }
    };

    return (
        <div className='GameRoomItem-container'>
            <div className='GameRoomItem-header'>
                <div className='game-info'>
                    <h3>{game.name}</h3>
                    <span className={`game-status ${getStatusColor()}`}>
                        {getStatusText()}
                    </span>
                </div>
            </div>

            <div className='GameRoomItem-details'>
                <div className='detail-row'>
                    <span className='label'>Format:</span>
                    <span className='value'>{game.format}</span>
                </div>
                <div className='detail-row'>
                    <span className='label'>Host:</span>
                    <span className='value'>{game.host?.username || 'Unknown'}</span>
                </div>
                <div className='detail-row'>
                    <span className='label'>Players:</span>
                    <span className='value'>
                        {uniquePlayers.length} / {game.maxPlayers}
                    </span>
                </div>
            </div>

            <div className='GameRoomItem-players'>
                {uniquePlayers.map(player => (
                    <div key={player._id} className='player-chip'>
                        {player.username}
                        {player._id === game.host?._id && (
                            <span className='host-badge'>Host</span>
                        )}
                    </div>
                ))}
            </div>

            <div className='GameRoomItem-actions'>
                {isInGame ? (
                    <>
                        <button className='btn-primary' onClick={handleJoinAction}>
                            Enter Game
                        </button>
                        <button 
                            className='btn-secondary'
                            onClick={() => setShowConfirmLeave(true)}
                        >
                            Leave Game
                        </button>
                    </>
                ) : isFull ? (
                    <button className='btn-disabled btn-full' disabled>
                        Game Full
                    </button>
                ) : (
                    <button className='btn-primary btn-full' onClick={handleJoinAction}>
                        Join Game
                    </button>
                )}
            </div>

            {showConfirmLeave && (
                <div className='room-modal-overlay' onClick={() => setShowConfirmLeave(false)}>
                    <div className='room-modal-content' onClick={(e) => e.stopPropagation()}>
                        <h3>Leave Game?</h3>
                        <p>Are you sure you want to leave "{game.name}"?</p>
                        <div className='modal-actions'>
                            <button 
                                className='btn-secondary'
                                onClick={() => setShowConfirmLeave(false)}
                            >
                                Cancel
                            </button>
                            <button 
                                className='btn-danger'
                                onClick={() => {
                                    onLeave();
                                    setShowConfirmLeave(false);
                                }}
                            >
                                Leave
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameRoomItem;