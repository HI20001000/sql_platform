<script setup>
import { ref } from 'vue'
import MeetingRecordModal from './MeetingRecordModal.vue'
import { apiBaseUrl } from '../scripts/apiBaseUrl.js'
const props = defineProps({
  onFill: {
    type: Function,
    default: () => {},
  },
})

const isLoading = ref(false)
const message = ref('')
const messageType = ref('')
const showModal = ref(false)

const setMessage = (text, type = '') => {
  message.value = text
  messageType.value = type
}

const parseJsonPayload = (answer) => {
  if (!answer || typeof answer !== 'string') return null
  try {
    return JSON.parse(answer)
  } catch {
    const start = answer.indexOf('{')
    const end = answer.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    try {
      return JSON.parse(answer.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

const handleRecordsSelected = async (selection) => {
  const records = Array.isArray(selection) ? selection : selection?.records || []
  const selectedClient = Array.isArray(selection) ? '' : selection?.client
  const selectedVendor = Array.isArray(selection) ? '' : selection?.vendor
  const selectedProduct = Array.isArray(selection) ? '' : selection?.product
  setMessage('')
  const contents = (records || [])
    .map((record) => record?.content_text || '')
    .filter((text) => text.trim())
  if (contents.length === 0) {
    setMessage('目前僅支援文字記錄預覽（txt）。', 'error')
    return
  }
  isLoading.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/dify/auto-fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: contents.join('\n\n') }),
    })
    const data = await response.json()
    if (!response.ok || !data?.success) {
      setMessage(data?.message || 'AI 處理失敗', 'error')
      return
    }
    const answer = data?.data?.answer
    const parsed = parseJsonPayload(answer)
    if (!parsed) {
      setMessage('無法解析 AI 回傳資料。', 'error')
      return
    }
    const nextPayload = {
      ...parsed,
      client: selectedClient || parsed.client,
      vendor: selectedVendor || parsed.vendor,
      product: selectedProduct || parsed.product,
    }
    props.onFill(nextPayload)
    setMessage('AI 提取完成', 'success')
  } catch (error) {
    console.error(error)
    setMessage('AI 處理失敗', 'error')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="summary-card dify-card">
    <h2>AI提取會議記錄填寫</h2>
    <p>上傳 docx 或 txt 檔案，自動解析並填入任務欄位。</p>
    <button class="upload-button" type="button" :disabled="isLoading" @click="showModal = true">
      {{ isLoading ? '處理中...' : '選取會議記錄' }}
    </button>
    <p v-if="message" :class="['status-message', messageType]">{{ message }}</p>
  </div>

  <MeetingRecordModal
    :is-open="showModal"
    :on-close="() => (showModal = false)"
    :on-select-records="handleRecordsSelected"
  />
</template>

<style scoped>
.summary-card {
  background: #fff;
  border-radius: 24px;
  padding: 1.8rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.dify-card {
  display: grid;
  gap: 0.8rem;
}

.dify-card h2 {
  margin: 0;
  font-size: 1.2rem;
}

.dify-card p {
  margin: 0;
  color: #64748b;
}

.upload-button {
  padding: 0.45rem 1rem;
  border-radius: 999px;
  background: #111827;
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  border: none;
}

.upload-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-message {
  margin: 0;
  font-weight: 600;
  font-size: 0.9rem;
}

.status-message.success {
  color: #16a34a;
}

.status-message.error {
  color: #dc2626;
}
</style>
