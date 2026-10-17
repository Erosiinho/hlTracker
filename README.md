# hlTracker

A trading-metrics tool for [Hyperliquid](https://hyperliquid.xyz), built on free
public data. Two features:

- **Top traders** — rank leaderboard wallets by window (`day`/`week`/`month`/
  `allTime`) and metric (`pnl`/`roi`/`vlm`); expand a row to see that wallet's
  live open positions.
- **Smart money** — aggregate per-coin long/short positioning across the current
  top-N traders (net notional, how many long vs short) as a sentiment signal.

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
| `GET /api/wallets/:address/positions` | A wallet's live open positions. |
| `GET /api/smart-money?window=week&metric=pnl&traders=30` | Per-coin aggregated positioning across top traders. |

## Data sources

- Public leaderboard: `https://stats-data.hyperliquid.xyz/Mainnet/leaderboard`
- Public info API (`clearinghouseState`): `https://api.hyperliquid.xyz/info`

No auth, no signup. See `CLAUDE.md` for architecture, tuning, and roadmap
(historical metrics would require reintroducing snapshot persistence).

## Tests

```bash
cd server && npm test          # pure ranking/aggregation unit tests
cd client && npm run build     # type-check + build
```
