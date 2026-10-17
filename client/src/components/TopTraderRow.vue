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
      <p
        v-else-if="positions.length === 0"
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
            <th>Leverage</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Notional</th>
            <th>uPnL</th>
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
            <td class="tabular">{{ p.leverage }}x</td>
            <td class="tabular">{{ fmtNum(p.size) }}</td>
            <td class="tabular">{{ fmtNum(p.entryPrice) }}</td>
            <td class="tabular">{{ fmtUsd(p.positionValue) }}</td>
            <td
              class="tabular"
              :class="(p.unrealizedPnl ?? 0) >= 0 ? 'value-positive' : 'value-negative'"
            >
              {{ fmtUsd(p.unrealizedPnl) }}
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ITopTrader, IWalletPosition } from '@/api/types';
import { api } from '@/api/api';
import { copyText } from '@/utils/clipboard';

const props = defineProps<{ trader: ITopTrader; rank: number }>();

const copied = ref(false);
const expanded = ref(false);
const loaded = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const positions = ref<IWalletPosition[]>([]);

const truncated = computed(() => {
  const a = props.trader.address;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
});

const label = computed(() => props.trader.displayName || truncated.value);

function fmtUsd(value: number | null): string {
  if (value === null) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function fmtNum(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
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
      const result = await api.wallets.getPositions(props.trader.address);
      positions.value = result.positions;
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
.value-positive {
  color: var(--success);
}
.value-negative {
  color: var(--danger);
}
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
  background-color: var(--accent-soft);
}
.sub-table {
  margin: 0.25rem 0;
}
</style>
