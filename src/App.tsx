import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { LogOut } from 'lucide-react';
import { FullGameState, Game, User, authFetch } from './types';
import { PlayerTerminal } from './components/PlayerTerminal';
import { AdminGodView } from './components/AdminGodView';

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('apex_exchange_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Require signed session token
      return parsed && parsed.token ? parsed : null;
    } catch {
      return null;
    }
  });

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Admin view mode toggle (Admin can inspect Player Terminal too)
  const [adminViewMode, setAdminViewMode] = useState<'admin' | 'terminal'>('admin');

  // Data state
  const [usersList, setUsersList] = useState<User[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [gameState, setGameState] = useState<FullGameState | null>(null);
  const [flashNews, setFlashNews] = useState<{
    headline: string;
    impact_summary: string;
    severity: string;
  } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const selectedGameIdRef = useRef<number | null>(null);
  selectedGameIdRef.current = selectedGameId;

  const handleLogout = useCallback(() => {
    localStorage.removeItem('apex_exchange_user');
    setUser(null);
    setGameState(null);
    setSelectedGameId(null);
  }, []);

  const fetchGamesAndUsers = useCallback(
    async (currentUser: User) => {
      try {
        const gamesRes = await authFetch(`/api/games`);
        if (gamesRes.status === 401 || gamesRes.status === 403) {
          handleLogout();
          return;
        }
        if (gamesRes.ok) {
          const gData = await gamesRes.json();
          setGames(gData.games || []);
          if (gData.games?.length > 0 && !selectedGameIdRef.current) {
            setSelectedGameId(gData.games[0].id);
          }
        }

        if (currentUser.role === 'Admin') {
          const usersRes = await authFetch('/api/admin/users');
          if (usersRes.ok) {
            const uData = await usersRes.json();
            setUsersList(uData.users || []);
          }
        }
      } catch (err) {
        console.error('Error fetching initial lists:', err);
      }
    },
    [handleLogout]
  );

  const fetchGameState = useCallback(
    async (gameId: number) => {
      try {
        const res = await authFetch(`/api/games/${gameId}/state`);
        if (res.status === 401 || res.status === 403) {
          handleLogout();
          return;
        }
        if (res.ok) {
          const data: FullGameState = await res.json();
          setGameState(data);
        }
      } catch (err) {
        console.error('Error fetching game state:', err);
      }
    },
    [handleLogout]
  );

  // Setup Socket.io connection
  useEffect(() => {
    if (!user) return;

    fetchGamesAndUsers(user);

    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (selectedGameIdRef.current) {
        socket.emit('game:subscribe', { gameId: selectedGameIdRef.current });
      }
    });

    socket.on('game:tick', ({ gameId }: { gameId: number }) => {
      if (gameId === selectedGameIdRef.current) {
        fetchGameState(gameId);
      }
    });

    socket.on('game:news_flash', (newsItem: any) => {
      if (newsItem && newsItem.game_id === selectedGameIdRef.current) {
        setFlashNews({
          headline: newsItem.headline,
          impact_summary: newsItem.impact_summary,
          severity: newsItem.severity,
        });
      }
    });

    socket.on('games:list_updated', () => {
      fetchGamesAndUsers(user);
    });

    socket.on('users:updated', (updatedUsers: User[]) => {
      if (user.role === 'Admin') {
        setUsersList(updatedUsers);
      }
    });

    socket.on('user:ban_status', ({ userId, is_banned }) => {
      if (user.id === userId && is_banned) {
        handleLogout();
        setLoginError('Your account has been suspended by the Exchange Administrator.');
      }
    });

    socket.on('user:deleted', ({ userId }) => {
      if (user.id === userId) {
        handleLogout();
        setLoginError('Your account has been removed by the Exchange Administrator.');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user, fetchGamesAndUsers, fetchGameState, handleLogout]);

  useEffect(() => {
    if (user && selectedGameId) {
      fetchGameState(selectedGameId);
      socketRef.current?.emit('game:subscribe', { gameId: selectedGameId });
    }
  }, [user, selectedGameId, fetchGameState]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Authentication failed');
      } else {
        localStorage.setItem('apex_exchange_user', JSON.stringify(data.user));
        setUser(data.user);
        setSelectedGameId(null);
      }
    } catch {
      setLoginError('Unable to reach exchange authentication server');
    } finally {
      setLoggingIn(false);
    }
  };

  // ==================== LOGIN SCREEN (NO AUTOFILL BOX) ====================
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col justify-between p-6">
        <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-2 border-b border-[#1E293B]">
          <span className="text-lg font-bold tracking-tight text-white">
            IITB Stoxchange
          </span>
          <span className="text-xs font-mono text-slate-400">
            LOCAL MULTIPLAYER SIMULATION TERMINAL
          </span>
        </header>

        <main className="max-w-md w-full mx-auto my-auto py-12">
          <div className="p-8 bg-[#111827] border border-[#1E293B] space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white">
                IITB Stoxchange Sign-In
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Closed-loop local trading floor. Self-registration is disabled; enter credentials issued by the Exchange Administrator.
              </p>
            </div>

            {loginError && (
              <div className="p-3 bg-red-950/60 border border-red-700 text-xs text-red-200">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4 text-xs" autoComplete="off">
              <div>
                <label className="text-slate-300 font-medium block mb-1.5">
                  Trader / Admin Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter assigned username"
                  autoComplete="off"
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1.5">
                  Security Passkey
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter passkey"
                  autoComplete="new-password"
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold uppercase tracking-wider transition-colors"
              >
                {loggingIn ? 'Authenticating...' : 'Connect to Trading Floor'}
              </button>
            </form>
          </div>
        </main>

        <footer className="max-w-6xl w-full mx-auto py-4 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-4 text-sm text-slate-300">
          <span className="font-semibold text-white">
            IITB Stoxchange — Local Multiplayer Market Simulation
          </span>
          <div>
            Developed by{' '}
            <a
              href="https://www.cse.iitb.ac.in/~pranavb/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-amber-400 hover:text-amber-300 underline underline-offset-4 transition-colors"
            >
              Pranav Bagrecha
            </a>
          </div>
        </footer>
      </div>
    );
  }

  // ==================== AUTHENTICATED TOP BAR (3-Zone Contract) ====================
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      <header className="px-6 py-3 bg-[#0B0F17] border-b border-[#1E293B] flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <a href="#top" className="text-lg font-bold tracking-tight text-white">
          IITB Stoxchange
        </a>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          {user.role === 'Admin' ? (
            <>
              <button
                onClick={() => setAdminViewMode('admin')}
                className={`hover:text-white transition-colors ${
                  adminViewMode === 'admin' ? 'text-amber-400 underline underline-offset-4' : ''
                }`}
              >
                Sudo Mode Command Center
              </button>
              <button
                onClick={() => setAdminViewMode('terminal')}
                className={`hover:text-white transition-colors ${
                  adminViewMode === 'terminal' ? 'text-emerald-400 underline underline-offset-4' : ''
                }`}
              >
                Live Trading Floor Preview
              </button>
            </>
          ) : (
            <span className="text-slate-300">
              Trader Session: {user.username}
            </span>
          )}
        </nav>

        {/* Zone 3: 1-2 Primary Actions */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400 hidden sm:inline">
            {user.username} · {user.role}
          </span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-[#111827] border border-[#1E293B] hover:border-slate-600 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        {user.role === 'Admin' && adminViewMode === 'admin' ? (
          <AdminGodView
            users={usersList}
            games={games}
            selectedGameId={selectedGameId}
            onSelectGame={(id) => setSelectedGameId(id)}
            gameState={gameState}
            onRefreshAll={() => {
              fetchGamesAndUsers(user);
              if (selectedGameId) fetchGameState(selectedGameId);
            }}
          />
        ) : (
          <PlayerTerminal
            user={user}
            games={games}
            selectedGameId={selectedGameId}
            onSelectGame={(id) => setSelectedGameId(id)}
            gameState={gameState}
            flashNews={flashNews}
            onDismissFlash={() => setFlashNews(null)}
            onRefreshState={() => {
              if (selectedGameId) fetchGameState(selectedGameId);
            }}
            onRefreshGamesList={() => fetchGamesAndUsers(user)}
          />
        )}
      </div>

      <footer className="px-6 py-3.5 bg-[#111827] border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm text-slate-300">
        <span className="font-semibold text-white">
          IITB Stoxchange — 100% Local Self-Contained Simulation Engine
        </span>
        <div>
          Built by{' '}
          <a
            href="https://www.cse.iitb.ac.in/~pranavb/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-amber-400 hover:text-amber-300 underline underline-offset-4 transition-colors"
          >
            Pranav Bagrecha
          </a>
        </div>
      </footer>
    </div>
  );
}
