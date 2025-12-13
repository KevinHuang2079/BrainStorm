import DeckList from '../components/DeckList';
import GameList from '../components/GameList';
import '../styles/HomePage.css';
import Particles from '../ogl/Particles';

export default function HomePage() {
  return (
    <>
      <div style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%', 
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none'
      }}>
        <Particles
          particleColors={['#ffffff', '#ffffff']}
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover={true}
          alphaParticles={false}
          disableRotation={false}
        />
      </div>
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="home-page">
          <h1 className="home-title">My Decks</h1>
          <DeckList />
          <GameList />
        </div>
      </div>
    </>
  );
}