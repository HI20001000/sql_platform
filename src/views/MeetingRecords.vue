<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import mammoth from 'mammoth'
import FilePreviewPane from '../components/FilePreviewPane.vue'
import NoticeModal from '../components/NoticeModal.vue'
import Toolbar from '../components/toolbar/Toolbar.vue'
import { useAppVh } from '../composables/useAppVh.js'
import {
  buildMeetingDownloadUrl,
  createMeetingDay,
  deleteMeetingDay,
  deleteMeetingFile,
  fetchMeetingFiles,
  fetchMeetingTree,
  renameMeetingDay,
  uploadMeetingFiles,
} from '../scripts/Meetings/api.js'

const tree = ref([])
const loadingTree = ref(false)
const treeError = ref('')
const files = ref([])
const filesLoading = ref(false)
const filesError = ref('')
const selectedProductId = ref(null)
const selectedMeetingDay = ref(null)
const createFieldProductId = ref(null)
const renameFieldProductId = ref(null)
const meetingDate = ref('')
const renameDate = ref('')
const renameInputRefs = new Map()
const createInputRefs = new Map()
const uploading = ref(false)
const uploadError = ref('')
const modalOpen = ref(false)
const modalTitle = ref('')
const modalMessage = ref('')
const modalSuccessItems = ref([])
const modalErrorItems = ref([])
const selectedFile = ref(null)
const previewLoading = ref(false)
const previewError = ref('')
const previewContent = ref('')
const previewUrl = ref('')
let previewAbortController = null
let previewObjectUrl = ''

