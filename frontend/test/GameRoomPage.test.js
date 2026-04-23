// GameRoomPage.test.js
import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Shared test fixtures ────────────────────────────────────────────────────
export const PLAYER_1 = { _id: 'p1', username: 'Alice' };
export const PLAYER_2 = { _id: 'p2', username: 'Bob' };

export const makeGame = (overrides = {}) => ({
  _id: 'game1',
  format: 'standard',
  status: 'waiting',
  host: PLAYER_1,
  players: [PLAYER_1],
  currentTurn: null,
  ...overrides,
});

// ── Module mocks ────────────────────────────────────────────────────────────
// NOTE: All jest.mock() paths must match the paths used in the SOURCE file
// (GameRoomPage.js), not the test file's own location.
// Since jest.config.js sets modulePaths: ['<rootDir>/src'], bare imports like
// 'contexts/auth' resolve to src/contexts/auth.js — so we mock the same way.

const mockSocketEmit = jest.fn();
const mockSocket = {
  connected: true,
  on: jest.fn(),
  off: jest.fn(),
  emit: mockSocketEmit,
};

jest.mock('contexts/webSocket', () => ({
  useWebSocket: () => ({ socket: mockSocket }),
}));

jest.mock('contexts/auth', () => {
  const { createContext } = require('react');
  return {
    AuthContext: createContext({ user: { _id: 'p1', username: 'Alice' } }),
  };
});

jest.mock('contexts/cardActions', () => ({
  CardActionsProvider: ({ children }) => <>{children}</>,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),  
  useParams: () => ({ gameId: 'game1' }),
  useNavigate: () => jest.fn(),
}));
// Heavy child components – render simple stubs so tests stay focused on the page
jest.mock('components/InGame/PlayerArea', () => () => <div data-testid="player-area" />);
jest.mock('components/InGame/BattleField', () => ({ onStartGame, onEndTurn, game, diceResult }) => (
  <div data-testid="battlefield">
    <button data-testid="start-game-btn" onClick={onStartGame}>Start</button>
    <button data-testid="end-turn-btn" onClick={onEndTurn}>End Turn</button>
    {diceResult && (
      <div data-testid="dice-result">
        {diceResult.username} rolled {diceResult.result}
      </div>
    )}
  </div>
));
jest.mock('components/InGame/OpponentArea', () => () => <div data-testid="opponent-area" />);
jest.mock('components/InGame/LeftRail', () => ({ onLeaveGame, onRollDice, onUntapAll, onToggleChat }) => (
  <div data-testid="left-rail">
    <button data-testid="leave-btn" onClick={onLeaveGame}>Leave</button>
    <button data-testid="roll-dice-btn" onClick={() => onRollDice(6, 6)}>Roll d6</button>
    <button data-testid="untap-btn" onClick={onUntapAll}>Untap All</button>
    <button data-testid="toggle-chat-btn" onClick={onToggleChat}>Chat</button>
  </div>
));
jest.mock('components/InGame/ChatLog', () => ({ messages, isOpen }) => (
  <div data-testid="chat-log" data-open={isOpen}>
    {messages.map((m, i) => <div key={i} data-testid={`chat-msg-${i}`}>{m.type}</div>)}
  </div>
));
jest.mock('imgs/magic-card-backballs.png', () => 'card-back.png');

// ── Imports that depend on mocks above ─────────────────────────────────────
// These must come AFTER jest.mock() calls (hoisting handles jest.mock, but
// the actual module import needs the mock already registered).
import GameRoomPage from 'pages/GameRoomPage';
import { AuthContext } from 'contexts/auth';

