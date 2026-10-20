<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="app-title">Smart money</h1>
      <p class="app-subtitle">
        Aggregated long/short positioning per coin across the current top
        traders — where the best wallets are leaning right now.
      </p>
    </header>

    <div class="panel">
      <div class="controls-grid">
        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="window">Window</label>
          <select id="window" v-model="store.window" class="field-input">
            <option value="day">24 hours</option>
            <option value="week">7 days</option>
            <option value="month">30 days</option>
            <option value="allTime">All time</option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="metric">Top traders by</label>
          <select id="metric" v-model="store.metric" class="field-input">
            <option value="pnl">PnL</option>
            <option value="roi">ROI</option>
            <option value="vlm">Volume</option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="traders"># Traders analyzed</label>
          <input
            id="traders"
            v-model.number="store.traders"
            type="number"
            min="1"
            max="100"
            class="field-input tabular"
          />
        </div>
      </div>

      <p v-if="store.error" class="pill pill-danger w-fit">{{ store.error }}</p>

      <button
        class="btn-primary"
        :disabled="store.loading"
        @click="store.fetchSmartMoney()"
      >
        {{ store.loading ? 'Analyzing positions…' : 'Analyze' }}
      </button>
      <p class="text-xs" style="color: var(--text-faint)">
        Fetches each trader's live positions — can take a few seconds.
      </p>
    </div>

    <div v-if="store.hasLoaded && !store.loading" class="panel">
      <div v-if="store.coins.length === 0" class="empty-state">
        <p class="text-sm font-medium">No open positions found.</p>
      </div>

      <template v-else>
        <div class="flex items-center justify-between">
          <span class="pill pill-neutral">
            {{ store.tradersAnalyzed }} traders · {{ store.coins.length }} coins
          </span>
        </div>
        <div class="divider" />

        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Positioning (by notional)</th>
                <th>Net</th>
                <th>Conviction</th>
                <th class="col-sm">Agree</th>
                <th class="col-sm">Funding</th>
                <th class="col-md">Cost basis</th>
                <th class="col-md">OI share</th>
                <th class="col-md">Total notional</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in store.coins" :key="c.coin">
                <td>
                  <div class="mono">{{ c.coin }}</div>
                  <div
                    v-if="c.dayChange !== null && c.dayChange !== undefined"
                    class="coin-sub tabular"
                    :class="c.dayChange >= 0 ? 'value-positive' : 'value-negative'"
                  >
                    {{ (c.dayChange * 100).toFixed(1) }}% 24h
                  </div>
                </td>
                <td class="min-w-[160px] sm:min-w-[200px]">
                  <div class="bias-bar">
                    <div
                      class="bias-long"
                      :style="{ width: longPct(c) + '%' }"
                    />
                    <div
                      class="bias-short"
                      :style="{ width: 100 - longPct(c) + '%' }"
                    />
                  </div>
                  <div class="bias-legend">
                    <span class="value-positive">{{ c.longCount }}L</span>
                    <span class="value-negative">{{ c.shortCount }}S</span>
                  </div>
                </td>
                <td>
                  <span
                    class="pill"
                    :class="
                      c.netSide === 'long' ? 'pill-success' : 'pill-danger'
                    "
                  >
                    {{ c.netSide }} {{ fmtUsd(Math.abs(c.netNotional)) }}
                  </span>
                </td>
                <td
                  class="tabular"
                  :class="c.netWeighted >= 0 ? 'value-positive' : 'value-negative'"
                  :title="'Implied leverage behind the net position (lev-weighted conviction ÷ net notional)'"
                >
                  {{ convictionLabel(c) }}
                </td>
                <td class="tabular col-sm">{{ (c.agreement * 100).toFixed(0) }}%</td>
                <td
                  class="tabular col-sm"
                  :class="fundingClass(c.funding)"
                  :title="'Hourly funding rate'"
                >
                  {{ fmtFunding(c.funding) }}
                </td>
                <td class="tabular col-md">{{ fmtPx(costBasis(c)) }}</td>
                <td class="tabular col-md">{{ fmtShare(c.smartMoneyOiShare) }}</td>
                <td class="tabular col-md">{{ fmtUsd(c.totalNotional) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useSmartMoneyStore } from '@/stores/smartMoney';
import type { CoinPositioning } from '@/api/types';

const store = useSmartMoneyStore();

function longPct(c: CoinPositioning): number {
  if (c.totalNotional <= 0) return 50;
  return (c.longNotional / c.totalNotional) * 100;
}

function fmtUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

// Cost basis of the side the crowd is net on — the smart-money entry to watch.
function costBasis(c: CoinPositioning): number | null {
  return c.netSide === 'long' ? c.avgEntryLong : c.avgEntryShort;
}

// Conviction as an implied leverage multiple: how levered the *net* position is.
// |lev-weighted net| / |net notional| → e.g. "11.5x short". Dimensionless and
// readable, unlike the raw weighted-notional dollar figure.
function convictionLabel(c: CoinPositioning): string {
  const net = Math.abs(c.netNotional);
  if (net <= 0) return '—';
  const lev = Math.abs(c.netWeighted) / net;
  const side = c.netWeighted >= 0 ? 'long' : 'short';
  return `${lev.toFixed(1)}x ${side}`;
}

function fmtPx(value: number | null): string {
  if (value === null || value === undefined) return '—';
  const digits = value >= 100 ? 0 : value >= 1 ? 2 : 4;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

function fmtFunding(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(4)}%`;
}

function fundingClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  // Positive funding → longs pay shorts.
  return value >= 0 ? 'value-negative' : 'value-positive';
}

function fmtShare(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

onMounted(() => {
  if (!store.hasLoaded) {
    store.fetchSmartMoney();
  }
});
</script>

<style scoped>
.coin-sub {
  font-size: 0.68rem;
  margin-top: 0.1rem;
}
.bias-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--surface-2);
}
.bias-long {
  background-color: var(--success);
}
.bias-short {
  background-color: var(--danger);
}
.bias-legend {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  margin-top: 0.2rem;
}
.value-positive {
  color: var(--success);
}
.value-negative {
  color: var(--danger);
}
</style>
