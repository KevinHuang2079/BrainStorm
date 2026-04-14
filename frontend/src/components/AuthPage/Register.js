import { useState, useContext } from 'react';
import { AuthContext } from '../../contexts/auth';
import ValidationPanel from './ValidationPanel';

const Register = ({ setIsLogin }) => {
    const [email, setEmail]                   = useState('');
    const [password, setPassword]             = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [username, setUsername]             = useState('');
    const [validationMsgs, setValidationMsgs] = useState([]);

    const { register, login } = useContext(AuthContext);

    const validate = () => {
        const msgs = [];

        if (!username.trim()) msgs.push('Username is required');

        if (!email.trim()) {
            msgs.push('Email is required');
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            msgs.push('Enter a valid email address');
        }

        if (!password) {
            msgs.push('Password is required');
        } else {
            if (password.length < 6)                          msgs.push('Password must be at least 6 characters');
            if (!/[A-Z]/.test(password))                      msgs.push('Password needs an uppercase letter');
            if (!/[a-z]/.test(password))                      msgs.push('Password needs a lowercase letter');
            if (!/\d/.test(password))                         msgs.push('Password needs a number');
            if (!/[!@#$%^&*(),.?":{}|<>]/.test(password))    msgs.push('Password needs a special character');
        }

        if (!confirmPassword) {
            msgs.push('Please confirm your password');
        } else if (password !== confirmPassword) {
            msgs.push("Passwords don't match");
        }

        return msgs;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const msgs = validate();
        if (msgs.length > 0) {
            setValidationMsgs(msgs);
            return;
        }
        setValidationMsgs([]);

        try {
            const registerData = {
                username: username.trim(),
                email: email.trim(),
                password,
            };
            await register(registerData);
            await login({ email: registerData.email, password: registerData.password });
        } catch (err) {
            const msgs = [];
            if (err.response?.data?.message)      msgs.push(err.response.data.message);
            else if (err.response?.status === 409) msgs.push('An account with that email already exists');
            else if (err.response?.status === 429) msgs.push('Too many attempts — please wait');
            else if (err.response?.status === 500) msgs.push('Server error, please try again later');
            else                                   msgs.push('Something went wrong, please try again');
            setValidationMsgs(msgs);
        }
    };

    const clearOnChange = (setter) => (e) => {
        setter(e.target.value);
        if (validationMsgs.length) setValidationMsgs([]);
    };

    return (
        <form className="Register-form" onSubmit={handleSubmit} noValidate>
            <input className="auth-input" type="text" value={username}
                onChange={clearOnChange(setUsername)} placeholder="Username" />
            <input className="auth-input" type="email" value={email}
                onChange={clearOnChange(setEmail)} placeholder="Email" />
            <input className="auth-input" type="password" value={password}
                onChange={clearOnChange(setPassword)} placeholder="Password" />
            <input className="auth-input" type="password" value={confirmPassword}
                onChange={clearOnChange(setConfirmPassword)} placeholder="Confirm Password" />
            <button className="auth-submit" type="submit">Sign Up</button>

            <ValidationPanel messages={validationMsgs} />

            <div className="auth-toggle-text">
                <span>Have an account? </span>
                <button className="auth-toggle-btn" type="button" onClick={() => setIsLogin(prev => !prev)}>
                    Log In
                </button>
            </div>
        </form>
    );
};

export default Register;