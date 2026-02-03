<script setup>
import { onMounted } from 'vue'
import router from '../../router/index.js'
import { useUserInfo } from '../../scripts/useUserInfo.js'

const { icon, iconBg, loadUserInfo } = useUserInfo()

const handleCreateProject = () => {
  router.push('/projects/create')
}

onMounted(() => {
  loadUserInfo()
})
</script>

<template>
  <aside class="toolbar" aria-label="工具欄">
    <div class="toolbar-section toolbar-section--top">
      <div class="avatar" aria-label="用戶頭像" :style="{ background: iconBg }">
        <span class="avatar-icon">{{ icon }}</span>
      </div>
    </div>
    <div class="toolbar-section toolbar-section--middle" aria-label="主要操作">
      <button
        class="tool-button"
        type="button"
        aria-label="新增"
        @click="handleCreateProject"
      >
        ➕
      </button>
      <button class="tool-button" type="button" aria-label="編輯">✏️</button>
      <button class="tool-button" type="button" aria-label="刪除">🗑️</button>
    </div>
    <div class="toolbar-section toolbar-section--bottom">
      <button class="tool-button" type="button" aria-label="設定">⚙️</button>
    </div>
  </aside>
</template>

<style scoped>
.toolbar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 84px;
  background: #0f172a;
  color: #ffffff;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: 1.5rem 0.75rem;
  gap: 1.5rem;
  border-right: 1px solid rgba(148, 163, 184, 0.2);
}

.toolbar-section {
  display: grid;
  justify-items: center;
  gap: 1rem;
}

.toolbar-section--middle {
  align-content: center;
  gap: 0.75rem;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: #2563eb;
  display: grid;
  place-items: center;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.4);
}

.avatar-icon {
  font-size: 1.4rem;
}

.tool-button {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: none;
  background: rgba(148, 163, 184, 0.15);
  color: #ffffff;
  font-size: 1.25rem;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: transform 0.2s ease, background 0.2s ease;
}

.tool-button:hover {
  transform: translateY(-1px);
  background: rgba(148, 163, 184, 0.3);
}
</style>
