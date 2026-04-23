// AuthPage.test.js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AuthPage from '../src/pages/AuthPage';

// ── Mock heavy/visual deps ──────────────────────────────────────────────────
jest.mock('../src/ogl/Lightning', () => () => <div data-testid="lightning-mock" />);

// Lightweight stubs for the three auth sub-components so we can test
// AuthPage's own routing logic without needing real form implementations.
jest.mock('../src/components/AuthPage/Login', () => ({ setIsLogin, setIsRecovery }) => (
  <div data-testid="login-form">
    <button onClick={() => setIsRecovery(true)}>Forgot password</button>
    <button onClick={() => setIsLogin(false)}>Go to Register</button>
  </div>
));

jest.mock('../src/components/AuthPage/Register', () => ({ setIsLogin }) => (
  <div data-testid="register-form">
    <button onClick={() => setIsLogin(true)}>Back to Login</button>
  </div>
));

jest.mock('../src/components/AuthPage/PasswordRecovery', () =>
  ({ setIsLogin, setIsRecovery }) => (
    <div data-testid="recovery-form">
      <button onClick={() => { setIsRecovery(false); setIsLogin(true); }}>Cancel</button>
    </div>
  )
);

// ── Tests ───────────────────────────────────────────────────────────────────
describe('AuthPage', () => {
  describe('Initial render', () => {
    it('renders the BRAINSTORM title', () => {
      render(<AuthPage />);
      expect(screen.getByText('BRAINSTORM')).toBeInTheDocument();
    });

    it('renders the MTG Tabletop Simulator eyebrow text', () => {
      render(<AuthPage />);
      expect(screen.getByText(/MTG Tabletop Simulator/i)).toBeInTheDocument();
    });

    it('shows the Login form by default', () => {
      render(<AuthPage />);
      expect(screen.getByTestId('login-form')).toBeInTheDocument();
      expect(screen.queryByTestId('register-form')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recovery-form')).not.toBeInTheDocument();
    });

    it('renders the Lightning background', () => {
      render(<AuthPage />);
      expect(screen.getByTestId('lightning-mock')).toBeInTheDocument();
    });
  });

  describe('Navigation: Login → Register → Login', () => {
    it('switches to the Register form when the Login component calls setIsLogin(false)', () => {
      render(<AuthPage />);
      fireEvent.click(screen.getByText('Go to Register'));
      expect(screen.getByTestId('register-form')).toBeInTheDocument();
      expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
    });

    it('switches back to Login when Register calls setIsLogin(true)', () => {
      render(<AuthPage />);
      // Navigate to register first
      fireEvent.click(screen.getByText('Go to Register'));
      fireEvent.click(screen.getByText('Back to Login'));
      expect(screen.getByTestId('login-form')).toBeInTheDocument();
      expect(screen.queryByTestId('register-form')).not.toBeInTheDocument();
    });
  });

  describe('Navigation: Login → PasswordRecovery → Login', () => {
    it('shows the PasswordRecovery form when setIsRecovery(true) is called', () => {
      render(<AuthPage />);
      fireEvent.click(screen.getByText('Forgot password'));
      expect(screen.getByTestId('recovery-form')).toBeInTheDocument();
      expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
    });

    it('returns to Login when PasswordRecovery cancels', () => {
      render(<AuthPage />);
      fireEvent.click(screen.getByText('Forgot password'));
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.getByTestId('login-form')).toBeInTheDocument();
      expect(screen.queryByTestId('recovery-form')).not.toBeInTheDocument();
    });
  });

  describe('Recovery form takes priority over isLogin state', () => {
    it('shows recovery even when isLogin is still true', () => {
      render(<AuthPage />);
      // isLogin starts true; clicking "Forgot password" sets isRecovery=true
      fireEvent.click(screen.getByText('Forgot password'));
      // Recovery should be visible, not login or register
      expect(screen.getByTestId('recovery-form')).toBeInTheDocument();
      expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
      expect(screen.queryByTestId('register-form')).not.toBeInTheDocument();
    });
  });
});