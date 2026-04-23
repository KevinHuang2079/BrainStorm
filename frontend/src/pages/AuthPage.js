import React from 'react';
import { useState } from 'react';
import Login from '../components/AuthPage/Login';
import Register from '../components/AuthPage/Register';
import Lightning from '../ogl/Lightning';
import PasswordRecovery from '../components/AuthPage/PasswordRecovery';

const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [isRecovery, setIsRecovery] = useState(false);

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;900&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');

                :root {
                    --gold: #c9a84c;
                    --gold-light: #e8c97a;
                    --gold-dim: #7a5f28;
                    --blue-arcane: #4a8fd4;
                    --blue-dim: #1e3a5f;
                    --ember: #a0380a;
                    --void: #06060f;
                    --surface: #0a0a18;
                    --border-gold: rgba(201,168,76,0.2);
                    --border-blue: rgba(74,143,212,0.25);
                }

                .auth-page {
                    font-family: 'Crimson Text', serif;
                }

                /* Void bg with blue-tinted radial */
                .auth-void-bg {
                    background: transparent; 
                }

                .auth-panel {
                    background: linear-gradient(
                        160deg,
                        rgba(10,10,28,0.06) 0%,    
                        rgba(8,8,20,0.88) 50%,
                        rgba(12,10,22,0.80) 100%
                    );
                    backdrop-filter: blur(1.5px);     
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(74,143,212,0.35);   
                    box-shadow:
                        inset 0 1px 0 rgba(74,143,212,0.15),
                        0 0 80px rgba(74,143,212,0.08),
                        0 16px 64px rgba(0,0,0,0.9); 
                }

                /* Corner ornaments */
                .auth-panel::before,
                .auth-panel::after {
                    content: '';
                    position: absolute;
                    width: 18px;
                    height: 18px;
                    border-color: var(--gold-dim);
                    border-style: solid;
                    opacity: 0.5;
                    z-index: 0;
                }
                .auth-panel::before { top: 10px; left: 10px; border-width: 1px 0 0 1px; }
                .auth-panel::after  { bottom: 10px; right: 10px; border-width: 0 1px 1px 0; }

                /* Title */
                .auth-title {
                    font-family: 'Cinzel', serif;
                    font-weight: 900;
                    font-size: 2.4rem;
                    letter-spacing: 0.06em;
                    background: linear-gradient(160deg, #e8c97a 0%, #c9a84c 45%, #7a5f28 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    filter: drop-shadow(0 0 18px rgba(201,168,76,0.25));
                    text-align: center;
                    line-height: 1.1;
                    filter: drop-shadow(0 0 18px rgba(201,168,76,0.25))
                            drop-shadow(0 2px 12px rgba(0,0,0,0.9));
                }

                .auth-eyebrow {
                    font-family: 'Cinzel', serif;
                    font-size: 0.6rem;
                    letter-spacing: 0.45em;
                    color: #a0380a;
                    text-transform: uppercase;
                    text-align: center;
                    text-shadow: 0 1px 8px rgba(0,0,0,0.95), 0 0 20px rgba(160,56,10,0.3);
                }

                /* Rune divider */
                .rune-divider {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .rune-divider::before,
                .rune-divider::after {
                    content: '';
                    flex: 1;
                    height: 1px;
                    background: linear-gradient(to right, transparent, var(--gold-dim), transparent);
                }
                .rune-diamond {
                    width: 5px;
                    height: 5px;
                    background: var(--gold);
                    transform: rotate(45deg);
                    box-shadow: 0 0 8px var(--gold), 0 0 2px rgba(0,0,0,0.9);
                    flex-shrink: 0;
                }

                /* Inputs */
                .auth-input {
                    width: 100%;
                    padding: 13px 16px;
                    background: rgba(74,143,212,0.04);
                    border: 1px solid rgba(74,143,212,0.2);
                    border-radius: 4px;
                    font-size: 15px;
                    font-family: 'Crimson Text', serif;
                    color: #d8cfc4;
                    transition: border-color 0.25s ease, box-shadow 0.25s ease;
                    box-sizing: border-box;
                    letter-spacing: 0.03em;
                }
                .auth-input:focus {
                    outline: none;
                    border-color: rgba(201,168,76,0.45);
                    box-shadow: 0 0 0 3px rgba(201,168,76,0.07), 0 0 16px rgba(201,168,76,0.08);
                }
                .auth-input::placeholder {
                    color: rgba(201,168,76,0.25);
                    font-style: italic;
                }
                .auth-input:-webkit-autofill,
                .auth-input:-webkit-autofill:focus {
                    -webkit-box-shadow: 0 0 0 1000px #0a0a18 inset;
                    -webkit-text-fill-color: #d8cfc4;
                    caret-color: #d8cfc4;
                    transition: background-color 5000s ease-in-out 0s;
                }

                /* Submit button */
                .auth-submit {
                    width: 100%;
                    padding: 13px;
                    background: linear-gradient(135deg, rgba(201,168,76,0.1), rgba(201,168,76,0.04));
                    color: var(--gold-light);
                    border: 1px solid rgba(201,168,76,0.35);
                    border-radius: 4px;
                    font-family: 'Cinzel', serif;
                    font-size: 0.8rem;
                    font-weight: 600;
                    letter-spacing: 0.2em;
                    text-transform: uppercase;
                    cursor: pointer;
                    transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
                    position: relative;
                    overflow: hidden;
                }
                .auth-submit:hover {
                    background: linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.08));
                    border-color: rgba(201,168,76,0.6);
                    box-shadow: 0 0 20px rgba(201,168,76,0.12);
                }
                .auth-submit:active {
                    box-shadow: none;
                    transform: translateY(1px);
                }

                /* Toggle link */
                .auth-toggle-btn {
                    display: inline;
                    background: transparent;
                    border: none;
                    padding: 0;
                    font-family: 'Crimson Text', serif;
                    font-size: 15px;
                    color: var(--gold);
                    cursor: pointer;
                    text-decoration: underline;
                    text-decoration-color: rgba(201,168,76,0.4);
                    text-underline-offset: 3px;
                    transition: color 0.2s ease, text-decoration-color 0.2s ease;
                }
                .auth-toggle-btn:hover {
                    color: var(--gold-light);
                    text-decoration-color: rgba(232,201,122,0.8);
                }

                /* Toggle text */
                .auth-toggle-text {
                    color: rgba(201,168,76,0.45);
                    font-size: 15px;
                    text-align: center;
                    font-style: italic;
                    margin-top: 20px;
                }

                /* Error */
                .auth-error {
                    color: #e07070;
                    font-size: 14px;
                    min-height: 20px;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                    text-align: center;
                    padding: 6px 8px;
                    font-style: italic;
                }
                .auth-error.visible { opacity: 1; }

                /* Mana watermark circle */
                .mana-mark {
                    position: absolute;
                    right: -30px; top: 50%;
                    transform: translateY(-50%);
                    width: 140px; height: 140px;
                    border: 1px solid rgba(74,143,212,0.08);
                    border-radius: 50%;
                    pointer-events: none;
                }
                .mana-mark::before {
                    content: '';
                    position: absolute;
                    inset: 14px;
                    border: 1px solid rgba(74,143,212,0.05);
                    border-radius: 50%;
                }

                /* Fade in */
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .fade-up { animation: fadeUp 0.65s ease both; }
                .delay-1 { animation-delay: 0.1s; }
            `}</style>

            {/* Lightning background */}
            <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: 'rgba(6,6,15,0.55)' }}>
                <Lightning
                    hue={.89}
                    xOffset={0.3}
                    speed={0.4}
                    intensity={0.4}
                    size={1}
                />
            </div>

            {/* Page */}
            <div className="auth-page auth-void-bg relative z-10 min-h-screen flex flex-col items-center justify-center px-5 py-12">

                {/* Header above panel */}
                <div className="fade-up flex flex-col items-center gap-2 mb-8"  
                    style={{
                        background: 'radial-gradient(ellipse at center, rgba(6,6,15,0.6) 0%, transparent 70%)',
                        padding: '16px 40px',
                        borderRadius: '12px',
                    }}>
                    <span className="auth-eyebrow">MTG Tabletop Simulator</span>
                    <h1 className="auth-title">
                        BRAINSTORM
                    </h1>
                    <div className="rune-divider w-48 mt-1">
                        <div className="rune-diamond" />
                        <div className="rune-diamond" />
                        <div className="rune-diamond" />
                    </div>
                </div>

                {/* Auth panel */}
                <div className="auth-panel fade-up delay-1 rounded-sm w-full max-w-sm px-8 py-8 flex flex-col gap-5">
                    <div className="mana-mark" />
                    {isRecovery
                        ? <PasswordRecovery setIsLogin={setIsLogin} setIsRecovery={setIsRecovery} />
                        : isLogin
                            ? <Login setIsLogin={setIsLogin} setIsRecovery={setIsRecovery} />
                            : <Register setIsLogin={setIsLogin} />
                    }
                </div>

                {/* Footer rune */}
                <div className="fade-up mt-8">
                    <div className="rune-divider w-32">
                        <div className="rune-diamond" />
                    </div>
                </div>
            </div>
        </>
    );
};

export default AuthPage;


//todo: CAPTCHA on Registration Add Google reCAPTCHA v3 (invisible, no checkbox) or Cloudflare Turnstile (more privacy-friendly). This is the single biggest win against bot signups. Frontend sends a token, backend verifies it with the provider's API before creating the account.
