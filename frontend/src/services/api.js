import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002/api';
console.log('Final API_BASE_URL:', API_BASE_URL);

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true, //cookies need 
    headers: {
        'Content-Type': 'application/json'
    },
});

//before request leaves
api.interceptors.request.use(
    config => {
        return config;
    },
    (err) => {
        return Promise.reject(err);
    }
);

//after response arrives
api.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) { //unauthorized/session expired
            const currentPath = window.location.pathname;

            if (currentPath !== '/auth') {          //was '/login'
                window.location.href = '/auth';     
            }
        }
        return Promise.reject(error);
    }
);

export const authAPI = {
    login: async(loginData) => {
        const response = await api.post('/auth/login', loginData);
        sessionStorage.setItem('user', JSON.stringify(response.data.user));
        return response.data;
    },
    register: async(signupData) => {
        const response = await api.post('/auth/register', signupData);
        return response.data;
    },
    logout: async () => {
        try {
            await api.post('/auth/logout'); 
        } catch (err) {}
        sessionStorage.removeItem('user');
    },
    fetchCurrentUser: async() => {
        const stored = sessionStorage.getItem('user');
        if (!stored) return null;

        try {   
            const response = await api.get('/auth/me');
            sessionStorage.setItem('user', JSON.stringify(response.data.user));
            return response.data.user;
        } catch {
            sessionStorage.removeItem('user'); // clean up stale data (issue when user local storage was stale or corrupted and it couldn't set a new one so just delete first, 401 loop)
            return null;    
        }
    },
    requestPasswordReset: async (email) => {
        const response = await api.post('/auth/forgot-password', { email });
        return response.data;
    },
    resetPassword: async (token, newPassword) => {
        const response = await api.post('/auth/reset-password', { token, newPassword });
        return response.data;   
    },
};

export const cardAPI = {
    getCardById: async(cardId) => {
        const response = await api.get(`/card/${cardId}`);
        return response.data;
    },
    searchCards: async(searchTerm) => {
        const response = await api.get(`/card/search/${searchTerm}`);
        return response.data;
    },
    searchTokens: async(searchTerm) => {
        const response = await api.get(`/card/search-tokens/${searchTerm}`);
        return response.data;
    },
};

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
    addCardToDeck: async(deckId, cardId, zone = 'mainDeck', quantity = 1) => {
        const response = await api.post(`/deck/${deckId}/cards/${cardId}`, { zone, quantity });
        return response.data;
    },
    removeCardFromDeck: async(deckId, cardId, zone = 'mainDeck', quantity = 1) => {
        const response = await api.delete(`/deck/${deckId}/cards/${cardId}`, { data: { zone, quantity }});
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

export const getCurrentUser = () => {
    const user = sessionStorage.getItem('user');
    return user ? JSON.parse(user) : null;
};
export const isAuthenticated = () => !!getCurrentUser();

export default api;