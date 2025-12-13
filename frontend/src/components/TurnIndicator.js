import React, { useContext } from 'react';
import { AuthContext } from '../contexts/auth';
import '../styles/TurnIndicator.css';

const TurnIndicator = ({ game, currentTurn, onEndTurn, onStartGame, diceResult }) => {
    
    const { user } = useContext(AuthContext);
    
    if (!game) return null;

    const isHost = game.host._id === user._id;
    const gameStarted = game.status === 'active';
    
    if (diceResult) {
        return (
            <div className="turn-indicator dice-result">
                <span className="dice-result-text">
                    {diceResult.username} rolled {diceResult.result} (D{diceResult.sides})
                </span>
            </div>
        );
    }

    if (!gameStarted) {
        return (
            <div className="turn-indicator waiting">
                <span className="turn-indicator-text">
                    Waiting for all players...
                </span>
                {isHost && (
                    <button 
                        className="start-game-button"
                        onClick={onStartGame}
                    >
                        Start Game
                    </button>
                )}
            </div>
        );
    }

    if (!currentTurn) return null;

    const currentTurnId = typeof currentTurn === 'object' ? currentTurn._id : currentTurn;
    
    const currentPlayer = game.players.find(p => 
        p._id === currentTurnId || p._id.toString() === currentTurnId.toString()
    );
    
    const currentPlayerName = currentPlayer?.username || 'Unknown';
    const isMyTurn = currentTurnId === user._id || currentTurnId.toString() === user._id.toString();

    return (
        <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
            <span className="turn-indicator-text">
                {isMyTurn ? "Your Turn" : `${currentPlayerName}'s Turn`}
            </span>
            {isMyTurn && (
                <button 
                    className="end-turn-button"
                    onClick={onEndTurn}
                >
                    End Turn
                </button>
            )}
        </div>
    );
};

export default TurnIndicator;