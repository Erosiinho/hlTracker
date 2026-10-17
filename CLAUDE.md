# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

hlTracker is a trading-metrics tool for Hyperliquid (a perp DEX). It surfaces,
from free public data, **who the best traders are right now** and **where the
"smart money" is positioned**, so the metrics can be used as trading signal.

Two features today:

- **Top traders** — ranks wallets from Hyperliquid's public leaderboard by a
  chosen window (`day`/`week`/`month`/`allTime`) and metric (`pnl`/`roi`/`vlm`).
  Each row expands to show that wallet's current open positions.
- **Smart money** — aggregates per-coin long/short positioning across the
  current top-N traders (how many are long vs short, net notional), i.e. a
  sentiment view of where the sharpest wallets are leaning.

It only uses free, no-auth, no-signup public data: Hyperliquid's public
leaderboard and the public `clearinghouseState` info endpoint.

**The app is fully ephemeral** — every request hits Hyperliquid live; there is
no database. (Historical metrics — win rate, drawdown, who's adding/trimming
over time — would need snapshot persistence; see "Roadmap".)

> History: this repo began as `hyperliquid-positions-watcher`, a flex-claim
> verifier with a Postgres-backed matching engine and bridge/leaderboard/trades
> ingestion. That whole stack was removed when the project pivoted to hlTracker;
> only the Top-traders and Smart-money features were kept. It's still a sibling
> of `../lifeTracker` and reuses its layering/DI/naming — see "Conventions".

## Commands

### Server (`server/`)

```bash
npm install
npm run dev                # tsx watch, http://localhost:3000
npm run build && npm start # tsup build, then run dist/index.js
npx tsc --noEmit           # type-check only

npm test                   # vitest run
npm run test:watch
npx vitest run -t "ranks by the chosen metric"  # single test by name
```

### Client (`client/`)

```bash
npm install
npm run dev            # vite --host
npm run build          # type-check (vue-tsc --build) + vite build
npx vue-tsc --build    # type-check only
```

No root `package.json` — `client/` and `server/` are two independent npm
packages. No Docker Compose and no database: the server is a plain stateless
Express app (`server/Dockerfile` builds + runs `dist/index.js`); the client
`Dockerfile` builds the SPA and serves it via nginx, proxying `/api` to the
server.

## Architecture

### Server layering

`service -> controller -> routes`, wired in `server.ts#init()` (no DB, no
repository layer — services fetch Hyperliquid directly). Controllers wrap
handlers in `asyncController` (`http/controllers/controller.ts`) to forward
thrown errors to `errorHandler`.

`errorHandler` is registered in `server.ts#init()` **after** routes are mounted,
not inside `setupMiddlewares()`. This is load-bearing: Express only routes an
error to error-handling middleware registered *after* the point of failure, so
registering it earlier silently breaks error handling for every route.

### Endpoints

- `GET /api/top-traders?window=week&metric=pnl&limit=50` — `LeaderboardService`.
  Defaults: week / pnl / 50. `limit` ≤ 500.
- `GET /api/wallets/:address/positions` — `WalletPositionsService`. A wallet's
  live open positions via `clearinghouseState`, sorted by notional desc. Address
  is Zod-validated (`0x` + 40 hex) → `400` on bad input.
- `GET /api/smart-money?window=week&metric=pnl&traders=30` — `SmartMoneyService`.
  Takes the top-N traders, fetches each one's positions, aggregates per coin.
  `traders` ≤ 100.

### Services (`services/`)

- `LeaderboardService` — fetches the leaderboard and ranks via the pure
  `selectTopTraders()` in `lib/hyperliquid-api.ts`. The leaderboard payload is
  ~40 MB, so raw rows are cached in-memory with a short TTL
  (`LEADERBOARD_CACHE_TTL_MS`, default 60s).
- `WalletPositionsService` — fetches `clearinghouseState` for the default dex +
  `EXTRA_DEXS` (`['xyz']`), normalizes, sorts by notional. No cache.
- `SmartMoneyService` — depends on the other two. Fetches top-N wallets'
  positions with bounded concurrency (`p-limit`, `SMART_MONEY_CONCURRENCY`,
  default 5) and **tolerates per-wallet failures** (a bad response returns null
  and is filtered out rather than sinking the aggregate). Result cached by
  `window:metric:traders` (`SMART_MONEY_CACHE_TTL_MS`, default 60s). The per-coin
  rollup is the pure, exported `aggregatePositioning()` — unit-tested directly.

Tuning constants live as `process.env.X || default` in each service (there is no
central config module), matching the original codebase's style.

### External data (`lib/hyperliquid-api.ts`)

Pure fetch/transport + normalization, no app state. Leaderboard fetch needs a
`User-Agent` header or the CDN 403s it. All numeric fields in Hyperliquid
responses are strings; `szi`'s sign gives the side; an empty `assetPositions`
array is a normal "no open positions" outcome, not an error.

### Testing (server)

`src/__tests__/aggregation.test.ts` unit-tests the pure ranking/aggregation
functions directly (no mocks, no DB, no HTTP). Prefer testing new logic as pure
functions this way. There is intentionally no end-to-end HTTP test harness
anymore — the mocked-Prisma `buildApp` fixture went away with the database.

### Client

Flat `api/api.ts` (native `fetch` + `handleResponse<T>` which reads `error.error`
from failure bodies) plus composition-style Pinia stores (`stores/topTraders.ts`,
`stores/smartMoney.ts`: refs/computed, try/catch/finally actions). Router has two
routes: `/` (Top traders, the default) and `/smart-money`; page-level components
live directly in `components/` (no `views/` dir). `utils/clipboard.ts` is a
copy helper with an `execCommand` fallback — required because the app is often
served over plain HTTP on a LAN IP, where `navigator.clipboard` is undefined
(secure-context only).

`assets/style.css` owns the visual system (light/dark via `prefers-color-scheme`,
indigo accent, `.panel` cards, `.pill` badges, `.data-table`). Positive/negative
values use `var(--success)`/`var(--danger)`.

## Conventions carried over from `lifeTracker`

Manual constructor injection (no DI framework), file naming (`*.service.ts`,
`*.controller.ts`, `*.routes.ts`, `I*.ts` for interfaces), `asyncController`/
`errorHandler` shape, composition-style Pinia stores. Two deliberate departures
(correctness fixes — keep them): `errorHandler` registered *after* routes; the
client's `handleResponse` reads `error.error` (matching the server's
`{error: "..."}` shape), not `error.message`.

## Roadmap / known gaps

- **Rate-limiting**: `smart-money` fetches ~2 requests per analyzed trader
  (default + `xyz` dex), so `traders=30` ≈ 60 live calls, mitigated by
  concurrency 5 + the 60s cache. Pushing toward `traders=100` can hit HTTP 429
  on the free public API.
- **Historical metrics** (win rate, drawdown, PnL curves, position deltas / who's
  adding or trimming) are impossible from `clearinghouseState`'s single snapshot.
  They need periodic snapshot persistence — reintroduce a DB (and likely a cron
  job) when building them.
- Many richer per-position fields are already returned by `clearinghouseState`
  but not yet surfaced: `returnOnEquity`, `marginUsed`, `maxLeverage`,
  `cumFunding`, `liquidationPx`, `leverage.type`, and the account `marginSummary`
  (effective leverage, free margin). Good low-cost next metrics.
- Nothing is covered by an end-to-end/live integration test; service behavior
  against live Hyperliquid has only been spot-checked manually.
