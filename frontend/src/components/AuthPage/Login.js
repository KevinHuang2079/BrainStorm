import { useState, useContext } from 'react';
import { AuthContext } from '../../contexts/auth';
import ValidationPanel from './ValidationPanel';

const Login = ({ setIsLogin, setIsRecovery }) => {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [validationMsgs, setValidationMsgs] = useState([]);

    const { login } = useContext(AuthContext);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const msgs = [];
        if (!email.trim())    msgs.push('Email is required');
        if (!password.trim()) msgs.push('Password is required');
        if (msgs.length > 0) { setValidationMsgs(msgs); return; }
        setValidationMsgs([]);

        try {
            await login({ email: email.trim(), password });
        } catch (err) {
            const msgs = [];
            if (err.response?.data?.message)      msgs.push(err.response.data.message);
            else if (err.response?.status === 400) msgs.push('Invalid email or password');
            else if (err.response?.status === 429) msgs.push('Too many login attempts — please wait');
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
        <form className="Login-form" onSubmit={handleSubmit} noValidate>
            <input className="auth-input" type="email" value={email}
                onChange={clearOnChange(setEmail)} placeholder="Email" />
            <input className="auth-input" type="password" value={password}
                onChange={clearOnChange(setPassword)} placeholder="Password" />
            <button className="auth-submit" type="submit">Log In</button>

            
            <ValidationPanel messages={validationMsgs} />

            <div className="auth-toggle-text">
                <span>No account yet? {' '}</span>
                <button className="auth-toggle-btn" type="button" onClick={() => setIsLogin(prev => !prev)}>
                    Sign Up
                </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: '-8px' }}>
                <button
                    type="button"
                    onClick={() => setIsRecovery(true)}
                    style={{
                        fontSize: '13px',
                        fontStyle: 'italic',
                        color: '#a0380a', // dark red
                        textShadow: '0 0 6px rgba(160,56,10,0.35), 0 0 12px rgba(160,56,10,0.2)',
                        transition: 'color 0.2s ease, text-shadow 0.2s ease'
                    }}
                >
                    Forgot password?
                </button>
            </div>
        </form>
    );

};

export default Login;