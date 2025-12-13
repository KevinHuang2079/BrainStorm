import { useState, useContext } from 'react';
import {AuthContext} from '../contexts/auth';
import { useNavigate } from 'react-router-dom';

const Login = ({setIsLogin}) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    
    const navigate = useNavigate();
    const {login} = useContext(AuthContext);

    const handleSubmit = async(e) => {
        e.preventDefault();
        
        try {
            // Clear previous errors
            setError('');

            // Validate fields
            if (!email.trim() || !password.trim()) {
                setError('Please provide both email and password');
                return;
            }

            const loginData = {
                email: email.trim(),
                password,
            };

            const res = await login(loginData);
            console.log(res);
            navigate('/home');
        } catch (err) {
            console.error('Login error:', err);
            
            if (err.response?.data?.message) {
                setError(err.response.data.message);
            } else if (err.response?.status === 400) {
                setError('Invalid email or password');
            } else if (err.response?.status === 500) {
                setError('Server error. Please try again later.');
            } else if (err.message) {
                setError(err.message);
            } else {
                setError('An unexpected error occurred. Please try again.');
            }
        }
    };

    return (
        <form className="Login-form" onSubmit={handleSubmit}>
            <h1 className="auth-header">BrainStorm</h1>
            <input 
                className='email'
                type="email"
                value={email}
                onChange={(e) => {
                    setEmail(e.target.value);
                    setError(''); // Clear error on input
                }}
                placeholder='Email'
                required
            />
            <input 
                className='password'
                type="password"
                value={password}
                onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                }}
                placeholder='Password'
                required
            />
            <button type="submit">Log In</button>
            <div className="auth-toggle-text">
                <span>Don't have account yet? </span>
                <span className='auth-button' onClick={() => setIsLogin(prev => !prev)}>
                    Sign Up
                </span>
            </div>
            <div className={`error-message${error ? ' visible' : ''}`}>{error}</div>
        </form>
    );
};

export default Login;