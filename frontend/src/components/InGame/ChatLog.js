import { useEffect, useRef } from 'react';
import '../../styles/ChatLog.css';

const ACTION_LABELS = {
    play:               (e) => `played ${e.cardName || 'a card'}`,
    playFaceDown:       (e) => `played ${e.cardName || 'a card'} face down`,
    move:               (e) => `moved ${e.cardName || 'a card'}`,
    moveToLibraryTop:   (e) => `put ${e.cardName || 'a card'} on top of library`,
    moveToLibraryBottom:(e) => `put ${e.cardName || 'a card'} on bottom of library`,
    drawCard:           (e) => `drew ${e.extra?.count > 1 ? `${e.extra.count} cards` : 'a card'}`,
    mulligan:           (e) => `took a mulligan to ${e.extra?.count ?? '?'}`,
    tapCard:            (e) => e.extra?.isTapped ? `tapped ${e.cardName || 'a card'}` : `untapped ${e.cardName || 'a card'}`,
    toggleFaceDown:     (e) => e.extra?.isFaceDown ? `turned ${e.cardName || 'a card'} face down` : `turned ${e.cardName || 'a card'} face up`,
    toggleAltFace:      (e) => `transformed ${e.cardName || 'a card'}`,
    addCounter:         (e) => `added a counter to ${e.cardName || 'a card'}`,
    removeCounter:      (e) => `removed a counter from ${e.cardName || 'a card'}`,
    incrementCounter:   (e) => `changed counters on ${e.cardName || 'a card'}`,
    cloneCard:          (e) => `copied ${e.cardName || 'a card'}`,
    shuffleLibrary:     ()  => `shuffled their library`,
    scoopDeck:          ()  => `scooped`,
    changeLifeTotal:    (e) => e.extra ? `changed life total: ${e.extra.from} → ${e.extra.to}` : `changed their life total`,
    changeCounter:      (e) => e.extra ? `changed ${e.extra.counterType}: ${e.extra.from} → ${e.extra.to}` : `changed a counter`,
    loadDeck:           ()  => `loaded their deck`,
    repositionCard:     ()  => null,
    shakeCard:          ()  => null,
    shakeOpponentCard:  ()  => null,
    rollDice:           (e) => `rolled a d${e.extra?.sides} — got ${e.extra?.result}`,
};

const formatEntry = (entry) => {
    const fn = ACTION_LABELS[entry.action];
    if (!fn) return `performed ${entry.action}`;
    return fn(entry);
};

const ChatLog = ({ messages, isOpen }) => {
    const bottomRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    //collapse consecutive identical actions by the same user into one entry with a count
    const collapsed = messages.reduce((acc, entry) => {
        if (entry.type === 'turn-divider') {
            acc.push({ ...entry, _count: 1 });
            return acc;
        }

        const text = formatEntry(entry);
        if (!text) return acc;

        const prev = acc[acc.length - 1];
        const isSame =
            prev &&
            prev.type === 'action' &&
            prev._username === entry.username &&
            prev._text === text;

        if (isSame) {
            prev._count += 1;
        } else {
            acc.push({
                ...entry,
                type: 'action',
                _username: entry.username,
                _text: text,
                _count: 1
            });
        }

        return acc;
    }, []);

    if (!isOpen) return null;

    return (
        <div className="chat-log-panel">
            <div className="chat-log-header">
                <span className="chat-log-title">Game Log</span>
            </div>
            <div className="chat-log-body">
                {collapsed.length === 0 && (
                    <p className="chat-log-empty">No actions yet.</p>
                )}
                {collapsed.map((entry, i) => {
                    if (entry.type === 'turn-divider') {
                        return (
                            <div key={i} className="chat-log-divider">
                                <span className="chat-log-divider-line" />
                                <span className="chat-log-divider-label">Turn {entry.turn}</span>
                                <span className="chat-log-divider-line" />
                            </div>
                        );
                    }

                    return (
                        <div key={i} className="chat-log-entry">
                            <span className="chat-log-username">{entry._username}</span>
                            <span className="chat-log-action"> {entry._text}</span>
                            {entry._count > 1 && (
                                <span className="chat-log-count"> ({entry._count})</span>
                            )}
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};

export default ChatLog;