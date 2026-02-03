<script setup>
import Toolbar from '../components/toolbar/Toolbar.vue'
</script>

<template>
  <section class="create-project" aria-label="Create project">
    <Toolbar />
    <main class="content">
      <header class="content-header">
        <p class="eyebrow">新專案</p>
        <h1>建立專案</h1>
        <p class="subtitle">上傳檔案開始建立你的專案內容。</p>
      </header>

      <section class="upload-card" aria-label="Upload files">
        <div class="upload-icon" aria-hidden="true">📄</div>
        <div>
          <h2>上傳檔案</h2>
          <p>支援拖曳或點擊選擇檔案。</p>
        </div>
        <label class="upload-action">
          <span>選擇檔案</span>
          <input type="file" class="upload-input" multiple />
        </label>
      </section>
    </main>
  </section>
</template>

<style scoped>
.create-project {
  min-height: 100vh;
  background: #f8fafc;
  padding-left: 84px;
}

.content {
  max-width: 920px;
  margin: 0 auto;
  padding: 3.5rem 1.5rem;
  display: grid;
  gap: 2rem;
}

.content-header h1 {
  font-size: 2rem;
  margin: 0.35rem 0;
  color: #0f172a;
}

.eyebrow {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin: 0;
}

.subtitle {
  margin: 0;
  color: #475569;
}

.upload-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 2.5rem;
  display: grid;
  gap: 1.5rem;
  border: 1px dashed #cbd5f5;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
  text-align: center;
}

.upload-card h2 {
  margin: 0 0 0.4rem;
  font-size: 1.4rem;
  color: #0f172a;
}

.upload-card p {
  margin: 0;
  color: #64748b;
}

.upload-icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  margin: 0 auto;
  background: #e2e8f0;
  display: grid;
  place-items: center;
  font-size: 1.8rem;
}

.upload-action {
  justify-self: center;
  background: #2563eb;
  color: #ffffff;
  padding: 0.75rem 1.75rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.3);
}

.upload-action:hover {
  background: #1d4ed8;
}

.upload-input {
  display: none;
}
</style>