const getCurrentUser = () => {
  try {
    const raw = window.localStorage.getItem('innerai_user')
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const selectedProduct = computed(() => {
  for (const project of tree.value) {
    const match = project.products?.find((product) => product.id === selectedProductId.value)
    if (match) return match
  }
  return null
})

const selectedDayId = computed(() => selectedMeetingDay.value?.id ?? null)

const loadTree = async () => {
  loadingTree.value = true
  treeError.value = ''
  try {
    const response = await fetchMeetingTree()
    tree.value = response.tree || []
  } catch (error) {
    tree.value = []
    treeError.value = error?.message || '載入會議樹狀資料失敗'
  } finally {
    loadingTree.value = false
  }
}

const loadFiles = async () => {
  if (!selectedDayId.value) {
    files.value = []
    return
  }
  filesLoading.value = true
  filesError.value = ''
  try {
    const response = await fetchMeetingFiles({ meetingDayId: selectedDayId.value })
    files.value = response.files || []
  } catch (error) {
    files.value = []
    filesError.value = error?.message || '載入會議文件失敗'
  } finally {
    filesLoading.value = false
  }
}

const handleSelectProduct = (product) => {
  selectedProductId.value = product.id
  selectedMeetingDay.value = null
  files.value = []
  clearPreviewSelection()
}

const handleToggleDateField = (product) => {
  selectedProductId.value = product.id
  renameFieldProductId.value = null
  createFieldProductId.value = product.id
  meetingDate.value = ''
  nextTick(() => {
    const input = createInputRefs.get(product.id)
    if (!input) return
    if (typeof input.showPicker === 'function') {
      input.showPicker()
    } else {
      input.focus()
      input.click()
    }
  })
}

const handleSelectDay = (product, meetingDay) => {
  selectedProductId.value = product.id
  selectedMeetingDay.value = meetingDay
  loadFiles()
  clearPreviewSelection()
}

const handleEditDay = (product, meetingDay) => {
  selectedProductId.value = product.id
  selectedMeetingDay.value = meetingDay
  createFieldProductId.value = null
  renameFieldProductId.value = product.id
  renameDate.value = meetingDay.meeting_date || ''
  loadFiles()
  clearPreviewSelection()
  nextTick(() => {
    const input = renameInputRefs.get(meetingDay.id)
    if (!input) return
    if (typeof input.showPicker === 'function') {
      input.showPicker()
    } else {
      input.focus()
      input.click()
    }
  })
}

const registerRenameInput = (id) => (element) => {
  if (element) {
    renameInputRefs.set(id, element)
  } else {
    renameInputRefs.delete(id)
  }
}

const registerCreateInput = (id) => (element) => {
  if (element) {
    createInputRefs.set(id, element)
  } else {
    createInputRefs.delete(id)
  }
}

const handleCreateDay = async () => {
  if (!selectedProductId.value || !meetingDate.value) return
  const existingDay = selectedProduct.value?.meeting_days?.find(
    (day) => day.meeting_date === meetingDate.value
  )
  if (existingDay) {
    modalTitle.value = '新增失敗'
    modalMessage.value = '此日期已存在，請選擇其他日期。'
    modalSuccessItems.value = []
    modalErrorItems.value = []
    modalOpen.value = true
    return
  }
  try {
    const user = getCurrentUser()
    await createMeetingDay({
      productId: selectedProductId.value,
      meetingDate: meetingDate.value,
      createdBy: user?.username || user?.mail || 'system',
    })
    await loadTree()
    const nextDay = selectedProduct.value?.meeting_days?.find(
      (day) => day.meeting_date === meetingDate.value
    )
    if (nextDay) {
      selectedMeetingDay.value = nextDay
      await loadFiles()
    }
    meetingDate.value = ''
    modalTitle.value = '新增成功'
    modalMessage.value = '會議日期已成功新增。'
    modalSuccessItems.value = []
    modalErrorItems.value = []
    modalOpen.value = true
  } catch (error) {
    treeError.value = error?.message || '新增會議日期失敗'
    modalTitle.value = '新增失敗'
    modalMessage.value = treeError.value
    modalSuccessItems.value = []
    modalErrorItems.value = []
    modalOpen.value = true
  }
}

const handleRenameDay = async () => {
  if (!selectedDayId.value || !renameDate.value) return
  const existingDay = selectedProduct.value?.meeting_days?.find(
    (day) => day.meeting_date === renameDate.value
  )
  if (existingDay && existingDay.id !== selectedDayId.value) {
    modalTitle.value = '更新失敗'
    modalMessage.value = '此日期已存在，請選擇其他日期。'
    modalSuccessItems.value = []
    modalErrorItems.value = []
    modalOpen.value = true
    return
  }
  try {
    await renameMeetingDay({
      meetingDayId: selectedDayId.value,
      meetingDate: renameDate.value,
    })
    await loadTree()
    const product = selectedProduct.value
    const nextDay = product?.meeting_days?.find((day) => day.meeting_date === renameDate.value)
    selectedMeetingDay.value = nextDay || null
    await loadFiles()
    modalTitle.value = '更新成功'
    modalMessage.value = '會議日期已成功更新。'
    modalSuccessItems.value = []
    modalErrorItems.value = []
    modalOpen.value = true
  } catch (error) {
    treeError.value = error?.message || '更新會議日期失敗'
    modalTitle.value = '更新失敗'
    modalMessage.value = treeError.value
    modalSuccessItems.value = []
    modalErrorItems.value = []
    modalOpen.value = true
  }
}

const handleDeleteDay = async (meetingDay) => {
  if (!meetingDay?.id) return
  try {
    await deleteMeetingDay({ meetingDayId: meetingDay.id })
    await loadTree()
    if (selectedDayId.value === meetingDay.id) {
      selectedMeetingDay.value = null
      files.value = []
      clearPreviewSelection()
    }
  } catch (error) {
    treeError.value = error?.message || '刪除會議日期失敗'
  }
}

const handleDeleteFile = async (file) => {
  if (!selectedDayId.value || !file?.filename) return
  try {
    await deleteMeetingFile({
      meetingDayId: selectedDayId.value,
      filename: file.filename,
    })
    await loadFiles()
    if (selectedFile.value?.name === file.filename) {
      clearPreviewSelection()
    }
  } catch (error) {
    filesError.value = error?.message || '刪除檔案失敗'
  }
}

const handleUpload = async (event) => {
  if (!selectedDayId.value) return
  const filesList = event.target.files
  if (!filesList?.length) return
  const existingFiles = new Set(files.value.map((file) => file.filename))
  const incomingFiles = Array.from(filesList)
  const duplicateFiles = incomingFiles
    .filter((file) => existingFiles.has(file.name))
    .map((file) => file.name)
  const uploadableFiles = incomingFiles.filter((file) => !existingFiles.has(file.name))
  if (!uploadableFiles.length) {
    modalTitle.value = '上傳結果'
    modalMessage.value = '已存在相同檔名，沒有新增任何檔案。'
    modalSuccessItems.value = []
    modalErrorItems.value = duplicateFiles
    modalOpen.value = true
    event.target.value = ''
    return
  }
  uploading.value = true
  uploadError.value = ''
  try {
    const user = getCurrentUser()
    await uploadMeetingFiles({
      meetingDayId: selectedDayId.value,
      files: uploadableFiles,
      uploadedBy: user?.username || user?.mail || 'system',
    })
    await loadFiles()
    modalTitle.value = '上傳結果'
    modalMessage.value = ''
    modalSuccessItems.value = uploadableFiles.map((file) => file.name)
    modalErrorItems.value = duplicateFiles
    modalOpen.value = true
    event.target.value = ''
  } catch (error) {
    uploadError.value = error?.message || '上傳失敗'
    modalTitle.value = '上傳失敗'
    modalMessage.value = uploadError.value
    modalSuccessItems.value = []
    modalErrorItems.value = uploadableFiles.map((file) => file.name)
    modalOpen.value = true
  } finally {
    uploading.value = false
  }
}

const handleCloseModal = () => {
  modalOpen.value = false
}

const handleOpenPreview = async (file) => {
  if (!file?.filename || !selectedDayId.value) return
  const filename = file.filename.toLowerCase()
  const type = filename.endsWith('.pdf')
    ? 'pdf'
    : filename.endsWith('.docx')
      ? 'docx'
      : filename.endsWith('.txt')
        ? 'text'
      : filename.endsWith('.html') || filename.endsWith('.htm')
        ? 'html'
        : 'text'
  selectedFile.value = {
    id: file.id ?? file.filename,
    name: file.filename,
    type,
    url: downloadUrl(file.filename),
  }
  await loadPreview()
}

const clearPreviewResources = () => {
  if (previewAbortController) {
    previewAbortController.abort()
    previewAbortController = null
  }
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl)
    previewObjectUrl = ''
  }
}

