import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import AuthProvider, { AuthContext } from '../src/contexts/auth';
import { authAPI } from '../src/services/api';

// ─── Mock the API module ───────────────────────────────────────────────────────
jest.mock('../src/services/api', () => ({
    authAPI: {
        fetchCurrentUser: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        requestPasswordReset: jest.fn(),
        resetPassword: jest.fn(),
    },
}));

// ─── Helper: consume context in a test component ──────────────────────────────
const TestConsumer = () => {
    const ctx = React.useContext(AuthContext);
    if (!ctx) return <div>no context</div>;
    return (
        <div>
            <span data-testid="loading">{String(ctx.loading)}</span>
            <span data-testid="user">{ctx.user ? ctx.user.username : 'null'}</span>
        </div>
    );
};

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const renderWithProvider = (ui = <TestConsumer />) =>
    render(<AuthProvider>{ui}</AuthProvider>);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthProvider – session restoration', () => {
    afterEach(() => jest.clearAllMocks());

    it('starts with loading=true and user=null before the API resolves', async () => {
        // Never resolves during this assertion window
        authAPI.fetchCurrentUser.mockReturnValue(new Promise(() => {}));

        renderWithProvider();

        expect(screen.getByTestId('loading').textContent).toBe('true');
        expect(screen.getByTestId('user').textContent).toBe('null');
    });

    it('sets user and loading=false when fetchCurrentUser resolves', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue({ _id: '1', username: 'alice' });

        renderWithProvider();

        await waitFor(() =>
            expect(screen.getByTestId('loading').textContent).toBe('false')
        );
        expect(screen.getByTestId('user').textContent).toBe('alice');
    });

    it('sets user=null and loading=false when fetchCurrentUser returns null', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue(null);

        renderWithProvider();

        await waitFor(() =>
            expect(screen.getByTestId('loading').textContent).toBe('false')
        );
        expect(screen.getByTestId('user').textContent).toBe('null');
    });

    it('sets user=null and loading=false when fetchCurrentUser throws', async () => {
        authAPI.fetchCurrentUser.mockRejectedValue(new Error('Network error'));

        renderWithProvider();

        await waitFor(() =>
            expect(screen.getByTestId('loading').textContent).toBe('false')
        );
        expect(screen.getByTestId('user').textContent).toBe('null');
    });
});

describe('AuthProvider – login', () => {
    afterEach(() => jest.clearAllMocks());

    it('calls authAPI.login and sets user on success', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue(null);
        authAPI.login.mockResolvedValue({ user: { _id: '2', username: 'bob' }, token: 'tok' });

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.login({ email: 'bob@example.com', password: 'secret' });
        });

        expect(authAPI.login).toHaveBeenCalledWith({ email: 'bob@example.com', password: 'secret' });
        expect(result.current.user).toEqual({ _id: '2', username: 'bob' });
    });

    it('propagates errors thrown by authAPI.login', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue(null);
        authAPI.login.mockRejectedValue(new Error('Bad credentials'));

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));

        await expect(result.current.login({ email: 'x', password: 'y' })).rejects.toThrow(
            'Bad credentials'
        );
        expect(result.current.user).toBeNull();
    });
});

describe('AuthProvider – logout', () => {
    afterEach(() => jest.clearAllMocks());

    it('calls authAPI.logout and sets user to null', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue({ _id: '3', username: 'carol' });
        authAPI.logout.mockResolvedValue();

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });
        await waitFor(() => expect(result.current.user).toEqual({ _id: '3', username: 'carol' }));

        await act(async () => {
            await result.current.logout();
        });

        expect(authAPI.logout).toHaveBeenCalledTimes(1);
        expect(result.current.user).toBeNull();
    });
});

describe('AuthProvider – register', () => {
    afterEach(() => jest.clearAllMocks());

    it('delegates to authAPI.register and returns the result', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue(null);
        authAPI.register.mockResolvedValue({ message: 'Account created' });

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));

        let res;
        await act(async () => {
            res = await result.current.register({ username: 'dave', email: 'd@d.com', password: 'pw' });
        });

        expect(authAPI.register).toHaveBeenCalledWith({
            username: 'dave',
            email: 'd@d.com',
            password: 'pw',
        });
        expect(res).toEqual({ message: 'Account created' });
    });

    it('does NOT automatically set user after register', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue(null);
        authAPI.register.mockResolvedValue({ user: { _id: '9', username: 'dave' } });

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.register({ username: 'dave', email: 'd@d.com', password: 'pw' });
        });

        expect(result.current.user).toBeNull();
    });
});

describe('AuthProvider – password reset', () => {
    afterEach(() => jest.clearAllMocks());

    it('requestPasswordReset calls authAPI.requestPasswordReset with the email', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue(null);
        authAPI.requestPasswordReset.mockResolvedValue();

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.requestPasswordReset('user@example.com');
        });

        expect(authAPI.requestPasswordReset).toHaveBeenCalledWith('user@example.com');
    });

    it('resetPassword calls authAPI.resetPassword with token and new password', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue(null);
        authAPI.resetPassword.mockResolvedValue();

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.resetPassword('my-token', 'newpass123');
        });

        expect(authAPI.resetPassword).toHaveBeenCalledWith('my-token', 'newpass123');
    });
});

describe('AuthProvider – setUser', () => {
    afterEach(() => jest.clearAllMocks());

    it('exposes setUser and allows direct user mutation', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue(null);

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setUser({ _id: '99', username: 'injected' });
        });

        expect(result.current.user).toEqual({ _id: '99', username: 'injected' });
    });
});

describe('AuthProvider – context availability', () => {
    it('throws if useContext(AuthContext) is accessed outside a provider (value is null)', () => {
        // AuthContext default value is null; consuming components should guard against it
        const { result } = renderHook(() => React.useContext(AuthContext));
        expect(result.current).toBeNull();
    });
});

describe('AuthProvider – value stability (memoization)', () => {
    afterEach(() => jest.clearAllMocks());

    it('context value reference is stable between unrelated renders', async () => {
        authAPI.fetchCurrentUser.mockResolvedValue(null);

        const renders = [];
        const Spy = () => {
            const ctx = React.useContext(AuthContext);
            renders.push(ctx);
            return null;
        };

        const { rerender } = render(
            <AuthProvider>
                <Spy />
            </AuthProvider>
        );

        await waitFor(() => expect(renders.length).toBeGreaterThanOrEqual(2));
        const snapshot = renders[renders.length - 1];

        rerender(
            <AuthProvider>
                <Spy />
            </AuthProvider>
        );

        // After a rerender with identical props, the context object should be the same reference
        // (useMemo guarantees this when deps haven't changed)
        expect(renders[renders.length - 1]).toBe(snapshot);
    });
});