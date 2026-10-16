# IITB Stoxchange — Official Rulebook & Complete Algorithm Guide

This document explains **every single rule, formula, and algorithm** inside **IITB Stoxchange** in plain, simple language, along with the exact math and step-by-step examples for every possible case.

---

## 1. How the Platform Works (The Big Picture)

1. **100% Local & Self-Contained**: The market is **not** connected to the real-world stock market. Every price movement happens inside your local server based on:
   - What players **Buy** and **Sell**.
   - A continuous background **Random Heartbeat ("Tick")**.
   - Any actions taken or scheduled by the **Admin (Sudo Mode)**.
2. **All Times Are in IST (`UTC+05:30`)**: Every clock, trade log, stock chart point, join code expiry, and scheduled task runs on Indian Standard Time (`Asia/Kolkata`).
3. **Zero Hardcoded Rules**: Every game round has its own independent rulebook stored in the database. The Admin can set these rules when creating a round and can even change them live while a game is running.

---

## 2. What Every Player Starts With

When a player is added to a game (either by the Admin or by entering a valid **6-Character Join Code**):
- **Starting Cash Balance (`₹`)**: Set by the Admin (Default: `₹10,00,000`).
- **Initial Information Credits (`CR`)**: Set by the Admin (Default: `10 CR`).
- **Starting Stock Holdings**: `0` shares of every stock.

---

## 3. How a Player's Net Worth & Profit/Loss Are Calculated

On every single price tick and after every trade, the server calculates three numbers for each player:

### A. Portfolio Value (Equity Value)
For every stock the player holds, multiply the **number of shares** by the stock's **current live price**, then add them all up:
$$\text{Portfolio Value} = \sum (\text{Quantity Held} \times \text{Current Stock Price})$$

* **Case 1 — Long Position (`Quantity > 0`)**: If you own `100` shares of a stock trading at `₹500`, that position adds `+₹50,000` to your Portfolio Value.
* **Case 2 — Short Position (`Quantity < 0`)**: If you short-sold `100` shares (`Quantity = -100`) of a stock trading at `₹500`, that position is a liability of `-₹50,000` in your Portfolio Value (because you owe 100 shares back to the market).

### B. Total Net Worth
$$\text{Net Worth} = \text{Cash Balance} + \text{Portfolio Value}$$

> **Why Short Selling Doesn't Artificially Inflate Net Worth**:
> When you short-sell `100` shares at `₹500` (assuming 0% fee), you receive `+₹50,000` in Cash, and your Holdings become `-100` shares worth `-₹50,000`.
> Your Net Worth immediately after the short sale is `(+₹50,000 Cash) + (-₹50,000 Equity) = ₹0 change`.
> - If the stock price **drops** to `₹400`, your `-100` shares now only cost `-₹40,000` to buy back, so your Net Worth **increases by `+₹10,000`**!
> - If the stock price **rises** to `₹600`, your `-100` shares now cost `-₹60,000`, so your Net Worth **decreases by `-₹10,000`**.

### C. Return / P&L Percentage (`pnlPercent`)
$$\text{Return \%} = \left( \frac{\text{Net Worth} - \text{Starting Capital}}{\text{Starting Capital}} \right) \times 100$$

**Leaderboard Ranking**: Players are ranked from highest **Net Worth** to lowest **Net Worth**.

---

## 4. Stock Price Algorithm #1: The Background Heartbeat ("Market Tick")

While a game's status is **`Active`** (Open), a background timer wakes up every **`tick_interval_ms`** (for example, every `3000 ms` = 3 seconds) and updates the price of every stock in that game.

If the game is **`Paused`** or **`Completed`**, the background tick stops completely and prices freeze.

### Step-by-Step Math for Every Tick
For each stock, the server looks at:
1. **`current_price`**: The stock's price right now.
2. **`volatility`** ($\sigma$): How jumpy this specific stock is (e.g., `0.02` = 2%).
3. **`noise_multiplier`**: A game-wide dial set by the Admin (e.g., `0.45`) that scales how strong random noise is across the whole market. (If set to `0`, random noise is completely turned off).
4. **`random_drift_bias`**: A game-wide upward or downward push per tick set by the Admin (e.g., `+0.0005` for a Bull market, `-0.0030` for a Bear crash, or `0` for neutral).

#### Step 1: Pick a Random Number
The server generates a random decimal between `-1.0` and `+1.0`:
$$\text{Random Direction} = (\text{Math.random}() - 0.5) \times 2$$

