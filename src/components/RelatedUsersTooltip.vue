<script setup>
const props = defineProps({
  users: {
    type: Array,
    default: () => [],
  },
})
</script>

<template>
  <div class="related-users">
    <span class="count">{{ props.users.length }} 人</span>
    <div class="tooltip">
      <div v-if="props.users.length === 0" class="empty">尚無關聯用戶</div>
      <div v-else class="list">
        <div v-for="user in props.users" :key="user.mail" class="item">
          <span class="avatar" :style="{ backgroundColor: user.icon_bg || '#e2e8f0' }">
            {{ user.icon || '🙂' }}
          </span>
          <span class="label">{{ user.username || 'user' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.related-users {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.count {
  font-weight: 600;
  color: #2563eb;
  cursor: default;
}

.tooltip {
  position: absolute;
  top: calc(100% + 0.4rem);
  left: 0;
  min-width: 200px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.6rem;
  box-shadow: 0 18px 30px rgba(15, 23, 42, 0.12);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition: all 0.15s ease;
  z-index: 5;
}

.related-users:hover .tooltip {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.list {
  display: grid;
  gap: 0.4rem;
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.75rem;
}

.label {
  font-size: 0.85rem;
  color: #1f2937;
}

.empty {
  font-size: 0.85rem;
  color: #64748b;
}
</style>
