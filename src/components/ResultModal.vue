<script setup>
const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  message: {
    type: String,
    default: '',
  },
  confirmText: {
    type: String,
    default: '確定',
  },
})

const emit = defineEmits(['close'])

const handleClose = () => emit('close')
</script>

<template>
  <div v-if="props.isOpen" class="modal-overlay" @click.self="handleClose">
    <div class="modal-card">
      <h2>{{ props.title }}</h2>
      <p>{{ props.message }}</p>
      <div class="modal-actions">
        <button class="primary-button" type="button" @click="handleClose">
          {{ props.confirmText }}
        </button>
      </div>
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
  background: #fff;
  padding: 2rem 2.4rem;
  border-radius: 24px;
  width: min(420px, 90vw);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.2);
  display: grid;
  gap: 1rem;
}

.modal-card h2 {
  margin: 0;
  font-size: 1.4rem;
}

.modal-card p {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
}

.primary-button {
  border: none;
  background: #111827;
  color: #fff;
  padding: 0.7rem 1.4rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
}
</style>
