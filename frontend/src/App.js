import './App.css';
import AuthProvider, { AuthContext } from './contexts/auth'; 
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { WebSocketProvider } from './contexts/webSocket';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import GameRoomPage from './pages/GameRoomPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { useContext } from 'react';

function AppRoutes() {
  const { user, loading, logout } = useContext(AuthContext);
  const location = useLocation();
  
  const isGameRoom = location.pathname.startsWith('/game/');

  if (loading) return null;

  return (
    <div className="App">
      {/* {user && !isGameRoom && (
        <div className="top-bar">
          <button className="logout-button" onClick={() => logout()}>Logout</button>
        </div>)
      } */}
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        
        <Route 
          path="/" 
          element={user ? <Navigate to="/home" replace /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="*" 
          element={user ? <Navigate to="/home" replace /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="/home" 
          element={user ? <HomePage /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="/game/:gameId" 
          element={user ? <GameRoomPage /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="/auth" 
          element={user ? <Navigate to="/home" replace /> : <AuthPage />} 
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