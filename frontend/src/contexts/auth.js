import { useState, createContext } from 'react';
import {authAPI} from '../services/api'; 

const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // useEffect(() => {
  //   console.log('token', token);
  //   console.log('user', user);
  // })

  const register = async (registerData) => {
    try {
      const response = await authAPI.register(registerData);
      setToken(response.token);
      setUser(response.user);
      return response;
    } catch (error) {
      throw error;
    }
  };

  const login = async (loginData) => {
    try {
      const response = await authAPI.login(loginData);
      setToken(response.token);
      setUser(response.user);
      return response;
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  const value = {
    token,
    user,
    register,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};


export { AuthContext };
export default AuthProvider;