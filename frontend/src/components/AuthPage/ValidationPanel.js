const ValidationPanel = ({ messages }) => {
    const visible = messages.length > 0;

    return (
        <>
            <style>{`
                .validation-panel {
                    min-height: 52px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    padding: 0 2px;
                    transition: opacity 0.3s ease;
                    opacity: 0;
                }
                .validation-panel.visible {
                    opacity: 1;
                }
                .validation-panel-header {
                    font-family: 'Cinzel', serif;
                    font-size: 0.55rem;
                    letter-spacing: 0.3em;
                    color: rgba(160, 56, 10, 0.85);
                    text-transform: uppercase;
                    margin-bottom: 2px;
                }
                .validation-message {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    font-family: 'Crimson Text', serif;
                    font-size: 13.5px;
                    font-style: italic;
                    color: #e07070;
                    line-height: 1.4;
                    animation: msgFadeIn 0.25s ease both;
                }
                .validation-message-glyph {
                    color: rgba(160, 56, 10, 0.7);
                    font-style: normal;
                    flex-shrink: 0;
                    margin-top: 1px;
                }
                @keyframes msgFadeIn {
                    from { opacity: 0; transform: translateX(-4px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
            `}</style>

            <div className={`validation-panel${visible ? ' visible' : ''}`}>
                {visible && (
                    <>
                        {messages.map((msg, i) => (
                            <div className="validation-message" key={i}>
                                <span className="validation-message-glyph">✦</span>
                                <span>{msg}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </>
    );
};

export default ValidationPanel;