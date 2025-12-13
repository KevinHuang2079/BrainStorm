// frontend/contexts/webSocket.js
import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './auth'; 

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const { token } = useContext(AuthContext);

    useEffect(() => {
        if (!token) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
            setIsConnected(false);
            return;
        }

        // Create socket connection
        const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5002', {
            auth: {
                token: token
            },
            autoConnect: true,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        // Connection event handlers
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

        setSocket(newSocket);

        // Cleanup on unmount
        return () => {
            newSocket.disconnect();
        };
    }, [token]);

    return (
        <WebSocketContext.Provider value={{ 
            socket, 
            isConnected, 
            error 
        }}>
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