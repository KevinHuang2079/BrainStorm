// src/pages/ResetPassword.jsx  (or wherever your page-level components live)

import { useState, useContext } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/auth';
import ValidationPanel from '../components/AuthPage/ValidationPanel';
//TODO
//eventually redesign
//make sure the password follows the password requirements like in signup
//make sure the password isn't the same as old password
const ResetPasswordPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { resetPassword } = useContext(AuthContext);

    const token = searchParams.get('token');

    const [newPassword, setNewPassword]         = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [validationMsgs, setValidationMsgs]   = useState([]);
    const [successMsg, setSuccessMsg]           = useState('');
    const [loading, setLoading]                 = useState(false);

    const validate = () => {
        const msgs = [];
        if (!newPassword)                           msgs.push('Password is required');
        else if (newPassword.length < 8)            msgs.push('Password must be at least 8 characters');
        if (!confirmPassword)                       msgs.push('Please confirm your password');
        else if (newPassword !== confirmPassword)   msgs.push('Passwords do not match');
        return msgs;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token) { setValidationMsgs(['Invalid or missing reset token.']); return; }

        const msgs = validate();
        if (msgs.length) { setValidationMsgs(msgs); return; }
        setValidationMsgs([]);
        setLoading(true);

        try {
            await resetPassword(token, newPassword);
            setSuccessMsg('Password updated — redirecting you to login…');
            setTimeout(() => navigate('/'), 2500); // adjust route to wherever your auth panel lives
        } catch (err) {
            const msgs = [];
            if (err.response?.status === 400)       msgs.push(err.response.data?.message || 'Invalid or expired reset link.');
            else if (err.response?.status === 429)  msgs.push('Too many attempts — please wait.');
            else if (err.response?.status === 500)  msgs.push('Server error, please try again later.');
            else                                    msgs.push('Something went wrong, please try again.');
            setValidationMsgs(msgs);
        } finally {
            setLoading(false);
        }
    };

    const clearOnChange = (setter) => (e) => {
        setter(e.target.value);
        if (validationMsgs.length) setValidationMsgs([]);
        if (successMsg) setSuccessMsg('');
    };

    if (!token) {
        return (
            <div className="reset-password-page">
                <p className="reset-invalid">No reset token found. Check your email link.</p>
            </div>
        );
    }

    return (
        <div className="reset-password-page">
            <form className="Recovery-form" onSubmit={handleSubmit} noValidate>
                <input
                    className="auth-input"
                    type="password"
                    value={newPassword}
                    onChange={clearOnChange(setNewPassword)}
                    placeholder="New Password"
                    autoComplete="new-password"
                />
                <input
                    className="auth-input"
                    type="password"
                    value={confirmPassword}
                    onChange={clearOnChange(setConfirmPassword)}
                    placeholder="Confirm Password"
                    autoComplete="new-password"
                />
                <button
                    className="auth-submit"
                    type="submit"
                    disabled={loading}
                    style={{ fontSize: '0.7rem', letterSpacing: '0.15em' }}
                >
                    {loading ? 'Updating…' : 'Set New Password'}
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
            </form>
        </div>
    );
};

export default ResetPasswordPage;