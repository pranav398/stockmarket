import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Lock,
  Megaphone,
  ArrowUpRight,
  ArrowDownRight,
  PauseCircle,
  KeyRound,
  PlusCircle,
} from 'lucide-react';
import {
  FullGameState,
  Game,
  User,
  authFetch,
  formatISTTime,
} from '../types';
import { StockChart } from './StockChart';

interface PlayerTerminalProps {
  user: User;
  games: Game[];
  selectedGameId: number | null;
  onSelectGame: (id: number) => void;
  gameState: FullGameState | null;
  flashNews: { headline: string; impact_summary: string; severity: string } | null;
  onDismissFlash: () => void;
  onRefreshState: () => void;
  onRefreshGamesList?: () => void;
}

export function formatINR(num: number): string {
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const PlayerTerminal: React.FC<PlayerTerminalProps> = ({
  user,
  games,
  selectedGameId,
  onSelectGame,
  gameState,
  flashNews,
  onDismissFlash,
  onRefreshState,
  onRefreshGamesList,
}) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'portfolio' | 'intel' | 'leaderboard'>('terminal');
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState<string>('10');
  const [tradeStatus, setTradeStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchTicker, setSearchTicker] = useState('');

  // Join by 6-character code state
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinCodeStatus, setJoinCodeStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  useEffect(() => {
    if (gameState && gameState.stocks.length > 0) {
      const exists = gameState.stocks.some((s) => s.id === selectedStockId);
      if (!exists) {
        setSelectedStockId(gameState.stocks[0].id);
      }
    }
  }, [gameState, selectedStockId]);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCodeInput.trim().toUpperCase();
    if (clean.length !== 6) {
      setJoinCodeStatus({ type: 'err', msg: 'Enter a valid 6-character alphanumeric code.' });
      return;
    }
    setJoiningByCode(true);
    setJoinCodeStatus(null);
    try {
      const res = await authFetch('/api/games/join-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinCodeStatus({ type: 'err', msg: data.error || 'Failed to join round' });
      } else {
        setJoinCodeStatus({ type: 'ok', msg: `Joined ${data.gameName}!` });
        setJoinCodeInput('');
        setShowJoinModal(false);
        if (onRefreshGamesList) onRefreshGamesList();
        if (data.gameId) onSelectGame(data.gameId);
      }
    } catch {
      setJoinCodeStatus({ type: 'err', msg: 'Network error verifying code' });
    } finally {
      setJoiningByCode(false);
    }
  };

  if (games.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 bg-[#111827] border border-[#1E293B] space-y-6">
        <div className="text-center space-y-2">
          <KeyRound className="w-10 h-10 text-amber-400 mx-auto mb-2" />
          <h2 className="text-xl font-semibold text-slate-100">
            Enter 6-Digit Game Access Code
          </h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Your trader account (<span className="text-slate-200 font-mono">{user.username}</span>) is active. Enter the 6-character alphanumeric lobby code provided by the Exchange Administrator to join an active round.
          </p>
        </div>

        <form onSubmit={handleJoinByCode} className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              maxLength={6}
              placeholder="e.g. IITB26"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              className="flex-1 bg-[#0B0F17] border border-[#1E293B] px-4 py-3 text-center text-lg font-mono font-bold tracking-widest text-amber-400 uppercase focus:outline-none focus:border-amber-500"
              required
            />
            <button
              type="submit"
              disabled={joiningByCode}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
            >
              {joiningByCode ? 'Joining...' : 'Join Round →'}
            </button>
          </div>

          {joinCodeStatus && (
            <div
              className={`p-3 text-xs border ${
                joinCodeStatus.type === 'ok'
                  ? 'bg-emerald-950/60 border-emerald-700 text-emerald-200'
                  : 'bg-red-950/60 border-red-700 text-red-200'
              }`}
            >
              {joinCodeStatus.msg}
            </div>
          )}
        </form>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="p-8 text-center text-sm text-slate-400 font-mono">
        Synchronizing live order book with Exchange floor...
      </div>
    );
  }

  const myPlayer = gameState.players.find((p) => p.user_id === user.id);
  const selectedStock =
    gameState.stocks.find((s) => s.id === selectedStockId) || gameState.stocks[0];

  const myHolding = myPlayer?.holdings.find((h) => h.stock_id === selectedStock?.id);
  const currentQtyOwned = myHolding ? myHolding.quantity : 0;

  const feePct = Number(gameState.game.trade_fee_percent) || 0;
  const maxOrderLot = Number(gameState.game.max_order_quantity) || 5000;
  const maxPosPct = Number(gameState.game.max_position_percent) || 100;
  const allowShort = Boolean(gameState.game.allow_short_selling);
  const shortMargin = Number(gameState.game.short_margin_requirement) || 0.5;

  const parsedQty = Math.max(0, Math.floor(Number(quantity) || 0));
  const grossOrderValue = selectedStock ? parsedQty * selectedStock.current_price : 0;
  const estimatedFee = (grossOrderValue * feePct) / 100;
  const netCashImpact =
    orderSide === 'BUY' ? grossOrderValue + estimatedFee : grossOrderValue - estimatedFee;

  const maxBuyableByCash =
    myPlayer && selectedStock && selectedStock.current_price > 0
      ? Math.floor(
          myPlayer.cash_balance / (selectedStock.current_price * (1 + feePct / 100))
        )
      : 0;
  const maxBuyable = Math.min(maxOrderLot, maxBuyableByCash);

  const handleExecuteOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStock || !selectedGameId || parsedQty <= 0) return;
    setSubmitting(true);
    setTradeStatus(null);
    try {
      const res = await authFetch(`/api/games/${selectedGameId}/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          stockId: selectedStock.id,
          type: orderSide,
          quantity: parsedQty,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTradeStatus({ type: 'err', msg: data.error || 'Order rejected' });
      } else {
        setTradeStatus({
          type: 'ok',
          msg: `Executed ${orderSide} ${parsedQty} ${selectedStock.ticker} @ ₹${formatINR(data.executedPrice)}${
            data.fee > 0 ? ` (Fee: ₹${formatINR(data.fee)})` : ''
          }`,
        });
        onRefreshState();
      }
    } catch {
      setTradeStatus({ type: 'err', msg: 'Network error executing trade' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlockHint = async (hintId: number) => {
    if (!selectedGameId) return;
    try {
      const res = await authFetch(`/api/games/${selectedGameId}/unlock-hint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, hintId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTradeStatus({ type: 'err', msg: data.error || 'Could not unlock dossier' });
      } else {
        onRefreshState();
      }
    } catch {
      setTradeStatus({ type: 'err', msg: 'Failed to contact Information Store' });
    }
  };

  const filteredStocks = gameState.stocks.filter(
    (s) =>
      s.ticker.toLowerCase().includes(searchTicker.toLowerCase()) ||
      s.name.toLowerCase().includes(searchTicker.toLowerCase())
  );

  const latestNews = gameState.news[0];

  return (
    <div className="flex flex-col min-h-[calc(100vh-57px)] bg-[#0B0F17] text-slate-100">
      {/* Live Breaking News Banner */}
      {(flashNews || latestNews) && (
        <div
          className={`px-6 py-2.5 border-b flex items-center justify-between gap-4 text-xs ${
            (flashNews?.severity || latestNews?.severity) === 'Bearish' ||
            (flashNews?.severity || latestNews?.severity) === 'Critical'
              ? 'bg-red-950/50 border-red-800/60 text-red-200'
              : (flashNews?.severity || latestNews?.severity) === 'Bullish'
              ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-200'
              : 'bg-[#111827] border-[#1E293B] text-slate-300'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Megaphone className="w-4 h-4 shrink-0 text-amber-400" />
            <div className="truncate">
              <span className="font-semibold mr-2">
                {flashNews ? 'BREAKING WIRE:' : 'EXCHANGE WIRE:'}
              </span>
              <span className="font-medium text-white">
                {flashNews ? flashNews.headline : latestNews.headline}
              </span>
              {(flashNews?.impact_summary || latestNews?.impact_summary) && (
                <span className="text-slate-400 ml-2">
                  — {flashNews ? flashNews.impact_summary : latestNews.impact_summary}
                </span>
              )}
            </div>
          </div>
          {flashNews && (
            <button
              onClick={onDismissFlash}
              className="text-xs text-slate-300 hover:text-white underline shrink-0 whitespace-nowrap"
            >
              Acknowledge
            </button>
          )}
        </div>
      )}

      {/* Sub-header Bar: Round selector, Join by Code button, Portfolio KPI strip, View Switcher */}
      <div className="px-6 py-3 bg-[#111827] border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Active Lobby</label>
            <select
              value={selectedGameId || ''}
              onChange={(e) => onSelectGame(Number(e.target.value))}
              className="bg-[#0B0F17] border border-[#1E293B] text-slate-100 text-xs px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.status})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowJoinModal(!showJoinModal);
              setJoinCodeStatus(null);
            }}
            className="px-2.5 py-1.5 bg-[#0B0F17] border border-[#1E293B] hover:border-amber-500 text-amber-400 text-xs font-mono flex items-center gap-1 whitespace-nowrap"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Join Code
          </button>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Status:</span>
            <span
              className={`font-mono font-semibold ${
                gameState.game.status === 'Active'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {gameState.game.status === 'Active' ? 'OPEN // LIVE' : `${gameState.game.status.toUpperCase()} // HALTED`}
            </span>
          </div>
        </div>

        {/* Player Live KPIs */}
        {myPlayer && (
          <div className="flex flex-wrap items-center gap-6 text-xs font-mono tabular-nums">
            <div>
              <span className="text-slate-400 block text-[11px] font-sans">Cash Available</span>
              <span className="text-sm font-semibold text-white">
                ₹{formatINR(myPlayer.cash_balance)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] font-sans">Equity Value</span>
              <span className="text-sm font-semibold text-slate-200">
                ₹{formatINR(myPlayer.portfolioValue)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] font-sans">Total Net Worth</span>
              <span className="text-sm font-semibold text-emerald-400">
                ₹{formatINR(myPlayer.netWorth)}{' '}
                <span
                  className={
                    myPlayer.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }
                >
                  ({myPlayer.pnlPercent >= 0 ? '+' : ''}
                  {myPlayer.pnlPercent}%)
                </span>
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] font-sans">Information Credits</span>
              <span className="text-sm font-semibold text-amber-400">
                {myPlayer.info_credits} CR
              </span>
            </div>
          </div>
        )}

        {/* Segmented Workspace Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-[#1E293B]">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'terminal'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Trading Desk
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'portfolio'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Portfolio ({myPlayer?.holdings.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('intel')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'intel'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Information Store ({gameState.unlockedHintIds.length}/{gameState.hints.length})
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'leaderboard'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Standings & Wire
          </button>
        </div>
      </div>

      {/* Collapsible 6-char Join Code Bar */}
      {showJoinModal && (
        <div className="px-6 py-3 bg-[#0B0F17] border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-4">
          <form onSubmit={handleJoinByCode} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-300 font-medium">
              Enter 6-Digit Alphanumeric Round Code:
            </span>
            <input
              type="text"
              maxLength={6}
              placeholder="IITB26"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              className="w-28 bg-[#111827] border border-[#1E293B] px-3 py-1.5 font-mono font-bold tracking-widest text-amber-400 uppercase focus:outline-none focus:border-amber-500"
              required
            />
            <button
              type="submit"
              disabled={joiningByCode}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {joiningByCode ? 'Joining...' : 'Join Game'}
            </button>
            <button
              type="button"
              onClick={() => setShowJoinModal(false)}
              className="px-2.5 py-1.5 text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </form>
          {joinCodeStatus && (
            <span
              className={`text-xs font-mono ${
                joinCodeStatus.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {joinCodeStatus.msg}
            </span>
          )}
        </div>
      )}

      {gameState.game.status !== 'Active' && (
        <div className="bg-amber-950/60 border-b border-amber-700/60 px-6 py-2 flex items-center gap-2 text-xs text-amber-200">
          <PauseCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Trading is currently {gameState.game.status.toLowerCase()} by the Exchange Administrator. Order execution is suspended until the session resumes.
          </span>
        </div>
      )}

      {/* MAIN WORKSPACE CONTENT */}
      {activeTab === 'terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1">
          {/* LEFT 3 COLS: Live Market Watchlist */}
          <div className="lg:col-span-3 border-r border-[#1E293B] bg-[#111827]/60 flex flex-col">
            <div className="p-3 border-b border-[#1E293B] flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-300">Market Watchlist</span>
              <input
                type="text"
                placeholder="Filter ticker..."
                value={searchTicker}
                onChange={(e) => setSearchTicker(e.target.value)}
                className="bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 w-32"
              />
            </div>

            <div className="divide-y divide-[#1E293B] overflow-y-auto flex-1">
              {filteredStocks.map((st) => {
                const changeFromBase =
                  st.base_price > 0
                    ? ((st.current_price - st.base_price) / st.base_price) * 100
                    : 0;
                const tickDelta = st.current_price - st.previous_price;
                const isSelected = selectedStock?.id === st.id;
                const held = myPlayer?.holdings.find((h) => h.stock_id === st.id);

                return (
                  <button
                    key={st.id}
                    onClick={() => {
                      setSelectedStockId(st.id);
                      setTradeStatus(null);
                    }}
                    className={`w-full text-left p-3.5 transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#1E293B]/90 border-l-2 border-l-emerald-500'
                        : 'hover:bg-[#1E293B]/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-white">
                          {st.ticker}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate">
                          · {st.sector}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {st.name}
                      </div>
                      {held && held.quantity !== 0 && (
                        <div
                          className={`text-[11px] font-mono mt-1 ${
                            held.quantity > 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          Position: {held.quantity > 0 ? `${held.quantity} sh (Long)` : `${held.quantity} sh (Short)`}
                        </div>
                      )}
                    </div>

                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div
                        className={`text-sm font-semibold flex items-center justify-end gap-1 ${
                          tickDelta > 0
                            ? 'text-emerald-400'
                            : tickDelta < 0
                            ? 'text-red-400'
                            : 'text-slate-100'
                        }`}
                      >
                        {tickDelta > 0 && <ArrowUpRight className="w-3.5 h-3.5" />}
                        {tickDelta < 0 && <ArrowDownRight className="w-3.5 h-3.5" />}
                        ₹{formatINR(st.current_price)}
                      </div>
                      <div
                        className={`text-[11px] ${
                          changeFromBase >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {changeFromBase >= 0 ? '+' : ''}
                        {changeFromBase.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CENTER 6 COLS: Selected Instrument Chart, Depth & Tape */}
          <div className="lg:col-span-6 border-r border-[#1E293B] p-5 flex flex-col gap-5">
            {selectedStock ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#1E293B] pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl font-bold text-white font-mono">
                        {selectedStock.ticker}
                      </h1>
                      <span className="text-sm text-slate-400">·</span>
                      <span className="text-sm font-medium text-slate-200">
                        {selectedStock.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2 font-mono tabular-nums">
                      <span>Sector: {selectedStock.sector}</span>
                      <span>·</span>
                      <span>Vol: {(selectedStock.volatility * 100).toFixed(1)}%</span>
                      <span>·</span>
                      <span>
                        Circuit Bounds: ₹
                        {formatINR(
                          selectedStock.base_price *
                            (1 - (gameState.game.circuit_breaker_down_pct || 50) / 100)
                        )}{' '}
                        – ₹
                        {formatINR(
                          selectedStock.base_price *
                            (1 + (gameState.game.circuit_breaker_up_pct || 200) / 100)
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="text-right font-mono tabular-nums">
                    <div className="text-2xl font-bold text-white">
                      ₹{formatINR(selectedStock.current_price)}
                    </div>
                    <div
                      className={`text-xs flex items-center justify-end gap-1 ${
                        selectedStock.current_price >= selectedStock.base_price
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {selectedStock.current_price >= selectedStock.base_price ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {selectedStock.current_price >= selectedStock.base_price ? '+' : ''}
                        {(
                          ((selectedStock.current_price - selectedStock.base_price) /
                            selectedStock.base_price) *
                          100
                        ).toFixed(2)}
                        % vs Base (₹{formatINR(selectedStock.base_price)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Real-time Price Chart */}
                <StockChart
                  history={selectedStock.price_history}
                  basePrice={selectedStock.base_price}
                  ticker={selectedStock.ticker}
                />

                {/* Your Position in this Stock + Unlocked Intel Preview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-[#111827] border border-[#1E293B]">
                    <div className="text-xs font-semibold text-slate-300 mb-2">
                      Your Position in {selectedStock.ticker}
                    </div>
                    {myHolding && myHolding.quantity !== 0 ? (
                      <div className="space-y-1.5 text-xs font-mono tabular-nums">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Position Type:</span>
                          <span
                            className={`font-semibold ${
                              myHolding.quantity > 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {myHolding.quantity > 0
                              ? `LONG (${myHolding.quantity} sh)`
                              : `SHORT (${myHolding.quantity} sh)`}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Avg Entry Price:</span>
                          <span className="text-slate-200">₹{formatINR(myHolding.avg_buy_price)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Position Value:</span>
                          <span className="text-white">
                            ₹{formatINR(myHolding.quantity * selectedStock.current_price)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-[#1E293B]">
                          <span className="text-slate-400">Unrealized P&L:</span>
                          {(() => {
                            const pnl =
                              myHolding.quantity > 0
                                ? (selectedStock.current_price - myHolding.avg_buy_price) *
                                  myHolding.quantity
                                : (myHolding.avg_buy_price - selectedStock.current_price) *
                                  Math.abs(myHolding.quantity);
                            return (
                              <span
                                className={`font-semibold ${
                                  pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}
                              >
                                {pnl >= 0 ? '+' : ''}₹{formatINR(pnl)}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 py-4">
                        No active position held in {selectedStock.ticker}. Use the execution ticket on the right to open a position.
                      </div>
                    )}
                  </div>

                  {/* Dossiers available for this stock */}
                  <div className="p-4 bg-[#111827] border border-[#1E293B] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-300">
                          Research & Risk Dossiers ({selectedStock.ticker})
                        </span>
                        <button
                          onClick={() => setActiveTab('intel')}
                          className="text-[11px] text-amber-400 hover:underline"
                        >
                          Open Store →
                        </button>
                      </div>
                      {(() => {
                        const stockHints = gameState.hints.filter(
                          (h) => h.stock_id === selectedStock.id
                        );
                        if (stockHints.length === 0) {
                          return (
                            <p className="text-xs text-slate-500">
                              No intelligence dossiers filed for this instrument yet.
                            </p>
                          );
                        }
                        return (
                          <div className="space-y-2">
                            {stockHints.slice(0, 2).map((h) => {
                              const isUnlocked = gameState.unlockedHintIds.includes(h.id);
                              return (
                                <div
                                  key={h.id}
                                  className="text-xs border-t border-[#1E293B] pt-2 first:border-0 first:pt-0"
                                >
                                  <div className="flex items-center justify-between text-slate-200 font-medium">
                                    <span className="truncate">{h.title}</span>
                                    <span className="font-mono text-[11px] text-amber-400 shrink-0 ml-2">
                                      {isUnlocked ? 'UNLOCKED' : `${h.cost_credits} CR`}
                                    </span>
                                  </div>
                                  {isUnlocked ? (
                                    <p className="text-[11px] text-emerald-300/90 mt-1 line-clamp-2">
                                      {h.content}
                                    </p>
                                  ) : (
                                    <button
                                      onClick={() => handleUnlockHint(h.id)}
                                      className="mt-1 text-[11px] text-amber-400 hover:text-amber-300 underline"
                                    >
                                      Redeem {h.cost_credits} Credits to decrypt →
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Recent Market Tape (IST) */}
                <div className="flex-1">
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Recent Exchange Executions (IST +5:30)
                  </div>
                  <div className="border border-[#1E293B] bg-[#111827] overflow-hidden">
                    <table className="w-full text-left text-xs font-mono tabular-nums">
                      <thead className="bg-[#0B0F17] text-slate-400 border-b border-[#1E293B]">
                        <tr>
                          <th className="py-2 px-3">Time (IST)</th>
                          <th className="py-2 px-3">Trader</th>
                          <th className="py-2 px-3">Side</th>
                          <th className="py-2 px-3">Ticker</th>
                          <th className="py-2 px-3 text-right">Qty</th>
                          <th className="py-2 px-3 text-right">Fill Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E293B]">
                        {gameState.recentTrades.slice(0, 7).map((tr) => (
                          <tr key={tr.id} className="hover:bg-[#1E293B]/30">
                            <td className="py-1.5 px-3 text-slate-400">
                              {formatISTTime(tr.created_at)}
                            </td>
                            <td className="py-1.5 px-3 text-slate-200">{tr.username}</td>
                            <td
                              className={`py-1.5 px-3 font-semibold ${
                                tr.type === 'BUY' ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {tr.type}
                            </td>
                            <td className="py-1.5 px-3 text-white">{tr.ticker}</td>
                            <td className="py-1.5 px-3 text-right text-slate-200">
                              {tr.quantity}
                            </td>
                            <td className="py-1.5 px-3 text-right text-slate-200">
                              ₹{formatINR(tr.price)}
                            </td>
                          </tr>
                        ))}
                        {gameState.recentTrades.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-slate-500">
                              No trades executed in this round yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* RIGHT 3 COLS: Order Execution Ticket */}
          <div className="lg:col-span-3 p-5 bg-[#111827] flex flex-col justify-between">
            {selectedStock && (
              <div>
                <div className="flex items-center justify-between border-b border-[#1E293B] pb-3 mb-4">
                  <span className="text-sm font-semibold text-white">
                    Order Execution Ticket
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {selectedStock.ticker}
                  </span>
                </div>

                {/* Buy / Sell Segmented Toggle */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F17] border border-[#1E293B] mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setOrderSide('BUY');
                      setTradeStatus(null);
                    }}
                    className={`py-2 text-xs font-semibold transition-colors ${
                      orderSide === 'BUY'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    BUY / LONG
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderSide('SELL');
                      setTradeStatus(null);
                    }}
                    className={`py-2 text-xs font-semibold transition-colors ${
                      orderSide === 'SELL'
                        ? 'bg-red-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {allowShort ? 'SELL / SHORT' : 'SELL / CLOSE'}
                  </button>
                </div>

                <form onSubmit={handleExecuteOrder} className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Execution Type</span>
                      <span className="font-mono text-slate-200">INSTANT MARKET FILL</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Spot Price</span>
                      <span className="font-mono text-white font-semibold">
                        ₹{formatINR(selectedStock.current_price)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <label className="text-slate-300 font-medium">Share Quantity</label>
                      <span className="text-slate-400 font-mono">
                        {orderSide === 'BUY'
                          ? `Max Allowed: ${maxBuyable} sh`
                          : `Held: ${currentQtyOwned} sh`}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max={maxOrderLot}
                      step="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                    />

                    {/* Quick Allocation Presets */}
                    <div className="grid grid-cols-4 gap-1.5 mt-2">
                      {[0.25, 0.5, 0.75, 1].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            const baseMax =
                              orderSide === 'BUY'
                                ? maxBuyable
                                : currentQtyOwned > 0
                                ? currentQtyOwned
                                : allowShort
                                ? Math.min(maxOrderLot, 100)
                                : 0;
                            const calc = Math.max(1, Math.floor(baseMax * pct));
                            setQuantity(String(calc));
                          }}
                          className="py-1 text-[11px] font-mono bg-[#0B0F17] border border-[#1E293B] text-slate-300 hover:border-slate-500"
                        >
                          {pct * 100}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-[#0B0F17] border border-[#1E293B] space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gross Value:</span>
                      <span className="text-slate-200">
                        ₹{formatINR(grossOrderValue)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">
                        Exchange Fee ({feePct}%):
                      </span>
                      <span className="text-amber-400">
                        ₹{formatINR(estimatedFee)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-[#1E293B]">
                      <span className="text-slate-300 font-semibold">
                        {orderSide === 'BUY' ? 'Total Debit:' : 'Net Proceeds:'}
                      </span>
                      <span className="text-white font-semibold">
                        ₹{formatINR(netCashImpact)}
                      </span>
                    </div>
                  </div>

                  {tradeStatus && (
                    <div
                      className={`p-3 text-xs border ${
                        tradeStatus.type === 'ok'
                          ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200'
                          : 'bg-red-950/50 border-red-700 text-red-200'
                      }`}
                    >
                      {tradeStatus.msg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || gameState.game.status !== 'Active'}
                    className={`w-full py-2.5 px-4 text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-40 ${
                      orderSide === 'BUY'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-red-600 hover:bg-red-500 text-white'
                    }`}
                  >
                    {submitting
                      ? 'Routing Order...'
                      : `${orderSide} ${parsedQty} ${selectedStock.ticker}`}
                  </button>
                </form>
              </div>
            )}

            {/* Active Admin Market Rules Box */}
            <div className="mt-6 pt-4 border-t border-[#1E293B] text-[11px] text-slate-400 space-y-1.5 font-mono">
              <div className="font-sans font-semibold text-slate-300">
                Active Round Rules
              </div>
              <div className="flex justify-between">
                <span>Max Order Lot:</span>
                <span className="text-slate-200">{maxOrderLot.toLocaleString()} sh</span>
              </div>
              <div className="flex justify-between">
                <span>Max Concentration:</span>
                <span className="text-slate-200">{maxPosPct}% Net Worth</span>
              </div>
              <div className="flex justify-between">
                <span>Commission Fee:</span>
                <span className="text-slate-200">{feePct}%</span>
              </div>
              <div className="flex justify-between">
                <span>Short Selling:</span>
                <span className="text-slate-200">
                  {allowShort ? `Allowed (${(shortMargin * 100).toFixed(0)}% Margin)` : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Circuit Breakers:</span>
                <span className="text-slate-200">
                  -{gameState.game.circuit_breaker_down_pct}% / +{gameState.game.circuit_breaker_up_pct}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PORTFOLIO VIEW */}
      {activeTab === 'portfolio' && myPlayer && (
        <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Current Equity Portfolio & Asset Allocation
              </h2>
              <p className="text-xs text-slate-400">
                Real-time mark-to-market valuation across all open long and short positions in {gameState.game.name}
              </p>
            </div>
            <div className="text-right font-mono tabular-nums">
              <span className="text-xs text-slate-400 block">Starting Capital Benchmark</span>
              <span className="text-sm text-slate-200">
                ₹{formatINR(gameState.game.starting_capital)}
              </span>
            </div>
          </div>

          <div className="border border-[#1E293B] bg-[#111827]">
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="bg-[#0B0F17] text-slate-400 border-b border-[#1E293B]">
                <tr>
                  <th className="py-3 px-4">Ticker</th>
                  <th className="py-3 px-4 font-sans">Company</th>
                  <th className="py-3 px-4 text-right">Position</th>
                  <th className="py-3 px-4 text-right">Avg Entry Price</th>
                  <th className="py-3 px-4 text-right">Live Price</th>
                  <th className="py-3 px-4 text-right">Market Value</th>
                  <th className="py-3 px-4 text-right">Unrealized P&L</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {myPlayer.holdings.map((h) => {
                  const st = gameState.stocks.find((s) => s.id === h.stock_id);
                  const curPrice = st ? st.current_price : h.avg_buy_price;
                  const mktVal = h.quantity * curPrice;
                  const pnl =
                    h.quantity > 0
                      ? (curPrice - h.avg_buy_price) * h.quantity
                      : (h.avg_buy_price - curPrice) * Math.abs(h.quantity);
                  const pnlPct =
                    h.avg_buy_price > 0
                      ? (pnl / (Math.abs(h.quantity) * h.avg_buy_price)) * 100
                      : 0;

                  return (
                    <tr key={h.id} className="hover:bg-[#1E293B]/40">
                      <td className="py-3 px-4 font-semibold text-white">{h.ticker}</td>
                      <td className="py-3 px-4 font-sans text-slate-300">{h.stock_name}</td>
                      <td
                        className={`py-3 px-4 text-right font-semibold ${
                          h.quantity > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {h.quantity > 0 ? `${h.quantity} (LONG)` : `${h.quantity} (SHORT)`}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-300">
                        ₹{formatINR(h.avg_buy_price)}
                      </td>
                      <td className="py-3 px-4 text-right text-white font-semibold">
                        ₹{formatINR(curPrice)}
                      </td>
                      <td className="py-3 px-4 text-right text-white">
                        ₹{formatINR(mktVal)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold ${
                          pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}₹{formatINR(pnl)} ({pnl >= 0 ? '+' : ''}
                        {pnlPct.toFixed(2)}%)
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedStockId(h.stock_id);
                            setOrderSide(h.quantity > 0 ? 'SELL' : 'BUY');
                            setQuantity(String(Math.abs(h.quantity)));
                            setActiveTab('terminal');
                          }}
                          className="px-2.5 py-1 bg-[#0B0F17] border border-[#1E293B] text-slate-200 hover:border-emerald-500 text-[11px]"
                        >
                          {h.quantity > 0 ? 'Close / Sell →' : 'Cover Short →'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {myPlayer.holdings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                      You currently hold 100% Cash (₹{formatINR(myPlayer.cash_balance)}). Head to the Trading Desk to acquire equities.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INFORMATION STORE (CREDITS REDEMPTION) */}
      {activeTab === 'intel' && (
        <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Exchange Information Store & Risk Dossiers
              </h2>
              <p className="text-xs text-slate-400">
                Spend your Information Credits to decrypt Admin-authored insider hints, regulatory audits, and institutional risk metrics.
              </p>
            </div>
            <div className="px-4 py-2 bg-[#111827] border border-[#1E293B] font-mono tabular-nums text-xs">
              <span className="text-slate-400 mr-2">Available Balance:</span>
              <span className="text-amber-400 font-bold text-sm">
                {myPlayer?.info_credits ?? 0} CREDITS
              </span>
            </div>
          </div>

          {tradeStatus && (
            <div
              className={`p-3 text-xs border ${
                tradeStatus.type === 'ok'
                  ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200'
                  : 'bg-red-950/50 border-red-700 text-red-200'
              }`}
            >
              {tradeStatus.msg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gameState.hints.map((hint) => {
              const isUnlocked = gameState.unlockedHintIds.includes(hint.id);
              const canAfford = (myPlayer?.info_credits ?? 0) >= hint.cost_credits;

              return (
                <div
                  key={hint.id}
                  className={`p-5 border flex flex-col justify-between transition-colors ${
                    isUnlocked
                      ? 'bg-[#111827] border-emerald-800/70'
                      : 'bg-[#111827]/70 border-[#1E293B]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
                      <div>
                        <span className="text-white font-bold">{hint.ticker}</span>
                        <span className="mx-1.5">·</span>
                        <span>{hint.category}</span>
                      </div>
                      <span className="text-amber-400 font-semibold">
                        {isUnlocked ? 'DECRYPTED' : `${hint.cost_credits} CREDITS`}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-white mb-2">
                      {hint.title}
                    </h3>

                    {isUnlocked ? (
                      <div className="mt-3 p-3.5 bg-[#0B0F17] border border-[#1E293B] space-y-2">
                        <div className="text-[11px] font-mono text-amber-400">
                          RISK METRIC: {hint.risk_rating}
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {hint.content}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 p-4 bg-[#0B0F17] border border-dashed border-[#1E293B] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5 text-xs text-slate-400">
                          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            Classified research note & quantitative beta rating locked.
                          </span>
                        </div>
                        <button
                          onClick={() => handleUnlockHint(hint.id)}
                          disabled={!canAfford}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs whitespace-nowrap transition-colors"
                        >
                          Unlock ({hint.cost_credits} CR)
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#1E293B] flex items-center justify-between text-[11px] text-slate-400">
                    <span>Target Instrument: {hint.stock_name}</span>
                    <button
                      onClick={() => {
                        setSelectedStockId(hint.stock_id);
                        setActiveTab('terminal');
                      }}
                      className="text-emerald-400 hover:underline font-mono"
                    >
                      Trade {hint.ticker} →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STANDINGS & NEWS WIRE */}
      {activeTab === 'leaderboard' && (
        <div className="p-6 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            <h2 className="text-base font-semibold text-white">
              Live Round Standings ({gameState.game.name})
            </h2>
            <div className="border border-[#1E293B] bg-[#111827]">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="bg-[#0B0F17] text-slate-400 border-b border-[#1E293B]">
                  <tr>
                    <th className="py-2.5 px-4">Rank</th>
                    <th className="py-2.5 px-4 font-sans">Trader</th>
                    <th className="py-2.5 px-4 text-right">Cash</th>
                    <th className="py-2.5 px-4 text-right">Equity</th>
                    <th className="py-2.5 px-4 text-right">Net Worth</th>
                    <th className="py-2.5 px-4 text-right">Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {gameState.players.map((p, idx) => (
                    <tr
                      key={p.user_id}
                      className={
                        p.user_id === user.id ? 'bg-emerald-950/30' : 'hover:bg-[#1E293B]/30'
                      }
                    >
                      <td className="py-2.5 px-4 text-slate-400">#{idx + 1}</td>
                      <td className="py-2.5 px-4 font-sans font-medium text-white">
                        {p.username} {p.user_id === user.id && '(You)'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-300">
                        ₹{formatINR(p.cash_balance)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-300">
                        ₹{formatINR(p.portfolioValue)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-white font-semibold">
                        ₹{formatINR(p.netWorth)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-semibold ${
                          p.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {p.pnlPercent >= 0 ? '+' : ''}
                        {p.pnlPercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-3">
            <h2 className="text-base font-semibold text-white">
              Exchange News Wire History (IST +5:30)
            </h2>
            <div className="space-y-2.5">
              {gameState.news.map((n) => (
                <div
                  key={n.id}
                  className="p-3.5 bg-[#111827] border border-[#1E293B] space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>
                      {n.severity.toUpperCase()}
                      {n.affected_ticker ? ` · ${n.affected_ticker}` : ''}
                      {n.price_delta_percent !== 0
                        ? ` (${n.price_delta_percent > 0 ? '+' : ''}${n.price_delta_percent}%)`
                        : ''}
                    </span>
                    <span>{formatISTTime(n.created_at)}</span>
                  </div>
                  <div className="text-xs font-semibold text-white">{n.headline}</div>
                  {n.impact_summary && (
                    <p className="text-xs text-slate-400">{n.impact_summary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
