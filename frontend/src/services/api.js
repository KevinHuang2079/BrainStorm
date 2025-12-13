import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002/api';
console.log('Final API_BASE_URL:', API_BASE_URL);

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    config => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (err) => {
        return Promise.reject(err);
    }
);

// Response interceptor for error handling
api.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    login: async(loginData) => {
        const response = await api.post('/auth/login', loginData);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        localStorage.setItem('token', response.data.token);
        return response.data;
    },
    register: async(signupData) => {
        const response = await api.post('/auth/register', signupData);
        if (response.data.token) {
            localStorage.setItem('user', JSON.stringify(response.data.user));
            localStorage.setItem('token', response.data.token);
        }
        return response.data;
    },
    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },
};

// Card API
export const cardAPI = {
    getAllCards: async(params = {}) => {
        const response = await api.get('/card', { params });
        return response.data;
    },
    getCardById: async(cardId) => {
        const response = await api.get(`/card/${cardId}`);
        return response.data;
    },
    searchCards: async(searchTerm) => {
        const response = await api.get(`/card/search/${searchTerm}`);
        return response.data;
    },
    createCard: async(cardData) => {
        const response = await api.post('/card', cardData);
        return response.data;
    },
    updateCard: async(cardId, cardData) => {
        const response = await api.patch(`/card/${cardId}`, cardData);
        return response.data;
    },
    deleteCard: async(cardId) => {
        const response = await api.delete(`/card/${cardId}`);
        return response.data;
    }
};

// Deck API
export const deckAPI = {
    getAllDecks: async(params = {}) => {
        const response = await api.get('/deck', { params });
        return response.data;
    },
    getMyDecks: async() => {
        const response = await api.get('/deck/my-decks');
        return response.data;
    },
    getDeckById: async(deckId) => {
        const response = await api.get(`/deck/${deckId}`);
        return response.data;
    },
    createDeck: async(deckData) => {
        const response = await api.post('/deck', deckData);
        return response.data;
    },
    updateDeck: async(deckId, deckData) => {
        const response = await api.patch(`/deck/${deckId}`, deckData);
        return response.data;
    },
    deleteDeck: async(deckId) => {
        const response = await api.delete(`/deck/${deckId}`);
        return response.data;
    },
    addCardToDeck: async(deckId, cardId, zone = 'mainDeck') => {
        const response = await api.post(`/deck/${deckId}/cards/${cardId}`, { zone });
        return response.data;
    },
    removeCardFromDeck: async(deckId, cardId, zone = 'mainDeck') => {
        const response = await api.delete(`/deck/${deckId}/cards/${cardId}`, { 
            data: { zone }
        });
        return response.data;
    },
    importDeck: async(deckId, decklist) => {
        const response = await api.post(`/deck/${deckId}/import`, {decklist});
        return response.data;
    },
    getDeckStats: async(deckId) => {
        const response = await api.get(`/deck/${deckId}/stats`);
        return response.data;
    }
};

// Game API
export const gameAPI = {
    getAllGames: async(params = {}) => {
        const response = await api.get('/games', { params });
        return response.data;
    },
    getMyGames: async() => {
        const response = await api.get('/games/my-games');
        return response.data;
    },
    getGameById: async(gameId) => {
        const response = await api.get(`/games/${gameId}`);
        return response.data;
    },
    createGame: async(gameData) => {
        const response = await api.post('/games', gameData);
        return response.data;
    },
    joinGame: async(gameId) => {
        const response = await api.post(`/games/${gameId}/join`);
        return response.data;
    },
    leaveGame: async(gameId) => {
        const response = await api.post(`/games/${gameId}/leave`);
        return response.data;
    },
    startGame: async(gameId) => {
        const response = await api.post(`/games/${gameId}/start`);
        return response.data;
    },
    completeGame: async(gameId, winnerId) => {
        const response = await api.post(`/games/${gameId}/complete`, { winnerId });
        return response.data;
    },
    deleteGame: async(gameId) => {
        const response = await api.delete(`/games/${gameId}`);
        return response.data;
    },
    getActiveGames: async() => {
        const response = await api.get('/active');
        return response.data;
    }
};

// Helper functions
export const getAuthToken = () => localStorage.getItem('token');
export const getCurrentUser = () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
};
export const isAuthenticated = () => !!getAuthToken();

export default api;