#### Step 2: Calculate the Random Wiggle
$$\text{Random Shock} = \text{Random Direction} \times (\text{Stock Volatility} \times \text{Noise Multiplier})$$

#### Step 3: Add the Admin's Market Drift Bias
$$\text{Total Shock} = \text{Random Shock} + \text{Random Drift Bias}$$

#### Step 4: Calculate the New Unclamped Price
$$\text{Raw Next Price} = \text{Current Price} \times (1 + \text{Total Shock})$$

#### Step 5: Enforce Circuit Breakers (Upper & Lower Price Limits) & Baseline Resets
Every stock has a **`base_price`** (its reference baseline price, which starts as its initial IPO price). The Admin sets three controls for Circuit Breakers:
1. **Lower Circuit Breaker (`circuit_breaker_down_pct`)**: The maximum % a stock is allowed to fall below its current `base_price` (e.g., `45%` drop).
   $$\text{Minimum Allowed Price} = \max\left(1, \text{Base Price} \times \left(1 - \frac{\text{Lower Circuit \%}}{100}\right)\right)$$
2. **Upper Circuit Breaker (`circuit_breaker_up_pct`)**: The maximum % a stock is allowed to rise above its current `base_price` (e.g., `150%` gain).
   $$\text{Maximum Allowed Price} = \text{Base Price} \times \left(1 + \frac{\text{Upper Circuit \%}}{100}\right)$$
3. **When Does the Baseline (`base_price`) Reset? (`circuit_breaker_reset_minutes`)**:
   - **Case 1 — Fixed Baseline for the Entire Round (`circuit_breaker_reset_minutes = 0`, Default)**:
     - The `base_price` **never** resets automatically during the round. A stock with an IPO `base_price` of `₹1,000`, Lower Circuit `45%`, and Upper Circuit `150%` is locked between **`₹550`** and **`₹2,500`** for the entire round (unless the Admin clicks **Reset Baseline Now** or overrides the price in Sudo Mode).
   - **Case 2 — Periodic Time-Window Baseline Reset (`circuit_breaker_reset_minutes > 0`, e.g., every `10` minutes)**:
     - If the Admin sets **Baseline Reset Window** to `N` minutes (for example, `10` minutes), then every `10` minutes while the market is `Active`, the server automatically resets every stock's `base_price` to its `current_price` (`base_price = current_price`).
     - **Example**: A stock starts at `₹1,000` with a `±20%` circuit breaker per `10-minute` window. During the first 10 minutes, it can only move between `₹800` and `₹1,200`. Suppose it hits `₹1,200` and gets stuck at the upper ceiling. As soon as the 10-minute window finishes, the baseline resets to `₹1,200`! Now, for the next 10 minutes, its new allowed range is `₹960` (`-20%`) to `₹1,440` (`+20%`).
   - **Case 3 — Manual or Scheduled Market Start After a Pause (`Reset Baseline on Start` Option)**:
     - Whenever a round is `Paused`, the Admin sees a **`Reset Baseline on Start`** checkbox right next to the **`Open Market`** button in the top Sudo Mode bar.
     - Similarly, when scheduling an **`Open / Pause / Close Market (SET_STATUS -> Active)`** task in **Task Scheduler (IST)**, the Admin can check **`Also Reset Circuit Breaker Baseline when Market Opens`**.
     - If checked, opening the market automatically re-anchors `base_price = current_price` for every stock at the exact moment trading resumes. If left unchecked, stocks keep their previous `base_price`.
   - **Case 4 — Standalone Scheduled Baseline Reset (`RESET_BASELINE` in Task Scheduler)**:
     - In **Sudo Mode → Task Scheduler (IST)**, the Admin can schedule a dedicated **`Reset Circuit Breaker Baseline`** task for any exact IST time (targeting either **`ALL STOCKS IN ROUND`** or a single stock ticker).
   - **Case 5 — Instant Manual Baseline Reset by Admin (`Reset Baseline Now` button)**:
     - At any moment in **Sudo Mode → Live Market Rules**, the Admin can click **Reset Baseline Now**, which immediately sets `base_price = current_price` for all stocks in the active round.

If `Raw Next Price` goes below the Minimum Allowed Price or above the Maximum Allowed Price, it is **clamped (stopped)** right at that boundary until the price moves back or the baseline resets.

