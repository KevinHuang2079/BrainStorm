import { useState, useMemo, useEffect } from 'react';
import '../../../styles/GameRoomItem.css';

const WARN_MS  = 1 * 60 * 1000;  // 1 minute
const CLOSE_MS = 5 * 60 * 1000;  // 5 minutes

function useInactivityCountdown(lastActivityAt) {
    const [now, setNow] = useState(Date.now());

    
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    if (!lastActivityAt) return null;

    const elapsed = now - new Date(lastActivityAt).getTime();
    const remaining = CLOSE_MS - elapsed;

    return {
        remaining: Math.max(0, remaining),
        isWarning: elapsed >= WARN_MS,
        pct: Math.min(100, (elapsed / CLOSE_MS) * 100),
    };
}

function formatCountdown(ms) {
    if (ms <= 0) return '0m';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

const GameRoomItem = ({ game, currentUser, onJoin, onLeave }) => {
    const [showConfirmLeave, setShowConfirmLeave] = useState(false);
    const countdown = useInactivityCountdown(game.lastActivityAt);

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

    useEffect(() => {
        console.log('current and unique players', currentUser, uniquePlayers);
    }, [currentUser, uniquePlayers])

    // console.log('isInGame check', 
    //     uniquePlayers.map(p => p._id?.toString()), 
    //     currentUser?._id?.toString()
    // );


    const isInGame = uniquePlayers.some(p => p._id?.toString() === currentUser?._id?.toString());
    const isFull = uniquePlayers.length >= game.maxPlayers;
    const fillPct = (uniquePlayers.length / game.maxPlayers) * 100;

    const getStatusClass = () => {
        if (isFull) return 'status-full';
        if (uniquePlayers.length <= 1) return 'status-waiting';
        return 'status-active';
    };

    const getStatusText = () => {
        if (isFull) return 'Full';
        if (uniquePlayers.length <= 1) return 'Waiting';
        return 'Active';
    };

    return (
        <>
            <div className={`gri-row ${isInGame ? 'gri-row--mine' : ''}`}>
                {/* Left: name + meta */}
                <div className="gri-main">
                    <span className="gri-name">{game.name}</span>
                    <span className="gri-meta">
                        <span className="gri-format">{game.format}</span>
                        <span className="gri-sep">·</span>
                        <span className="gri-host">Host: {game.host?.username || 'Unknown'}</span>
                    </span>

                    {/* Inactivity countdown */}
                    {countdown && (
                        <span className={`gri-inactivity ${countdown.isWarning ? 'gri-inactivity--warn' : ''}`}>
                            ⏱ Inactivity: Closes in {formatCountdown(countdown.remaining)}
                        </span>
                    )}
                </div>

                {/* Center: player pips */}
                <div className="gri-players">
                    {Array.from({ length: game.maxPlayers }).map((_, i) => {
                        const player = uniquePlayers[i];
                        return (
                            <div
                                key={i}
                                className={`gri-pip ${player ? 'gri-pip--filled' : 'gri-pip--empty'} ${player?._id?.toString() === game.host?._id?.toString() ? 'gri-pip--host' : ''}`}
                                title={player?.username || 'Open slot'}
                            >
                                {player ? player.username.charAt(0).toUpperCase() : ''}
                            </div>
                        );
                    })}
                    <span className="gri-count">{uniquePlayers.length}/{game.maxPlayers}</span>
                </div>

                {/* Right: status + actions */}
                <div className="gri-right">
                    <span className={`gri-status ${getStatusClass()}`}>{getStatusText()}</span>

                    {isInGame ? (
                        <div className="gri-actions">
                            <button className="gri-btn gri-btn--enter" onClick={onJoin}>
                                Enter
                            </button>
                            <button className="gri-btn gri-btn--leave" onClick={() => setShowConfirmLeave(true)}>
                                Leave
                            </button>
                        </div>
                    ) : isFull ? (
                        <button className="gri-btn gri-btn--disabled" disabled>Full</button>
                    ) : (
                        <button className="gri-btn gri-btn--join" onClick={onJoin}>
                            Join
                        </button>
                    )}
                </div>
            </div>

            {showConfirmLeave && (
                <div className="gri-overlay" onClick={() => setShowConfirmLeave(false)}>
                    <div className="gri-modal" onClick={e => e.stopPropagation()}>
                        <h3>Leave Game?</h3>
                        <p>Are you sure you want to leave <em>"{game.name}"</em>?</p>
                        <div className="gri-modal-actions">
                            <button className="gri-btn gri-btn--cancel" onClick={() => setShowConfirmLeave(false)}>
                                Cancel
                            </button>
                            <button className="gri-btn gri-btn--confirm-leave" onClick={() => { onLeave(); setShowConfirmLeave(false); }}>
                                Leave
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default GameRoomItem;