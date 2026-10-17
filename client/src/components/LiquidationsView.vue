<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="app-title">Liquidations</h1>
      <p class="app-subtitle">
        Where the tracked top traders would get liquidated, bucketed by distance
        from the current price. Tall clusters mark cascade zones — if price
        reaches them, forced closes can accelerate the move.
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
        {{ store.loading ? 'Mapping liquidations…' : 'Map liquidations' }}
      </button>

      <div class="legend" v-if="coins.length">
        <span><b class="value-positive">long liqs</b> below price (downside cascade)</span>
        <span><b class="value-negative">short liqs</b> above price (upside squeeze)</span>
      </div>
    </div>

    <div v-if="store.hasLoaded && !store.loading" class="panel">
      <div v-if="coins.length === 0" class="empty-state">
        <p class="text-sm font-medium">No liquidation data.</p>
        <p class="text-xs" style="color: var(--text-faint)">
          Positions may lack a liquidation price, or market data was unavailable.
        </p>
      </div>

      <div v-else class="liq-grid">
        <div v-for="c in coins" :key="c.coin" class="liq-card">
          <div class="liq-head">
            <span class="mono liq-coin">{{ c.coin }}</span>
            <span class="tabular liq-mark">mark {{ fmtPx(c.markPx) }}</span>
          </div>

          <svg class="liq-chart" viewBox="0 0 100 44" preserveAspectRatio="none">
            <!-- current price marker -->
            <line
              :x1="priceX(c)"
              y1="0"
              :x2="priceX(c)"
              y2="40"
              class="liq-mid"
            />
            <rect
              v-for="(b, i) in bars(c)"
              :key="i"
              :x="b.x"
              :y="40 - b.h"
              :width="b.w"
              :height="b.h"
              :class="b.cls"
            />
            <!-- baseline -->
            <line x1="0" y1="40" x2="100" y2="40" class="liq-base" />
          </svg>

          <div class="liq-axis">
            <span>{{ fmtOffset(domain(c).min) }}</span>
            <span>price</span>
            <span>{{ fmtOffset(domain(c).max) }}</span>
          </div>

          <div class="liq-totals">
            <span class="value-positive">{{ fmtUsd(longTotal(c)) }} long</span>
            <span class="value-negative">{{ fmtUsd(shortTotal(c)) }} short</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useSmartMoneyStore } from '@/stores/smartMoney';
import type { CoinPositioning } from '@/api/types';

const store = useSmartMoneyStore();

// Only coins that actually have liquidation clusters, richest zones first.
const coins = computed(() =>
  store.coins.filter((c) => (c.liqClusters?.length ?? 0) > 0),
);

function maxNotional(c: CoinPositioning): number {
  let max = 0;
  for (const b of c.liqClusters ?? []) {
    max = Math.max(max, b.longNotional, b.shortNotional);
  }
  return max || 1;
}

// Notional-weighted edge for one side: the distance from price that captures
// ~90% of that side's liquidation notional. Using a weighted percentile means
// a lone far-off liquidation (or the +500% clamp pile) no longer stretches the
// axis — the scale tracks where the mass actually is, so each coin differs.
function sideEdge(c: CoinPositioning, side: 'long' | 'short'): number {
  const pts = (c.liqClusters ?? [])
    .map((b) => ({
      off: Math.abs(b.offsetPct),
      w: side === 'short' ? b.shortNotional : b.longNotional,
    }))
    .filter((p) => p.w > 0)
    .sort((a, b) => a.off - b.off);
  if (!pts.length) return 0.05;
  const total = pts.reduce((s, p) => s + p.w, 0);
  let cum = 0;
  for (const p of pts) {
    cum += p.w;
    if (cum >= total * 0.9) return p.off;
  }
  return pts[pts.length - 1].off;
}

// Axis domain: always includes 0 (price); extends each side to its weighted
// edge so near-price cascade zones stay readable and far liquidations pin to
// the border rather than flattening the chart.
function domain(c: CoinPositioning): { min: number; max: number } {
  const max = Math.max(sideEdge(c, 'short'), 0.05);
  const min = -Math.max(sideEdge(c, 'long'), 0.05);
  const pad = Math.max((max - min) * 0.06, 0.01);
  return { min: min - pad, max: max + pad };
}

function scaleX(c: CoinPositioning, offset: number): number {
  const { min, max } = domain(c);
  const span = max - min || 1;
  // Clamp so out-of-window liquidations stack at the edge.
  const clamped = Math.max(min, Math.min(max, offset));
  return ((clamped - min) / span) * 100;
}

function priceX(c: CoinPositioning): number {
  return scaleX(c, 0);
}

function barWidth(c: CoinPositioning): number {
  const { min, max } = domain(c);
  const span = max - min || 1;
  // Server bins at 5% steps; render each a little narrower for separation.
  return Math.max((0.05 / span) * 100 * 0.85, 0.8);
}

function bars(c: CoinPositioning) {
  const max = maxNotional(c);
  const w = barWidth(c);
  const out: { x: number; w: number; h: number; cls: string }[] = [];
  for (const b of c.liqClusters ?? []) {
    const x = scaleX(c, b.offsetPct) - w / 2;
    if (b.longNotional > 0) {
      out.push({ x, w, h: (b.longNotional / max) * 38, cls: 'liq-long' });
    }
    if (b.shortNotional > 0) {
      out.push({ x, w, h: (b.shortNotional / max) * 38, cls: 'liq-short' });
    }
  }
  return out;
}

function fmtOffset(offset: number): string {
  const pct = offset * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

function longTotal(c: CoinPositioning): number {
  return (c.liqClusters ?? []).reduce((s, b) => s + b.longNotional, 0);
}
function shortTotal(c: CoinPositioning): number {
  return (c.liqClusters ?? []).reduce((s, b) => s + b.shortNotional, 0);
}

function fmtUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

function fmtPx(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const digits = value >= 100 ? 0 : value >= 1 ? 2 : 4;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

onMounted(() => {
  if (!store.hasLoaded) {
    store.fetchSmartMoney();
  }
});
</script>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.liq-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}
.liq-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.75rem;
  background-color: var(--surface-2);
}
.liq-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.4rem;
}
.liq-coin {
  font-weight: 600;
}
.liq-mark {
  font-size: 0.72rem;
  color: var(--text-faint);
}
.liq-chart {
  width: 100%;
  height: 56px;
  display: block;
}
.liq-mid {
  stroke: var(--accent);
  stroke-width: 0.5;
  stroke-dasharray: 1.5 1.5;
  opacity: 0.7;
}
.liq-base {
  stroke: var(--border-strong);
  stroke-width: 0.5;
}
.liq-long {
  fill: var(--success);
}
.liq-short {
  fill: var(--danger);
}
.liq-axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.62rem;
  color: var(--text-faint);
  margin-top: 0.15rem;
}
.liq-totals {
  display: flex;
  justify-content: space-between;
  font-size: 0.74rem;
  font-weight: 600;
  margin-top: 0.4rem;
}
</style>
