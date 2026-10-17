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
  is Zod-validated (`0x` + 40 hex) → `400` on bad input. Each position carries
  risk fields (`returnOnEquity`, `liquidationPx`, `liquidationDistance`,
  `marginUsed`, `maxLeverage`, `marginType`, `cumFundingSinceOpen`) and the
  response includes an account `summary` (effective leverage, free margin) from
  `marginSummary`.
- `GET /api/wallets/:address/stats` — `WalletStatsService`. Realized track record
  (win rate, payoff ratio, avg hold, realized PnL, top coins, recent fills, a
  cumulative-PnL `pnlCurve`, and `maxDrawdown`) derived from the public
  `userFills` endpoint. Same Zod address validation.
- `GET /api/wallets/:address/orders` — `WalletOrdersService`. Resting orders
  (limits + TP/SL triggers) from `frontendOpenOrders`. Same Zod validation.
- `GET /api/smart-money?window=week&metric=pnl&traders=30` — `SmartMoneyService`.
  Takes the top-N traders, fetches each one's positions, aggregates per coin, then
  merges per-coin market context (funding, OI, mark) and a liquidation-cascade
  map (`liqClusters`). `traders` ≤ 100.
- `GET /api/funding` — `FundingService`. Per-coin funding (current + predicted)
  with a crowding/reversal read (`classifyFunding` → neutral/elevated/high/
  extreme + a plain-language note), sorted by |funding| desc.

### Services (`services/`)

- `LeaderboardService` — fetches the leaderboard and ranks via the pure
  `selectTopTraders()` in `lib/hyperliquid-api.ts`. The leaderboard payload is
  ~40 MB, so raw rows are cached in-memory with a short TTL
  (`LEADERBOARD_CACHE_TTL_MS`, default 60s).
- `WalletPositionsService` — fetches `clearinghouseState` for the default dex +
  `EXTRA_DEXS` (`['xyz']`), normalizes, sorts by notional, and extracts the
  account `summary` from the default-dex `marginSummary`. No cache.
- `WalletStatsService` — fetches `userFills` and computes stats via the pure,
  exported `computeTraderStats()` in `lib/` (realized metrics + equity curve +
  drawdown). No cache (per-wallet, on demand).
- `WalletOrdersService` — fetches `frontendOpenOrders`, normalizes, sorts by
  coin+price. No cache. Not used by smart-money (would double per-trader calls).
- `MarketService` — one `metaAndAssetCtxs` call yields per-coin context (mark,
  funding, OI, prevDayPx) for every coin; cached in-memory
  (`MARKET_CACHE_TTL_MS`, default 30s) since it is shared across all coins.
- `FundingService` — depends on `MarketService` + `predictedFundings`; classifies
  each coin's funding into a crowding/reversal signal via the pure, exported
  `classifyFunding()`. Cached (`FUNDING_CACHE_TTL_MS`, default 30s).
- `SmartMoneyService` — depends on leaderboard + wallet-positions + market.
  Fetches top-N wallets' positions with bounded concurrency (`p-limit`,
  `SMART_MONEY_CONCURRENCY`, default 5) and **tolerates per-wallet failures** (a
  bad response returns null and is filtered out rather than sinking the
  aggregate); market context is fetched in parallel and a failed fetch degrades
  to empty rather than sinking positioning. Result cached by
  `window:metric:traders` (`SMART_MONEY_CACHE_TTL_MS`, default 60s). The per-coin
  rollup is the pure, exported `aggregatePositioning()` (counts, lev-weighted
  conviction, agreement, notional-weighted avg entry/liq, raw liq points) plus
  `mergeMarketContext()` (merges market data and builds `liqClusters` via
  `buildLiquidationClusters()`, stripping the internal `liqPoints`) — all
  unit-tested directly.

Tuning constants live as `process.env.X || default` in each service (there is no
central config module), matching the original codebase's style.

### External data (`lib/hyperliquid-api.ts`)

Pure fetch/transport + normalization, no app state. Covers the leaderboard,
`clearinghouseState`, `metaAndAssetCtxs` (market context), and `userFills`
(trade history) — all free/no-auth. Leaderboard fetch needs a `User-Agent`
header or the CDN 403s it. All numeric fields in Hyperliquid responses are
strings (parse via the `num()` helper, which returns null for missing values);
`szi`'s sign gives the side; an empty `assetPositions` array is a normal "no
open positions" outcome, not an error. `metaAndAssetCtxs` returns a positional
`[meta, assetCtxs]` tuple aligned by coin index; `userFills` is newest-first,
so `computeTraderStats()` re-sorts ascending for round-trip holding times. Mark
price is recovered as `positionValue / size` (no extra fetch needed for the
liquidation-distance metric).

### Testing (server)

