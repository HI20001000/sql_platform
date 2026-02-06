<template>
  <div v-if="open" class="preview-modal">
    <div class="preview-modal__backdrop" @click="handleClose"></div>
    <div class="preview-modal__card" role="dialog" aria-modal="true">
      <div class="preview-modal__header">
        <h3>{{ title }}</h3>
        <button type="button" class="preview-modal__close" @click="handleClose">✕</button>
      </div>
      <div class="preview-modal__body">
        <div v-if="loading" class="preview-modal__state">載入中...</div>
        <div v-else-if="error" class="preview-modal__state preview-modal__state--error">{{ error }}</div>
        <iframe
          v-else-if="type === 'pdf'"
          class="preview-modal__frame"
          :src="url"
          title="file-preview"
        ></iframe>
        <div v-else-if="type === 'docx'" ref="docxContainer" class="preview-modal__docx"></div>
        <div v-else-if="type === 'html'" class="preview-modal__html" v-html="content"></div>
        <pre v-else class="preview-modal__content">{{ content }}</pre>
      </div>
      <div class="preview-modal__actions">
        <button type="button" class="preview-modal__confirm" @click="handleClose">關閉</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { renderAsync } from 'docx-preview'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  content: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'text',
  },
  buffer: {
    type: [ArrayBuffer, null],
    default: null,
  },
  url: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['close'])

const handleClose = () => {
  emit('close')
}

const docxContainer = ref(null)

const renderDocx = async () => {
  if (!docxContainer.value || !props.buffer) return
  await nextTick()
  docxContainer.value.innerHTML = ''
  await renderAsync(props.buffer, docxContainer.value, undefined, {
    inWrapper: true,
  })
}

watch(
  () => [props.open, props.type, props.buffer],
  async ([open, type, buffer]) => {
    if (!open || type !== 'docx' || !buffer) return
    await renderDocx()
  }
)

onBeforeUnmount(() => {
  if (docxContainer.value) {
    docxContainer.value.innerHTML = ''
  }
})
</script>

<style scoped>
.preview-modal {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
}

.preview-modal__card {
  position: relative;
  width: min(720px, 92vw);
  max-height: 80vh;
  background: #ffffff;
  border-radius: 16px;
  padding: 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.25);
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preview-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.preview-modal__header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.preview-modal__close {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
}

.preview-modal__body {
  flex: 1;
  overflow: auto;
}

.preview-modal__state {
  color: #475569;
}

.preview-modal__state--error {
  color: #dc2626;
}

.preview-modal__content {
  margin: 0;
  white-space: pre-wrap;
  font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    'Liberation Mono', 'Courier New', monospace;
  font-size: 0.9rem;
  color: #0f172a;
}

.preview-modal__frame {
  width: 100%;
  height: 100%;
  border: none;
}

.preview-modal__docx :deep(.docx-wrapper) {
  padding: 0;
}

.preview-modal__docx :deep(.docx) {
  color: #0f172a;
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  line-height: 1.6;
}

.preview-modal__docx {
  width: 100%;
}

.preview-modal__html {
  color: #0f172a;
  line-height: 1.6;
}

.preview-modal__actions {
  display: flex;
  justify-content: flex-end;
}

.preview-modal__confirm {
  border: none;
  background: #2563eb;
  color: #ffffff;
  border-radius: 10px;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  font-weight: 600;
}
</style>