---

## 5. Stock Price Algorithm #2: How Player Buying & Selling Moves the Price

Whenever a player executes a **BUY** or **SELL** order, two things happen in order:
1. **First**, the player gets filled at the **current spot price (`execPrice = current_price`)**.
2. **Second**, the player's order pushes the stock's price **UP** (if they bought) or **DOWN** (if they sold) for the next trade!

### The Order Price Impact Formula
$$\text{Direction} = \begin{cases} +1 & \text{if BUY} \\ -1 & \text{if SELL} \end{cases}$$

$$\text{Raw Impact} = \text{Direction} \times \min\Big(0.12,\; \sqrt{\text{Quantity}} \times \text{Demand Impact Factor} \times (1 + \text{Stock Volatility} \times 8)\Big)$$

$$\text{New Price} = \text{ClampToCircuitBreakers}\Big(\text{Current Price} \times (1 + \text{Raw Impact})\Big)$$

### Why Does It Use $\sqrt{\text{Quantity}}$ (Square Root of Shares)?
- In real financial markets, this is called the **Square-Root Law of Market Impact**.
- Buying `100` shares ($\sqrt{100} = 10$) moves the price 10× as much as buying `1` share ($\sqrt{1} = 1$), rather than 100× as much. This prevents a single large trade from breaking the price, while still rewarding/penalizing big orders.
- **Hard Cap (`0.12` = 12%)**: No single player trade can ever move a stock's price by more than **12%** in a single order, no matter how huge the order is.
- **Circuit Breakers Apply Here Too**: Player trades cannot push a stock past its Upper or Lower Circuit Breaker limits.

---

## 6. Order Execution Rules & All Possible Trade Cases

When a player clicks **BUY** or **SELL**, the server checks **5 strict rules** before allowing the trade. If any rule fails, the order is rejected and nothing changes.

### Pre-Trade Validation Checks (All Orders)
1. **Is the Market Open?**
   - The game `status` must be `'Active'`. If it is `'Paused'` or `'Completed'`, all orders are rejected.
2. **Is the Quantity Valid?**
   - `Quantity` must be a whole positive integer ($1, 2, 3, \dots$).
3. **Max Order Lot Rule (`max_order_quantity`)**:
   - If `Quantity > max_order_quantity` (e.g., trying to buy `3,000` shares when the ticket limit is `2,500`), the order is rejected.
4. **Gross Value & Commission Fee Calculation**:
   $$\text{Gross Value} = \text{Current Price} \times \text{Quantity}$$
   $$\text{Fee Amount} = \text{Gross Value} \times \left(\frac{\text{Trade Fee \%}}{100}\right)$$

---

### All Possible Cases When a Player Clicks `BUY`

When buying, the player must pay both the **Gross Value** and the **Commission Fee**:
$$\text{Total Cash Debit} = \text{Gross Value} + \text{Fee Amount}$$

* **Check 1 — Enough Cash?**:
  - If `Player Cash Balance < Total Cash Debit`, the order is **rejected** (*"Insufficient cash balance"*).
* **Check 2 — Max Single-Stock Concentration Rule (`max_position_percent`)**:
  - Suppose the Admin set `max_position_percent = 50%`. That means no player is allowed to have more than `50%` of their total **Net Worth** invested in a single stock.
  - Let `Next Stock Quantity = Current Owned Shares + Buy Quantity`.
  - If `Next Stock Quantity > 0` (meaning the player will end up with a positive Long position after this buy), the server checks:
    $$\text{Next Position Value} = \text{Next Stock Quantity} \times \text{Current Price}$$
    $$\text{Max Allowed Value} = \text{Player Net Worth} \times \left(\frac{\text{Max Position \%}}{100}\right)$$
  - If `Next Position Value > Max Allowed Value`, the order is **rejected** (*"Order violates Max Single-Stock Concentration Rule"*).
  - *(Note: If a player is only buying shares to cover/reduce a negative Short position so that `Next Stock Quantity <= 0`, the concentration limit does not block them from covering their short!)*

