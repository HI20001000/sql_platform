<script setup>
const props = defineProps({
  height: {
    type: String,
    default: '70vh',
  },
})
</script>

<template>
  <div class="scroll-panel">
    <div class="scroll-panel__body" :style="{ maxHeight: props.height }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.scroll-panel {
  overflow-x: visible;
  overflow-y: auto;
}

.scroll-panel__body {
  overflow-x: visible;
  padding-right: 0.4rem;
}

.scroll-panel__body::-webkit-scrollbar {
  width: 8px;
}

.scroll-panel__body::-webkit-scrollbar-track {
  background: rgba(148, 163, 184, 0.2);
  border-radius: 999px;
}

.scroll-panel__body::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #111827, #334155);
  border-radius: 999px;
}

.scroll-panel__body::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #1f2937, #475569);
}

.scroll-panel__body {
  scrollbar-color: #1f2937 rgba(148, 163, 184, 0.2);
  scrollbar-width: thin;
}
</style>
