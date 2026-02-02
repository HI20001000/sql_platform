<script setup>
import { computed } from 'vue'

const props = defineProps({
  user: {
    type: Object,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  selectedLabel: {
    type: String,
    default: '已選',
  },
})

const emit = defineEmits(['select'])

const userName = computed(() => props.user?.username || 'user')
</script>

<template>
  <button type="button" class="option-item user-option" @click="emit('select')">
    <span class="user-avatar" :style="{ backgroundColor: user?.icon_bg || '#e2e8f0' }">
      {{ user?.icon || '🙂' }}
    </span>
    <span class="user-label">{{ userName }}</span>
    <span v-if="selected" class="user-selected">{{ selectedLabel }}</span>
  </button>
</template>

<style scoped>
.option-item {
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 500;
  color: #1f2937;
}

.option-item:hover {
  background: #e2e8f0;
}

.user-option {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  background: #e2e8f0;
}

.user-label {
  font-size: 0.85rem;
  color: #1f2937;
}

.user-selected {
  margin-left: auto;
  font-size: 0.75rem;
  color: #16a34a;
  font-weight: 600;
  text-align: right;
}
</style>