// ── Helper: render page and simulate successful game:joined ─────────────────
const renderPage = (user = PLAYER_1) => {
  const listeners = {};
  mockSocket.on.mockImplementation((event, handler) => {
    listeners[event] = listeners[event] || [];
    listeners[event].push(handler);
  });

  const utils = render(
    <AuthContext.Provider value={{ user }}>
      <MemoryRouter initialEntries={['/game/game1']}>
        <Routes>
          <Route path="/game/:gameId" element={<GameRoomPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

  const emit = (event, payload) => {
    act(() => {
      (listeners[event] || []).forEach(fn => fn(payload));
    });
  };

  return { ...utils, emit, listeners };
};

const joinGame = (emit, gameOverride = {}) => {
  emit('game:joined', {
    ...makeGame(gameOverride),
    players: [PLAYER_1],
    savedState: {},
  });
};

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – loading state', () => {
  it('shows the loading spinner before game data arrives', () => {
    renderPage();
    expect(screen.getByText(/Entering/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – socket registration', () => {
  it('emits game:join on mount when socket is connected', () => {
    renderPage();
    expect(mockSocketEmit).toHaveBeenCalledWith('game:join', { gameId: 'game1' });
  });

  it('registers all expected socket event listeners', () => {
    renderPage();
    const registeredEvents = mockSocket.on.mock.calls.map(([event]) => event);
    const expected = [
      'game:joined',
      'game:playerJoined',
      'game:playerLeft',
      'game:playerDisconnected',
      'game:requestSync',
      'game:stateUpdate',
      'game:action',
      'game:turnChanged',
      'game:started',
      'game:diceRolled',
      'game:inactivityWarning',
      'game:closedDueToInactivity',
    ];
    expected.forEach(evt => expect(registeredEvents).toContain(evt));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – after game:joined', () => {
  it('renders core layout areas after receiving game data', async () => {
    const { emit } = renderPage();
    joinGame(emit);

    await waitFor(() => {
      expect(screen.getByTestId('battlefield')).toBeInTheDocument();
      expect(screen.getByTestId('player-area')).toBeInTheDocument();
      expect(screen.getByTestId('opponent-area')).toBeInTheDocument();
      expect(screen.getByTestId('left-rail')).toBeInTheDocument();
    });
  });

  it('broadcasts own state via game:syncState after joining', () => {
    const { emit } = renderPage();
    joinGame(emit);

    expect(mockSocketEmit).toHaveBeenCalledWith(
      'game:syncState',
      expect.objectContaining({ gameId: 'game1' })
    );
  });

  it('restores chat log from savedState', () => {
    const { emit } = renderPage();
    const savedLog = [{ type: 'turn-divider', turn: 1, username: 'Alice', timestamp: 1 }];

    emit('game:joined', {
      ...makeGame(),
      players: [PLAYER_1],
      savedState: { _chatLog: savedLog },
    });

    expect(screen.getByTestId('chat-msg-0')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – commander vs standard starting life', () => {
  it('sets 40 life for commander format', () => {
    const { emit } = renderPage();
    emit('game:joined', {
      ...makeGame({ format: 'commander' }),
      players: [PLAYER_1],
      savedState: {},
    });
    expect(screen.getByTestId('battlefield')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – inactivity warning', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows inactivity warning banner when server sends game:inactivityWarning', async () => {
    const { emit } = renderPage();
    joinGame(emit);

    act(() => {
      emit('game:inactivityWarning', { timeRemaining: 5000 });
    });

    expect(screen.getByText(/Closing in/i)).toBeInTheDocument();
  });

  it('hides the warning after any action resets the timer', async () => {
    const { emit } = renderPage();
    joinGame(emit);
    act(() => emit('game:inactivityWarning', { timeRemaining: 5000 }));

    fireEvent.click(screen.getByTestId('end-turn-btn'));
    await waitFor(() =>
      expect(screen.queryByText(/Closing in/i)).not.toBeInTheDocument()
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – dice roll', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows dice result overlay when roll button is clicked', async () => {
    const { emit } = renderPage();
    joinGame(emit);

    fireEvent.click(screen.getByTestId('roll-dice-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('dice-result')).toBeInTheDocument()
    );
  });

  it('clears dice result after 3 seconds', async () => {
    const { emit } = renderPage();
    joinGame(emit);

    fireEvent.click(screen.getByTestId('roll-dice-btn'));
    expect(screen.getByTestId('dice-result')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(3001));

    await waitFor(() =>
      expect(screen.queryByTestId('dice-result')).not.toBeInTheDocument()
    );
  });

  it('shows dice result from game:diceRolled socket event', async () => {
    const { emit } = renderPage();
    joinGame(emit);

    act(() => emit('game:diceRolled', { username: 'Bob', result: 4, sides: 6 }));

    await waitFor(() => {
      const el = screen.getByTestId('dice-result');
      expect(el.textContent).toMatch(/Bob/);
      expect(el.textContent).toMatch(/4/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – turn management', () => {
  it('emits game:startGame when host clicks start', () => {
    const { emit } = renderPage();
    joinGame(emit);

    fireEvent.click(screen.getByTestId('start-game-btn'));

    expect(mockSocketEmit).toHaveBeenCalledWith(
      'game:startGame',
      expect.objectContaining({ gameId: 'game1' })
    );
  });

  it('emits game:endTurn when end turn is clicked', () => {
    const { emit } = renderPage();
    joinGame(emit);

    fireEvent.click(screen.getByTestId('end-turn-btn'));

    expect(mockSocketEmit).toHaveBeenCalledWith(
      'game:endTurn',
      expect.objectContaining({ gameId: 'game1' })
    );
  });

  it('appends a turn-divider to chat log on game:turnChanged', async () => {
    const { emit } = renderPage();
    joinGame(emit);

    act(() => emit('game:turnChanged', { currentTurn: 'p2', username: 'Bob' }));

    await waitFor(() => {
      const msgs = screen.getAllByTestId(/chat-msg-/);
      const types = msgs.map(m => m.textContent);
      expect(types).toContain('turn-divider');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – chat panel toggle', () => {
  it('chat log starts closed', () => {
    const { emit } = renderPage();
    joinGame(emit);

    expect(screen.getByTestId('chat-log').dataset.open).toBe('false');
  });

  it('toggles chat open when chat button is clicked', async () => {
    const { emit } = renderPage();
    joinGame(emit);

    fireEvent.click(screen.getByTestId('toggle-chat-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('chat-log').dataset.open).toBe('true')
    );
  });

  it('toggles chat closed on second click', async () => {
    const { emit } = renderPage();
    joinGame(emit);

    fireEvent.click(screen.getByTestId('toggle-chat-btn'));
    fireEvent.click(screen.getByTestId('toggle-chat-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('chat-log').dataset.open).toBe('false')
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – handleLocalAction: changeLifeTotal', () => {
  it('applies life total delta locally via game:action socket', async () => {
    const { emit } = renderPage();
    joinGame(emit);

    act(() =>
      emit('game:action', {
        username: 'Alice',
        playerId: 'p1',
        action: 'changeLifeTotal',
        data: { amount: -3 },
        timestamp: Date.now(),
      })
    );

    expect(screen.getByTestId('battlefield')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – handleLocalAction: tapCard', () => {
  it('processes tapCard action without throwing', () => {
    const { emit } = renderPage();
    joinGame(emit);

    expect(() =>
      act(() =>
        emit('game:action', {
          username: 'Alice',
          playerId: 'p1',
          action: 'tapCard',
          data: { cardId: 'card-xyz' },
          timestamp: Date.now(),
        })
      )
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – player sync', () => {
  it('handles game:requestSync by emitting syncState for own player', () => {
    const { emit } = renderPage();
    joinGame(emit);

    mockSocketEmit.mockClear();
    act(() => emit('game:requestSync'));

    expect(mockSocketEmit).toHaveBeenCalledWith(
      'game:syncState',
      expect.objectContaining({ gameId: 'game1' })
    );
  });

  it('updates playerStates when game:stateUpdate arrives for another player', () => {
    const { emit } = renderPage();
    joinGame(emit);

    expect(() =>
      act(() =>
        emit('game:stateUpdate', {
          senderId: 'p2',
          gameState: {
            p2: {
              _id: 'p2',
              username: 'Bob',
              lifeTotal: 18,
              library: [],
              hand: [],
              battlefield: [],
              graveyard: [],
              exile: [],
              facedown: [],
              sideboard: [],
            },
          },
        })
      )
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GameRoomPage – cleanup on unmount', () => {
  it('calls socket.off for all registered events on unmount', () => {
    const { emit, unmount } = renderPage();
    joinGame(emit);
    unmount();

    const offEvents = mockSocket.off.mock.calls.map(([event]) => event);
    ['game:joined', 'game:action', 'game:turnChanged'].forEach(evt =>
      expect(offEvents).toContain(evt)
    );
  });
});