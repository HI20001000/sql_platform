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
        <div v-else-if="displayError" class="preview-modal__state preview-modal__state--error">
          {{ displayError }}
        </div>
        <iframe
          v-else-if="type === 'pdf'"
          class="preview-modal__frame"
          :src="pdfSrc"
          sandbox="allow-same-origin"
          title="file-preview"
        ></iframe>
        <pre v-else-if="type === 'docx'" class="preview-modal__content">{{ content }}</pre>
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
import { computed, onBeforeUnmount, ref, watch } from 'vue'

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

const internalError = ref('')
const displayError = computed(() => props.error || internalError.value)

const pdfSrc = ref('')
let pdfObjectUrl = ''

const clearPdfObjectUrl = () => {
  if (pdfObjectUrl) {
    URL.revokeObjectURL(pdfObjectUrl)
    pdfObjectUrl = ''
  }
  pdfSrc.value = ''
}

const loadPdf = async () => {
  if (!props.url) return
  const response = await fetch(props.url)
  if (!response.ok) {
    throw new Error('PDF 載入失敗')
  }
  const blob = await response.blob()
  pdfObjectUrl = URL.createObjectURL(blob)
  pdfSrc.value = `${pdfObjectUrl}#toolbar=0`
}

watch(
  () => [props.open, props.type, props.url, props.loading],
  async ([open, type, url, loading]) => {
    if (!open || type !== 'pdf' || !url || loading) {
      clearPdfObjectUrl()
      return
    }
    try {
      internalError.value = ''
      clearPdfObjectUrl()
      await loadPdf()
    } catch (error) {
      internalError.value = error?.message || 'PDF 載入失敗'
    }
  }
)

onBeforeUnmount(() => {
  clearPdfObjectUrl()
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
