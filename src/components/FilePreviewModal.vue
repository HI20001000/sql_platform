<template>
  <div v-if="open" class="preview-modal">
    <div class="preview-modal__backdrop" @click="handleClose"></div>
    <div class="preview-modal__card" role="dialog" aria-modal="true">
      <div class="preview-modal__header">
        <h3>{{ title }}</h3>
        <button type="button" class="preview-modal__close" @click="handleClose">✕</button>
      </div>
      <div class="preview-modal__body">
        <div v-if="displayLoading" class="preview-modal__state">載入中...</div>
        <div v-else-if="displayError" class="preview-modal__state preview-modal__state--error">
          {{ displayError }}
        </div>
        <div v-else-if="type === 'pdf'" ref="pdfContainerRef" class="preview-modal__pdf"></div>
        <div v-else-if="type === 'docx'" class="preview-modal__docx" v-html="docxHtml"></div>
        <div v-else-if="type === 'html'" class="preview-modal__html" v-html="htmlContent"></div>
        <pre v-else class="preview-modal__content">{{ textContent }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min?url'
import mammoth from 'mammoth'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  url: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'text',
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

const internalLoading = ref(false)
const internalError = ref('')
const textContent = ref('')
const htmlContent = ref('')
const docxHtml = ref('')
const pdfContainerRef = ref(null)
let pdfLoadingTask = null
let pdfDocument = null
let fetchAbortController = null
let renderToken = 0

const displayLoading = computed(() => props.loading || internalLoading.value)
const displayError = computed(() => props.error || internalError.value)

const resetContent = () => {
  textContent.value = ''
  htmlContent.value = ''
  docxHtml.value = ''
}

const clearPdf = () => {
  renderToken += 1
  if (fetchAbortController) {
    fetchAbortController.abort()
    fetchAbortController = null
  }
  if (pdfLoadingTask) {
    pdfLoadingTask.destroy()
    pdfLoadingTask = null
  }
  if (pdfDocument) {
    pdfDocument.destroy?.()
    pdfDocument = null
  }
  if (pdfContainerRef.value) {
    pdfContainerRef.value.innerHTML = ''
  }
}

const logPdfDebug = (phase) => {
  const el = pdfContainerRef.value
  console.log('[FilePreviewModal][PDF]', phase, {
    open: props.open,
    type: props.type,
    url: props.url,
    hasContainer: Boolean(el),
    width: el?.clientWidth ?? 0,
    height: el?.clientHeight ?? 0,
  })
}

const loadPdf = async () => {
  if (!props.url) return
  internalLoading.value = true
  internalError.value = ''
  clearPdf()
  const currentToken = (renderToken += 1)

  await nextTick()
  logPdfDebug('after-nextTick')
  const container = pdfContainerRef.value
  if (!container) {
    throw new Error('PDF 容器不存在')
  }
  container.innerHTML = ''
  if (container.clientWidth === 0 || container.clientHeight === 0) {
    console.warn('[FilePreviewModal][PDF] 容器尺寸為 0，請確認 CSS 是否設定高度/寬度。', {
      width: container.clientWidth,
      height: container.clientHeight,
    })
    throw new Error('容器高度/寬度為 0，請檢查 CSS（iframe/canvas 100% 高度塌陷）')
  }

  fetchAbortController = new AbortController()
  const response = await fetch(props.url, { signal: fetchAbortController.signal })
  if (!response.ok) {
    throw new Error('PDF 載入失敗')
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/pdf')) {
    const preview = await response.clone().text()
    console.warn('[FilePreviewModal][PDF] 非 PDF 回應內容前 200 字:', preview.slice(0, 200))
    throw new Error('回應不是 PDF（可能被導到登入頁或 CORS）')
  }
  const buffer = await response.arrayBuffer()
  pdfLoadingTask = getDocument({ data: buffer })
  pdfDocument = await pdfLoadingTask.promise

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    if (currentToken !== renderToken) return
    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.2 })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.className = 'preview-modal__pdf-canvas'
    container.appendChild(canvas)
    await page.render({ canvasContext: context, viewport }).promise
  }
}

const loadDocx = async () => {
  if (!props.url) return
  internalLoading.value = true
  internalError.value = ''
  docxHtml.value = ''

  const response = await fetch(props.url)
  if (!response.ok) {
    throw new Error('DOCX 載入失敗')
  }
  const buffer = await response.arrayBuffer()
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer })
  docxHtml.value = value || ''
}

const loadText = async () => {
  if (!props.url) return
  internalLoading.value = true
  internalError.value = ''
  textContent.value = ''

  const response = await fetch(props.url)
  if (!response.ok) {
    throw new Error('文件載入失敗')
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text') && !contentType.includes('json')) {
    textContent.value = '此檔案格式不支援預覽，請下載後查看。'
    return
  }
  textContent.value = await response.text()
}

const loadHtml = async () => {
  if (!props.url) return
  internalLoading.value = true
  internalError.value = ''
  htmlContent.value = ''

  const response = await fetch(props.url)
  if (!response.ok) {
    throw new Error('文件載入失敗')
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    throw new Error('非 HTML 檔案，無法預覽')
  }
  htmlContent.value = await response.text()
}

const loadPreview = async () => {
  resetContent()
  clearPdf()
  if (!props.open || !props.url || props.loading) {
    internalLoading.value = false
    return
  }

  try {
    internalError.value = ''
    if (props.type === 'pdf') {
      await loadPdf()
    } else if (props.type === 'docx') {
      await loadDocx()
    } else if (props.type === 'html') {
      await loadHtml()
    } else {
      await loadText()
    }
  } catch (error) {
    internalError.value = error?.message || '文件載入失敗'
  } finally {
    internalLoading.value = false
  }
}

watch(
  () => [props.open, props.type, props.url, props.loading],
  async ([open, , , loading]) => {
    if (!open) {
      internalLoading.value = false
      internalError.value = ''
      resetContent()
      clearPdf()
      return
    }
    if (loading) return
    await loadPreview()
  },
  { flush: 'post' }
)

onBeforeUnmount(() => {
  clearPdf()
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

.preview-modal__html {
  color: #0f172a;
  line-height: 1.6;
}

.preview-modal__pdf {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 320px;
}

.preview-modal__pdf :deep(.preview-modal__pdf-canvas) {
  max-width: 100%;
  height: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
}

.preview-modal__docx {
  font-family: 'Inter', 'Noto Sans TC', system-ui, sans-serif;
  color: #0f172a;
  line-height: 1.7;
}

.preview-modal__docx :deep(p) {
  margin: 0 0 0.9rem;
}

.preview-modal__docx :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

.preview-modal__docx :deep(th),
.preview-modal__docx :deep(td) {
  border: 1px solid #e2e8f0;
  padding: 0.4rem 0.6rem;
}

.preview-modal__docx :deep(ul),
.preview-modal__docx :deep(ol) {
  padding-left: 1.2rem;
  margin: 0 0 0.9rem;
}
</style>
