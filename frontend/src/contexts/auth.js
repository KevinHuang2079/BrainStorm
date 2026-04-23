import React from 'react';
import { useState, createContext, useEffect, useMemo, useCallback } from 'react';
import { authAPI } from '../services/api';
import '../styles/AuthPage.css'

const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const restoreSession = async () => {
            try {
                const currUser = await authAPI.fetchCurrentUser();
                setUser(currUser);
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        restoreSession();
    }, []);

    const register = useCallback(async (registerData) => {
        return await authAPI.register(registerData);
    }, []);

    const login = useCallback(async (loginData) => {
        const response = await authAPI.login(loginData);
        setUser(response.user);
        return response;
    }, []);

    const requestPasswordReset = useCallback(async (email) => {
        await authAPI.requestPasswordReset(email);
    }, []);

    const resetPassword = useCallback(async (token, newPassword) => {
        await authAPI.resetPassword(token, newPassword);
    }, []);

    const logout = useCallback(async () => {
        await authAPI.logout();
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user,
        loading,
        register,
        login,
        logout,
        setUser,
        requestPasswordReset,
        resetPassword,
    }), [user, loading, register, login, logout, requestPasswordReset, resetPassword]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export { AuthContext };
export default AuthProvider;