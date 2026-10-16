export interface User {
  id: number;
  username: string;
  role: 'Admin' | 'Player';
  is_banned: number;
  created_at: string;
  token?: string;
}

export interface Game {
  id: number;
  name: string;
  starting_capital: number;
  initial_credits: number;
  status: 'Active' | 'Paused' | 'Completed';
  tick_interval_ms: number;
  demand_impact_factor: number;
  random_drift_bias: number;
  noise_multiplier: number;
  trade_fee_percent: number;
  max_order_quantity: number;
  max_position_percent: number;
  circuit_breaker_down_pct: number;
  circuit_breaker_up_pct: number;
  circuit_breaker_reset_minutes: number;
  allow_short_selling: number;
  short_margin_requirement: number;
  join_code: string | null;
  join_code_expires_at: string | null;
  created_at: string;
}

export interface Stock {
  id: number;
  game_id: number;
  name: string;
  ticker: string;
  sector: string;
  base_price: number;
  current_price: number;
  previous_price: number;
  high_price: number;
  low_price: number;
  volatility: number;
  volume: number;
  price_history: { time: string; price: number }[];
}

export interface GamePlayer {
  id: number;
  game_id: number;
  user_id: number;
  username: string;
  is_banned?: number;
  cash_balance: number;
  info_credits: number;
  joined_at: string;
}

export interface Holding {
  id: number;
  game_id: number;
  user_id: number;
  stock_id: number;
  ticker?: string;
  stock_name?: string;
  quantity: number;
  avg_buy_price: number;
}

export interface StockHint {
  id: number;
  game_id: number;
  stock_id: number;
  ticker: string;
  stock_name: string;
  title: string;
  category: 'Insider Intel' | 'Risk Metric' | 'Earnings Whisper' | 'Regulatory Audit';
  risk_rating: string;
  content: string;
  cost_credits: number;
  unlocked?: boolean;
}

export interface NewsEvent {
  id: number;
  game_id: number;
  headline: string;
  impact_summary: string;
  severity: 'Info' | 'Bullish' | 'Bearish' | 'Critical';
  affected_ticker: string | null;
  price_delta_percent: number;
  created_at: string;
}

export interface TradeRecord {
  id: number;
  game_id: number;
  user_id: number;
  username: string;
  stock_id: number;
  ticker: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fee: number;
  total: number;
  created_at: string;
}

export type ScheduledTaskActionType =
  | 'SET_STATUS'
  | 'RESET_BASELINE'
  | 'BROADCAST_NEWS'
  | 'MANIPULATE_STOCK'
  | 'ALTER_PLAYER'
  | 'UPDATE_RULES';

export interface ScheduledTask {
  id: number;
  game_id: number;
  execute_at: string;
  action_type: ScheduledTaskActionType;
  payload: any;
  status: 'Pending' | 'Executed' | 'Cancelled' | 'Failed';
  executed_at: string | null;
  created_at: string;
}

export interface FullGameState {
  game: Game;
  stocks: Stock[];
  players: (GamePlayer & {
    holdings: Holding[];
    portfolioValue: number;
    netWorth: number;
    pnlPercent: number;
  })[];
  hints: StockHint[];
  unlockedHintIds: number[];
  news: NewsEvent[];
  recentTrades: TradeRecord[];
  scheduledTasks: ScheduledTask[];
}

export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token = '';
  try {
    const saved = localStorage.getItem('apex_exchange_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.token) token = parsed.token;
    }
  } catch {
    // ignore
  }
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
}

/**
 * Formats any ISO date or Date object into Indian Standard Time (IST, UTC+05:30).
 */
export function formatISTTime(dateInput: string | number | Date): string {
  try {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return String(dateInput);
    return (
      d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' IST'
    );
  } catch {
    return String(dateInput);
  }
}

export function formatISTDateTime(dateInput: string | number | Date): string {
  try {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return String(dateInput);
    return (
      d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' IST'
    );
  } catch {
    return String(dateInput);
  }
}

/**
 * Returns a YYYY-MM-DDTHH:mm string in IST (UTC+05:30) suitable for <input type="datetime-local" />
 */
export function getCurrentISTInputString(offsetMinutes = 5): string {
  const now = new Date(Date.now() + offsetMinutes * 60000);
  // Shift by +5:30 (330 minutes) and format as ISO slice
  const istShifted = new Date(now.getTime() + 330 * 60000);
  return istShifted.toISOString().slice(0, 16);
}
