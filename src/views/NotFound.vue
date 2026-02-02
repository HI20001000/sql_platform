<template>
  <div class="not-found">
    <div class="card">
      <p class="eyebrow">404</p>
      <h1>找不到頁面</h1>
      <p>你要找的頁面不存在，請返回首頁。</p>
      <button class="primary-button" type="button" @click="goHome">返回首頁</button>
    </div>
  </div>
</template>

<script setup>
import { getCurrentInstance } from 'vue'

const router = getCurrentInstance().appContext.config.globalProperties.$router

const goHome = () => {
  router?.push('/home')
}
</script>

<style scoped>
.not-found {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  background: #f6f7fb;
  color: #0f172a;
}

.card {
  background: #fff;
  padding: 2.5rem 3rem;
  border-radius: 24px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.1);
  text-align: center;
  display: grid;
  gap: 0.8rem;
}

.eyebrow {
  letter-spacing: 0.18em;
  font-size: 0.8rem;
  color: #64748b;
  margin: 0;
}

h1 {
  margin: 0;
  font-size: 2rem;
}

p {
  margin: 0;
  color: #64748b;
}

.primary-button {
  border: none;
  background: #111827;
  color: #fff;
  padding: 0.75rem 1.6rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0.6rem;
}
</style>
