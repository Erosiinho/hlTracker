<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="wallet-head">
        <h1 class="app-title mono">{{ truncated }}</h1>
        <button class="btn-ghost" @click="copy">
          {{ copied ? 'Copied!' : 'Copy address' }}
        </button>
      </div>
      <p class="app-subtitle">
        Live positions, resting orders and realized track record for this wallet
        — reconstructed from public Hyperliquid data.
      </p>
    </header>

    <p v-if="loading" class="status-chip">
      <span class="status-dot" /> Loading wallet…
    </p>
    <p v-if="error" class="pill pill-danger w-fit">{{ error }}</p>

    <!-- account roll-up -->
    <div v-if="summary" class="panel">
      <div class="stat-strip">
        <div class="stat">
          <span class="stat-label">Account value</span>
          <span class="stat-value tabular">{{ fmtUsd(summary.accountValue) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Effective leverage</span>
          <span
            class="stat-value tabular"
            :class="summary.effectiveLeverage >= 10 ? 'value-negative' : ''"
          >
            {{ summary.effectiveLeverage.toFixed(2) }}x
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">Free margin</span>
          <span class="stat-value tabular">{{ fmtUsd(summary.freeMargin) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Margin used</span>
          <span class="stat-value tabular">{{ fmtUsd(summary.totalMarginUsed) }}</span>
        </div>
      </div>
    </div>

    <!-- realized track record + PnL curve -->
    <div v-if="stats && stats.closedTrades > 0" class="panel">
      <h2 class="section-title">Realized track record</h2>
      <div class="stat-strip">
        <div class="stat">
          <span class="stat-label">Win rate</span>
          <span class="stat-value tabular">
            {{ stats.winRate !== null ? (stats.winRate * 100).toFixed(0) + '%' : '—' }}
            <span class="stat-sub">({{ stats.wins }}/{{ stats.closedTrades }})</span>
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">Payoff ratio</span>
          <span class="stat-value tabular">
            {{ stats.payoffRatio !== null ? stats.payoffRatio.toFixed(2) : '—' }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">Realized PnL</span>
          <span
            class="stat-value tabular"
            :class="stats.totalRealizedPnl >= 0 ? 'value-positive' : 'value-negative'"
          >
            {{ fmtUsd(stats.totalRealizedPnl) }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">Max drawdown</span>
          <span class="stat-value tabular value-negative">
            -{{ fmtUsd(stats.maxDrawdown) }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">Avg hold</span>
          <span class="stat-value tabular">{{ fmtDuration(stats.avgHoldingMs) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Fees paid</span>
          <span class="stat-value tabular">{{ fmtUsd(stats.totalFees) }}</span>
        </div>
      </div>

      <div v-if="curve" class="curve-wrap">
        <span class="stat-label">Cumulative realized PnL</span>
        <svg class="curve" viewBox="0 0 100 40" preserveAspectRatio="none">
          <line :x1="0" :y1="curve.zeroY" :x2="100" :y2="curve.zeroY" class="curve-zero" />
          <polyline :points="curve.area" :class="curveClass" class="curve-area" />
          <polyline :points="curve.line" :class="curveClass" class="curve-line" />
        </svg>
      </div>

      <div v-if="stats.topCoins.length" class="top-coins">
        <span class="stat-label">Most traded</span>
        <span v-for="t in stats.topCoins" :key="t.coin" class="pill pill-neutral">
          {{ t.coin }} · {{ t.fills }}
        </span>
      </div>
    </div>

    <!-- open positions -->
    <div v-if="loaded" class="panel">
      <h2 class="section-title">Open positions</h2>
      <div v-if="positions.length === 0" class="empty-state">
        <p class="text-sm font-medium">No open positions.</p>
      </div>
      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Coin</th>
              <th>Side</th>
              <th>Lev</th>
              <th class="col-sm">Entry</th>
              <th>Notional</th>
              <th>uPnL</th>
              <th class="col-sm">ROE</th>
              <th class="col-md">Liq dist</th>
              <th class="col-md">Funding</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in positions" :key="p.coin + p.side">
              <td class="mono">{{ p.coin }}</td>
              <td>
                <span
                  class="pill"
                  :class="p.side === 'long' ? 'pill-success' : 'pill-danger'"
                >
                  {{ p.side }}
                </span>
              </td>
              <td class="tabular">
                {{ p.leverage }}x
                <span v-if="p.marginType === 'isolated'" class="margin-tag">iso</span>
              </td>
              <td class="tabular col-sm">{{ fmtNum(p.entryPrice) }}</td>
              <td class="tabular">{{ fmtUsd(p.positionValue) }}</td>
              <td
                class="tabular"
                :class="(p.unrealizedPnl ?? 0) >= 0 ? 'value-positive' : 'value-negative'"
              >
                {{ fmtUsd(p.unrealizedPnl) }}
              </td>
              <td
                class="tabular col-sm"
                :class="(p.returnOnEquity ?? 0) >= 0 ? 'value-positive' : 'value-negative'"
              >
                {{ fmtPct(p.returnOnEquity) }}
              </td>
              <td
                class="tabular col-md"
                :class="(p.liquidationDistance ?? 1) < 0.1 ? 'value-negative' : ''"
              >
                {{ fmtPct(p.liquidationDistance) }}
              </td>
              <td
                class="tabular col-md"
                :class="(p.cumFundingSinceOpen ?? 0) > 0 ? 'value-negative' : 'value-positive'"
              >
                {{ fmtUsd(p.cumFundingSinceOpen) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- resting orders -->
    <div v-if="loaded && orders.length > 0" class="panel">
      <h2 class="section-title">Resting orders</h2>
      <p class="text-xs" style="color: var(--text-faint)">
        Limits and triggers (take-profit / stop) the wallet has sitting on the
        book — where it intends to add, take profit or cut.
      </p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Coin</th>
              <th>Side</th>
              <th>Type</th>
              <th>Price</th>
              <th class="col-sm">Trigger</th>
              <th class="col-sm">Size</th>
              <th class="col-md">Reduce-only</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(o, i) in orders" :key="i">
              <td class="mono">{{ o.coin }}</td>
              <td>
                <span
                  class="pill"
                  :class="o.side === 'buy' ? 'pill-success' : 'pill-danger'"
                >
                  {{ o.side }}
                </span>
              </td>
              <td>{{ o.orderType }}</td>
              <td class="tabular">{{ fmtNum(o.price) }}</td>
              <td class="tabular col-sm">
                {{ o.triggerPx !== null ? fmtNum(o.triggerPx) : '—' }}
              </td>
              <td class="tabular col-sm">{{ fmtNum(o.size) }}</td>
              <td class="col-md">{{ o.reduceOnly ? 'yes' : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/api';
import type {
  IWalletPosition,
  IAccountSummary,
  TraderStats,
  OpenOrder,
} from '@/api/types';
import { copyText } from '@/utils/clipboard';

const route = useRoute();
const address = computed(() => String(route.params.address));

const copied = ref(false);
const loading = ref(false);
const loaded = ref(false);
const error = ref<string | null>(null);
const positions = ref<IWalletPosition[]>([]);
const summary = ref<IAccountSummary | null>(null);
const stats = ref<TraderStats | null>(null);
const orders = ref<OpenOrder[]>([]);

const truncated = computed(() => {
  const a = address.value;
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
});

async function load() {
  loading.value = true;
  loaded.value = false;
  error.value = null;
  try {
    const [pos, st, ord] = await Promise.all([
      api.wallets.getPositions(address.value),
      api.wallets.getStats(address.value).catch(() => null),
      api.wallets.getOrders(address.value).catch(() => null),
    ]);
    positions.value = pos.positions;
    summary.value = pos.summary;
    stats.value = st?.stats ?? null;
    orders.value = ord?.orders ?? [];
    loaded.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

// Build the cumulative-PnL polyline in a 0..100 x 0..40 viewBox.
const curve = computed(() => {
  const pts = stats.value?.pnlCurve ?? [];
  if (pts.length < 2) return null;

  const times = pts.map((p) => p.time);
  const vals = pts.map((p) => p.cumPnl);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const vMin = Math.min(0, ...vals);
  const vMax = Math.max(0, ...vals);
  const tSpan = tMax - tMin || 1;
  const vSpan = vMax - vMin || 1;

  const x = (t: number) => 2 + ((t - tMin) / tSpan) * 96;
  const y = (v: number) => 38 - ((v - vMin) / vSpan) * 36;

  const line = pts.map((p) => `${x(p.time).toFixed(2)},${y(p.cumPnl).toFixed(2)}`).join(' ');
  const zeroY = y(0);
  const area = `${x(tMin).toFixed(2)},${zeroY.toFixed(2)} ${line} ${x(tMax).toFixed(2)},${zeroY.toFixed(2)}`;
  return { line, area, zeroY };
});

const curveClass = computed(() =>
  (stats.value?.totalRealizedPnl ?? 0) >= 0 ? 'curve-pos' : 'curve-neg',
);

function fmtUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}
function fmtNum(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
function fmtPct(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(1)}%`;
}
function fmtDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60_000)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

async function copy() {
  if (await copyText(address.value)) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  }
}

watch(address, load, { immediate: true });
</script>

<style scoped>
.wallet-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.wallet-head .app-title {
  font-size: 1.25rem;
}
.section-title {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.stat-strip {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.9rem;
}
@media (min-width: 640px) {
  .stat-strip {
    grid-template-columns: repeat(3, 1fr);
  }
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.stat-label {
  font-size: 0.68rem;
  color: var(--text-faint);
}
.stat-value {
  font-size: 1.05rem;
  font-weight: 600;
}
.stat-sub {
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--text-faint);
}
.margin-tag {
  font-size: 0.62rem;
  color: var(--warning);
  margin-left: 0.2rem;
}
.curve-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.curve {
  width: 100%;
  height: 120px;
  display: block;
}
.curve-zero {
  stroke: var(--border-strong);
  stroke-width: 0.4;
  stroke-dasharray: 1 1;
}
.curve-line {
  fill: none;
  stroke-width: 0.9;
  vector-effect: non-scaling-stroke;
}
.curve-area {
  stroke: none;
  opacity: 0.12;
}
.curve-pos {
  stroke: var(--success);
  fill: var(--success);
}
.curve-neg {
  stroke: var(--danger);
  fill: var(--danger);
}
.top-coins {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
</style>
