<template>
  <tr>
    <td class="tabular" style="color: var(--text-faint)">
      <button class="btn-ghost caret" @click="toggle">
        <span :class="{ open: expanded }">▸</span>
        {{ rank }}
      </button>
    </td>
    <td>
      <button class="btn-ghost mono" @click="copy">
        {{ copied ? 'Copied!' : label }}
      </button>
    </td>
    <td class="tabular" :class="pnlClass">{{ formattedPnl }}</td>
    <td class="tabular" :class="roiClass">{{ formattedRoi }}</td>
    <td class="tabular col-sm">{{ formattedAccountValue }}</td>
    <td class="tabular col-md">{{ formattedVolume }}</td>
  </tr>

  <tr v-if="expanded">
    <td colspan="6" class="positions-cell">
      <p v-if="loading" class="text-xs" style="color: var(--text-faint)">
        Loading positions…
      </p>
      <p v-else-if="error" class="pill pill-danger w-fit">{{ error }}</p>

      <template v-else>
        <div class="expand-actions">
          <RouterLink :to="`/wallet/${trader.address}`" class="dashboard-link">
            Open full dashboard →
          </RouterLink>
        </div>

        <!-- account-level risk roll-up -->
        <div v-if="summary" class="stat-strip">
          <div class="stat">
            <span class="stat-label">Account value</span>
            <span class="stat-value tabular">{{ fmtUsd(summary.accountValue) }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Effective leverage</span>
            <span class="stat-value tabular" :class="leverageClass(summary.effectiveLeverage)">
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

        <!-- realized track record from fills -->
        <div v-if="stats && stats.closedTrades > 0" class="stat-strip">
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
            <span class="stat-label">Avg hold</span>
            <span class="stat-value tabular">{{ fmtDuration(stats.avgHoldingMs) }}</span>
          </div>
        </div>

        <p
          v-if="positions.length === 0"
          class="text-xs"
          style="color: var(--text-faint)"
        >
          No open positions.
        </p>
        <div v-else class="table-scroll">
          <table class="data-table sub-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Side</th>
                <th>Lev</th>
                <th class="col-sm">Size</th>
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
                <td class="tabular col-sm">{{ fmtNum(p.size) }}</td>
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
                <td class="tabular col-md" :class="liqDistClass(p.liquidationDistance)">
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

        <!-- recent activity feed -->
        <div v-if="stats && stats.recent.length > 0" class="recent">
          <span class="stat-label">Recent fills</span>
          <ul class="recent-list">
            <li v-for="(f, i) in stats.recent.slice(0, 6)" :key="i">
              <span class="mono recent-coin">{{ f.coin }}</span>
              <span class="recent-dir">{{ f.dir }}</span>
              <span class="tabular recent-px">@ {{ fmtNum(f.price) }}</span>
              <span
                v-if="f.closedPnl !== 0"
                class="tabular"
                :class="f.closedPnl >= 0 ? 'value-positive' : 'value-negative'"
              >
                {{ fmtUsd(f.closedPnl) }}
              </span>
              <span class="recent-time">{{ fmtAgo(f.time) }}</span>
            </li>
          </ul>
        </div>
      </template>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  ITopTrader,
  IWalletPosition,
  IAccountSummary,
  TraderStats,
} from '@/api/types';
import { api } from '@/api/api';
import { copyText } from '@/utils/clipboard';

const props = defineProps<{ trader: ITopTrader; rank: number }>();

const copied = ref(false);
const expanded = ref(false);
const loaded = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const positions = ref<IWalletPosition[]>([]);
const summary = ref<IAccountSummary | null>(null);
const stats = ref<TraderStats | null>(null);

const truncated = computed(() => {
  const a = props.trader.address;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
});

const label = computed(() => props.trader.displayName || truncated.value);

function fmtUsd(value: number | null): string {
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

function fmtAgo(time: number): string {
  const s = (Date.now() - time) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function leverageClass(lev: number): string {
  return lev >= 10 ? 'value-negative' : '';
}

function liqDistClass(dist: number | null): string {
  if (dist === null || dist === undefined) return '';
  return dist < 0.1 ? 'value-negative' : '';
}

const formattedPnl = computed(() => fmtUsd(props.trader.pnl));
const formattedAccountValue = computed(() => fmtUsd(props.trader.accountValue));
const formattedVolume = computed(() => fmtUsd(props.trader.vlm));
const formattedRoi = computed(() => `${(props.trader.roi * 100).toFixed(2)}%`);

const pnlClass = computed(() =>
  props.trader.pnl >= 0 ? 'value-positive' : 'value-negative',
);
const roiClass = computed(() =>
  props.trader.roi >= 0 ? 'value-positive' : 'value-negative',
);

async function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value && !loaded.value && !loading.value) {
    loading.value = true;
    error.value = null;
    try {
      // Positions are the main payload; stats are best-effort so a wallet with
      // no public fills still shows its open book.
      const [posResult, statsResult] = await Promise.all([
        api.wallets.getPositions(props.trader.address),
        api.wallets.getStats(props.trader.address).catch(() => null),
      ]);
      positions.value = posResult.positions;
      summary.value = posResult.summary;
      stats.value = statsResult?.stats ?? null;
      loaded.value = true;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }
}

async function copy() {
  if (await copyText(props.trader.address)) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  }
}
</script>

<style scoped>
.caret {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.caret span {
  display: inline-block;
  transition: transform 0.15s ease;
}
.caret span.open {
  transform: rotate(90deg);
}
.positions-cell {
  background-color: var(--surface-2);
  padding: 0.75rem 0.5rem;
}
.expand-actions {
  display: flex;
  justify-content: flex-end;
  padding-bottom: 0.25rem;
}
.dashboard-link {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}
.dashboard-link:hover {
  text-decoration: underline;
}

.stat-strip {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  padding: 0.5rem 0 0.75rem;
}
@media (min-width: 640px) {
  .stat-strip {
    grid-template-columns: repeat(4, 1fr);
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
  font-size: 0.95rem;
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
.sub-table {
  margin: 0.25rem 0;
}

.recent {
  margin-top: 0.75rem;
}
.recent-list {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.recent-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
}
.recent-coin {
  min-width: 3.5rem;
  color: var(--text);
}
.recent-dir {
  color: var(--text-muted);
  flex: 1;
}
.recent-px {
  color: var(--text-faint);
}
.recent-time {
  color: var(--text-faint);
  min-width: 2.5rem;
  text-align: right;
}
</style>
