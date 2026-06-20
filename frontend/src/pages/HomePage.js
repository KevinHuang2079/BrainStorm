import { useState,useEffect,useRef } from 'react';
import DeckList from '../components/HomePage/DeckList/DeckList';
import GameList from '../components/HomePage/MatchList/GameList';
import HomeBackground from '../components/HomePage/HomeBackground';
import { authAPI, getCurrentUser } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const isMobile = () => window.innerWidth <= 768;
  const [showMobileBanner, setShowMobileBanner] = useState(isMobile());
  const dismissed = useRef(false);

  useEffect(() => {
    const handleResize = () => {
      if (!dismissed.current) setShowMobileBanner(isMobile());
      else setShowMobileBanner(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDismiss = () => {
    dismissed.current = true;
    setShowMobileBanner(false);
  };

  const navigate = useNavigate();
  const handleLogout = async () => {
    await authAPI.logout();
    navigate('/login');
  };
  
  return (
    <>
      {/* Google Fonts - Cinzel (display) + Crimson Text (body) */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;900&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');

        :root {
          --gold: #c9a84c;
          --gold-light: #e8c97a;
          --gold-dim: #7a5f28;
          --ember: #a0380a;
          --void: #08080f;
          --surface: #0e0e1a;
          --border: rgba(201,168,76,0.2);
        }

        .mtg-page { font-family: 'Crimson Text', serif; }

        /* ── Navbar ── */
        .mtg-navbar {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 44px;
          background: rgba(8,8,15,0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(201,168,76,0.15);
          box-shadow: 0 1px 24px rgba(0,0,0,0.6);
        }

        .mtg-navbar-eyebrow {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.45em;
          color: var(--ember);
          text-transform: uppercase;
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          top: 6px;
          white-space: nowrap;
          pointer-events: none;
        }

        .mtg-logout-btn {
          position: absolute;
          right: 16px;
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gold-dim);
          background: transparent;
          border: 1px solid rgba(201,168,76,0.2);
          padding: 4px 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .mtg-logout-btn:hover {
          color: var(--gold-light);
          border-color: rgba(201,168,76,0.5);
          box-shadow: 0 0 10px rgba(201,168,76,0.15);
          background: rgba(201,168,76,0.05);
        }

        .mtg-navbar-title {
          font-family: 'Cinzel', serif;
          font-weight: 900;
          font-size: 1.05rem;
          letter-spacing: 0.12em;
          background: linear-gradient(160deg, #e8c97a 0%, #c9a84c 45%, #7a5f28 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: drop-shadow(0 0 10px rgba(201,168,76,0.3));
          line-height: 1;
        }

        /* Thin rune accents flanking the title */
        .mtg-navbar-rune {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 14px;
        }
        .mtg-navbar-rune::before,
        .mtg-navbar-rune::after {
          content: '';
          width: 32px;
          height: 1px;
          background: linear-gradient(to right, transparent, var(--gold-dim));
        }
        .mtg-navbar-rune::after {
          background: linear-gradient(to left, transparent, var(--gold-dim));
        }
        .navbar-diamond {
          width: 4px;
          height: 4px;
          background: var(--gold);
          transform: rotate(45deg);
          box-shadow: 0 0 5px var(--gold);
          flex-shrink: 0;
        }

        .section-heading {
          font-family: 'Cinzel', serif;
          font-weight: 600;
          font-size: 0.7rem;
          letter-spacing: 0.35em;
          color: var(--gold-dim);
          text-transform: uppercase;
        }

        /* Runic divider */
        .rune-divider {
          display: flex;
          align-items: center;
          gap: 1px;
                   color: var(--gold-dim);
        }
        .rune-divider::before,
        .rune-divider::after {
          content: '';
          flex: 1;
          height: .8px;
          background: linear-gradient(to right, transparent, var(--gold-dim), transparent);
        }
        .rune-diamond {
          width: 3px;
          height: 3px;
          background: var(--gold);
          transform: rotate(45deg);
          box-shadow: 0 0 4px var(--gold);
          flex-shrink: 0;
        }

        /* Void background */
        .void-bg {
          background:
            radial-gradient(ellipse 60% 50% at 50% 0%, rgba(160,56,10,0.12) 0%, transparent 70%),
            radial-gradient(ellipse 80% 60% at 20% 80%, rgba(201,168,76,0.05) 0%, transparent 60%),
        }

        /* Arcane panel */
        .arcane-panel {
          background: linear-gradient(135deg, rgba(201,168,76,0.04) 0%, rgba(14,14,26,0.9) 50%, rgba(201,168,76,0.02) 100%);
          border: 1px solid var(--border);
          box-shadow:
            inset 0 1px 0 rgba(201,168,76,0.1),
            0 4px 32px rgba(0,0,0,0.6);
          position: relative;
          overflow: hidden;
        }
        .arcane-panel::before,
        .arcane-panel::after {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          border-color: var(--gold-dim);
          border-style: solid;
          opacity: 0.6;
        }
        .arcane-panel::before {
          top: 8px; left: 8px;
          border-width: 1px 0 0 1px;
        }
        .arcane-panel::after {
          bottom: 8px; right: 8px;
          border-width: 0 1px 1px 0;
        }

        /* Mana pip watermark */
        .mana-watermark {
          position: absolute;
          right: -20px;
          top: 50%;
          transform: translateY(-50%);
          width: 120px;
          height: 120px;
          opacity: 0.03;
          border: 1px solid var(--gold);
          border-radius: 50%;
        }
        .mana-watermark::before {
          content: '';
          position: absolute;
          inset: 10px;
          border: 1px solid var(--gold);
          border-radius: 50%;
        }

        /* Fade-in animation */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.25s; }
        .delay-3 { animation-delay: 0.4s; }
        .mobile-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: #3a3a3a;
          color: #d1d1d1;
          font-family: 'Crimson Text', serif;
          font-size: 0.85rem;
          padding: 10px 14px;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .mobile-banner-dismiss {
          background: transparent;
          border: 1px solid #5a5a5a;
          color: #b0b0b0;
          font-size: 0.75rem;
          padding: 4px 10px;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>

      <HomeBackground/>

      {/* Mobile Warning/Disclaimer */}
      {showMobileBanner && (
      <div className="mobile-banner">
        <span>For the best experience, try this on desktop.</span>
        <button className="mobile-banner-dismiss" onClick={() => setShowMobileBanner(false)}>
          Yeah whatever
        </button>
      </div>
    )}

      {/* Sticky Navbar */}
      <nav className="mtg-navbar fade-up" style={{ top: showMobileBanner ? '41px' : '0' }}>
        <div className="mtg-navbar-rune">
          <div className="navbar-diamond" />
          <span className="mtg-navbar-title">BRAINSTORM</span>
          <div className="navbar-diamond" />
        </div>
        <button className="mtg-logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </nav>

      {/* Main content */}
      <div className="mtg-page void-bg relative min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col gap-14">

          {/* Deck section */}
          <section className="fade-up delay-1 flex flex-col gap-5">
            <div className="rune-divider">
              <span className="section-heading">Decks</span>
            </div>
            <div className="arcane-panel rounded-sm p-5">
              <div className="mana-watermark" />
              <DeckList />
            </div>
          </section>

          {/* Game section */}
          <section className="fade-up delay-2 flex flex-col gap-5">
            <div className="rune-divider">
              <span className="section-heading">Matches</span>
            </div>
            <div className="arcane-panel rounded-sm p-5">
              <div className="mana-watermark" />
              <GameList />
            </div>
          </section>

          {/* Footer rune */}
          <footer className="fade-up delay-3 flex justify-center pt-4">
            <div className="rune-divider w-48">
              <div className="rune-diamond" />
            </div>
          </footer>

        </div>
      </div>
    </>
  );
}