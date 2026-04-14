import { useState, useContext } from 'react';
import { AuthContext } from '../../contexts/auth';
import ValidationPanel from './ValidationPanel';

const PasswordRecovery = ({ setIsLogin, setIsRecovery }) => {
    const [email, setEmail] = useState('');
    const [validationMsgs, setValidationMsgs] = useState([]);
    const [successMsg, setSuccessMsg] = useState('');

    const { requestPasswordReset } = useContext(AuthContext);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const msgs = [];
        if (!email.trim()) msgs.push('Email is required');
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) msgs.push('Enter a valid email address');
        if (msgs.length > 0) { setValidationMsgs(msgs); return; }
        setValidationMsgs([]);

        try {
            await requestPasswordReset(email.trim());
            setSuccessMsg('If that address is registered, a reset link is on its way.');
        } catch (err) {
            const msgs = [];
            if (err.response?.data?.message)       msgs.push(err.response.data.message);
            else if (err.response?.status === 429)  msgs.push('Too many attempts — please wait');
            else if (err.response?.status === 500)  msgs.push('Server error, please try again later');
            else                                    msgs.push('Something went wrong, please try again');
            setValidationMsgs(msgs);
        }
    };

    const clearOnChange = (e) => {
        setEmail(e.target.value);
        if (validationMsgs.length) setValidationMsgs([]);
        if (successMsg) setSuccessMsg('');
    };

    return (
        <form className="Recovery-form" onSubmit={handleSubmit} noValidate>
            <input
                className="auth-input"
                type="email"
                value={email}
                onChange={clearOnChange}
                placeholder="Email"
            />
            <button
                className="auth-submit"
                type="submit"
                style={{
                    fontSize: '0.7rem',
                    letterSpacing: '0.15em'
                }}
            >
                Send Reset Link
            </button>

            {successMsg && (
                <p style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: '0.72rem',
                    letterSpacing: '0.08em',
                    color: 'rgba(201,168,76,0.7)',
                    textAlign: 'center',
                    marginTop: '4px',
                    fontStyle: 'italic',
                }}>
                    {successMsg}
                </p>
            )}

            <ValidationPanel messages={validationMsgs} />

            <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: '0.6rem',
                letterSpacing: '0.3em',
                color: '#a0380a',
                textTransform: 'uppercase',
                textAlign: 'center',
                fontStyle: 'italic',
                marginTop: '-8px',
                textShadow: '0 1px 8px rgba(0,0,0,0.95), 0 0 20px rgba(160,56,10,0.3)',
            }}>
                <button className="auth-toggle-btn" type="button" onClick={() => setIsRecovery(false)}>
                    Log Back In
                </button>
                <br/>
                <button className="auth-toggle-btn" type="button" onClick={() => { setIsRecovery(false); setIsLogin(false); }}>
                    Back to Sign Up 
                </button>
            </div>
        </form>
    );
};

export default PasswordRecovery;