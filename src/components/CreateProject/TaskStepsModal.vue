<script setup>
const props = defineProps({
  task: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close'])

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <div v-if="task" class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal">
      <header class="modal-header">
        <div>
          <p class="modal-title">跟進流程</p>
          <p class="modal-subtitle">{{ task?.name }}</p>
        </div>
        <button class="close-button" type="button" @click="handleClose">✕</button>
      </header>

      <div class="modal-body">
        <div class="steps-grid">
          <div class="steps-row steps-row--head">
            <span>狀態</span>
            <span>負責人</span>
            <span>跟進內容</span>
            <span>更新時間</span>
            <span>建立時間</span>
          </div>
          <div v-for="step in task.steps" :key="step.id" class="steps-row">
            <span class="status-pill">{{ step.status }}</span>
            <span>{{ step.ownerId }}</span>
            <span class="step-content">{{ step.content }}</span>
            <span>{{ step.updatedAt }}</span>
            <span>{{ step.createdAt }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: grid;
  place-items: center;
  z-index: 20;
}

.modal {
  width: min(860px, 90vw);
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #0f172a;
}

.modal-subtitle {
  margin: 0.25rem 0 0;
  color: #64748b;
}

.close-button {
  border: none;
  background: #f1f5f9;
  border-radius: 10px;
  width: 36px;
  height: 36px;
  cursor: pointer;
}

.modal-body {
  padding: 1.5rem;
}

.steps-grid {
  display: grid;
  gap: 0.75rem;
}

.steps-row {
  display: grid;
  grid-template-columns: 1fr 1fr 2.2fr 1fr 1fr;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 0.5rem;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.9rem;
}

.steps-row--head {
  font-weight: 600;
  color: #475569;
  background: #f8fafc;
  border-radius: 10px;
  border-bottom: none;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: #e2e8f0;
  color: #0f172a;
  font-weight: 600;
  width: fit-content;
}

.step-content {
  color: #0f172a;
}
</style>