#### How Your Holdings & Average Entry Price Update on a `BUY`:
- **Cash Balance**: Decreases by `Total Cash Debit`.
- **New Share Quantity**: `Current Owned + Buy Quantity`.
- **Average Entry Price (`avg_buy_price`)**:
  - **Case B1 — Adding to an existing Long position (`Current Owned >= 0`)**:
    Calculates the weighted average price:
    $$\text{New Avg Price} = \frac{(\text{Current Owned} \times \text{Old Avg Price}) + \text{Gross Value}}{\text{New Share Quantity}}$$
  - **Case B2 — Covering part or all of a Short position (`Current Owned < 0` and `New Share Quantity <= 0`)**:
    Your `avg_buy_price` stays at your original short-entry price so you can still see your exact profit/loss on the remaining short shares.
  - **Case B3 — Flipping from Short to Long in one trade (`Current Owned < 0` and `New Share Quantity > 0`)**:
    Your `avg_buy_price` resets to the current execution price (`execPrice`).

---

### All Possible Cases When a Player Clicks `SELL`

When selling, the fee is deducted from the cash you receive:
$$\text{Net Cash Proceeds} = \text{Gross Value} - \text{Fee Amount}$$
$$\text{New Share Quantity} = \text{Current Owned} - \text{Sell Quantity}$$

There are **3 possible cases** depending on how many shares you currently own:

