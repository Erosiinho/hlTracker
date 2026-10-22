<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="app-title">Funding</h1>
      <p class="app-subtitle">
        Perp funding across Hyperliquid, most extreme first. Funding is what one
        side pays the other to hold a position — the more lopsided it gets, the
        more crowded the trade and the higher the odds of a squeeze against it.
      </p>
    </header>

    <div class="panel">
      <div class="flex items-center justify-between gap-3">
        <span v-if="rows.length" class="pill pill-neutral">{{ rows.length }} markets</span>
        <span v-else class="text-sm" style="color: var(--text-muted)">
          {{ loading ? 'Loading…' : '' }}
        </span>
        <button class="btn-ghost" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <p v-if="error" class="pill pill-danger w-fit">{{ error }}</p>

      <!-- how to read it -->
      <div v-if="rows.length" class="legend">
        <span><b class="value-negative">+ funding</b> longs pay → crowded longs</span>
        <span><b class="value-positive">− funding</b> shorts pay → crowded shorts</span>
        <span class="legend-levels">
          <i class="pill pill-neutral">neutral</i>
          <i class="pill pill-warning">elevated</i>
          <i class="pill pill-warning">high</i>
          <i class="pill pill-danger">extreme</i>
        </span>
      </div>

      <div v-if="rows.length" class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Coin</th>
              <th>Funding /h</th>
              <th>APR</th>
              <th class="col-sm">Predicted /h</th>
              <th>Signal</th>
              <th class="col-md">Open interest</th>
              <th class="col-sm">24h</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.coin">
              <td class="mono">{{ r.coin }}</td>
              <td class="tabular" :class="fundingSignClass(r.funding)">
                {{ fmtRate(r.funding) }}
              </td>
              <td class="tabular" :class="fundingSignClass(r.funding)">
                {{ fmtApr(r.signal.apr) }}
              </td>
              <td class="tabular col-sm" :class="fundingSignClass(r.predicted)">
                {{ fmtRate(r.predicted) }}
              </td>
              <td class="signal-cell">
                <span class="pill" :class="levelPill(r.signal.level)">
                  {{ r.signal.level }}
                </span>
                <span class="signal-note">{{ r.signal.note }}</span>
              </td>
              <td class="tabular col-md">{{ fmtUsd(r.oiNotional) }}</td>
              <td
                class="tabular col-sm"
                :class="(r.dayChange ?? 0) >= 0 ? 'value-positive' : 'value-negative'"
              >
                {{ fmtPct(r.dayChange) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '@/api/api';
import type { FundingRow, FundingLevel } from '@/api/types';

const rows = ref<FundingRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const result = await api.funding.get();
    rows.value = result.coins;
  } catch (e) {
    error.value = (e as Error).message;
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function fmtRate(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(4)}%`;
}

function fmtApr(apr: number): string {
  return `${(apr * 100).toFixed(1)}%`;
}

function fmtPct(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function fmtUsd(value: number | null): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

// Positive funding (longs pay) is the risk side → red; negative → green.
function fundingSignClass(value: number | null): string {
  if (value === null || value === undefined) return '';
  if (value > 0) return 'value-negative';
  if (value < 0) return 'value-positive';
  return '';
}

function levelPill(level: FundingLevel): string {
  if (level === 'extreme') return 'pill-danger';
  if (level === 'high' || level === 'elevated') return 'pill-warning';
  return 'pill-neutral';
}

onMounted(load);
</script>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  align-items: center;
}
.legend-levels {
  display: flex;
  gap: 0.35rem;
}
.legend-levels .pill {
  font-size: 0.65rem;
  font-style: normal;
}
.signal-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 220px;
  white-space: normal;
}
.signal-note {
  font-size: 0.74rem;
  color: var(--text-muted);
  line-height: 1.3;
}
</style>
