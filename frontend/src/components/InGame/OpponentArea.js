import { useState, useContext } from 'react';
import { createPortal } from 'react-dom';   // ← add this
import { AuthContext } from '../../contexts/auth';
import ZoneViewingModal from './ZoneViewingModal';
import '../../styles/OpponentInfo.css';

const OpponentInfo = ({ opponent, game, playerStates }) => {
    const [viewingZone, setViewingZone] = useState(null);
    const [zonesOpen, setZonesOpen] = useState(false);

    const lifeTotal = opponent.lifeTotal ?? (game?.format === 'commander' ? 40 : 20);

    const zones = [
        { label: 'Library',   key: 'library',   count: opponent.library?.length   ?? 0 },
        { label: 'Graveyard', key: 'graveyard',  count: opponent.graveyard?.length ?? 0 },
        { label: 'Exile',     key: 'exile',      count: opponent.exile?.length     ?? 0 },
        { label: 'Face Down', key: 'facedown',   count: opponent.facedown?.length  ?? 0 },
        { label: 'Sideboard', key: 'sideboard',  count: opponent.sideboard?.length ?? 0 },
    ];

    return (
        <div className="opp-info">
            <span className="opp-username">{opponent.username}</span>

            <div className="opp-life-box">
                <span className="opp-life-icon">♥</span>
                <span className="opp-life-val">{lifeTotal}</span>
            </div>

            <div className="opp-zones-anchor">
                <button className="opp-zones-btn" onClick={() => setZonesOpen(p => !p)}>
                    <span className="opp-zones-grid-icon">⊞</span>
                    <span>zones</span>
                </button>
                {zonesOpen && (
                    <>
                        <div className="opp-zones-backdrop" onClick={() => setZonesOpen(false)} />
                        <div className="opp-zones-popover">
                            {zones.map(z => (
                                <button
                                    key={z.key}
                                    className="opp-zones-row"
                                    onClick={() => { setViewingZone(z); setZonesOpen(false); }}
                                >
                                    <span>{z.label}</span>
                                    <span className="opp-zones-count">{z.count}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {opponent.poisonCounters > 0 && <span className="opp-badge">☠ {opponent.poisonCounters}</span>}
            {opponent.energy         > 0 && <span className="opp-badge">⚡ {opponent.energy}</span>}
            {(opponent.customCounters || []).filter(c => c.value > 0).map((c, i) => (
                <span key={i} className="opp-badge">◆ {c.value}</span>
            ))}

            {viewingZone && createPortal(  
                <ZoneViewingModal
                    zoneName={viewingZone.label}
                    onClose={() => setViewingZone(null)}
                    playerStates={playerStates}
                    userId={opponent._id}
                    readOnly
                    isOpponent={true}
                    targetPlayerId={opponent._id}
                />,
                document.body              
            )}
        </div>
    );
};

const OpponentArea = ({ game, playerStates }) => {
    const { user } = useContext(AuthContext);
    const opponents = Object.values(playerStates).filter(p => p._id !== user._id);

    if (opponents.length === 0) return null;

    return (
        <div className="opponent-area">
            {opponents.map(opp => (
                <OpponentInfo
                    key={opp._id}
                    opponent={opp}
                    game={game}
                    playerStates={playerStates}
                />
            ))}
        </div>
    );
};

export default OpponentArea;