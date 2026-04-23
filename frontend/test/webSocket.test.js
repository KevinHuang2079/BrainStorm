// webSocket.test.js
import React from 'react';
import { act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { WebSocketProvider, useWebSocket } from 'contexts/webSocket';
import { AuthContext } from 'contexts/auth';
import { io } from 'socket.io-client';

// ─── Mock socket.io-client ────────────────────────────────────────────────────
jest.mock('socket.io-client');

// Factory that builds a mock socket with controllable event callbacks
const createMockSocket = () => {
  const listeners = {};

  const socket = {
    on: jest.fn((event, cb) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
    id: 'mock-socket-id',
    // Helper to simulate server → client events in tests
    _trigger: (event, ...args) => {
      (listeners[event] || []).forEach(cb => cb(...args));
    },
  };
  return socket;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const buildWrapper =
  (user = { _id: '1', username: 'alice' }) =>
  ({ children }) =>
    (
      <AuthContext.Provider value={{ user, loading: false }}>
        <WebSocketProvider>{children}</WebSocketProvider>
      </AuthContext.Provider>
    );

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebSocketProvider – no user', () => {
  afterEach(() => jest.clearAllMocks());

  it('does NOT call io() when user is null', () => {
    const wrapper = ({ children }) => (
      <AuthContext.Provider value={{ user: null, loading: false }}>
        <WebSocketProvider>{children}</WebSocketProvider>
      </AuthContext.Provider>
    );

    renderHook(() => useWebSocket(), { wrapper });

    expect(io).not.toHaveBeenCalled();
  });

  it('exposes socket=null, isConnected=false when user is null', () => {
    const wrapper = ({ children }) => (
      <AuthContext.Provider value={{ user: null, loading: false }}>
        <WebSocketProvider>{children}</WebSocketProvider>
      </AuthContext.Provider>
    );

    const { result } = renderHook(() => useWebSocket(), { wrapper });

    expect(result.current.socket).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('WebSocketProvider – with user', () => {
  let mockSocket;

  beforeEach(() => {
    mockSocket = createMockSocket();
    io.mockReturnValue(mockSocket);
  });

  afterEach(() => jest.clearAllMocks());

  it('calls io() with correct options when user is present', () => {
    renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        withCredentials: true,
        autoConnect: true,
        reconnection: true,
      })
    );
  });

  it('sets isConnected=true when "connect" event fires', async () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    act(() => {
      mockSocket._trigger('connect');
    });

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it('sets isConnected=false when "disconnect" event fires', async () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    act(() => mockSocket._trigger('connect'));
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => mockSocket._trigger('disconnect', 'transport close'));
    await waitFor(() => expect(result.current.isConnected).toBe(false));
  });

  it('sets error and isConnected=false on "connect_error"', async () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    act(() => mockSocket._trigger('connect_error', new Error('ECONNREFUSED')));

    await waitFor(() => expect(result.current.error).toBe('ECONNREFUSED'));
    expect(result.current.isConnected).toBe(false);
  });

  it('sets error on generic "error" event', async () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    act(() => mockSocket._trigger('error', { message: 'Something broke' }));

    await waitFor(() => expect(result.current.error).toBe('Something broke'));
  });

  it('sets error to fallback string when error event has no message', async () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    act(() => mockSocket._trigger('error', {}));

    await waitFor(() =>
      expect(result.current.error).toBe('An error occurred')
    );
  });

  it('clears error when "connect" fires after a previous error', async () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    act(() => mockSocket._trigger('connect_error', new Error('timeout')));
    await waitFor(() => expect(result.current.error).toBe('timeout'));

    act(() => mockSocket._trigger('connect'));
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('exposes the socket ref', () => {
    const { result } = renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    expect(result.current.socket).toBe(mockSocket);
  });

  it('calls socket.disconnect() and nulls ref on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects old socket and creates a new one when user changes', async () => {
    const secondSocket = createMockSocket();
    io.mockReturnValueOnce(mockSocket).mockReturnValueOnce(secondSocket);

    const userRef = { current: { _id: '1', username: 'alice' } };

    const wrapper = ({ children }) => (
      <AuthContext.Provider value={{ user: userRef.current, loading: false }}>
        <WebSocketProvider>{children}</WebSocketProvider>
      </AuthContext.Provider>
    );

    const { rerender } = renderHook(() => useWebSocket(), { wrapper });

    expect(io).toHaveBeenCalledTimes(1);

    userRef.current = { _id: '2', username: 'bob' };
    rerender();

    await waitFor(() => expect(mockSocket.disconnect).toHaveBeenCalledTimes(1));
    expect(io).toHaveBeenCalledTimes(2);
  });

  it('disconnects socket and sets isConnected=false when user becomes null', async () => {
    const userRef = { current: { _id: '1', username: 'alice' } };

    const wrapper = ({ children }) => (
      <AuthContext.Provider value={{ user: userRef.current, loading: false }}>
        <WebSocketProvider>{children}</WebSocketProvider>
      </AuthContext.Provider>
    );

    const { result, rerender } = renderHook(() => useWebSocket(), { wrapper });

    act(() => mockSocket._trigger('connect'));
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    userRef.current = null;
    rerender();

    await waitFor(() => expect(result.current.isConnected).toBe(false));
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('useWebSocket – outside provider', () => {
  it('throws an error when used outside WebSocketProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useWebSocket())).toThrow(
      'useWebSocket must be used within WebSocketProvider'
    );

    consoleError.mockRestore();
  });
});

describe('WebSocketProvider – io() options', () => {
  let mockSocket;

  beforeEach(() => {
    mockSocket = createMockSocket();
    io.mockReturnValue(mockSocket);
  });

  afterEach(() => jest.clearAllMocks());

  it('connects to REACT_APP_SOCKET_URL env variable when set', () => {
    const original = process.env.REACT_APP_SOCKET_URL;
    process.env.REACT_APP_SOCKET_URL = 'https://my-server.com';

    renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    expect(io).toHaveBeenCalledWith('https://my-server.com', expect.any(Object));

    process.env.REACT_APP_SOCKET_URL = original;
  });

  it('falls back to localhost:5002 when REACT_APP_SOCKET_URL is unset', () => {
    const original = process.env.REACT_APP_SOCKET_URL;
    delete process.env.REACT_APP_SOCKET_URL;

    renderHook(() => useWebSocket(), { wrapper: buildWrapper() });

    expect(io).toHaveBeenCalledWith('http://localhost:5002', expect.any(Object));

    process.env.REACT_APP_SOCKET_URL = original;
  });
});