# hlTracker

A trading-metrics tool for [Hyperliquid](https://hyperliquid.xyz), built on free
public data. It surfaces **who the best traders are right now** and **where the
smart money is positioned**, so the metrics can be read as trading signal.

Five views:

- **Top traders** — rank leaderboard wallets by window (`day`/`week`/`month`/
  `allTime`) and metric (`pnl`/`roi`/`vlm`). Expand a row for that wallet's live
  positions (with ROE, liquidation distance, funding paid, margin type), its
  account risk (effective leverage, free margin) and its realized track record
  (win rate, payoff, avg hold).
- **Smart money** — per-coin long/short positioning across the current top-N
  traders: net notional, **leverage-weighted conviction** (shown as an implied
  leverage multiple, e.g. `11.5x short`), consensus/agreement, notional-weighted
  cost basis, funding, and the tracked wallets' share of open interest.
- **Funding** — every market's funding rate (current + predicted) with an
  explicit crowding/reversal read: positive funding = crowded longs, negative =
  crowded shorts, and the more extreme the rate the higher the squeeze/reversal
  risk. Each row gets a `neutral`/`elevated`/`high`/`extreme` signal and a
  plain-language note.
- **Liquidations** — the tracked top traders' liquidation notional bucketed by
  distance from price, per coin. Tall clusters near price mark cascade zones;
  the axis scales to where the liquidation mass actually sits.
- **Wallet** (`/wallet/:address`) — a deep-dive: account risk, a cumulative
  **realized-PnL curve** and max drawdown (reconstructed from public fills, no
  database), open positions, and resting orders (limits + TP/SL triggers).

Fully ephemeral: every request hits Hyperliquid live, no database.

## Quick start

```bash
# server (http://localhost:3000)
cd server && npm install && npm run dev

# client (Vite dev server)
cd client && npm install && npm run dev
```

Copy `.env.example` to `.env` if you want to override defaults (data-source URLs,
cache TTLs, `SMART_MONEY_CONCURRENCY`); everything has a sensible default, so
`.env` is optional.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/top-traders?window=week&metric=pnl&limit=50` | Ranked top traders. |
| `GET /api/wallets/:address/positions` | Live open positions + account risk summary. |
| `GET /api/wallets/:address/stats` | Realized track record (win rate, payoff, PnL curve, drawdown) from public fills. |
| `GET /api/wallets/:address/orders` | Resting orders (limits + TP/SL triggers). |
| `GET /api/smart-money?window=week&metric=pnl&traders=30` | Per-coin positioning, conviction, market context + liquidation map. |
| `GET /api/funding` | Per-coin funding with a crowding/reversal signal. |

## Data sources

All free, no auth, no signup — Hyperliquid's public endpoints:

- Leaderboard: `https://stats-data.hyperliquid.xyz/Mainnet/leaderboard`
- Info API (`https://api.hyperliquid.xyz/info`): `clearinghouseState` (positions
  + margin), `metaAndAssetCtxs` (mark/funding/OI), `predictedFundings`,
  `userFills` (trade history), `frontendOpenOrders` (resting orders).

See `CLAUDE.md` for architecture, tuning, and roadmap. Realized stats now come
live from `userFills`; only *time-series* state (PnL curves over time, position
deltas) would still need snapshot persistence.

## Tests

```bash
cd server && npm test          # pure ranking/aggregation/stats/funding unit tests
cd client && npm run build     # type-check + build
```