const clearPreviewSelection = () => {
  clearPreviewResources()
  selectedFile.value = null
  previewContent.value = ''
  previewUrl.value = ''
  previewError.value = ''
  previewLoading.value = false
}

const loadPreview = async () => {
  if (!selectedFile.value) return
  clearPreviewResources()
  previewLoading.value = true
  previewError.value = ''
  previewContent.value = ''
  previewUrl.value = ''
  previewAbortController = new AbortController()

  try {
    const response = await fetch(selectedFile.value.url, { signal: previewAbortController.signal })
    if (!response.ok) {
      throw new Error('文件載入失敗')
    }
    const contentType = response.headers.get('content-type') || ''
    if (selectedFile.value.type === 'pdf') {
      if (!contentType.includes('application/pdf')) {
        throw new Error('回應不是 PDF（可能被導到登入頁或 CORS）')
      }
      const blob = await response.blob()
      previewObjectUrl = URL.createObjectURL(blob)
      previewUrl.value = previewObjectUrl
      return
    }
    if (selectedFile.value.type === 'docx') {
      if (
        !contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') &&
        !contentType.includes('application/octet-stream')
      ) {
        throw new Error('回應不是 DOCX（可能被導到登入頁或 CORS）')
      }
      const buffer = await response.arrayBuffer()
      const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer })
      previewContent.value = value || ''
      return
    }
    if (selectedFile.value.type === 'html') {
      if (!contentType.includes('text/html')) {
        throw new Error('回應不是 HTML（可能被導到登入頁或 CORS）')
      }
      previewContent.value = await response.text()
      return
    }
    if (!contentType.includes('text') && !contentType.includes('json')) {
      previewContent.value = '此檔案格式不支援預覽，請下載後查看。'
      return
    }
    previewContent.value = await response.text()
  } catch (error) {
    if (error?.name === 'AbortError') return
    previewError.value = error?.message || '文件載入失敗'
  } finally {
    previewLoading.value = false
  }
}

