import './App.css';
import AuthProvider, { AuthContext } from './contexts/auth'; 
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { WebSocketProvider } from './contexts/webSocket';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import GameRoomPage from './pages/GameRoomPage';
import { useContext } from 'react';

function AppRoutes() {
  const { token, logout } = useContext(AuthContext);
  const location = useLocation();
  
  // Check if we're on a game room page
  const isGameRoom = location.pathname.startsWith('/game/');

  return (
    <div className="App">
      {token && !isGameRoom && (
        <div className="top-bar">
          <button className="logout-button" onClick={() => logout()}>Logout</button>
        </div>)
      }
      <Routes>
        <Route 
          path="/auth" 
          element={token ? <Navigate to="/home" replace /> : <AuthPage />} 
        />
        <Route 
          path="/home" 
          element={token ? <HomePage /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="/game/:gameId" 
          element={token ? <GameRoomPage /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="/" 
          element={token ? <Navigate to="/home" replace /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="*" 
          element={token ? <Navigate to="/home" replace /> : <Navigate to="/auth" replace />} 
        />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <WebSocketProvider>
          <AppRoutes />
        </WebSocketProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;