import { useState, useContext } from 'react';
import {AuthContext} from '../contexts/auth';
import { useNavigate } from 'react-router-dom';

const Register = ({ChangeLogin, setIsLogin}) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const {register} = useContext(AuthContext);
    const navigate = useNavigate();

    const validatePassword = (pwd) => {
        if (pwd.length === 0) {
            setPasswordError('');
            return;
        }
        
        if (pwd.length < 6) {
            setPasswordError('Password must be at least 6 characters');
            return;
        }
        if (!/[A-Z]/.test(pwd)) {
            setPasswordError('Password must contain at least one uppercase letter');
            return;
        }
        if (!/[a-z]/.test(pwd)) {
            setPasswordError('Password must contain at least one lowercase letter');
            return;
        }
        if (!/\d/.test(pwd)) {
            setPasswordError('Password must contain at least one number');
            return;
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
            setPasswordError('Password must contain at least one special character (!@#$%^&*)');
            return;
        }
        
        setPasswordError('');
    };

    const handleSubmit = async(e) => {
        e.preventDefault();
        
        try {
            // Clear previous errors
            setError('');

            // Validate all fields are filled
            if (!email.trim() || !password.trim() || !confirmPassword.trim() || 
                !username.trim()) {
                setError('All fields are required');
                return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                setError('Please enter a valid email address');
                return;
            }

            // Check for password errors
            if (passwordError) {
                setError(passwordError);
                return;
            }

            // Check if passwords match
            if (!comparePasswords()) {
                return;
            }

            const registerData = {
                username: username.trim(),
                email: email.trim(),
                password,
            };

            const res = await register(registerData);
            console.log(res);
            
            // Switch to login form after successful registration
            ChangeLogin(true);
        } catch (err) {
            console.error('Registration error:', err);
            
            // Extract error message from response
            if (err.response?.data?.message) {
                setError(err.response.data.message);
            } else if (err.response?.status === 400) {
                setError('Registration failed. Please check your information.');
            } else if (err.response?.status === 409) {
                setError('User already exists.');
            } else if (err.response?.status === 500) {
                setError('Server error. Please try again later.');
            } else if (err.message) {
                setError(err.message);
            } else {
                setError('An unexpected error occurred. Please try again.');
            }
        }
    };
    
    const comparePasswords = () => {
        if (password.trim() !== confirmPassword.trim()) {
            setError("Passwords don't match");
            return false;
        }
        return true;
    };

    return (
        <form className="Register-form" onSubmit={handleSubmit}>
            <h1 className="auth-header">BrainStorm</h1>
            <input 
                className='username'
                type="text"
                value={username}
                onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                }}
                placeholder='Username'
                required
            />
            <input 
                className='email'
                type="email"
                value={email}
                onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                }}
                placeholder='Email'
                required
            />
            <input 
                className='password'
                type="password"
                value={password}
                onChange={(e) => {
                    const newPassword = e.target.value;
                    setPassword(newPassword);
                    validatePassword(newPassword);
                    setError('');
                }}
                placeholder='Password'
                required
            />
            {passwordError && <div className="error-message visible">{passwordError}</div>}
            <input 
                className='confirm-password'
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                }}
                placeholder='Confirm Password'
                required
            />
            <button type="submit">Sign Up</button>
            <div className="auth-toggle-text">
                <span>Already have an account? </span>
                <span className='auth-button' onClick={() => setIsLogin(prev => !prev)}>
                    Log In
                </span>
            </div>
            <div className={`error-message${error ? ' visible' : ''}`}>{error}</div>
        </form>
    );
};

export default Register;