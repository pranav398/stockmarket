import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import initSqlJs, { Database } from 'sql.js';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'simulation.sqlite');

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

let db: Database;
const lastGameTickMap = new Map<number, number>();
const lastBaselineResetMap = new Map<number, number>();
const loginAttemptMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Formats a timestamp or current time strictly in IST (Asia/Kolkata, UTC+05:30).
 */
function getISTTimeStr(dateObj: Date = new Date()): string {
  return (
    dateObj.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' IST'
  );
}

function generateSixCharCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const [, salt, originalHash] = parts;
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(originalHash, 'hex')
    );
  }
  return stored === password;
}

interface TokenPayload {
  id: number;
  username: string;
  role: 'Admin' | 'Player';
  iat: number;
}

function signToken(payload: TokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, Buffer.from(data));
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Failed to persist SQLite database:', err);
  }
}

function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  const rows = queryAll<T>(sql, params);
  return rows[0];
}

function runSql(sql: string, params: any[] = []): { lastInsertRowid: number } {
  db.run(sql, params);
  const res = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
  saveDb();
  return { lastInsertRowid: res ? res.id : 0 };
}

function ensureColumn(table: string, column: string, definition: string) {
  try {
    const cols = queryAll<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      saveDb();
    }
  } catch (e) {
    console.error(`Failed ensuring column ${table}.${column}:`, e);
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Player',
      is_banned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      starting_capital REAL NOT NULL DEFAULT 1000000,
      initial_credits INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'Active',
      tick_interval_ms INTEGER NOT NULL DEFAULT 3000,
      demand_impact_factor REAL NOT NULL DEFAULT 0.0018,
      random_drift_bias REAL NOT NULL DEFAULT 0.0,
      noise_multiplier REAL NOT NULL DEFAULT 0.45,
      trade_fee_percent REAL NOT NULL DEFAULT 0.1,
      max_order_quantity INTEGER NOT NULL DEFAULT 5000,
      max_position_percent REAL NOT NULL DEFAULT 100,
      circuit_breaker_down_pct REAL NOT NULL DEFAULT 50,
      circuit_breaker_up_pct REAL NOT NULL DEFAULT 200,
      circuit_breaker_reset_minutes REAL NOT NULL DEFAULT 0,
      allow_short_selling INTEGER NOT NULL DEFAULT 0,
      short_margin_requirement REAL NOT NULL DEFAULT 0.5,
      join_code TEXT,
      join_code_expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      ticker TEXT NOT NULL,
      sector TEXT NOT NULL DEFAULT 'Technology',
      base_price REAL NOT NULL,
      current_price REAL NOT NULL,
      previous_price REAL NOT NULL,
      high_price REAL NOT NULL,
      low_price REAL NOT NULL,
      volatility REAL NOT NULL DEFAULT 0.02,
      volume INTEGER NOT NULL DEFAULT 0,
      price_history TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      cash_balance REAL NOT NULL,
      info_credits INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      UNIQUE(game_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      stock_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      avg_buy_price REAL NOT NULL DEFAULT 0,
      UNIQUE(game_id, user_id, stock_id)
    );

    CREATE TABLE IF NOT EXISTS stock_hints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      stock_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Insider Intel',
      risk_rating TEXT NOT NULL DEFAULT 'MEDIUM RISK',
      content TEXT NOT NULL,
      cost_credits INTEGER NOT NULL DEFAULT 2
    );

    CREATE TABLE IF NOT EXISTS unlocked_hints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      hint_id INTEGER NOT NULL,
      unlocked_at TEXT NOT NULL,
      UNIQUE(game_id, user_id, hint_id)
    );

    CREATE TABLE IF NOT EXISTS news_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      headline TEXT NOT NULL,
      impact_summary TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'Info',
      affected_ticker TEXT,
      price_delta_percent REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      stock_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      execute_at TEXT NOT NULL,
      action_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      executed_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn('games', 'random_drift_bias', 'REAL NOT NULL DEFAULT 0.0');
  ensureColumn('games', 'noise_multiplier', 'REAL NOT NULL DEFAULT 0.45');
  ensureColumn('games', 'trade_fee_percent', 'REAL NOT NULL DEFAULT 0.1');
  ensureColumn('games', 'max_order_quantity', 'INTEGER NOT NULL DEFAULT 5000');
  ensureColumn('games', 'max_position_percent', 'REAL NOT NULL DEFAULT 100');
  ensureColumn('games', 'circuit_breaker_down_pct', 'REAL NOT NULL DEFAULT 50');
  ensureColumn('games', 'circuit_breaker_up_pct', 'REAL NOT NULL DEFAULT 200');
  ensureColumn('games', 'circuit_breaker_reset_minutes', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('games', 'allow_short_selling', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('games', 'short_margin_requirement', 'REAL NOT NULL DEFAULT 0.5');
  ensureColumn('games', 'join_code', 'TEXT');
  ensureColumn('games', 'join_code_expires_at', 'TEXT');
  ensureColumn('trades', 'fee', 'REAL NOT NULL DEFAULT 0');

  const existingUsers = queryAll('SELECT id FROM users');
  if (existingUsers.length === 0) {
    const now = new Date().toISOString();
    runSql(`INSERT INTO users (username, password, role, is_banned, created_at) VALUES (?, ?, ?, 0, ?)`, [
      'admin',
      hashPassword('admin123'),
      'Admin',
      now,
    ]);
    const p1 = runSql(`INSERT INTO users (username, password, role, is_banned, created_at) VALUES (?, ?, ?, 0, ?)`, [
      'arjun_quant',
      hashPassword('trade123'),
      'Player',
      now,
    ]);
    const p2 = runSql(`INSERT INTO users (username, password, role, is_banned, created_at) VALUES (?, ?, ?, 0, ?)`, [
      'meera_alpha',
      hashPassword('trade123'),
      'Player',
      now,
    ]);
    const p3 = runSql(`INSERT INTO users (username, password, role, is_banned, created_at) VALUES (?, ?, ?, 0, ?)`, [
      'vikram_hedge',
      hashPassword('trade123'),
      'Player',
      now,
    ]);
    const p4 = runSql(`INSERT INTO users (username, password, role, is_banned, created_at) VALUES (?, ?, ?, 0, ?)`, [
      'zoya_capital',
      hashPassword('trade123'),
      'Player',
      now,
    ]);

    const g1 = runSql(
      `INSERT INTO games (
        name, starting_capital, initial_credits, status,
        tick_interval_ms, demand_impact_factor, random_drift_bias, noise_multiplier,
        trade_fee_percent, max_order_quantity, max_position_percent,
        circuit_breaker_down_pct, circuit_breaker_up_pct,
        allow_short_selling, short_margin_requirement,
        join_code, join_code_expires_at, created_at
      ) VALUES (?, ?, ?, 'Active', 3000, 0.0018, 0.0005, 0.45, 0.10, 2500, 50, 45, 150, 1, 0.50, 'IITB26', NULL, ?)`,
      ['Round 1 — Institutional Championship', 1000000, 10, now]
    );
    const gameId = g1.lastInsertRowid;

    const initialStocks = [
      { name: 'Aether Quantum Computing', ticker: 'AETH', sector: 'Semiconductors', base: 2450.0, vol: 0.025 },
      { name: 'Vanguard Fusion Energy', ticker: 'VFUS', sector: 'Clean Energy', base: 890.5, vol: 0.018 },
      { name: 'Helios Orbital Defense', ticker: 'HELI', sector: 'Aerospace', base: 3420.0, vol: 0.032 },
      { name: 'Synapse BioGenomics', ticker: 'SYNB', sector: 'Biotech', base: 1180.0, vol: 0.038 },
      { name: 'Kratos Sovereign Bank', ticker: 'KRAT', sector: 'Financials', base: 640.0, vol: 0.014 },
      { name: 'Nexus Autonomous Logistics', ticker: 'NEXL', sector: 'Industrials', base: 1560.0, vol: 0.022 },
    ];

    const stockIds: Record<string, number> = {};
    for (const s of initialStocks) {
      const history: { time: string; price: number }[] = [];
      let p = s.base;
      const baseTime = Date.now() - 25 * 3000;
      for (let i = 0; i < 25; i++) {
        const delta = (Math.random() - 0.495) * 2 * (s.vol * 0.5) * p;
        p = Math.max(10, Number((p + delta).toFixed(2)));
        history.push({
          time: getISTTimeStr(new Date(baseTime + i * 3000)),
          price: p,
        });
      }
      const prices = history.map((h) => h.price);
      const current = history[history.length - 1].price;
      const prev = history[history.length - 2].price;
      const high = Math.max(...prices, s.base);
      const low = Math.min(...prices, s.base);

      const inserted = runSql(
        `INSERT INTO stocks (game_id, name, ticker, sector, base_price, current_price, previous_price, high_price, low_price, volatility, volume, price_history)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [gameId, s.name, s.ticker, s.sector, s.base, current, prev, high, low, s.vol, Math.floor(Math.random() * 8500 + 1200), JSON.stringify(history)]
      );
      stockIds[s.ticker] = inserted.lastInsertRowid;
    }

    for (const uid of [p1.lastInsertRowid, p2.lastInsertRowid, p3.lastInsertRowid, p4.lastInsertRowid]) {
      runSql(
        `INSERT INTO game_players (game_id, user_id, cash_balance, info_credits, joined_at) VALUES (?, ?, ?, ?, ?)`,
        [gameId, uid, 1000000, 10, now]
      );
    }

    const aethStock = queryOne<{ id: number; current_price: number }>('SELECT id, current_price FROM stocks WHERE id = ?', [stockIds['AETH']]);
    const heliStock = queryOne<{ id: number; current_price: number }>('SELECT id, current_price FROM stocks WHERE id = ?', [stockIds['HELI']]);
    if (aethStock && heliStock) {
      const cost1 = 60 * aethStock.current_price;
      runSql(`UPDATE game_players SET cash_balance = cash_balance - ? WHERE game_id = ? AND user_id = ?`, [cost1, gameId, p1.lastInsertRowid]);
      runSql(`INSERT INTO holdings (game_id, user_id, stock_id, quantity, avg_buy_price) VALUES (?, ?, ?, ?, ?)`, [
        gameId,
        p1.lastInsertRowid,
        aethStock.id,
        60,
        aethStock.current_price,
      ]);

      const cost2 = 45 * heliStock.current_price;
      runSql(`UPDATE game_players SET cash_balance = cash_balance - ? WHERE game_id = ? AND user_id = ?`, [cost2, gameId, p2.lastInsertRowid]);
      runSql(`INSERT INTO holdings (game_id, user_id, stock_id, quantity, avg_buy_price) VALUES (?, ?, ?, ?, ?)`, [
        gameId,
        p2.lastInsertRowid,
        heliStock.id,
        45,
        heliStock.current_price,
      ]);
    }

    const initialHints = [
      {
        ticker: 'AETH',
        title: 'Q4 Wafer Yield Audit & Foundry Bottleneck',
        category: 'Risk Metric',
        risk_rating: 'HIGH VOLATILITY // BETA 1.85',
        content: 'Internal foundry telemetry indicates 3nm cryogenic qubit yield rose 18% above consensus. Institutional accumulation detected ahead of Defense Ministry contract award.',
        cost: 3,
      },
      {
        ticker: 'SYNB',
        title: 'FDA Phase-III Clinical Trial Blind Dossier',
        category: 'Insider Intel',
        risk_rating: 'EXTREME TAIL RISK // BETA 2.40',
        content: 'WARNING: Secondary biomarker endpoints in Cohort B showed elevated hepatotoxicity markers. Regulatory delay probability estimated at 68% by independent bio-auditors.',
        cost: 4,
      },
      {
        ticker: 'HELI',
        title: 'Pentagon Low-Earth Satellite Constellation Bid',
        category: 'Earnings Whisper',
        risk_rating: 'MODERATE RISK // BETA 1.35',
        content: 'Helios Orbital is sole shortlisted prime contractor for a 4,200-Cr sovereign reconnaissance tender. Expected margin expansion +420 bps.',
        cost: 3,
      },
      {
        ticker: 'VFUS',
        title: 'Magnetic Confinement Tokamak Thermal Audit',
        category: 'Regulatory Audit',
        risk_rating: 'LOW-MED RISK // BETA 1.10',
        content: 'Grid interconnect approval granted in 3 industrial corridors. Guaranteed power purchase agreements lock in 92% revenue visibility for 24 months.',
        cost: 2,
      },
      {
        ticker: 'KRAT',
        title: 'Sovereign Bond Desk Liquidity Exposure',
        category: 'Risk Metric',
        risk_rating: 'DEFENSIVE // BETA 0.72',
        content: 'Tier-1 capital adequacy ratio stands at 16.4%. Minimal exposure to commercial real estate defaults; acts as safe-haven hedge during market shocks.',
        cost: 2,
      },
      {
        ticker: 'NEXL',
        title: 'Autonomous Freight Corridor Fuel & Tariff Report',
        category: 'Insider Intel',
        risk_rating: 'MEDIUM RISK // BETA 1.25',
        content: 'Port automation rollout ahead of schedule by 2 quarters, reducing fleet idle cost by 23%. Watch for short-squeeze pressure above base price.',
        cost: 2,
      },
    ];

    for (const h of initialHints) {
      runSql(
        `INSERT INTO stock_hints (game_id, stock_id, title, category, risk_rating, content, cost_credits)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [gameId, stockIds[h.ticker], h.title, h.category, h.risk_rating, h.content, h.cost]
      );
    }

    runSql(
      `INSERT INTO news_events (game_id, headline, impact_summary, severity, affected_ticker, price_delta_percent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        gameId,
        'EXCHANGE FLOOR OPEN: Round 1 Institutional Championship Commences',
        'All algorithmic and manual order books are live. Join Code: IITB26 (Infinite validity).',
        'Info',
        null,
        0,
        now,
      ]
    );
  }
}

function clampPriceToCircuitBreakers(price: number, basePrice: number, game: any): number {
  const downPct = Number(game.circuit_breaker_down_pct) || 50;
  const upPct = Number(game.circuit_breaker_up_pct) || 200;
  const minAllowed = Math.max(1, Number((basePrice * (1 - Math.min(95, downPct) / 100)).toFixed(2)));
  const maxAllowed = Number((basePrice * (1 + Math.max(10, upPct) / 100)).toFixed(2));
  return Math.min(maxAllowed, Math.max(minAllowed, price));
}

function buildGameState(gameId: number, viewer?: { id: number; role: 'Admin' | 'Player' }) {
  const game = queryOne<any>('SELECT * FROM games WHERE id = ?', [gameId]);
  if (!game) return null;

  const isAdmin = viewer?.role === 'Admin';
  const safeGame = isAdmin
    ? game
    : { ...game, join_code: null, join_code_expires_at: null };

  const rawStocks = queryAll<any>('SELECT * FROM stocks WHERE game_id = ? ORDER BY ticker ASC', [gameId]);
  const stocks = rawStocks.map((s) => ({
    ...s,
    price_history: (() => {
      try {
        return JSON.parse(s.price_history || '[]');
      } catch {
        return [];
      }
    })(),
  }));

  const stockMap = new Map<number, any>();
  stocks.forEach((s) => stockMap.set(s.id, s));

  const rawPlayers = queryAll<any>(
    `SELECT gp.*, u.username, u.is_banned
     FROM game_players gp
     JOIN users u ON u.id = gp.user_id
     WHERE gp.game_id = ?`,
    [gameId]
  );

  const allHoldings = queryAll<any>(
    `SELECT h.*, s.ticker, s.name as stock_name
     FROM holdings h
     JOIN stocks s ON s.id = h.stock_id
     WHERE h.game_id = ? AND h.quantity != 0`,
    [gameId]
  );

  const players = rawPlayers.map((p) => {
    const pHoldings = allHoldings.filter((h) => h.user_id === p.user_id);
    let portfolioValue = 0;
    for (const h of pHoldings) {
      const st = stockMap.get(h.stock_id);
      if (st) {
        portfolioValue += h.quantity * st.current_price;
      }
    }
    portfolioValue = Number(portfolioValue.toFixed(2));
    const netWorth = Number((p.cash_balance + portfolioValue).toFixed(2));
    const pnlPercent =
      game.starting_capital > 0
        ? Number((((netWorth - game.starting_capital) / game.starting_capital) * 100).toFixed(2))
        : 0;

    const visibleHoldings = isAdmin || viewer?.id === p.user_id ? pHoldings : [];

    return {
      ...p,
      holdings: visibleHoldings,
      portfolioValue,
      netWorth,
      pnlPercent,
    };
  });

  players.sort((a, b) => b.netWorth - a.netWorth);

  const unlockedRows = viewer?.id
    ? queryAll<{ hint_id: number }>('SELECT hint_id FROM unlocked_hints WHERE game_id = ? AND user_id = ?', [
        gameId,
        viewer.id,
      ])
    : [];
  const unlockedHintIds = unlockedRows.map((r) => r.hint_id);

  const rawHints = queryAll<any>(
    `SELECT sh.*, s.ticker, s.name as stock_name
     FROM stock_hints sh
     JOIN stocks s ON s.id = sh.stock_id
     WHERE sh.game_id = ?
     ORDER BY sh.id DESC`,
    [gameId]
  );

  const sanitizedHints = rawHints.map((h) => {
    const isUnlocked = isAdmin || unlockedHintIds.includes(h.id);
    if (isUnlocked) {
      return h;
    }
    return {
      ...h,
      risk_rating: 'CLASSIFIED // LOCKED',
      content: 'REDACTED — Redeem Information Credits to decrypt this intelligence dossier.',
    };
  });

  const news = queryAll<any>('SELECT * FROM news_events WHERE game_id = ? ORDER BY id DESC LIMIT 25', [gameId]);

  const recentTrades = queryAll<any>(
    `SELECT t.*, u.username, s.ticker
     FROM trades t
     JOIN users u ON u.id = t.user_id
     JOIN stocks s ON s.id = t.stock_id
     WHERE t.game_id = ?
     ORDER BY t.id DESC
     LIMIT 30`,
    [gameId]
  );

  const scheduledTasks = isAdmin
    ? queryAll<any>('SELECT * FROM scheduled_tasks WHERE game_id = ? ORDER BY execute_at ASC, id DESC', [gameId]).map(
        (t) => ({
          ...t,
          payload: (() => {
            try {
              return JSON.parse(t.payload || '{}');
            } catch {
              return {};
            }
          })(),
        })
      )
    : [];

  return {
    game: safeGame,
    stocks,
    players,
    hints: sanitizedHints,
    unlockedHintIds,
    news,
    recentTrades,
    scheduledTasks,
  };
}

// Helper actions shared between instant Admin routes and the Scheduled Tasks Engine
function applyNewsEvent(
  gameId: number,
  opts: {
    headline: string;
    impact_summary?: string;
    severity?: string;
    affected_ticker?: string | null;
    price_delta_percent?: number;
  },
  io: SocketIOServer
) {
  const now = new Date().toISOString();
  const nowTime = getISTTimeStr();
  const deltaPct = Number(opts.price_delta_percent) || 0;
  const affected_ticker = opts.affected_ticker || null;

  if (affected_ticker && affected_ticker !== 'ALL' && deltaPct !== 0) {
    const stock = queryOne<any>('SELECT * FROM stocks WHERE game_id = ? AND ticker = ?', [gameId, affected_ticker]);
    if (stock) {
      const nextPrice = Math.max(1, Number((stock.current_price * (1 + deltaPct / 100)).toFixed(2)));
      const high = Math.max(stock.high_price, nextPrice);
      const low = Math.min(stock.low_price, nextPrice);
      let history: { time: string; price: number }[] = [];
      try {
        history = JSON.parse(stock.price_history || '[]');
      } catch {
        history = [];
      }
      history.push({ time: nowTime, price: nextPrice });
      if (history.length > 40) history = history.slice(history.length - 40);

      runSql(
        `UPDATE stocks SET previous_price = ?, current_price = ?, high_price = ?, low_price = ?, price_history = ? WHERE id = ?`,
        [stock.current_price, nextPrice, high, low, JSON.stringify(history), stock.id]
      );
    }
  } else if (affected_ticker === 'ALL' && deltaPct !== 0) {
    const allStocks = queryAll<any>('SELECT * FROM stocks WHERE game_id = ?', [gameId]);
    for (const stock of allStocks) {
      const nextPrice = Math.max(1, Number((stock.current_price * (1 + deltaPct / 100)).toFixed(2)));
      const high = Math.max(stock.high_price, nextPrice);
      const low = Math.min(stock.low_price, nextPrice);
      let history: { time: string; price: number }[] = [];
      try {
        history = JSON.parse(stock.price_history || '[]');
      } catch {
        history = [];
      }
      history.push({ time: nowTime, price: nextPrice });
      if (history.length > 40) history = history.slice(history.length - 40);

      db.run(
        `UPDATE stocks SET previous_price = ?, current_price = ?, high_price = ?, low_price = ?, price_history = ? WHERE id = ?`,
        [stock.current_price, nextPrice, high, low, JSON.stringify(history), stock.id]
      );
    }
    saveDb();
  }

  const inserted = runSql(
    `INSERT INTO news_events (game_id, headline, impact_summary, severity, affected_ticker, price_delta_percent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      gameId,
      opts.headline.trim(),
      (opts.impact_summary || '').trim(),
      opts.severity || 'Info',
      affected_ticker,
      deltaPct,
      now,
    ]
  );

  const newsItem = queryOne<any>('SELECT * FROM news_events WHERE id = ?', [inserted.lastInsertRowid]);
  io.emit('game:news_flash', newsItem);
  return newsItem;
}

function applyManipulateStock(
  gameId: number,
  opts: { stockId?: number; ticker?: string; deltaPercent?: number; exactPrice?: number; volatility?: number }
) {
  let stock: any;
  if (opts.stockId) {
    stock = queryOne<any>('SELECT * FROM stocks WHERE id = ? AND game_id = ?', [Number(opts.stockId), gameId]);
  } else if (opts.ticker) {
    stock = queryOne<any>('SELECT * FROM stocks WHERE ticker = ? AND game_id = ?', [
      String(opts.ticker).toUpperCase(),
      gameId,
    ]);
  }
  if (!stock) return null;

  let nextPrice = stock.current_price;
  if (typeof opts.exactPrice === 'number' && opts.exactPrice > 0) {
    nextPrice = Number(opts.exactPrice.toFixed(2));
  } else if (typeof opts.deltaPercent === 'number') {
    nextPrice = Math.max(1, Number((stock.current_price * (1 + opts.deltaPercent / 100)).toFixed(2)));
  }

  const nextVol = typeof opts.volatility === 'number' ? Math.max(0.001, opts.volatility) : stock.volatility;
  const high = Math.max(stock.high_price, nextPrice);
  const low = Math.min(stock.low_price, nextPrice);
  const nowTime = getISTTimeStr();

  let history: { time: string; price: number }[] = [];
  try {
    history = JSON.parse(stock.price_history || '[]');
  } catch {
    history = [];
  }
  history.push({ time: nowTime, price: nextPrice });
  if (history.length > 40) history = history.slice(history.length - 40);

  runSql(
    `UPDATE stocks SET previous_price = ?, current_price = ?, high_price = ?, low_price = ?, volatility = ?, price_history = ? WHERE id = ?`,
    [stock.current_price, nextPrice, high, low, nextVol, JSON.stringify(history), stock.id]
  );
  return { stockId: stock.id, newPrice: nextPrice };
}

function applyAlterPlayer(
  gameId: number,
  opts: {
    userId: number | 'ALL';
    cashDelta?: number;
    exactCash?: number;
    creditsDelta?: number;
    exactCredits?: number;
  }
) {
  const targets =
    opts.userId === 'ALL'
      ? queryAll<any>('SELECT * FROM game_players WHERE game_id = ?', [gameId])
      : queryAll<any>('SELECT * FROM game_players WHERE game_id = ? AND user_id = ?', [gameId, Number(opts.userId)]);

  for (const gp of targets) {
    let nextCash = gp.cash_balance;
    if (typeof opts.exactCash === 'number' && !Number.isNaN(opts.exactCash)) {
      nextCash = Math.max(0, Number(opts.exactCash.toFixed(2)));
    } else if (typeof opts.cashDelta === 'number' && !Number.isNaN(opts.cashDelta)) {
      nextCash = Math.max(0, Number((gp.cash_balance + opts.cashDelta).toFixed(2)));
    }

    let nextCredits = gp.info_credits;
    if (typeof opts.exactCredits === 'number' && !Number.isNaN(opts.exactCredits)) {
      nextCredits = Math.max(0, Math.floor(opts.exactCredits));
    } else if (typeof opts.creditsDelta === 'number' && !Number.isNaN(opts.creditsDelta)) {
      nextCredits = Math.max(0, gp.info_credits + Math.floor(opts.creditsDelta));
    }

    db.run(`UPDATE game_players SET cash_balance = ?, info_credits = ? WHERE id = ?`, [
      nextCash,
      nextCredits,
      gp.id,
    ]);
  }
  saveDb();
  return targets.length > 0;
}

// Express Authentication & Role Middlewares
interface AuthedRequest extends Request {
  authUser?: TokenPayload;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Valid session token required' });
  }
  const dbUser = queryOne<any>('SELECT id, username, role, is_banned FROM users WHERE id = ?', [payload.id]);
  if (!dbUser || dbUser.is_banned) {
    return res.status(403).json({ error: 'Account suspended or invalid' });
  }
  req.authUser = { id: dbUser.id, username: dbUser.username, role: dbUser.role, iat: payload.iat };
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.authUser?.role !== 'Admin') {
      return res.status(403).json({ error: 'Forbidden: Exchange Administrator privileges required' });
    }
    next();
  });
}

