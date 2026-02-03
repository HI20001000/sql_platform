<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import TaskStepsModal from '../components/CreateProject/TaskStepsModal.vue'
import Toolbar from '../components/toolbar/Toolbar.vue'
import { fetchProjectTree, fetchTaskSteps } from '../scripts/CreateProject/api.js'

const searchQuery = ref('')
const statusInput = ref('')
const assigneeInput = ref('')

const rows = ref([])
const taskCount = ref(0)
const loading = ref(false)
const error = ref('')

const expandedMap = ref(new Set())

const modalVisible = ref(false)
const currentTask = ref(null)
const stepsLoading = ref(false)
const stepsError = ref('')
const stepsData = ref([])

const parseTokens = (value) => {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const statusFilters = computed(() => parseTokens(statusInput.value))
const assigneeFilters = computed(() => parseTokens(assigneeInput.value))

const hasActiveFilters = computed(
  () =>
    searchQuery.value.trim().length > 0 ||
    statusFilters.value.length > 0 ||
    assigneeFilters.value.length > 0
)

const isExpanded = (id) => expandedMap.value.has(id)
const canToggle = (row) => row.rowType !== 'task' && row.hasChildren

const visibleRows = computed(() => {
  if (!rows.value.length) return []
  const byParent = new Map()
  rows.value.forEach((row) => {
    const key = row.parentId ?? 'root'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(row)
  })

  const output = []
  const walk = (parentKey) => {
    const children = byParent.get(parentKey) || []
    children.forEach((child) => {
      output.push(child)
      if (expandedMap.value.has(child.id)) {
        walk(child.id)
      }
    })
  }

  walk('root')
  return output
})

const formatTypeLabel = (type) => {
  switch (type) {
    case 'project':
      return '📚'
    case 'product':
      return '📦'
    case 'task':
      return '📋'
    default:
      return '⚠️'
  }
}

const depthPadding = (depth) => `${depth * 24}px`

const toggleExpanded = (row) => {
  if (!canToggle(row)) return
  const next = new Set(expandedMap.value)
  if (next.has(row.id)) {
    next.delete(row.id)
  } else {
    next.add(row.id)
  }
  expandedMap.value = next
}

const resetExpandedMap = (data) => {
  const next = new Set()
  if (hasActiveFilters.value) {
    data.forEach((row) => {
      if (row.rowType !== 'task') next.add(row.id)
    })
  } else {
    data.forEach((row) => {
      if (row.rowType === 'project' && row.hasChildren) next.add(row.id)
    })
  }
  expandedMap.value = next
}

const loadTree = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await fetchProjectTree({
      q: searchQuery.value.trim(),
      status: statusFilters.value,
      assignee: assigneeFilters.value,
    })
    rows.value = response.rows || []
    taskCount.value = response.taskCount || 0
    resetExpandedMap(rows.value)
  } catch (err) {
    error.value = err?.message || '載入失敗'
    rows.value = []
    taskCount.value = 0
  } finally {
    loading.value = false
  }
}

const openTaskSteps = async (row) => {
  if (!row || row.rowType !== 'task') return
  modalVisible.value = true
  currentTask.value = row
  stepsLoading.value = true
  stepsError.value = ''
  stepsData.value = []
  try {
    const response = await fetchTaskSteps(row.id)
    stepsData.value = response.steps || []
  } catch (err) {
    stepsError.value = err?.message || '載入步驟失敗'
  } finally {
    stepsLoading.value = false
  }
}

const closeTaskSteps = () => {
  modalVisible.value = false
  currentTask.value = null
  stepsData.value = []
  stepsError.value = ''
  stepsLoading.value = false
}

let debounceTimer = null
watch([searchQuery, statusInput, assigneeInput], () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    loadTree()
  }, 300)
})

onMounted(() => {
  loadTree()
})
</script>