#### Case S1 — Normal Sell (Closing or Reducing a Long Position: `New Share Quantity >= 0`)
- You already own enough shares to cover the sale (e.g., you own `100` shares and sell `40` shares, leaving `60` shares).
- **Always allowed** (as long as the market is `Active` and `Quantity <= max_order_quantity`).
- Your Cash Balance increases by `Net Cash Proceeds`.
- Your `avg_buy_price` stays unchanged (because selling part of a long position doesn't change what you originally paid per share for the remaining shares).

#### Case S2 — Short Selling When Short Selling Is `DISABLED` (`New Share Quantity < 0` and `allow_short_selling == 0`)
- You try to sell more shares than you own (for example, you own `0` shares and try to sell `50`, or you own `20` shares and try to sell `50`).
- Because `New Share Quantity` would become negative (`-50` or `-30`) and the Admin disabled short selling, the order is **rejected** (*"Short selling is disabled by Admin rules for this round"*).

#### Case S3 — Short Selling When Short Selling Is `ENABLED` (`New Share Quantity < 0` and `allow_short_selling == 1`)
- The Admin allows players to hold negative shares (`New Share Quantity < 0`), **provided they have enough Net Worth to meet the Short Margin Collateral Requirement (`short_margin_requirement`)**.
- **Exact Margin Check**:
  $$\text{Total Short Exposure} = |\text{New Share Quantity}| \times \text{Current Price}$$
  $$\text{Required Collateral} = \text{Total Short Exposure} \times \text{Short Margin Requirement}$$
  - *Example*: Suppose `short_margin_requirement = 0.50` (`50%`). You want to be short `-100` shares of a `₹1,000` stock.
    - Your `Total Short Exposure` is `100 × ₹1,000 = ₹1,00,000`.
    - Your `Required Collateral` is `₹1,00,000 × 0.50 = ₹50,000`.
    - If your total `Player Net Worth < ₹50,000`, the short sale is **rejected** (*"Insufficient Net Worth margin for short position"*).
    - If your `Player Net Worth >= ₹50,000`, the short sale succeeds! Your Cash increases by `Net Cash Proceeds`, and your holdings become `-100` shares.

---

## 7. Unrealized Profit & Loss (P&L) on Individual Positions

In the **Trading Desk** and **Portfolio** tab, each stock position shows its **Unrealized P&L**:

- **If you are LONG (`Quantity > 0`)**: You profit when `Current Price > Avg Entry Price`:
  $$\text{Unrealized P\&L (Long)} = (\text{Current Price} - \text{Avg Entry Price}) \times \text{Quantity}$$
- **If you are SHORT (`Quantity < 0`)**: You profit when `Current Price < Avg Entry Price`:
  $$\text{Unrealized P\&L (Short)} = (\text{Avg Entry Price} - \text{Current Price}) \times |\text{Quantity}|$$

---

## 8. Information Store & Credits Algorithm

1. Each game has hidden **Intelligence Dossiers (`stock_hints`)** created by the Admin. Each dossier has a `cost_credits` (e.g., `2 CR`, `3 CR`, `4 CR`).
2. **Server-Side Redaction (Anti-Cheat)**:
   - Before a player unlocks a dossier, the server strips out the real `content` and `risk_rating` before sending data over the network, replacing them with `"CLASSIFIED // LOCKED"` and `"REDACTED"`. Even if a player inspects browser DevTools / Network packets, the secret text is not there.
3. **Unlocking a Dossier**:
   - When a player clicks **Unlock**:
     - If they already unlocked it earlier, `0` credits are charged.
     - If `player.info_credits < hint.cost_credits`, the request is rejected (*"Insufficient Information Credits"*).
     - Otherwise, `hint.cost_credits` is subtracted from `player.info_credits`, the unlock is saved in SQLite (`unlocked_hints`), and the decrypted text is immediately revealed to that player only.

---

## 9. Sudo Mode (Admin) Algorithms & Special Powers

### A. Direct Stock Price Manipulation (`applyManipulateStock`)
The Admin can change a stock's price in two ways:
1. **Percentage Pump / Crash (`deltaPercent`)**:
   $$\text{New Price} = \max\left(1,\; \text{Current Price} \times \left(1 + \frac{\text{Delta \%}}{100}\right)\right)$$
2. **Set Exact Price (`exactPrice`)**:
   $$\text{New Price} = \text{Exact Price}$$
*(Note: Admin Sudo Mode overrides **bypass** circuit breakers! If the Admin explicitly sets a price or triggers a +500% shock, the stock jumps to that exact price).*

### B. Breaking News Wire & Auto Price Shock (`applyNewsEvent`)
When the Admin broadcasts a News Event:
- **Case 1 — Banner Only (`affected_ticker = None` or `price_delta_percent = 0`)**:
  - Sends a live pop-up banner (`Info`, `Bullish`, `Bearish`, or `Critical`) to all player screens without changing stock prices.
- **Case 2 — Single Stock Shock (`affected_ticker = 'AETH'`, `price_delta_percent = +15`)**:
  - Broadcasts the news banner **and** immediately changes `AETH`'s price by `+15%`.
- **Case 3 — Market-Wide Shock (`affected_ticker = 'ALL'`, `price_delta_percent = -10`)**:
  - Broadcasts the news banner **and** immediately drops **every stock in the game** by `-10%`.

### C. Player Cash & Credit Override (`applyAlterPlayer`)
For either a **single player** or **`ALL` players in the round**, the Admin can:
- **Add/Subtract Cash (`cashDelta`)**: $\text{New Cash} = \max(0, \text{Current Cash} + \text{Delta})$
- **Set Exact Cash (`exactCash`)**: $\text{New Cash} = \max(0, \text{Exact Cash})$
- **Add/Subtract Credits (`creditsDelta`)**: $\text{New Credits} = \max(0, \text{Current Credits} + \text{Delta})$
- **Set Exact Credits (`exactCredits`)**: $\text{New Credits} = \max(0, \text{Exact Credits})$
*(Player cash and credits can never go below `0`).*

### D. 6-Character Alphanumeric Join Code (`join_code`)
- Admin can set any 6-character code (e.g., `IITB26`) or generate a random one.
- **Validity**:
  - **Infinite (`join_code_expires_at = NULL`)**: Players can use the code at any time.
  - **Timed (`durationMinutes`)**: Server stores `join_code_expires_at = Current Time + durationMinutes`. If a player enters the code after that timestamp, the server rejects it with the exact IST time it expired.
  - **Disabled (`join_code = NULL`)**: No one can join via code; only the Admin can manually enroll players.

### E. IST Task Scheduler (`scheduled_tasks`)
- Every **500 milliseconds (0.5 seconds)**, the server checks all tasks in `scheduled_tasks` where `status = 'Pending'`.
- As soon as `Current Time >= task.execute_at` (in IST `+05:30`), the server automatically runs the task (`SET_STATUS`, `BROADCAST_NEWS`, `MANIPULATE_STOCK`, `ALTER_PLAYER`, or `UPDATE_RULES`), marks the task as `'Executed'`, saves to SQLite, and pushes a real-time update to all connected screens.

### F. Single-Round Export, Delete & Re-Import
- **Export Round**: Packages the entire round (`game`, `stocks`, `players`, `holdings`, `hints`, `unlockedHints`, `news`, `trades`, `scheduledTasks`) into a single `.json` file.
- **Delete Round**: Removes all rows for that `game_id` across all tables in SQLite.
- **Import Round**: Reads an exported `.json` file, creates a restored round in `Paused` status (matching existing users by `username` or creating missing player accounts automatically), and restores all holdings, price charts, news, and trade histories so you can inspect or resume the game at any time.
