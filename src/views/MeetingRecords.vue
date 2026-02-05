<script setup>
import { computed, onMounted, ref } from 'vue'
import Toolbar from '../components/toolbar/Toolbar.vue'
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
const meetingDate = ref('')
const actionMode = ref('create')
const uploading = ref(false)
const uploadError = ref('')

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
}

const handleSelectDay = (product, meetingDay) => {
  selectedProductId.value = product.id
  selectedMeetingDay.value = meetingDay
  loadFiles()
}

const handleSubmitDay = async () => {
  if (actionMode.value === 'create') {
    if (!selectedProductId.value || !meetingDate.value) return
    try {
      const user = getCurrentUser()
      await createMeetingDay({
        productId: selectedProductId.value,
        meetingDate: meetingDate.value,
        createdBy: user?.username || user?.mail || 'system',
      })
      await loadTree()
      const product = selectedProduct.value
      const nextDay = product?.meeting_days?.find(
        (day) => day.meeting_date === meetingDate.value
      )
      if (nextDay) {
        selectedMeetingDay.value = nextDay
        await loadFiles()
      }
      meetingDate.value = ''
    } catch (error) {
      treeError.value = error?.message || '新增會議日期失敗'
    }
    return
  }

  if (!selectedDayId.value || !meetingDate.value) return
  try {
    await renameMeetingDay({
      meetingDayId: selectedDayId.value,
      meetingDate: meetingDate.value,
    })
    await loadTree()
    const product = selectedProduct.value
    const nextDay = product?.meeting_days?.find((day) => day.meeting_date === meetingDate.value)
    selectedMeetingDay.value = nextDay || null
    await loadFiles()
  } catch (error) {
    treeError.value = error?.message || '更新會議日期失敗'
  }
}

const toggleActionMode = () => {
  actionMode.value = actionMode.value === 'create' ? 'rename' : 'create'
}

const handleDeleteDay = async (meetingDay) => {
  if (!meetingDay?.id) return
  try {
    await deleteMeetingDay({ meetingDayId: meetingDay.id })
    await loadTree()
    if (selectedDayId.value === meetingDay.id) {
      selectedMeetingDay.value = null
      files.value = []
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
  } catch (error) {
    filesError.value = error?.message || '刪除檔案失敗'
  }
}

const handleUpload = async (event) => {
  if (!selectedDayId.value) return
  const filesList = event.target.files
  if (!filesList?.length) return
  uploading.value = true
  uploadError.value = ''
  try {
    const user = getCurrentUser()
    await uploadMeetingFiles({
      meetingDayId: selectedDayId.value,
      files: filesList,
      uploadedBy: user?.username || user?.mail || 'system',
    })
    await loadFiles()
    event.target.value = ''
  } catch (error) {
    uploadError.value = error?.message || '上傳失敗'
  } finally {
    uploading.value = false
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
</script>

<template>
  <section class="meeting-records">
    <Toolbar />
    <div class="content">
      <header class="page-header">
        <div>
          <h1>會議記錄</h1>
          <p>依產品與日期管理會議記錄檔案。</p>
        </div>
      </header>

      <div class="layout">
        <aside class="tree-panel">
          <div class="panel-title">產品資料夾</div>
          <div v-if="loadingTree" class="state-card">載入中...</div>
          <div v-else-if="treeError" class="state-card state-card--error">{{ treeError }}</div>
          <div v-else class="tree">
            <div v-for="project in tree" :key="project.id" class="tree-project">
              <div class="tree-project__name">📁 {{ project.name }}</div>
              <div class="tree-project__products">
                <div v-for="product in project.products" :key="product.id" class="tree-product">
                  <button class="tree-product__name" :class="{ active: product.id === selectedProductId }" type="button"
                    @click="handleSelectProduct(product)">
                    <span>📦 {{ product.name }}</span>
                    <div v-if="product.id === selectedProductId" class="date-field" @click.stop>
                      <label>新增日期</label>
                      <input v-model="meetingDate" type="date" />
                      <div class="date-field__actions">
                        <button type="button" class="primary-button" :disabled="actionMode === 'create'
                          ? !selectedProductId || !meetingDate
                          : !selectedDayId || !meetingDate
                          " @click="handleSubmitDay">
                          ➕
                        </button>
                        <button type="button" class="toggle-button" @click="toggleActionMode">
                          ⇄
                        </button>
                      </div>
                    </div>
                  </button>
                  <div class="tree-days">
                    <div v-for="day in product.meeting_days" :key="day.id" class="tree-day-row"
                      :class="{ active: day.id === selectedDayId }">
                      <button type="button" class="tree-day" @click="handleSelectDay(product, day)">
                        🗓️ {{ day.meeting_date }}
                      </button>
                      <input v-if="day.id === selectedDayId" class="panel-title__left_input" type="file" multiple
                        accept=".pdf,.txt,.docx" :disabled="uploading" @change="handleUpload" />
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
        </aside>

        <main class="files-panel">
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
              <div class="file-name">{{ file.filename }}</div>
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
        </main>
      </div>
    </div>
  </section>
</template>

<style scoped>
.meeting-records {
  min-height: 100vh;
  background: #f8fafc;
  color: #0f172a;
  display: flex;
}

.content {
  flex: 1;
  padding: 2rem 2.5rem 3rem;
  width: 100%;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin-bottom: 2rem;
}

.page-header h1 {
  margin: 0 0 0.4rem;
  font-size: 2rem;
}

.page-header p {
  margin: 0;
  color: #475569;
}

.date-field {
  display: flex;
  gap: 0.75rem;
  background: #ffffff;
  padding: 0.75rem 1rem;
  border-radius: 14px;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}

.date-field label {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #475569;
}

.date-field input {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.4rem 0.6rem;
  font-size: 0.9rem;
}

.date-field__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.primary-button,
.ghost-button {
  border-radius: 10px;
  padding: 0.45rem 0.45rem;
  border: none;
  cursor: pointer;
  font-weight: 600;
}

.toggle-button {
  border-radius: 10px;
  padding: 0.45rem 0.7rem;
  border: 1px solid #cbd5f5;
  background: #ffffff;
  color: #1d4ed8;
  cursor: pointer;
  font-weight: 600;
}

.primary-button {
  background: #2563eb;
  color: #ffffff;
}

.primary-button:disabled,
.ghost-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ghost-button {
  background: #e2e8f0;
  color: #0f172a;
}

.layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1.5rem;
  width: 100%;
}

.tree-panel,
.files-panel {
  background: #ffffff;
  border-radius: 18px;
  padding: 1.5rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  min-height: 520px;
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
  cursor: pointer;
}

.tree-product__name.active {
  background: #dbeafe;
  color: #1d4ed8;
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

.panel-title__left_input[type='file'] {
  border: 1px dashed #cbd5f5;
  padding: 0.75rem;
  border-radius: 12px;
  background: #f8fafc;
  cursor: pointer;
  font-size: 0;
  color: transparent;
  max-width: 150px;
  overflow: hidden;
}

.panel-title__left_input[type='file']::file-selector-button {
  border: none;
  background: #2563eb;
  color: #ffffff;
  padding: 0.5rem 0.9rem;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  margin-right: 0.75rem;
  font-size: 0.85rem;
}

.panel-title__left_input[type='file']::-webkit-file-upload-button {
  border: none;
  background: #2563eb;
  color: #ffffff;
  padding: 0.5rem 0.9rem;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  margin-right: 0.75rem;
  font-size: 0.85rem;
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
</style>