<template>
  <section class="create-project">
    <Toolbar />
    <div class="content">
      <div class="toolbar-row">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            class="search-input"
            type="search"
            placeholder="全局模糊搜尋"
          />
        </div>
        <div class="filter-group">
          <label class="filter-field">
            <span>狀態</span>
            <input
              v-model="statusInput"
              type="text"
              placeholder="狀態 (逗號分隔)"
            />
          </label>
          <label class="filter-field">
            <span>負責人</span>
            <input
              v-model="assigneeInput"
              type="text"
              placeholder="負責人 ID (逗號分隔)"
            />
          </label>
        </div>
        <div class="task-count">任務總數：{{ taskCount }}</div>
      </div>

      <div v-if="loading" class="state-card">資料載入中...</div>
      <div v-else-if="error" class="state-card state-card--error">{{ error }}</div>
      <div v-else-if="visibleRows.length === 0" class="state-card">目前沒有資料。</div>
      <div v-else class="table">
        <div class="table-row table-row--header">
          <div>層級名稱</div>
          <div>狀態</div>
          <div>負責人</div>
          <div>更新時間</div>
          <div>建立時間</div>
        </div>
        <div
          v-for="row in visibleRows"
          :key="`${row.rowType}-${row.id}`"
          class="table-row"
          :class="{ clickable: row.rowType === 'task' }"
          @click="row.rowType === 'task' ? openTaskSteps(row) : null"
        >
          <div class="name-cell" :style="{ paddingLeft: depthPadding(row.level) }">
            <button
              v-if="canToggle(row)"
              class="toggle-button"
              type="button"
              @click.stop="toggleExpanded(row)"
            >
              {{ isExpanded(row.id) ? '▾' : '▸' }}
            </button>
            <span class="type-tag" :class="`type-tag--${row.rowType}`">
              {{ formatTypeLabel(row.rowType) }}
            </span>
            <span class="node-name">{{ row.name }}</span>
            <button
              v-if="row.rowType === 'task'"
              class="steps-button"
              type="button"
              @click.stop="openTaskSteps(row)"
            >
              查看步驟
            </button>
          </div>
          <div class="status-cell">
            <span v-if="row.rowType === 'task'" class="status-pill">
              {{ row.status || '-' }}
            </span>
            <span v-else class="status-muted">-</span>
          </div>
          <div>{{ row.rowType === 'task' ? row.assignee_user_id ?? '-' : '-' }}</div>
          <div>{{ row.updated_at }}</div>
          <div>{{ row.created_at }}</div>
        </div>
      </div>
    </div>

    <TaskStepsModal
      :visible="modalVisible"
      :task="currentTask"
      :steps="stepsData"
      :loading="stepsLoading"
      :error="stepsError"
      @close="closeTaskSteps"
    />
  </section>
</template>

<style scoped>
.create-project {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  width: 100vw;
  font-family: 'Noto Sans TC', 'Segoe UI', sans-serif;
  --project-color: #1d4ed8;
  --product-color: #0f766e;
  --task-color: #7c3aed;
}

.content {
  flex: 1;
  min-width: 0;
  padding: 2.5rem 3rem;
  display: grid;
  gap: 1.5rem;
  width: 100%;
}

.toolbar-row {
  display: grid;
  grid-template-columns: 1.2fr 2fr auto;
  gap: 1.5rem;
  align-items: center;
  background: #ffffff;
  padding: 1rem 1.5rem;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
}

.search-wrap {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: #f1f5f9;
  padding: 0.6rem 0.8rem;
  border-radius: 10px;
}

.search-input {
  border: none;
  background: transparent;
  width: 100%;
  font-size: 0.95rem;
}

.search-input:focus {
  outline: none;
}

.filter-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.filter-field {
  display: grid;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: #475569;
}

.filter-field input {
  border: 1px solid #e2e8f0;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  font-size: 0.9rem;
}

.task-count {
  font-weight: 600;
  color: #0f172a;
  justify-self: end;
}

.state-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 1rem 1.5rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
  color: #475569;
}

.state-card--error {
  background: #fee2e2;
  color: #b91c1c;
}

.table {
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
  color: #1f2937;
  border: 1px solid #e2e8f0;
}

.table-row {
  display: grid;
  grid-template-columns: 2.2fr 1fr 1fr 1fr 1fr;
  gap: 1rem;
  padding: 0.9rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  align-items: center;
  font-size: 0.95rem;
}

.table-row > div {
  border-right: 1px solid #e2e8f0;
  padding-right: 1rem;
}

.table-row > div:last-child {
  border-right: none;
  padding-right: 0;
}

.table-row--header {
  background: #f8fafc;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 0.85rem;
}

.table-row.clickable {
  cursor: pointer;
}

.table-row.clickable:hover {
  background: #f8fafc;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-button {
  border: none;
  background: transparent;
  font-size: 1rem;
  color: #64748b;
  cursor: pointer;
}

.type-tag {
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
  background: #e2e8f0;
  padding: 0.1rem 0.1rem;
  border-radius: 0.5rem;
}

.type-tag--project {
  background: rgba(29, 78, 216, 0.12);
  color: var(--project-color);
}

.type-tag--product {
  background: rgba(15, 118, 110, 0.12);
  color: var(--product-color);
}

.type-tag--task {
  background: rgba(124, 58, 237, 0.12);
  color: var(--task-color);
}

.node-name {
  display: inline-block;
  font-weight: 600;
}

.steps-button {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: #475569;
  cursor: pointer;
}

.status-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 600;
}

.status-muted {
  color: #94a3b8;
}
</style>