async function startServer() {
  await initDatabase();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  function broadcastGameUpdate(gameId: number) {
    io.emit('game:tick', { gameId });
  }

  // Master loop (every 500ms):
  // 1) Executes any due Scheduled Tasks (in IST / UTC ISO comparison)
  // 2) Runs active game market ticks
  setInterval(() => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const nowTime = getISTTimeStr(new Date(nowMs));

    // Check due scheduled tasks
    const pendingTasks = queryAll<any>(`SELECT * FROM scheduled_tasks WHERE status = 'Pending'`);
    for (const task of pendingTasks) {
      const execTimeMs = new Date(task.execute_at).getTime();
      if (!Number.isNaN(execTimeMs) && execTimeMs <= nowMs) {
        try {
          const payload = JSON.parse(task.payload || '{}');
          const gId = Number(task.game_id);

          if (task.action_type === 'SET_STATUS') {
            if (['Active', 'Paused', 'Completed'].includes(payload.status)) {
              runSql('UPDATE games SET status = ? WHERE id = ?', [payload.status, gId]);
              if (payload.resetBaseline) {
                runSql('UPDATE stocks SET base_price = current_price WHERE game_id = ?', [gId]);
                lastBaselineResetMap.set(gId, nowMs);
              }
              const allGames = queryAll<any>('SELECT * FROM games ORDER BY id DESC');
              io.emit('games:list_updated', allGames);
            }
          } else if (task.action_type === 'RESET_BASELINE') {
            if (payload.ticker && payload.ticker !== 'ALL') {
              runSql('UPDATE stocks SET base_price = current_price WHERE game_id = ? AND UPPER(ticker) = ?', [
                gId,
                String(payload.ticker).toUpperCase(),
              ]);
            } else {
              runSql('UPDATE stocks SET base_price = current_price WHERE game_id = ?', [gId]);
              lastBaselineResetMap.set(gId, nowMs);
            }
          } else if (task.action_type === 'BROADCAST_NEWS') {
            if (payload.headline) {
              applyNewsEvent(gId, payload, io);
            }
          } else if (task.action_type === 'MANIPULATE_STOCK') {
            applyManipulateStock(gId, payload);
          } else if (task.action_type === 'ALTER_PLAYER') {
            applyAlterPlayer(gId, payload);
          } else if (task.action_type === 'UPDATE_RULES') {
            const curGame = queryOne<any>('SELECT * FROM games WHERE id = ?', [gId]);
            if (curGame) {
              runSql(
                `UPDATE games SET
                  tick_interval_ms = ?,
                  demand_impact_factor = ?,
                  random_drift_bias = ?,
                  noise_multiplier = ?,
                  trade_fee_percent = ?,
                  max_order_quantity = ?,
                  max_position_percent = ?,
                  circuit_breaker_down_pct = ?,
                  circuit_breaker_up_pct = ?,
                  circuit_breaker_reset_minutes = ?,
                  allow_short_selling = ?,
                  short_margin_requirement = ?
                 WHERE id = ?`,
                [
                  payload.tick_interval_ms ?? curGame.tick_interval_ms,
                  payload.demand_impact_factor ?? curGame.demand_impact_factor,
                  payload.random_drift_bias ?? curGame.random_drift_bias,
                  payload.noise_multiplier ?? curGame.noise_multiplier,
                  payload.trade_fee_percent ?? curGame.trade_fee_percent,
                  payload.max_order_quantity ?? curGame.max_order_quantity,
                  payload.max_position_percent ?? curGame.max_position_percent,
                  payload.circuit_breaker_down_pct ?? curGame.circuit_breaker_down_pct,
                  payload.circuit_breaker_up_pct ?? curGame.circuit_breaker_up_pct,
                  payload.circuit_breaker_reset_minutes ?? curGame.circuit_breaker_reset_minutes ?? 0,
                  payload.allow_short_selling !== undefined
                    ? payload.allow_short_selling
                      ? 1
                      : 0
                    : curGame.allow_short_selling,
                  payload.short_margin_requirement ?? curGame.short_margin_requirement,
                  gId,
                ]
              );
            }
          }

          runSql(`UPDATE scheduled_tasks SET status = 'Executed', executed_at = ? WHERE id = ?`, [nowIso, task.id]);
          broadcastGameUpdate(gId);
        } catch (err) {
          console.error('Scheduled task execution error:', err);
          runSql(`UPDATE scheduled_tasks SET status = 'Failed', executed_at = ? WHERE id = ?`, [nowIso, task.id]);
        }
      }
    }

    // Run market price ticks & periodic Circuit Breaker Baseline resets for Active games
    const activeGames = queryAll<any>(`SELECT * FROM games WHERE status = 'Active'`);
    for (const game of activeGames) {
      // Check if periodic Circuit Breaker Baseline Reset is enabled (> 0 minutes)
      const resetMins = Math.max(0, Number(game.circuit_breaker_reset_minutes) || 0);
      if (resetMins > 0) {
        const resetIntervalMs = resetMins * 60000;
        const lastReset = lastBaselineResetMap.get(game.id) || new Date(game.created_at || nowMs).getTime() || nowMs;
        if (!lastBaselineResetMap.has(game.id)) {
          lastBaselineResetMap.set(game.id, nowMs);
        } else if (nowMs - lastReset >= resetIntervalMs) {
          lastBaselineResetMap.set(game.id, nowMs);
          db.run(`UPDATE stocks SET base_price = current_price WHERE game_id = ?`, [game.id]);
          saveDb();
        }
      }

      const tickInterval = Math.max(500, Number(game.tick_interval_ms) || 3000);
      const lastTick = lastGameTickMap.get(game.id) || 0;
      if (nowMs - lastTick < tickInterval) continue;

      lastGameTickMap.set(game.id, nowMs);

      const stocks = queryAll<any>(`SELECT * FROM stocks WHERE game_id = ?`, [game.id]);
      if (stocks.length === 0) continue;

      const driftBias = Number(game.random_drift_bias) || 0;
      const noiseMult = Number(game.noise_multiplier) ?? 0.45;

      for (const s of stocks) {
        const vol = Number(s.volatility) || 0.02;
        const randomComponent = (Math.random() - 0.5) * 2 * (vol * noiseMult);
        const totalShock = randomComponent + driftBias;
        const rawNext = s.current_price * (1 + totalShock);
        const clampedNext = clampPriceToCircuitBreakers(
          Math.max(1, Number(rawNext.toFixed(2))),
          s.base_price,
          game
        );
        const high = Math.max(s.high_price, clampedNext);
        const low = Math.min(s.low_price, clampedNext);

        let history: { time: string; price: number }[] = [];
        try {
          history = JSON.parse(s.price_history || '[]');
        } catch {
          history = [];
        }
        history.push({ time: nowTime, price: clampedNext });
        if (history.length > 40) history = history.slice(history.length - 40);

        db.run(
          `UPDATE stocks
           SET previous_price = ?, current_price = ?, high_price = ?, low_price = ?, price_history = ?
           WHERE id = ?`,
          [s.current_price, clampedNext, high, low, JSON.stringify(history), s.id]
        );
      }
      saveDb();
      broadcastGameUpdate(game.id);
    }
  }, 500);

  io.on('connection', (socket) => {
    socket.on('game:subscribe', ({ gameId }) => {
      if (gameId) {
        socket.emit('game:tick', { gameId: Number(gameId) });
      }
    });
  });

  // ==================== AUTH ROUTES ====================
  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const nowMs = Date.now();
    const record = loginAttemptMap.get(ip);
    if (record && nowMs < record.resetAt && record.count >= 15) {
      return res.status(429).json({ error: 'Too many login attempts. Please wait 60 seconds.' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = queryOne<any>('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [String(username).trim()]);
    if (!user || !verifyPassword(String(password), user.password)) {
      const nextCount = record && nowMs < record.resetAt ? record.count + 1 : 1;
      loginAttemptMap.set(ip, { count: nextCount, resetAt: nowMs + 60000 });
      return res.status(401).json({ error: 'Invalid credentials. Contact the Exchange Admin.' });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: 'Account suspended by Exchange Administrator.' });
    }

    if (!String(user.password).startsWith('scrypt:')) {
      runSql('UPDATE users SET password = ? WHERE id = ?', [hashPassword(String(password)), user.id]);
    }

    loginAttemptMap.delete(ip);
    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
      iat: Date.now(),
    });
    const { password: _, ...safeUser } = user;
    return res.json({ user: { ...safeUser, token } });
  });

  // ==================== ADMIN USER MANAGEMENT ====================
  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    const users = queryAll<any>('SELECT id, username, role, is_banned, created_at FROM users ORDER BY id ASC');
    res.json({ users });
  });

  app.post('/api/admin/users', requireAdmin, (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const cleanUser = String(username).trim();
    const exists = queryOne('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [cleanUser]);
    if (exists) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const now = new Date().toISOString();
    runSql(`INSERT INTO users (username, password, role, is_banned, created_at) VALUES (?, ?, ?, 0, ?)`, [
      cleanUser,
      hashPassword(String(password)),
      role === 'Admin' ? 'Admin' : 'Player',
      now,
    ]);
    const users = queryAll<any>('SELECT id, username, role, is_banned, created_at FROM users ORDER BY id ASC');
    io.emit('users:updated', users);
    res.json({ users });
  });

  app.post('/api/admin/users/:id/reset-password', requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password is required' });
    runSql('UPDATE users SET password = ? WHERE id = ?', [hashPassword(String(newPassword)), userId]);
    res.json({ success: true });
  });

  app.post('/api/admin/users/:id/toggle-ban', requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    const user = queryOne<any>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'Admin') return res.status(400).json({ error: 'Cannot ban an Admin account' });

    const nextBan = user.is_banned ? 0 : 1;
    runSql('UPDATE users SET is_banned = ? WHERE id = ?', [nextBan, userId]);
    const users = queryAll<any>('SELECT id, username, role, is_banned, created_at FROM users ORDER BY id ASC');
    io.emit('users:updated', users);
    io.emit('user:ban_status', { userId, is_banned: nextBan });

    const playerGames = queryAll<{ game_id: number }>('SELECT game_id FROM game_players WHERE user_id = ?', [userId]);
    playerGames.forEach((pg) => broadcastGameUpdate(pg.game_id));

    res.json({ users });
  });

  app.delete('/api/admin/users/:id', requireAdmin, (req: AuthedRequest, res) => {
    const userId = Number(req.params.id);
    const user = queryOne<any>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.id === req.authUser?.id) {
      return res.status(400).json({ error: 'You cannot delete your own active Admin account' });
    }
    if (user.role === 'Admin') {
      return res.status(400).json({ error: 'Cannot delete an Admin account' });
    }

    const playerGames = queryAll<{ game_id: number }>('SELECT game_id FROM game_players WHERE user_id = ?', [userId]);

    db.run('DELETE FROM unlocked_hints WHERE user_id = ?', [userId]);
    db.run('DELETE FROM holdings WHERE user_id = ?', [userId]);
    db.run('DELETE FROM trades WHERE user_id = ?', [userId]);
    db.run('DELETE FROM game_players WHERE user_id = ?', [userId]);
    db.run('DELETE FROM users WHERE id = ?', [userId]);
    saveDb();

    const users = queryAll<any>('SELECT id, username, role, is_banned, created_at FROM users ORDER BY id ASC');
    io.emit('users:updated', users);
    io.emit('user:deleted', { userId });
    playerGames.forEach((pg) => broadcastGameUpdate(pg.game_id));

    res.json({ users });
  });

  app.get('/api/admin/export-backup', requireAdmin, (_req, res) => {
    const backup = {
      exported_at: new Date().toISOString(),
      users: queryAll('SELECT id, username, role, is_banned, created_at FROM users'),
      games: queryAll('SELECT * FROM games'),
      stocks: queryAll('SELECT * FROM stocks'),
      game_players: queryAll('SELECT * FROM game_players'),
      holdings: queryAll('SELECT * FROM holdings'),
      trades: queryAll('SELECT * FROM trades'),
      stock_hints: queryAll('SELECT * FROM stock_hints'),
      unlocked_hints: queryAll('SELECT * FROM unlocked_hints'),
      news_events: queryAll('SELECT * FROM news_events'),
      scheduled_tasks: queryAll('SELECT * FROM scheduled_tasks'),
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="iitb_stoxchange_backup_${Date.now()}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  });

  // ==================== SINGLE ROUND EXPORT / DELETE / IMPORT ====================
  app.get('/api/admin/games/:id/export', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const game = queryOne<any>('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return res.status(404).json({ error: 'Round not found' });

    const stocks = queryAll<any>('SELECT * FROM stocks WHERE game_id = ?', [gameId]);
    const players = queryAll<any>(
      `SELECT gp.*, u.username, u.role
       FROM game_players gp
       JOIN users u ON u.id = gp.user_id
       WHERE gp.game_id = ?`,
      [gameId]
    );
    const holdings = queryAll<any>(
      `SELECT h.*, u.username, s.ticker
       FROM holdings h
       JOIN users u ON u.id = h.user_id
       JOIN stocks s ON s.id = h.stock_id
       WHERE h.game_id = ?`,
      [gameId]
    );
    const hints = queryAll<any>(
      `SELECT sh.*, s.ticker
       FROM stock_hints sh
       JOIN stocks s ON s.id = sh.stock_id
       WHERE sh.game_id = ?`,
      [gameId]
    );
    const unlockedHints = queryAll<any>(
      `SELECT uh.*, u.username, sh.title as hint_title, s.ticker as hint_ticker
       FROM unlocked_hints uh
       JOIN users u ON u.id = uh.user_id
       JOIN stock_hints sh ON sh.id = uh.hint_id
       JOIN stocks s ON s.id = sh.stock_id
       WHERE uh.game_id = ?`,
      [gameId]
    );
    const news = queryAll<any>('SELECT * FROM news_events WHERE game_id = ?', [gameId]);
    const trades = queryAll<any>(
      `SELECT t.*, u.username, s.ticker
       FROM trades t
       JOIN users u ON u.id = t.user_id
       JOIN stocks s ON s.id = t.stock_id
       WHERE t.game_id = ?`,
      [gameId]
    );
    const scheduledTasks = queryAll<any>('SELECT * FROM scheduled_tasks WHERE game_id = ?', [gameId]);

    const archive = {
      format: 'IITB_STOXCHANGE_ROUND_ARCHIVE_V1',
      exported_at_ist: getISTTimeStr(),
      exported_at_iso: new Date().toISOString(),
      game,
      stocks,
      players,
      holdings,
      hints,
      unlockedHints,
      news,
      trades,
      scheduledTasks,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="round_${gameId}_${game.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json"`
    );
    res.send(JSON.stringify(archive, null, 2));
  });

  app.delete('/api/admin/games/:id', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const game = queryOne<any>('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return res.status(404).json({ error: 'Round not found' });

    db.run('DELETE FROM scheduled_tasks WHERE game_id = ?', [gameId]);
    db.run('DELETE FROM unlocked_hints WHERE game_id = ?', [gameId]);
    db.run('DELETE FROM stock_hints WHERE game_id = ?', [gameId]);
    db.run('DELETE FROM holdings WHERE game_id = ?', [gameId]);
    db.run('DELETE FROM trades WHERE game_id = ?', [gameId]);
    db.run('DELETE FROM news_events WHERE game_id = ?', [gameId]);
    db.run('DELETE FROM game_players WHERE game_id = ?', [gameId]);
    db.run('DELETE FROM stocks WHERE game_id = ?', [gameId]);
    db.run('DELETE FROM games WHERE id = ?', [gameId]);
    saveDb();

    lastGameTickMap.delete(gameId);
    lastBaselineResetMap.delete(gameId);
    const allGames = queryAll<any>('SELECT * FROM games ORDER BY id DESC');
    io.emit('games:list_updated', allGames);
    res.json({ success: true, games: allGames });
  });

  app.post('/api/admin/games/import', requireAdmin, (req, res) => {
    const archive = req.body;
    if (!archive || !archive.game || !Array.isArray(archive.stocks)) {
      return res.status(400).json({ error: 'Invalid round archive JSON file' });
    }

    const g = archive.game;
    const now = new Date().toISOString();
    const importedName = `${g.name} (Imported)`;

    const createdGame = runSql(
      `INSERT INTO games (
        name, starting_capital, initial_credits, status,
        tick_interval_ms, demand_impact_factor, random_drift_bias, noise_multiplier,
        trade_fee_percent, max_order_quantity, max_position_percent,
        circuit_breaker_down_pct, circuit_breaker_up_pct,
        allow_short_selling, short_margin_requirement,
        join_code, join_code_expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        importedName,
        Number(g.starting_capital) || 1000000,
        Number(g.initial_credits) ?? 10,
        'Paused', // Import in Paused state so Admin can inspect/analyze before resuming if desired
        Number(g.tick_interval_ms) || 3000,
        Number(g.demand_impact_factor) ?? 0.0018,
        Number(g.random_drift_bias) || 0,
        Number(g.noise_multiplier) ?? 0.45,
        Number(g.trade_fee_percent) ?? 0.1,
        Number(g.max_order_quantity) || 5000,
        Number(g.max_position_percent) || 100,
        Number(g.circuit_breaker_down_pct) || 50,
        Number(g.circuit_breaker_up_pct) || 200,
        g.allow_short_selling ? 1 : 0,
        Number(g.short_margin_requirement) || 0.5,
        null,
        null,
        g.created_at || now,
      ]
    );
    const newGameId = createdGame.lastInsertRowid;

    // Map old stock IDs & tickers to new stock IDs
    const oldStockIdToNew = new Map<number, number>();
    const tickerToNewStockId = new Map<string, number>();

    for (const s of archive.stocks) {
      const stRes = runSql(
        `INSERT INTO stocks (
          game_id, name, ticker, sector, base_price, current_price, previous_price,
          high_price, low_price, volatility, volume, price_history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newGameId,
          s.name,
          s.ticker,
          s.sector || 'Equities',
          Number(s.base_price) || 100,
          Number(s.current_price) || 100,
          Number(s.previous_price) || 100,
          Number(s.high_price) || 100,
          Number(s.low_price) || 100,
          Number(s.volatility) || 0.02,
          Number(s.volume) || 0,
          typeof s.price_history === 'string' ? s.price_history : JSON.stringify(s.price_history || []),
        ]
      );
      if (s.id) oldStockIdToNew.set(Number(s.id), stRes.lastInsertRowid);
      if (s.ticker) tickerToNewStockId.set(String(s.ticker).toUpperCase(), stRes.lastInsertRowid);
    }

    // Ensure players exist by username and enroll them
    const usernameToUserId = new Map<string, number>();
    const oldUserIdToNew = new Map<number, number>();

    if (Array.isArray(archive.players)) {
      for (const p of archive.players) {
        const uname = String(p.username || `player_${p.user_id}`).trim();
        let existingUser = queryOne<any>('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [uname]);
        if (!existingUser) {
          const createdU = runSql(
            `INSERT INTO users (username, password, role, is_banned, created_at) VALUES (?, ?, 'Player', 0, ?)`,
            [uname, hashPassword('trade123'), now]
          );
          existingUser = { id: createdU.lastInsertRowid };
        }
        usernameToUserId.set(uname.toLowerCase(), existingUser.id);
        if (p.user_id) oldUserIdToNew.set(Number(p.user_id), existingUser.id);

        runSql(
          `INSERT OR IGNORE INTO game_players (game_id, user_id, cash_balance, info_credits, joined_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            newGameId,
            existingUser.id,
            Number(p.cash_balance) || 0,
            Number(p.info_credits) || 0,
            p.joined_at || now,
          ]
        );
      }
    }

    // Restore holdings
    if (Array.isArray(archive.holdings)) {
      for (const h of archive.holdings) {
        const uid =
          (h.username && usernameToUserId.get(String(h.username).toLowerCase())) ||
          oldUserIdToNew.get(Number(h.user_id));
        const sid =
          (h.ticker && tickerToNewStockId.get(String(h.ticker).toUpperCase())) ||
          oldStockIdToNew.get(Number(h.stock_id));
        if (uid && sid) {
          runSql(
            `INSERT OR IGNORE INTO holdings (game_id, user_id, stock_id, quantity, avg_buy_price)
             VALUES (?, ?, ?, ?, ?)`,
            [newGameId, uid, sid, Number(h.quantity) || 0, Number(h.avg_buy_price) || 0]
          );
        }
      }
    }

    // Restore hints
    const oldHintIdToNew = new Map<number, number>();
    if (Array.isArray(archive.hints)) {
      for (const h of archive.hints) {
        const sid =
          (h.ticker && tickerToNewStockId.get(String(h.ticker).toUpperCase())) ||
          oldStockIdToNew.get(Number(h.stock_id));
        if (sid) {
          const insH = runSql(
            `INSERT INTO stock_hints (game_id, stock_id, title, category, risk_rating, content, cost_credits)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              newGameId,
              sid,
              h.title || 'Dossier',
              h.category || 'Insider Intel',
              h.risk_rating || 'MEDIUM RISK',
              h.content || '',
              Number(h.cost_credits) || 2,
            ]
          );
          if (h.id) oldHintIdToNew.set(Number(h.id), insH.lastInsertRowid);
        }
      }
    }

    // Restore unlocked hints
    if (Array.isArray(archive.unlockedHints)) {
      for (const uh of archive.unlockedHints) {
        const uid =
          (uh.username && usernameToUserId.get(String(uh.username).toLowerCase())) ||
          oldUserIdToNew.get(Number(uh.user_id));
        const hid = oldHintIdToNew.get(Number(uh.hint_id));
        if (uid && hid) {
          runSql(
            `INSERT OR IGNORE INTO unlocked_hints (game_id, user_id, hint_id, unlocked_at)
             VALUES (?, ?, ?, ?)`,
            [newGameId, uid, hid, uh.unlocked_at || now]
          );
        }
      }
    }

    // Restore news
    if (Array.isArray(archive.news)) {
      for (const n of archive.news) {
        runSql(
          `INSERT INTO news_events (game_id, headline, impact_summary, severity, affected_ticker, price_delta_percent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            newGameId,
            n.headline || 'Wire Event',
            n.impact_summary || '',
            n.severity || 'Info',
            n.affected_ticker || null,
            Number(n.price_delta_percent) || 0,
            n.created_at || now,
          ]
        );
      }
    }

    // Restore trades
    if (Array.isArray(archive.trades)) {
      for (const t of archive.trades) {
        const uid =
          (t.username && usernameToUserId.get(String(t.username).toLowerCase())) ||
          oldUserIdToNew.get(Number(t.user_id));
        const sid =
          (t.ticker && tickerToNewStockId.get(String(t.ticker).toUpperCase())) ||
          oldStockIdToNew.get(Number(t.stock_id));
        if (uid && sid) {
          runSql(
            `INSERT INTO trades (game_id, user_id, stock_id, type, quantity, price, fee, total, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newGameId,
              uid,
              sid,
              t.type || 'BUY',
              Number(t.quantity) || 0,
              Number(t.price) || 0,
              Number(t.fee) || 0,
              Number(t.total) || 0,
              t.created_at || now,
            ]
          );
        }
      }
    }

    const allGames = queryAll<any>('SELECT * FROM games ORDER BY id DESC');
    const allUsers = queryAll<any>('SELECT id, username, role, is_banned, created_at FROM users ORDER BY id ASC');
    io.emit('games:list_updated', allGames);
    io.emit('users:updated', allUsers);
    broadcastGameUpdate(newGameId);

    res.json({ success: true, gameId: newGameId, games: allGames });
  });

  // ==================== 6-CHAR JOIN CODE MANAGEMENT & PLAYER JOIN ====================
  app.post('/api/admin/games/:id/join-code', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const { customCode, durationMinutes, disable } = req.body;
    const game = queryOne<any>('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    if (disable) {
      runSql('UPDATE games SET join_code = NULL, join_code_expires_at = NULL WHERE id = ?', [gameId]);
      broadcastGameUpdate(gameId);
      return res.json({ success: true, join_code: null, join_code_expires_at: null });
    }

    let code = customCode
      ? String(customCode)
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 6)
      : generateSixCharCode();

    if (code.length !== 6) {
      code = generateSixCharCode();
    }

    let expiresAt: string | null = null;
    if (durationMinutes !== null && durationMinutes !== undefined && durationMinutes !== 'infinite') {
      const mins = Number(durationMinutes);
      if (mins > 0) {
        expiresAt = new Date(Date.now() + mins * 60000).toISOString();
      }
    }

    runSql('UPDATE games SET join_code = ?, join_code_expires_at = ? WHERE id = ?', [code, expiresAt, gameId]);
    const allGames = queryAll<any>('SELECT * FROM games ORDER BY id DESC');
    io.emit('games:list_updated', allGames);
    broadcastGameUpdate(gameId);

    res.json({ success: true, join_code: code, join_code_expires_at: expiresAt });
  });

  app.post('/api/games/join-by-code', requireAuth, (req: AuthedRequest, res) => {
    const caller = req.authUser!;
    const rawCode = String(req.body.code || '')
      .trim()
      .toUpperCase();

    if (rawCode.length !== 6) {
      return res.status(400).json({ error: 'Please enter a valid 6-character alphanumeric lobby code.' });
    }

    const game = queryOne<any>('SELECT * FROM games WHERE UPPER(join_code) = ?', [rawCode]);
    if (!game) {
      return res.status(404).json({ error: 'Invalid lobby code. Check with the Exchange Administrator.' });
    }

    if (game.join_code_expires_at) {
      const expMs = new Date(game.join_code_expires_at).getTime();
      if (!Number.isNaN(expMs) && Date.now() > expMs) {
        return res.status(403).json({
          error: `This 6-character join code expired at ${getISTTimeStr(new Date(expMs))}. Ask the Admin to renew it.`,
        });
      }
    }

    const already = queryOne<any>('SELECT id FROM game_players WHERE game_id = ? AND user_id = ?', [
      game.id,
      caller.id,
    ]);
    if (!already) {
      runSql(
        `INSERT INTO game_players (game_id, user_id, cash_balance, info_credits, joined_at)
         VALUES (?, ?, ?, ?, ?)`,
        [game.id, caller.id, game.starting_capital, game.initial_credits, new Date().toISOString()]
      );
    }

    const enrolled = queryAll<any>(
      `SELECT g.id, g.name, g.starting_capital, g.initial_credits, g.status, g.tick_interval_ms,
              g.demand_impact_factor, g.random_drift_bias, g.noise_multiplier, g.trade_fee_percent,
              g.max_order_quantity, g.max_position_percent, g.circuit_breaker_down_pct,
              g.circuit_breaker_up_pct, g.circuit_breaker_reset_minutes, g.allow_short_selling, g.short_margin_requirement, g.created_at
       FROM games g
       JOIN game_players gp ON gp.game_id = g.id
       WHERE gp.user_id = ?
       ORDER BY g.id DESC`,
      [caller.id]
    );

    io.emit('games:list_updated');
    broadcastGameUpdate(game.id);
    return res.json({ success: true, gameId: game.id, gameName: game.name, games: enrolled });
  });

  // ==================== SCHEDULED TASKS (IST AUTOMATION) ====================
  app.post('/api/admin/games/:id/schedule', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const { execute_at, action_type, payload } = req.body;
    if (!execute_at || !action_type) {
      return res.status(400).json({ error: 'Execution time (IST) and action type are required' });
    }

    const parsedDate = new Date(execute_at);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date/time format' });
    }

    const now = new Date().toISOString();
    runSql(
      `INSERT INTO scheduled_tasks (game_id, execute_at, action_type, payload, status, created_at)
       VALUES (?, ?, ?, ?, 'Pending', ?)`,
      [gameId, parsedDate.toISOString(), action_type, JSON.stringify(payload || {}), now]
    );

    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  app.delete('/api/admin/games/:id/schedule/:taskId', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const taskId = Number(req.params.taskId);
    runSql('DELETE FROM scheduled_tasks WHERE id = ? AND game_id = ?', [taskId, gameId]);
    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  // ==================== GAMES & LOBBY MANAGEMENT ====================
  app.get('/api/games', requireAuth, (req: AuthedRequest, res) => {
    const caller = req.authUser!;
    if (caller.role === 'Admin') {
      const allGames = queryAll<any>('SELECT * FROM games ORDER BY id DESC');
      return res.json({ games: allGames });
    }
    const enrolled = queryAll<any>(
      `SELECT g.id, g.name, g.starting_capital, g.initial_credits, g.status, g.tick_interval_ms,
              g.demand_impact_factor, g.random_drift_bias, g.noise_multiplier, g.trade_fee_percent,
              g.max_order_quantity, g.max_position_percent, g.circuit_breaker_down_pct,
              g.circuit_breaker_up_pct, g.circuit_breaker_reset_minutes, g.allow_short_selling, g.short_margin_requirement, g.created_at
       FROM games g
       JOIN game_players gp ON gp.game_id = g.id
       WHERE gp.user_id = ?
       ORDER BY g.id DESC`,
      [caller.id]
    );
    return res.json({ games: enrolled });
  });

  app.get('/api/games/:id/state', requireAuth, (req: AuthedRequest, res) => {
    const gameId = Number(req.params.id);
    const caller = req.authUser!;
    const state = buildGameState(gameId, { id: caller.id, role: caller.role });
    if (!state) return res.status(404).json({ error: 'Game not found' });
    res.json(state);
  });

  app.post('/api/admin/games', requireAdmin, (req, res) => {
    const {
      name,
      starting_capital,
      initial_credits,
      tick_interval_ms,
      demand_impact_factor,
      random_drift_bias,
      noise_multiplier,
      trade_fee_percent,
      max_order_quantity,
      max_position_percent,
      circuit_breaker_down_pct,
      circuit_breaker_up_pct,
      circuit_breaker_reset_minutes,
      allow_short_selling,
      short_margin_requirement,
      join_code,
      join_code_duration_minutes,
      stocks,
      playerIds,
      hints,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Game name is required' });

    const startCap = Math.max(1000, Number(starting_capital) || 1000000);
    const initCreds = Math.max(0, Number(initial_credits) ?? 10);
    const tickMs = Math.max(500, Number(tick_interval_ms) || 3000);
    const demandFactor = Math.max(0, Number(demand_impact_factor) ?? 0.0018);
    const driftBias = Number(random_drift_bias) || 0.0;
    const noiseMult = Math.max(0, Number(noise_multiplier) ?? 0.45);
    const feePct = Math.max(0, Number(trade_fee_percent) ?? 0.1);
    const maxOrderQty = Math.max(1, Number(max_order_quantity) || 5000);
    const maxPosPct = Math.min(100, Math.max(5, Number(max_position_percent) || 100));
    const cbDown = Math.min(95, Math.max(5, Number(circuit_breaker_down_pct) || 50));
    const cbUp = Math.max(10, Number(circuit_breaker_up_pct) || 200);
    const cbResetMins = Math.max(0, Number(circuit_breaker_reset_minutes) || 0);
    const allowShort = allow_short_selling ? 1 : 0;
    const shortMargin = Math.max(0.1, Number(short_margin_requirement) || 0.5);

    const cleanCode = join_code
      ? String(join_code)
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 6) || generateSixCharCode()
      : generateSixCharCode();

    let codeExpiresAt: string | null = null;
    if (
      join_code_duration_minutes !== undefined &&
      join_code_duration_minutes !== null &&
      join_code_duration_minutes !== 'infinite'
    ) {
      const mins = Number(join_code_duration_minutes);
      if (mins > 0) {
        codeExpiresAt = new Date(Date.now() + mins * 60000).toISOString();
      }
    }

    const now = new Date().toISOString();
    const nowTime = getISTTimeStr();

    const created = runSql(
      `INSERT INTO games (
        name, starting_capital, initial_credits, status,
        tick_interval_ms, demand_impact_factor, random_drift_bias, noise_multiplier,
        trade_fee_percent, max_order_quantity, max_position_percent,
        circuit_breaker_down_pct, circuit_breaker_up_pct, circuit_breaker_reset_minutes,
        allow_short_selling, short_margin_requirement,
        join_code, join_code_expires_at, created_at
      ) VALUES (?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        startCap,
        initCreds,
        tickMs,
        demandFactor,
        driftBias,
        noiseMult,
        feePct,
        maxOrderQty,
        maxPosPct,
        cbDown,
        cbUp,
        cbResetMins,
        allowShort,
        shortMargin,
        cleanCode,
        codeExpiresAt,
        now,
      ]
    );
    const gameId = created.lastInsertRowid;

    const tickerToIdMap: Record<string, number> = {};
    if (Array.isArray(stocks) && stocks.length > 0) {
      for (const s of stocks) {
        const base = Math.max(1, Number(s.base_price) || 100);
        const vol = Math.max(0.001, Number(s.volatility) || 0.02);
        const tickerClean = (s.ticker || 'STK').trim().toUpperCase();
        const history = [{ time: nowTime, price: base }];
        const stInserted = runSql(
          `INSERT INTO stocks (game_id, name, ticker, sector, base_price, current_price, previous_price, high_price, low_price, volatility, volume, price_history)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            gameId,
            (s.name || s.ticker).trim(),
            tickerClean,
            (s.sector || 'Equities').trim(),
            base,
            base,
            base,
            base,
            base,
            vol,
            JSON.stringify(history),
          ]
        );
        tickerToIdMap[tickerClean] = stInserted.lastInsertRowid;
      }
    }

    if (Array.isArray(hints) && hints.length > 0) {
      for (const h of hints) {
        const stId = tickerToIdMap[(h.ticker || '').toUpperCase()] || Object.values(tickerToIdMap)[0];
        if (stId && h.title && h.content) {
          runSql(
            `INSERT INTO stock_hints (game_id, stock_id, title, category, risk_rating, content, cost_credits)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              gameId,
              stId,
              h.title.trim(),
              h.category || 'Insider Intel',
              (h.risk_rating || 'MEDIUM RISK').trim(),
              h.content.trim(),
              Math.max(1, Number(h.cost_credits) || 2),
            ]
          );
        }
      }
    }

    if (Array.isArray(playerIds) && playerIds.length > 0) {
      for (const uid of playerIds) {
        runSql(
          `INSERT OR IGNORE INTO game_players (game_id, user_id, cash_balance, info_credits, joined_at)
           VALUES (?, ?, ?, ?, ?)`,
          [gameId, Number(uid), startCap, initCreds, now]
        );
      }
    }

    runSql(
      `INSERT INTO news_events (game_id, headline, impact_summary, severity, affected_ticker, price_delta_percent, created_at)
       VALUES (?, ?, ?, 'Info', NULL, 0, ?)`,
      [
        gameId,
        `NEW SESSION INITIALIZED: ${name.trim()}`,
        `Capital: ₹${startCap.toLocaleString('en-IN')} · Fee: ${feePct}% · Max Order: ${maxOrderQty} sh · Circuit Breakers: -${cbDown}% / +${cbUp}%`,
        now,
      ]
    );

    const allGames = queryAll<any>('SELECT * FROM games ORDER BY id DESC');
    io.emit('games:list_updated', allGames);
    broadcastGameUpdate(gameId);
    res.json({ gameId, games: allGames });
  });

  app.post('/api/admin/games/:id/status', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const { status, resetBaseline } = req.body;
    if (!['Active', 'Paused', 'Completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    runSql('UPDATE games SET status = ? WHERE id = ?', [status, gameId]);
    if (resetBaseline) {
      runSql('UPDATE stocks SET base_price = current_price WHERE game_id = ?', [gameId]);
      lastBaselineResetMap.set(gameId, Date.now());
    }
    const allGames = queryAll<any>('SELECT * FROM games ORDER BY id DESC');
    io.emit('games:list_updated', allGames);
    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  app.post('/api/admin/games/:id/rules', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const {
      starting_capital,
      initial_credits,
      tick_interval_ms,
      demand_impact_factor,
      random_drift_bias,
      noise_multiplier,
      trade_fee_percent,
      max_order_quantity,
      max_position_percent,
      circuit_breaker_down_pct,
      circuit_breaker_up_pct,
      circuit_breaker_reset_minutes,
      allow_short_selling,
      short_margin_requirement,
    } = req.body;

    runSql(
      `UPDATE games SET
        starting_capital = ?,
        initial_credits = ?,
        tick_interval_ms = ?,
        demand_impact_factor = ?,
        random_drift_bias = ?,
        noise_multiplier = ?,
        trade_fee_percent = ?,
        max_order_quantity = ?,
        max_position_percent = ?,
        circuit_breaker_down_pct = ?,
        circuit_breaker_up_pct = ?,
        circuit_breaker_reset_minutes = ?,
        allow_short_selling = ?,
        short_margin_requirement = ?
       WHERE id = ?`,
      [
        Math.max(1000, Number(starting_capital) || 1000000),
        Math.max(0, Number(initial_credits) ?? 10),
        Math.max(500, Number(tick_interval_ms) || 3000),
        Math.max(0, Number(demand_impact_factor) ?? 0.0018),
        Number(random_drift_bias) || 0,
        Math.max(0, Number(noise_multiplier) ?? 0.45),
        Math.max(0, Number(trade_fee_percent) ?? 0.1),
        Math.max(1, Number(max_order_quantity) || 5000),
        Math.min(100, Math.max(5, Number(max_position_percent) || 100)),
        Math.min(95, Math.max(5, Number(circuit_breaker_down_pct) || 50)),
        Math.max(10, Number(circuit_breaker_up_pct) || 200),
        Math.max(0, Number(circuit_breaker_reset_minutes) || 0),
        allow_short_selling ? 1 : 0,
        Math.max(0.1, Number(short_margin_requirement) || 0.5),
        gameId,
      ]
    );
    const allGames = queryAll<any>('SELECT * FROM games ORDER BY id DESC');
    io.emit('games:list_updated', allGames);
    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  app.post('/api/admin/games/:id/reset-baseline', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    runSql('UPDATE stocks SET base_price = current_price WHERE game_id = ?', [gameId]);
    lastBaselineResetMap.set(gameId, Date.now());
    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  app.post('/api/admin/games/:id/players', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const { userId, action } = req.body;
    const game = queryOne<any>('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    if (action === 'remove') {
      runSql('DELETE FROM game_players WHERE game_id = ? AND user_id = ?', [gameId, Number(userId)]);
      runSql('DELETE FROM holdings WHERE game_id = ? AND user_id = ?', [gameId, Number(userId)]);
    } else {
      const now = new Date().toISOString();
      runSql(
        `INSERT OR IGNORE INTO game_players (game_id, user_id, cash_balance, info_credits, joined_at)
         VALUES (?, ?, ?, ?, ?)`,
        [gameId, Number(userId), game.starting_capital, game.initial_credits, now]
      );
    }
    const allGames = queryAll<any>('SELECT * FROM games ORDER BY id DESC');
    io.emit('games:list_updated', allGames);
    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  app.post('/api/admin/games/:id/stocks', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const { name, ticker, sector, base_price, volatility } = req.body;
    if (!name || !ticker || !base_price) {
      return res.status(400).json({ error: 'Stock name, ticker, and base price are required' });
    }
    const base = Math.max(1, Number(base_price));
    const vol = Math.max(0.001, Number(volatility) || 0.02);
    const nowTime = getISTTimeStr();
    const history = [{ time: nowTime, price: base }];

    runSql(
      `INSERT INTO stocks (game_id, name, ticker, sector, base_price, current_price, previous_price, high_price, low_price, volatility, volume, price_history)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [gameId, name.trim(), ticker.trim().toUpperCase(), (sector || 'Equities').trim(), base, base, base, base, base, vol, JSON.stringify(history)]
    );
    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  // ==================== MARKET MANIPULATION (SUDO MODE - PROTECTED) ====================
  app.post('/api/admin/games/:id/manipulate-stock', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const result = applyManipulateStock(gameId, req.body);
    if (!result) return res.status(404).json({ error: 'Stock not found' });
    broadcastGameUpdate(gameId);
    res.json({ success: true, ...result });
  });

  app.post('/api/admin/games/:id/alter-player', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const ok = applyAlterPlayer(gameId, req.body);
    if (!ok) return res.status(404).json({ error: 'Player not found in this game' });
    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  app.post('/api/admin/games/:id/news', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    if (!req.body.headline) return res.status(400).json({ error: 'Headline is required' });
    const newsItem = applyNewsEvent(gameId, req.body, io);
    broadcastGameUpdate(gameId);
    res.json({ success: true, news: newsItem });
  });

  app.post('/api/admin/games/:id/hints', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const { stock_id, title, category, risk_rating, content, cost_credits } = req.body;
    if (!stock_id || !title || !content) {
      return res.status(400).json({ error: 'Stock, title, and dossier content are required' });
    }
    runSql(
      `INSERT INTO stock_hints (game_id, stock_id, title, category, risk_rating, content, cost_credits)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        gameId,
        Number(stock_id),
        title.trim(),
        category || 'Insider Intel',
        (risk_rating || 'MEDIUM RISK').trim(),
        content.trim(),
        Math.max(1, Number(cost_credits) || 2),
      ]
    );
    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  app.delete('/api/admin/games/:id/hints/:hintId', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const hintId = Number(req.params.hintId);
    runSql('DELETE FROM stock_hints WHERE id = ? AND game_id = ?', [hintId, gameId]);
    runSql('DELETE FROM unlocked_hints WHERE hint_id = ? AND game_id = ?', [hintId, gameId]);
    broadcastGameUpdate(gameId);
    res.json({ success: true });
  });

  // ==================== PLAYER TRADING & INFO STORE (AUTHENTICATED) ====================
  app.post('/api/games/:id/trade', requireAuth, (req: AuthedRequest, res) => {
    const gameId = Number(req.params.id);
    const caller = req.authUser!;
    const userId = caller.id;

    const { stockId, type, quantity } = req.body;
    const qty = Math.floor(Number(quantity));
    if (!stockId || !['BUY', 'SELL'].includes(type) || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Valid positive integer trade quantity required' });
    }

    const game = queryOne<any>('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'Active') {
      return res.status(400).json({ error: `Market is currently ${game.status}. Order rejected.` });
    }

    const maxOrderQty = Number(game.max_order_quantity) || 5000;
    if (qty > maxOrderQty) {
      return res.status(400).json({
        error: `Order exceeds Exchange Maximum Order Lot rule (${maxOrderQty.toLocaleString()} shares per ticket).`,
      });
    }

    const player = queryOne<any>('SELECT * FROM game_players WHERE game_id = ? AND user_id = ?', [gameId, userId]);
    if (!player) return res.status(403).json({ error: 'You are not enrolled in this game' });

    const stock = queryOne<any>('SELECT * FROM stocks WHERE id = ? AND game_id = ?', [Number(stockId), gameId]);
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    const execPrice = stock.current_price;
    const grossValue = Number((execPrice * qty).toFixed(2));
    const feePct = Math.max(0, Number(game.trade_fee_percent) || 0);
    const feeAmount = Number(((grossValue * feePct) / 100).toFixed(2));

    const existingHolding = queryOne<any>(
      'SELECT * FROM holdings WHERE game_id = ? AND user_id = ? AND stock_id = ?',
      [gameId, userId, Number(stockId)]
    );
    const currentOwned = existingHolding ? existingHolding.quantity : 0;

    const allStocks = queryAll<any>('SELECT id, current_price FROM stocks WHERE game_id = ?', [gameId]);
    const stPriceMap = new Map<number, number>();
    allStocks.forEach((s) => stPriceMap.set(s.id, s.current_price));
    const playerHoldings = queryAll<any>('SELECT stock_id, quantity FROM holdings WHERE game_id = ? AND user_id = ?', [
      gameId,
      userId,
    ]);
    let currentEquityVal = 0;
    for (const h of playerHoldings) {
      currentEquityVal += h.quantity * (stPriceMap.get(h.stock_id) || 0);
    }
    const playerNetWorth = Math.max(1, player.cash_balance + currentEquityVal);

    if (type === 'BUY') {
      const totalDebit = Number((grossValue + feeAmount).toFixed(2));
      if (player.cash_balance < totalDebit) {
        return res.status(400).json({
          error: `Insufficient cash balance (Requires ₹${totalDebit.toLocaleString('en-IN')} including ${feePct}% fee).`,
        });
      }

      const nextStockQty = currentOwned + qty;
      const maxPosPct = Number(game.max_position_percent) || 100;
      if (nextStockQty > 0 && maxPosPct < 100) {
        const nextPositionValue = nextStockQty * execPrice;
        const maxAllowedValue = (playerNetWorth * maxPosPct) / 100;
        if (nextPositionValue > maxAllowedValue) {
          return res.status(400).json({
            error: `Order violates Max Single-Stock Concentration Rule (${maxPosPct}% of Net Worth = ₹${maxAllowedValue.toLocaleString('en-IN')}).`,
          });
        }
      }

      const nextCash = Number((player.cash_balance - totalDebit).toFixed(2));
      runSql('UPDATE game_players SET cash_balance = ? WHERE id = ?', [nextCash, player.id]);

      if (existingHolding) {
        const newQty = currentOwned + qty;
        const newAvg =
          currentOwned >= 0 && newQty > 0
            ? Number(((currentOwned * existingHolding.avg_buy_price + grossValue) / newQty).toFixed(2))
            : execPrice;
        runSql('UPDATE holdings SET quantity = ?, avg_buy_price = ? WHERE id = ?', [
          newQty,
          newAvg,
          existingHolding.id,
        ]);
      } else {
        runSql(
          'INSERT INTO holdings (game_id, user_id, stock_id, quantity, avg_buy_price) VALUES (?, ?, ?, ?, ?)',
          [gameId, userId, Number(stockId), qty, execPrice]
        );
      }
    } else {
      const newQty = currentOwned - qty;
      if (newQty < 0 && !game.allow_short_selling) {
        return res.status(400).json({
          error: `Short selling is disabled by Admin rules for this round (You own ${Math.max(0, currentOwned)} shares).`,
        });
      }

      if (newQty < 0 && game.allow_short_selling) {
        const shortMarginReq = Number(game.short_margin_requirement) || 0.5;
        const totalShortExposure = Math.abs(newQty) * execPrice;
        const requiredCollateral = totalShortExposure * shortMarginReq;
        if (playerNetWorth < requiredCollateral) {
          return res.status(400).json({
            error: `Insufficient Net Worth margin for short position (Requires ₹${requiredCollateral.toLocaleString('en-IN')} collateral at ${(shortMarginReq * 100).toFixed(0)}% margin rule).`,
          });
        }
      }

      const netProceeds = Number((grossValue - feeAmount).toFixed(2));
      const nextCash = Number((player.cash_balance + netProceeds).toFixed(2));
      runSql('UPDATE game_players SET cash_balance = ? WHERE id = ?', [nextCash, player.id]);

      if (existingHolding) {
        const newAvg = newQty < 0 && currentOwned >= 0 ? execPrice : existingHolding.avg_buy_price;
        runSql('UPDATE holdings SET quantity = ?, avg_buy_price = ? WHERE id = ?', [
          newQty,
          newAvg,
          existingHolding.id,
        ]);
      } else {
        runSql(
          'INSERT INTO holdings (game_id, user_id, stock_id, quantity, avg_buy_price) VALUES (?, ?, ?, ?, ?)',
          [gameId, userId, Number(stockId), newQty, execPrice]
        );
      }
    }

    const impactFactor = Number(game.demand_impact_factor) ?? 0.0018;
    const direction = type === 'BUY' ? 1 : -1;
    const rawImpact = direction * Math.min(0.12, Math.sqrt(qty) * impactFactor * (1 + stock.volatility * 8));
    const unclampedPrice = Math.max(1, Number((stock.current_price * (1 + rawImpact)).toFixed(2)));
    const nextPrice = clampPriceToCircuitBreakers(unclampedPrice, stock.base_price, game);

    const high = Math.max(stock.high_price, nextPrice);
    const low = Math.min(stock.low_price, nextPrice);
    const nowTime = getISTTimeStr();

    let history: { time: string; price: number }[] = [];
    try {
      history = JSON.parse(stock.price_history || '[]');
    } catch {
      history = [];
    }
    history.push({ time: nowTime, price: nextPrice });
    if (history.length > 40) history = history.slice(history.length - 40);

    runSql(
      `UPDATE stocks SET previous_price = ?, current_price = ?, high_price = ?, low_price = ?, volume = volume + ?, price_history = ? WHERE id = ?`,
      [stock.current_price, nextPrice, high, low, qty, JSON.stringify(history), stock.id]
    );

    const nowIso = new Date().toISOString();
    runSql(
      `INSERT INTO trades (game_id, user_id, stock_id, type, quantity, price, fee, total, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [gameId, userId, Number(stockId), type, qty, execPrice, feeAmount, grossValue, nowIso]
    );

    broadcastGameUpdate(gameId);
    const updatedState = buildGameState(gameId, { id: caller.id, role: caller.role });
    res.json({
      success: true,
      executedPrice: execPrice,
      fee: feeAmount,
      newMarketPrice: nextPrice,
      state: updatedState,
    });
  });

  app.post('/api/games/:id/unlock-hint', requireAuth, (req: AuthedRequest, res) => {
    const gameId = Number(req.params.id);
    const caller = req.authUser!;
    const userId = caller.id;
    const { hintId } = req.body;
    if (!hintId) return res.status(400).json({ error: 'Missing hintId' });

    const already = queryOne(
      'SELECT id FROM unlocked_hints WHERE game_id = ? AND user_id = ? AND hint_id = ?',
      [gameId, userId, Number(hintId)]
    );
    if (already) {
      return res.json({ success: true, state: buildGameState(gameId, { id: caller.id, role: caller.role }) });
    }

    const hint = queryOne<any>('SELECT * FROM stock_hints WHERE id = ? AND game_id = ?', [Number(hintId), gameId]);
    if (!hint) return res.status(404).json({ error: 'Hint not found' });

    const player = queryOne<any>('SELECT * FROM game_players WHERE game_id = ? AND user_id = ?', [gameId, userId]);
    if (!player) return res.status(403).json({ error: 'Player not enrolled in game' });

    if (player.info_credits < hint.cost_credits) {
      return res.status(400).json({ error: `Insufficient Information Credits (Requires ${hint.cost_credits} CR)` });
    }

    const nextCredits = player.info_credits - hint.cost_credits;
    runSql('UPDATE game_players SET info_credits = ? WHERE id = ?', [nextCredits, player.id]);
    runSql(
      'INSERT INTO unlocked_hints (game_id, user_id, hint_id, unlocked_at) VALUES (?, ?, ?, ?)',
      [gameId, userId, Number(hintId), new Date().toISOString()]
    );

    broadcastGameUpdate(gameId);
    const updatedState = buildGameState(gameId, { id: caller.id, role: caller.role });
    res.json({ success: true, state: updatedState });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`IITB Stoxchange Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
