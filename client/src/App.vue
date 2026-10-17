<script setup lang="ts"></script>

<template>
  <div class="app-frame">
    <header class="topbar">
      <div class="topbar-inner">
        <RouterLink to="/" class="brand">
          <span class="brand-mark">hl</span>
          <span class="brand-name">hl<b>Tracker</b></span>
        </RouterLink>
        <nav class="nav-seg">
          <RouterLink to="/" class="nav-link">Top traders</RouterLink>
          <RouterLink to="/smart-money" class="nav-link">Smart money</RouterLink>
        </nav>
      </div>
    </header>
    <main class="flex-1">
      <router-view />
    </main>
  </div>
</template>