`src/__tests__/aggregation.test.ts` unit-tests the pure ranking/aggregation
functions directly (no mocks, no DB, no HTTP). Prefer testing new logic as pure
functions this way. There is intentionally no end-to-end HTTP test harness
anymore — the mocked-Prisma `buildApp` fixture went away with the database.

### Client

Flat `api/api.ts` (native `fetch` + `handleResponse<T>` which reads `error.error`
from failure bodies) plus composition-style Pinia stores (`stores/topTraders.ts`,
`stores/smartMoney.ts`: refs/computed, try/catch/finally actions). Router has five
routes: `/` (Top traders, default), `/smart-money`, `/funding`, `/liquidations`
(reuses the smart-money store for its `liqClusters`), and `/wallet/:address` (a
deep-dive: positions + risk summary + realized-PnL curve/drawdown + resting
orders, with a hand-rolled SVG equity curve — no chart lib). Page-level
components live directly in `components/` (no `views/` dir); `TopTraderRow`'s
expanded panel links to `/wallet/:address`. `utils/clipboard.ts` is a
copy helper with an `execCommand` fallback — required because the app is often
served over plain HTTP on a LAN IP, where `navigator.clipboard` is undefined
(secure-context only).

`assets/style.css` owns the visual system — a Hyperliquid-themed trading-terminal
look: teal-black base with the mint accent (`--accent`, chrome only: brand, active
nav, focus, links — never on data), fonts Space Grotesk (UI) + IBM Plex Mono
(numerics, loaded in `index.html`), `.panel` cards, `.pill` badges, `.data-table`.
Light/dark via `prefers-color-scheme`. Long/short and positive/negative values are
the only saturated data colours (`var(--success)`/`var(--danger)`). The brand mark
in `App.vue` is an original mint glyph (not Hyperliquid's trademarked logo).
`TopTraderRow` fetches `/positions` and `/stats` together on expand (stats
best-effort); `SmartMoneyView` renders the enriched per-coin columns.

## Conventions carried over from `lifeTracker`

Manual constructor injection (no DI framework), file naming (`*.service.ts`,
`*.controller.ts`, `*.routes.ts`, `I*.ts` for interfaces), `asyncController`/
`errorHandler` shape, composition-style Pinia stores. Two deliberate departures
(correctness fixes — keep them): `errorHandler` registered *after* routes; the
client's `handleResponse` reads `error.error` (matching the server's
`{error: "..."}` shape), not `error.message`.

## Roadmap / known gaps

- **Rate-limiting**: `smart-money` fetches ~2 requests per analyzed trader
  (default + `xyz` dex) plus one shared (cached) `metaAndAssetCtxs`, so
  `traders=30` ≈ 60 live calls, mitigated by concurrency 5 + the 60s cache.
  Pushing toward `traders=100` can hit HTTP 429 on the free public API. The
  per-trader `/stats` call (from the Top-traders UI on row expand) adds one
  `userFills` request per opened wallet.
- **Realized track record is now live without a DB**: win rate, payoff, avg
  hold, realized PnL and recent activity come from the public `userFills`
  endpoint (`computeTraderStats()`). What still needs snapshot persistence is
  *time-series* state: PnL/drawdown curves and position deltas (who's adding or
  trimming between snapshots). Those remain impossible from a single
  `clearinghouseState` read — reintroduce a DB + cron when building them.
- Richer per-position fields and the account `marginSummary` are now surfaced
  (effective leverage, free margin, ROE, liquidation distance, funding paid,
  margin type). Remaining unused `clearinghouseState` data: `crossMarginSummary`,
  `withdrawable`, per-position `cumFunding.allTime`.
- Smart-money shows lev-weighted conviction, consensus/agreement, notional-
  weighted cost basis and avg liquidation per side, funding, and smart-money OI
  share. The aggregate **liquidation map** (cascade zones) now ships via
  `liqClusters` + the `/liquidations` page; the **wallet deep-dive** (`/wallet/
  :address`) adds the realized-PnL curve, drawdown and resting orders; the
  **funding** page adds explicit crowding/reversal signals.
- Not yet built (all feasible on free endpoints): a live "smart-money just
  opened/closed" activity tape (merge recent `userFills` across top-N — but
  rate-limit heavy), a per-coin page (`/coin/:symbol`) with a candle sparkline
  from `candleSnapshot`, spot-balance accumulation from `spotClearinghouseState`,
  and cross-referencing funding against smart-money net side per coin.
- Nothing is covered by an end-to-end/live integration test; service behavior
  against live Hyperliquid has only been spot-checked manually. The pure
  functions (`computeTraderStats`, `aggregatePositioning`, `mergeMarketContext`,
  `buildLiquidationClusters`, `classifyFunding`) are unit-tested in
  `aggregation.test.ts`.