const formatFileSize = (bytes) => {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const downloadUrl = (filename) =>
  buildMeetingDownloadUrl({
    meetingDayId: selectedDayId.value,
    filename,
  })

onMounted(() => {
  loadTree()
})

useAppVh()

onBeforeUnmount(() => {
  clearPreviewResources()
})
</script>

<template>
  <section class="meeting-records">
    <Toolbar />
    <NoticeModal
      :open="modalOpen"
      :title="modalTitle"
      :message="modalMessage"
      :success-items="modalSuccessItems"
      :error-items="modalErrorItems"
      @close="handleCloseModal"
    />
    <div class="content">
      <header class="page-header">
        <div>
          <h1>會議記錄</h1>
          <p>依產品與日期管理會議記錄檔案。</p>
        </div>
      </header>

      <div class="layout">
        <aside class="tree-panel">
          <div class="panel-header">
            <div class="panel-title">產品資料夾</div>
          </div>
          <div class="panel-body">
            <div v-if="loadingTree" class="state-card">載入中...</div>
            <div v-else-if="treeError" class="state-card state-card--error">{{ treeError }}</div>
            <div v-else class="tree">
              <div v-for="project in tree" :key="project.id" class="tree-project">
                <div class="tree-project__name">📁 {{ project.name }}</div>
                <div class="tree-project__products">
                  <div v-for="product in project.products" :key="product.id" class="tree-product">
                    <div class="tree-product__name" :class="{ active: product.id === selectedProductId }">
                      <div class="tree-product__header">
                        <button class="tree-product__select" type="button" @click="handleSelectProduct(product)">
                          📦 {{ product.name }}
                        </button>
                        <div class="tree-product__icons" v-if="product.id === selectedProductId">
                          <span class="date-picker-trigger">
                            <button class="tree-product__icon" type="button"
                              @click.stop="handleToggleDateField(product)">
                              ➕
                            </button>
                            <input
                              v-if="createFieldProductId === product.id && product.id === selectedProductId"
                              :ref="registerCreateInput(product.id)"
                              v-model="meetingDate"
                              class="date-picker-input"
                              type="date"
                              @change="handleCreateDay"
                            />
                          </span>
                        </div>
                      </div>
                    </div>
                    <div class="tree-days">
                      <div v-for="day in product.meeting_days" :key="day.id" class="tree-day-row"
                        :class="{ active: day.id === selectedDayId }">
                        <button type="button" class="tree-day" @click="handleSelectDay(product, day)">
                          🗓️ {{ day.meeting_date }}
                        </button>
                        <span v-if="day.id === selectedDayId" class="date-picker-trigger">
                          <button type="button" class="tree-day-edit"
                            @click.stop="handleEditDay(product, day)" aria-label="編輯日期">
                            ✏️
                          </button>
                          <input
                            v-if="renameFieldProductId === product.id && day.id === selectedDayId"
                            :ref="registerRenameInput(day.id)"
                            v-model="renameDate"
                            class="date-picker-input"
                            type="date"
                            @change="handleRenameDay"
                          />
                        </span>
                        <label v-if="day.id === selectedDayId" class="tree-day-upload"
                          :class="{ disabled: uploading }" :for="`upload-${day.id}`" aria-label="上傳文件">
                          ➕
                        </label>
                        <input v-if="day.id === selectedDayId" :id="`upload-${day.id}`"
                          class="tree-day-upload__input" type="file" multiple accept=".pdf,.txt,.docx"
                          :disabled="uploading" @change="handleUpload" />
                      </div>
                      <div v-if="product.meeting_days.length === 0" class="tree-empty">
                        尚未新增日期
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="tree.length === 0" class="tree-empty">尚未建立專案/產品。</div>
            </div>
          </div>
        </aside>

        <main class="files-panel">
          <div class="panel-header">
            <div class="panel-title panel-title--split">
              <div class="panel-title__left">
                <span>
                  {{
                    selectedProductId
                      ? selectedMeetingDay
                        ? `${selectedMeetingDay.meeting_date}的會議記錄`
                        : '會議文件'
                      : '請先選擇會議'
                  }}
                </span>
                <button v-if="selectedProductId" type="button" class="tree-day-delete" :disabled="!selectedDayId"
                  @click="handleDeleteDay(selectedMeetingDay)">
                  刪除日期
                </button>
              </div>
            </div>
          </div>
          <div class="panel-body">
            <div v-if="filesLoading" class="state-card">文件載入中...</div>
            <div v-else-if="filesError" class="state-card state-card--error">{{ filesError }}</div>
            <div v-else-if="files.length === 0" class="state-card">目前沒有文件。</div>
            <div v-else class="files-table">
              <div class="files-row files-row--header">
                <div>文件名稱</div>
                <div>類型</div>
                <div>大小</div>
                <div>建立時間</div>
                <div>下載</div>
                <div>刪除</div>
              </div>
              <div v-for="file in files" :key="file.filename" class="files-row">
                <button type="button" class="file-name file-name--button" @click="handleOpenPreview(file)">
                  {{ file.filename }}
                </button>
                <div>{{ file.file_type }}</div>
                <div>{{ formatFileSize(file.file_size) }}</div>
                <div>{{ new Date(file.created_at).toLocaleString() }}</div>
                <div>
                  <a class="download-link" :href="downloadUrl(file.filename)">下載</a>
                </div>
                <div>
                  <button class="delete-link" type="button" @click="handleDeleteFile(file)">
                    刪除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside class="preview-panel">
          <div class="panel-body">
            <FilePreviewPane
              class="preview-panel__pane"
              :title="selectedFile?.name || ''"
              :type="selectedFile?.type || 'text'"
              :url="previewUrl"
              :content="previewContent"
              :loading="previewLoading"
              :error="previewError"
              :empty="!selectedFile"
            />
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.meeting-records {
  height: calc(var(--app-vh, 1vh) * 100);
  background: #f8fafc;
  color: #0f172a;
  display: flex;
  overflow: hidden;
}

.content {
  flex: 1;
  padding: 2rem 2.5rem 3rem;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin-bottom: 2rem;
  flex: 0 0 auto;
}

.page-header h1 {
  margin: 0 0 0.4rem;
  font-size: 2rem;
}

.page-header p {
  margin: 0;
  color: #475569;
}

.date-picker-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.date-picker-input {
  position: absolute;
  right: 100%;
  top: 50%;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
}

.layout {
  display: grid;
  grid-template-columns: 320px minmax(360px, 1fr) minmax(360px, 1fr);
  gap: 1.5rem;
  width: 100%;
  flex: 1;
  min-height: 0;
}

.tree-panel,
.files-panel,
.preview-panel {
  background: #ffffff;
  border-radius: 18px;
  padding: 1.5rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  min-height: 520px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.panel-header {
  flex: 0 0 auto;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.preview-panel__pane {
  flex: 1;
  min-height: 0;
}

.panel-title {
  font-weight: 700;
  margin-bottom: 1rem;
}

.panel-title--split {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.panel-title__left {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.state-card {
  padding: 0.9rem 1rem;
  border-radius: 12px;
  background: #f1f5f9;
  color: #475569;
}

.state-card--error {
  background: #fee2e2;
  color: #991b1b;
}

.tree-project__name {
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.tree-product {
  margin-bottom: 0.9rem;
}

.tree-product__name {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
  text-align: left;
  background: #f1f5f9;
  border: none;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  cursor: default;
}

.tree-product__name.active {
  background: #dbeafe;
  color: #1d4ed8;
}

.tree-product__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.tree-product__select {
  border: none;
  background: transparent;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.tree-product__icons {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.tree-product__icon {
  border: none;
  background: #ffffff;
  border-radius: 8px;
  padding: 0.25rem 0.35rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.tree-days {
  display: grid;
  gap: 0.4rem;
  padding-left: 0.5rem;
}

.tree-day-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tree-day {
  text-align: left;
  border: none;
  background: #ffffff;
  border-radius: 10px;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  color: #475569;
  border: 1px solid #e2e8f0;
  flex: 1;
}

.tree-day-row:hover .tree-day {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #93c5fd;
}

.tree-day-delete {
  border: none;
  background: #fee2e2;
  color: #991b1b;
  padding: 0.3rem 0.6rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.75rem;
}

.tree-empty {
  font-size: 0.85rem;
  color: #94a3b8;
}

.tree-day-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px dashed #cbd5f5;
  background: #f8fafc;
  color: #2563eb;
  cursor: pointer;
  font-weight: 700;
}

.tree-day-upload.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tree-day-edit {
  border: none;
  background: #ffffff;
  border-radius: 8px;
  padding: 0.25rem 0.35rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.tree-day-upload__input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.files-table {
  display: grid;
  gap: 0.6rem;
}

.files-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.2fr 0.6fr 0.6fr;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  background: #f8fafc;
  align-items: center;
}

.files-row--header {
  background: #e2e8f0;
  font-weight: 600;
}

.file-name {
  word-break: break-all;
}

.file-name--button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 0;
  color: #2563eb;
  cursor: pointer;
}

.file-name--button:hover {
  text-decoration: underline;
}

.download-link {
  color: #2563eb;
  font-weight: 600;
  text-decoration: none;
}

.delete-link {
  border: none;
  background: transparent;
  color: #dc2626;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 1200px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
