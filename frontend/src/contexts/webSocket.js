// frontend/contexts/webSocket.js
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './auth';

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
    const socketRef = useRef(null); 
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const { user } = useContext(AuthContext);

    useEffect(() => {
        if (!user) {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            setIsConnected(false);
            return;
        }

        const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5002', {
            withCredentials: true,
            autoConnect: true,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
        });

        newSocket.on('connect', () => {
            console.log('WebSocket connected:', newSocket.id);
            setIsConnected(true);
            setError(null);
        });

        newSocket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            setIsConnected(false);
        });

        newSocket.on('connect_error', (err) => {
            console.error('WebSocket connection error:', err.message);
            setError(err.message);
            setIsConnected(false);
        });

        newSocket.on('error', (err) => {
            console.error('WebSocket error:', err);
            setError(err.message || 'An error occurred');
        });

        socketRef.current = newSocket;

        return () => {
            newSocket.disconnect();
            socketRef.current = null;
        };
    }, [user]);

    return (
        <WebSocketContext.Provider value={{ socket: socketRef.current, isConnected, error }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within WebSocketProvider');
    }
    return context;
};