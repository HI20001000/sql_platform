<script setup>
import MeetingRecords from '../views/MeetingRecords.vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  onClose: {
    type: Function,
    default: () => {},
  },
  onSelectRecords: {
    type: Function,
    default: () => {},
  },
})

const handleSelect = (records) => {
  props.onSelectRecords(records)
  props.onClose()
}
</script>

<template>
  <div v-if="props.isOpen" class="modal-overlay" @click.self="props.onClose">
    <div class="modal-card">
      <header class="modal-header">
        <h2>選擇會議記錄</h2>
        <button class="ghost-mini" type="button" @click="props.onClose">取消</button>
      </header>
      <MeetingRecords :embedded="true" :on-select-records="handleSelect" />
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: grid;
  place-items: center;
  z-index: 1000;
}

.modal-card {
  width: min(1100px, 92vw);
  max-height: 90vh;
  background: #f6f7fb;
  border-radius: 24px;
  padding: 1.6rem;
  display: grid;
  gap: 1rem;
  overflow: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ghost-mini {
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
  color: #475569;
}

:deep(.option-search) {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  background: #fff;
}
</style>
