# IITB Stoxchange — Multiplayer Stock Market Simulation Platform

A 100% local, self-contained, real-time multiplayer stock market simulation built with **React**, **Tailwind CSS**, **Node.js (Express)**, **Socket.io**, and **SQLite** (`sql.js`). Created by **[Pranav Bagrecha](https://www.cse.iitb.ac.in/~pranavb/)**.

All game rules, market microstructure parameters, stock listings, user accounts, and insider intelligence dossiers are controlled dynamically by the **Admin** and persisted in a local SQLite database file (`simulation.sqlite`).

---

## 1. Core Features & Architecture

### Admin Dashboard (Sudo Mode)
- **Explicit Market Rules Engine**: When creating a new round or modifying an active round, the Admin explicitly defines:
  - **Starting Capital** (e.g., `₹10,00,000`) & **Initial Information Credits** (e.g., `10 CR`)
  - **Market Tick Frequency** (`ms` per background price update, e.g., `1200ms` to `5000ms`)
  - **Order Demand Impact Factor** (how strongly player Buy/Sell orders move the stock price)
  - **Background Market Drift Bias** (`+` for secular bull market, `-` for bear stress test, `0` for neutral)
  - **Random Noise Volatility Multiplier** (scales each stock's individual volatility factor)
  - **Exchange Commission / Transaction Fee (%)** (charged on every Buy/Sell execution)
  - **Maximum Order Lot Size** (maximum shares allowed per single order ticket)
  - **Maximum Single-Stock Concentration (%)** (caps how much of a player's Net Worth can be allocated to one stock)
  - **Upper & Lower Circuit Breakers (%)** (hard price floor and ceiling relative to each stock's base price)
  - **Short Selling & Margin Requirement** (enable/disable short selling and set required Net Worth collateral ratio)
  - **Starting Equities & Pre-Seeded Info Store Hints**
- **User Account Provisioning**: Create `Player` or `Admin` accounts, reset passwords, and Ban/Unban users (banning immediately disconnects active terminals via Socket.io).
- **Live Sudo Mode**: Real-time master matrix of all players in the active round, including Cash, Portfolio Value, Net Worth, Credits, and instant `+₹1L / -₹1L` cash and `+5 CR / -2 CR` credit override buttons.
- **Direct Market Manipulation & News Wire**: Pump or crash any stock (`+15%`, `+5%`, `-5%`, `-15%`, or exact price) and broadcast live breaking news banners with optional automatic price shocks to all player screens.

---

## 2. Deploying on a Local Network (LAN / Wi-Fi)

Because the server binds to `0.0.0.0:3000` and the Socket.io client automatically connects to `window.location.origin`, hosting a multiplayer session over a local Wi-Fi or Ethernet LAN requires zero code changes.

### Prerequisites
- **Node.js** `v18+` (or `v20+` LTS recommended) installed on the host machine (the Admin's laptop/PC).
- All players and the host machine connected to the **same Wi-Fi network or LAN** (avoid "Guest" Wi-Fi networks that enable AP Client Isolation).

### Step 1: Install Dependencies
Open a terminal in the project root directory on the host machine and run:

```bash
npm install
```
*(Note: If your local `npm` version complains about peer dependencies between `vite` and `esbuild`, either ensure `"esbuild": "^0.27.0"` is in your `package.json` or run `npm install --legacy-peer-deps`).*

### Step 2: Find the Host Machine's Local IP Address
Find your machine's LAN IPv4 address (typically looks like `192.168.x.x` or `10.x.x.x`):

- **Windows (Command Prompt / PowerShell)**:
  ```powershell
  ipconfig
  ```
  Look for **IPv4 Address** under your active Wi-Fi or Ethernet adapter (e.g., `192.168.1.45`).

- **macOS**:
  ```bash
  ipconfig getifaddr en0
  ```
  *(Or check System Settings → Wi-Fi → Details → IP Address).*

- **Linux**:
  ```bash
  hostname -I | awk '{print $1}'
  ```

### Step 3: Build & Start the Server (Recommended for Multi-Player Events)
For maximum performance with multiple concurrent players, build the optimized frontend bundle first and run the production server:

```bash
npm run build
NODE_ENV=production npm start
```
*(Alternatively, during testing or development, you can simply run `npm run dev`).*

You will see:
```text
Apex Exchange Server running on http://0.0.0.0:3000
```

### Step 4: Allow Port `3000` Through Your Host Firewall (If Needed)
If players on other laptops/phones cannot reach the host IP, allow incoming TCP traffic on port `3000`:

- **Windows**:
  Open PowerShell as Administrator and run:
  ```powershell
  New-NetFirewallRule -DisplayName "Apex Exchange LAN" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
  ```
- **Linux (UFW)**:
  ```bash
  sudo ufw allow 3000/tcp
  ```
- **macOS**:
  If a prompt appears asking *"Do you want the application 'node' to accept incoming network connections?"*, click **Allow**.

### Step 5: Connect Admin & Players
1. **Admin Host**: Open `http://localhost:3000` (or `http://<YOUR_LAN_IP>:3000`) and sign in with:
   - **Username**: `admin`
   - **Password**: `admin123`
2. **Players**: Share your LAN URL (`http://<YOUR_LAN_IP>:3000`, for example `http://192.168.1.45:3000`) with all participants on the network.
3. Players log in using the credentials you create in **Admin → Users** (or the pre-seeded accounts: `arjun_quant`, `meera_alpha`, `vikram_hedge`, `zoya_capital` with password `trade123`).

---

## 3. Competition Security Architecture & Checklist

Before starting a live competition, review these built-in security protections and best practices:

1. **Change the Default Admin Password Immediately**:
   - Sign in as `admin` (`admin123`), go to **Users**, and click **Reset Password** on the `admin` row to set a strong secret password before players connect to the network.
2. **Cryptographic Session Tokens (`HMAC-SHA256`) & Role Enforcement**:
   - Every API request requires a signed `Authorization: Bearer <token>` header.
   - All `/api/admin/*` routes strictly verify `role === 'Admin'` on the server.
   - All Player trade and credit-redemption routes (`/api/games/:id/trade` and `/api/games/:id/unlock-hint`) extract the player's identity directly from their signed token, making it impossible for a player to execute trades on behalf of another user via `curl` or DevTools.
3. **Server-Side Redaction of Locked Information Store Hints**:
   - Locked dossiers in `/api/games/:id/state` have their `content` and `risk_rating` redacted on the server (`REDACTED — Redeem Information Credits to decrypt`) until the authenticated player actually spends the credits. Players cannot peek at locked hints in the browser Network tab.
4. **Portfolio Privacy**:
   - Other players' exact stock holdings are stripped from the public state payload for non-Admin users (players can only see rival Net Worth and Return % on the leaderboard, while the Admin sees every player's full holdings in Sudo Mode).
5. **Password Hashing (`scrypt`) & Login Rate-Limiting**:
   - Passwords are salted and hashed with `crypto.scryptSync`, and `/api/auth/login` rate-limits brute-force attempts per IP.

---

## 4. Where the Database Is Stored & How to Retrieve Data If `npm start` Is Suspended

### Where Is the Data Stored?
All data is stored in a single standard **SQLite 3** file located directly in your project root directory:
```text
~/market/simulation.sqlite
```

### What Happens If `npm start` Is Stopped, Suspended (`Ctrl+Z`), or Killed (`Ctrl+C`)?
- **Zero Data Loss**: Every single trade, price tick, user creation, balance change, and news event immediately writes to `simulation.sqlite` on your hard drive using an atomic write (`simulation.sqlite.tmp` → `simulation.sqlite`).
- **If you accidentally press `Ctrl+Z` (which suspends the process in Linux)**:
  - Simply run `fg` in that same terminal to resume the server immediately, **or** kill the suspended process (`kill %1`) and run `NODE_ENV=production npm start` again.
- **If the server crashes, terminal closes, or laptop reboots**:
  - When you run `npm start` (or `npm run dev`) again, `server.ts` automatically detects `./simulation.sqlite` and loads all games, player cash balances, stock prices, and portfolios right where they left off.

### 3 Ways to Inspect or Retrieve Your Competition Data at Any Time

1. **Directly from the Admin UI (One-Click JSON Export)**:
   - Go to **Sudo Mode → Users** and click **Download Full DB Snapshot (.json)** on the left panel. This downloads a complete, human-readable JSON file containing all users, games, stocks, player cash balances, holdings, and trades.

2. **Using the `sqlite3` CLI in Your Terminal (Even When `npm start` Is Stopped)**:
   ```bash
   # View final player standings & cash balances
   sqlite3 -header -column simulation.sqlite "SELECT u.username, gp.cash_balance, gp.info_credits FROM game_players gp JOIN users u ON u.id = gp.user_id;"

   # Export all trades to a CSV file for Excel / Google Sheets
   sqlite3 -header -csv simulation.sqlite "SELECT t.id, u.username, s.ticker, t.type, t.quantity, t.price, t.fee, t.total, t.created_at FROM trades t JOIN users u ON u.id = t.user_id JOIN stocks s ON s.id = t.stock_id;" > trades_export.csv
   ```

3. **Using a Visual GUI Viewer**:
   - Open `simulation.sqlite` in **DB Browser for SQLite** (`sudo apt install sqlitebrowser`) or the **SQLite Viewer** extension inside VS Code.

### Backing Up or Resetting the Database
- **Backup a Round**: Copy `cp simulation.sqlite simulation_backup_round1.sqlite`.
- **Factory Reset**: Stop the server, delete `rm simulation.sqlite`, and restart the server—it will automatically recreate and seed a fresh database.
