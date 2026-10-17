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
                <th class="col-sm">Traders</th>
                <th>Net</th>
                <th class="col-md">Total notional</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in store.coins" :key="c.coin">
                <td class="mono">{{ c.coin }}</td>
                <td class="min-w-[160px] sm:min-w-[220px]">
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
                <td class="tabular col-sm">{{ c.traderCount }}</td>
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

onMounted(() => {
  if (!store.hasLoaded) {
    store.fetchSmartMoney();
  }
});
</script>

<style scoped>
.bias-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--accent-soft);
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
