<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="app-title">Top traders</h1>
      <p class="app-subtitle">
        The best-performing wallets on Hyperliquid's public leaderboard right
        now, ranked by your chosen window and metric.
      </p>
    </header>

    <div class="panel">
      <div class="controls-grid">
        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="window">Window</label>
          <select
            id="window"
            v-model="store.window"
            class="field-input"
            @change="store.fetchTopTraders()"
          >
            <option value="day">24 hours</option>
            <option value="week">7 days</option>
            <option value="month">30 days</option>
            <option value="allTime">All time</option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="metric">Rank by</label>
          <select
            id="metric"
            v-model="store.metric"
            class="field-input"
            @change="store.fetchTopTraders()"
          >
            <option value="pnl">PnL</option>
            <option value="roi">ROI</option>
            <option value="vlm">Volume</option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="limit">Show top</label>
          <input
            id="limit"
            v-model.number="store.limit"
            type="number"
            min="1"
            max="500"
            class="field-input tabular"
            @change="store.fetchTopTraders()"
          />
        </div>
      </div>

      <p v-if="store.error" class="pill pill-danger w-fit">{{ store.error }}</p>

      <button
        class="btn-primary"
        :disabled="store.loading"
        @click="store.fetchTopTraders()"
      >
        {{ store.loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="store.hasLoaded" class="panel">
      <div v-if="store.traders.length === 0" class="empty-state">
        <p class="text-sm font-medium">No traders found.</p>
      </div>

      <template v-else>
        <div class="flex items-center justify-between">
          <span class="pill pill-neutral">
            {{ store.traders.length }}
            trader{{ store.traders.length === 1 ? '' : 's' }}
          </span>
          <button class="btn-ghost" @click="copyAll">
            {{ copiedAll ? 'Copied!' : 'Copy all addresses' }}
          </button>
        </div>

        <div class="divider" />
      </template>

      <div v-if="store.traders.length > 0" class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Wallet</th>
              <th>PnL</th>
              <th>ROI</th>
              <th class="col-sm">Account value</th>
              <th class="col-md">Volume</th>
            </tr>
          </thead>
          <tbody>
            <TopTraderRow
              v-for="(t, i) in store.traders"
              :key="t.address"
              :trader="t"
              :rank="i + 1"
            />
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useTopTradersStore } from '@/stores/topTraders';
import TopTraderRow from './TopTraderRow.vue';
import { copyText } from '@/utils/clipboard';

const store = useTopTradersStore();

const copiedAll = ref(false);

async function copyAll() {
  const addresses = store.traders.map((t) => t.address).join('\n');
  if (await copyText(addresses)) {
    copiedAll.value = true;
    setTimeout(() => (copiedAll.value = false), 1500);
  }
}

onMounted(() => {
  if (!store.hasLoaded) {
    store.fetchTopTraders();
  }
});
</script>
