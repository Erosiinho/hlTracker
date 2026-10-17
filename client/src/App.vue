<script setup lang="ts"></script>

<template>
  <div class="app-frame">
    <header class="topbar">
      <div class="topbar-inner">
        <RouterLink to="/" class="brand" aria-label="hlTracker home">
          <svg
            class="brand-mark"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="1"
              width="22"
              height="22"
              rx="6"
              stroke="currentColor"
              stroke-width="1.5"
              opacity="0.45"
            />
            <rect x="6" y="11" width="3.4" height="9" rx="1.2" fill="currentColor" />
            <rect x="6" y="7" width="3.4" height="2.6" rx="1" fill="currentColor" opacity="0.55" />
            <rect x="14.6" y="4" width="3.4" height="13" rx="1.2" fill="currentColor" />
            <rect x="14.6" y="18.4" width="3.4" height="2.6" rx="1" fill="currentColor" opacity="0.55" />
          </svg>
          <span class="brand-name">hl<b>Tracker</b></span>
        </RouterLink>
        <nav class="nav-seg">
          <RouterLink to="/" class="nav-link">Top traders</RouterLink>
          <RouterLink to="/smart-money" class="nav-link">Smart money</RouterLink>
          <RouterLink to="/funding" class="nav-link">Funding</RouterLink>
          <RouterLink to="/liquidations" class="nav-link">Liquidations</RouterLink>
        </nav>
      </div>
    </header>
    <main class="flex-1">
      <router-view />
    </main>
  </div>
</template>
