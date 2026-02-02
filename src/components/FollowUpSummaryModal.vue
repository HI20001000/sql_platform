<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatDateTimeDisplay, toDateKey } from '../scripts/time.js'
import { apiBaseUrl } from '../scripts/apiBaseUrl.js'
import UserOptionItem from './UserOptionItem.vue'
import { filterUserOptions, normalizeUserOptions } from '../scripts/user-options/index.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '跟進任務',
  },
  statusFilter: {
    type: String,
    default: 'all',
  },
  submissions: {
    type: Array,
    default: () => [],
  },
  includeOverdueIncomplete: {
    type: Boolean,
    default: false,
  },
  referenceDate: {
    type: [String, Date],
    default: '',
  },
  userScoped: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['close', 'select-date'])

const followUpStatuses = ref([])
const isLoading = ref(false)
const activeStatusMenu = ref(null)
const activeAssigneeMenu = ref(null)
const statusSearch = ref('')
const assigneeSearch = ref('')
const clientFilter = ref('')
const vendorFilter = ref('')
const productFilter = ref('')
const activeFilterMenu = ref(null)

const currentUserMail = computed(() => readUserProfile()?.mail?.toLowerCase() || '')

const normalizeAssigneeMails = (assignees = []) =>
  Array.isArray(assignees)
    ? assignees
        .map((item) => (typeof item === 'string' ? item : item?.mail))
        .filter((mail) => typeof mail === 'string' && mail.trim())
    : []

const formatAssigneeLabels = (assignees = []) =>
  Array.isArray(assignees)
    ? assignees
        .map((item) => {
          if (!item) return null
          if (typeof item === 'string') return item
          return item.username || item.mail || null
        })
        .filter(Boolean)
    : []

const scopedSubmissions = computed(() => {
  const items = props.submissions || []
  if (!props.userScoped) return items
  const mail = currentUserMail.value
  if (!mail) return []
  return items.filter((submission) => {
    const relatedUsers = Array.isArray(submission?.related_users) ? submission.related_users : []
    return relatedUsers.some((user) => user?.mail?.toLowerCase() === mail)
  })
})

const readAuthStorage = () => {
  const raw = window.localStorage.getItem('innerai_auth')
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (!data?.token || !data?.expiresAt) return null
    return data
  } catch {
    return null
  }
}

const readUserProfile = () => {
  const raw = window.localStorage.getItem('innerai_user')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const fetchStatuses = async () => {
  const auth = readAuthStorage()
  if (!auth) return
  isLoading.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/follow-up-statuses`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await response.json()
    if (!response.ok || !data?.success) return
    followUpStatuses.value = data.data || []
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  if (props.open) fetchStatuses()
})

watch(
  () => props.open,
  (value) => {
    if (value && followUpStatuses.value.length === 0) {
      fetchStatuses()
    }
  }
)

const isOverdue = (submission) => {
  if (!props.includeOverdueIncomplete || !props.referenceDate) return false
  const refKey = toDateKey(props.referenceDate)
  if (!refKey) return false
  const endKey = toDateKey(submission?.end_at)
  if (!endKey) return false
  return endKey < refKey
}

const matchesStatusFilter = (followUp, submission) => {
  if (!followUp) return false
  const statusName = followUp.status_name || '進行中'
  if (props.statusFilter === 'incomplete') {
    if (statusName === '已完成') return false
    if (props.includeOverdueIncomplete) {
      return isOverdue(submission)
    }
    return statusName === '未完成'
  }
  if (props.statusFilter === 'completed') return statusName === '已完成'
  if (props.statusFilter === 'in_progress') {
    if (isOverdue(submission)) return false
    return statusName !== '已完成' && statusName !== '未完成'
  }
  if (props.statusFilter === 'unassigned') {
    return (followUp.assignees || []).length === 0
  }
  return true
}

const getTaskLabel = (submission) => {
  const fallbackLabel = `${submission.client_name || '客戶'}_${submission.vendor_name || '廠家'}_${
    submission.product_name || '產品'
  }`
  return submission.tag || submission.tag_name || submission.label || submission.task_label || fallbackLabel
}

const getSubmissionTags = (submission) => {
  const raw = submission?.tags ?? submission?.tag ?? submission?.tag_name ?? []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  return []
}

const hierarchy = computed(() => {
  const result = new Map()
  const items = scopedSubmissions.value
  const clientQuery = clientFilter.value.trim().toLowerCase()
  const vendorQuery = vendorFilter.value.trim().toLowerCase()
  const productQuery = productFilter.value.trim().toLowerCase()
  items.forEach((submission) => {
    const clientName = submission.client_name || '客戶'
    const vendorName = submission.vendor_name || '廠家'
    const productName = submission.product_name || '產品'
    if (clientQuery && !clientName.toLowerCase().includes(clientQuery)) return
    if (vendorQuery && !vendorName.toLowerCase().includes(vendorQuery)) return
    if (productQuery && !productName.toLowerCase().includes(productQuery)) return
    const followUps = Array.isArray(submission.follow_ups) ? submission.follow_ups : []
    const filtered = followUps.filter((followUp) => matchesStatusFilter(followUp, submission))
    if (filtered.length === 0) return
    const taskLabel = getTaskLabel(submission)
    if (!result.has(clientName)) {
      result.set(clientName, new Map())
    }
    const vendorMap = result.get(clientName)
    if (!vendorMap.has(vendorName)) {
      vendorMap.set(vendorName, new Map())
    }
    const productMap = vendorMap.get(vendorName)
    if (!productMap.has(productName)) {
      productMap.set(productName, new Map())
    }
    const taskMap = productMap.get(productName)
    if (!taskMap.has(taskLabel)) {
      taskMap.set(taskLabel, {
        submission,
        followUps: [],
      })
    }
    taskMap.get(taskLabel).followUps.push(...filtered)
  })
  return Array.from(result.entries()).map(([clientName, vendorMap]) => ({
    clientName,
    vendors: Array.from(vendorMap.entries()).map(([vendorName, productMap]) => ({
      vendorName,
      products: Array.from(productMap.entries()).map(([productName, taskMap]) => ({
        productName,
        tasks: Array.from(taskMap.entries()).map(([taskLabel, taskInfo]) => ({
          taskLabel,
          submission: taskInfo.submission,
          followUps: taskInfo.followUps,
          tags: getSubmissionTags(taskInfo.submission),
        })),
      })),
    })),
  }))
})

const clientOptions = computed(() => {
  const items = scopedSubmissions.value
  const names = items.map((submission) => submission.client_name || '客戶')
  return Array.from(new Set(names)).sort()
})

const vendorOptions = computed(() => {
  const items = scopedSubmissions.value
  const names = items.map((submission) => submission.vendor_name || '廠家')
  return Array.from(new Set(names)).sort()
})

const productOptions = computed(() => {
  const items = scopedSubmissions.value
  const names = items.map((submission) => submission.product_name || '產品')
  return Array.from(new Set(names)).sort()
})

const getFilteredOptions = (options, query) => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return options
  return options.filter((item) => item.toLowerCase().includes(normalized))
}

const openFilterMenu = (menu) => {
  activeFilterMenu.value = menu
}

const closeFilterMenu = (menu) => {
  window.setTimeout(() => {
    if (activeFilterMenu.value !== menu) return
    activeFilterMenu.value = null
  }, 100)
}

const selectFilterOption = (target, value) => {
  if (target === 'client') clientFilter.value = value
  if (target === 'vendor') vendorFilter.value = value
  if (target === 'product') productFilter.value = value
  activeFilterMenu.value = null
}

const updateFollowUpStatus = async (followUp, status) => {
  const auth = readAuthStorage()
  if (!auth || !followUp) return
  const statusId = status?.id ?? null
  const response = await fetch(`${apiBaseUrl}/api/task-submission-followups/${followUp.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({ status_id: statusId }),
  })
  const data = await response.json()
  if (!response.ok || !data?.success) return
  followUp.status_id = statusId
  followUp.status_name = status?.name || ''
  followUp.status_bg_color = status?.bg_color || ''
  const user = readUserProfile()
  if (user) {
    followUp.status_updated_by = user.mail || ''
    followUp.status_updated_by_name = user.username || ''
  }
}

const updateFollowUpAssignees = async (followUp, assignees, relatedUsers = []) => {
  const auth = readAuthStorage()
  if (!auth) return
  const normalizedAssignees = normalizeAssigneeMails(assignees)
  const response = await fetch(`${apiBaseUrl}/api/task-submission-followups/${followUp.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({ assignees: normalizedAssignees }),
  })
  const data = await response.json()
  if (!response.ok || !data?.success) return
  const selected = normalizeUserOptions(relatedUsers).filter((user) =>
    assignees.includes(user.mail)
  )
  followUp.assignees = selected
}

const toggleAssignee = async (followUp, user, relatedUsers) => {
  const mail = user?.mail
  if (!mail) return
  const current = Array.isArray(followUp?.assignees) ? followUp.assignees : []
  const mails = normalizeAssigneeMails(current)
  const next = mails.includes(mail) ? mails.filter((item) => item !== mail) : [...mails, mail]
  await updateFollowUpAssignees(followUp, next, relatedUsers)
}

const toggleStatusMenu = (followUpId) => {
  statusSearch.value = ''
  const nextValue = activeStatusMenu.value === followUpId ? null : followUpId
  activeStatusMenu.value = nextValue
  if (nextValue) {
    activeAssigneeMenu.value = null
  }
}

const toggleAssigneeMenu = (followUpId) => {
  assigneeSearch.value = ''
  const nextValue = activeAssigneeMenu.value === followUpId ? null : followUpId
  activeAssigneeMenu.value = nextValue
  if (nextValue) {
    activeStatusMenu.value = null
  }
}

const isAssigneeSelected = (followUp, mail) => {
  if (!mail) return false
  const normalizedMail = String(mail).trim().toLowerCase()
  return normalizeAssigneeMails(followUp?.assignees).some(
    (assignee) => assignee.trim().toLowerCase() === normalizedMail
  )
}

const filteredStatuses = computed(() => {
  const query = statusSearch.value.trim().toLowerCase()
  if (!query) return followUpStatuses.value
  return followUpStatuses.value.filter((status) => status.name.toLowerCase().includes(query))
})

const getFilteredRelatedUsers = (submission) => {
  const relatedUsers = Array.isArray(submission?.related_users) ? submission.related_users : []
  return filterUserOptions(relatedUsers, assigneeSearch.value)
}

const getAssigneeButtonText = (followUp) => {
  const assignees = followUp?.assignees || []
  if (assignees.length === 0) return '選擇跟進人'
  if (assignees.length > 1) {
    const names = assignees.map((user) => user.username || 'user').filter(Boolean)
    return names.length > 0 ? names.join('、') : '選擇跟進人'
  }
  const names = assignees.map((user) => user.username || user.mail).filter(Boolean)
  return names.length > 0 ? names.join('、') : '選擇跟進人'
}

const handleSelectFollowUp = (submission) => {
  const dateKey = toDateKey(submission?.end_at)
  if (!dateKey) return
  emit('select-date', dateKey)
  emit('close')
}

const handleOutsideMenuClick = (event) => {
  if (!activeStatusMenu.value && !activeAssigneeMenu.value) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.status-select') || target.closest('.assignee-select')) return
  activeStatusMenu.value = null
  activeAssigneeMenu.value = null
}

onMounted(() => {
  window.addEventListener('click', handleOutsideMenuClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleOutsideMenuClick)
})
</script>

<template>
  <div v-if="open" class="followup-modal">
    <div class="followup-modal-backdrop" @click="emit('close')"></div>
    <div class="followup-modal-card">
      <header class="followup-modal-header">
        <div>
          <p class="followup-modal-eyebrow">跟進任務總覽</p>
          <h3 class="followup-modal-title">{{ title }}</h3>
        </div>
        <button type="button" class="followup-modal-close" @click="emit('close')">✕</button>
      </header>
      <div class="followup-modal-filters">
        <label class="followup-filter-field">
          <span class="followup-filter-label">客戶</span>
          <input
            v-model="clientFilter"
            class="followup-filter-input"
            type="text"
            placeholder="搜尋客戶"
            @focus="openFilterMenu('client')"
            @input="openFilterMenu('client')"
            @blur="closeFilterMenu('client')"
          />
          <div
            v-if="activeFilterMenu === 'client'"
            class="followup-filter-menu"
          >
            <button
              v-for="option in getFilteredOptions(clientOptions, clientFilter)"
              :key="option"
              type="button"
              class="followup-filter-option"
              @mousedown.prevent="selectFilterOption('client', option)"
            >
              {{ option }}
            </button>
          </div>
        </label>
        <label class="followup-filter-field">
          <span class="followup-filter-label">廠家</span>
          <input
            v-model="vendorFilter"
            class="followup-filter-input"
            type="text"
            placeholder="搜尋廠家"
            @focus="openFilterMenu('vendor')"
            @input="openFilterMenu('vendor')"
            @blur="closeFilterMenu('vendor')"
          />
          <div
            v-if="activeFilterMenu === 'vendor'"
            class="followup-filter-menu"
          >
            <button
              v-for="option in getFilteredOptions(vendorOptions, vendorFilter)"
              :key="option"
              type="button"
              class="followup-filter-option"
              @mousedown.prevent="selectFilterOption('vendor', option)"
            >
              {{ option }}
            </button>
          </div>
        </label>
        <label class="followup-filter-field">
          <span class="followup-filter-label">廠家產品</span>
          <input
            v-model="productFilter"
            class="followup-filter-input"
            type="text"
            placeholder="搜尋產品"
            @focus="openFilterMenu('product')"
            @input="openFilterMenu('product')"
            @blur="closeFilterMenu('product')"
          />
          <div
            v-if="activeFilterMenu === 'product'"
            class="followup-filter-menu"
          >
            <button
              v-for="option in getFilteredOptions(productOptions, productFilter)"
              :key="option"
              type="button"
              class="followup-filter-option"
              @mousedown.prevent="selectFilterOption('product', option)"
            >
              {{ option }}
            </button>
          </div>
        </label>
      </div>
      <div v-if="isLoading" class="followup-modal-empty">載入狀態中...</div>
      <div v-else-if="hierarchy.length === 0" class="followup-modal-empty">目前沒有符合條件的跟進任務。</div>
      <div v-else class="followup-modal-body">
        <template v-for="client in hierarchy" :key="client.clientName">
          <template v-for="vendor in client.vendors" :key="vendor.vendorName">
            <template v-for="product in vendor.products" :key="product.productName">
              <div v-for="task in product.tasks" :key="task.taskLabel" class="followup-task">
                <div class="followup-task-header">
                  <button
                    type="button"
                    class="followup-task-title"
                    @click="handleSelectFollowUp(task.submission)"
                  >
                    {{ task.taskLabel }}
                  </button>
                  <span v-if="task.tags?.length" class="followup-task-tags">
                    <span
                      v-for="tag in task.tags"
                      :key="tag"
                      class="followup-task-tag"
                    >
                      {{ tag }}
                    </span>
                  </span>
                  <span class="followup-task-meta">
                    結束時間：{{ formatDateTimeDisplay(task.submission.end_at) }}
                  </span>
                </div>
                <div class="followup-list">
                  <div
                    v-for="followUp in task.followUps"
                    :key="followUp.id || followUp.content"
                    class="followup-item"
                  >
                    <div class="followup-item-content">
                      {{ followUp.content || '跟進任務' }}
                    </div>
                    <div class="followup-item-meta">
                      <div class="followup-actions">
                        <div class="status-select">
                          <button
                            type="button"
                            class="status-select-button"
                            @click="toggleStatusMenu(followUp.id)"
                          >
                            <span
                              v-if="followUp.status_bg_color"
                              class="status-dot"
                              :style="{ backgroundColor: followUp.status_bg_color }"
                            ></span>
                            {{ followUp.status_name || '選擇狀態' }}
                          </button>
                          <div v-if="activeStatusMenu === followUp.id" class="status-menu">
                            <input
                              v-model="statusSearch"
                              class="status-search"
                              type="text"
                              placeholder="搜尋狀態"
                            />
                            <button
                              v-for="status in filteredStatuses"
                              :key="status.id"
                              type="button"
                              class="status-item"
                              @click="
                                updateFollowUpStatus(followUp, status);
                                activeStatusMenu = null
                              "
                            >
                              <span
                                class="status-dot"
                                :style="{ backgroundColor: status.bg_color || '#e2e8f0' }"
                              ></span>
                              {{ status.name }}
                            </button>
                          </div>
                        </div>
                        <div class="assignee-select">
                          <button
                            type="button"
                            class="select-field"
                            @click="toggleAssigneeMenu(followUp.id)"
                          >
                            {{ getAssigneeButtonText(followUp) }}
                          </button>
                          <div v-if="activeAssigneeMenu === followUp.id" class="option-list">
                            <input
                              v-model="assigneeSearch"
                              class="option-search"
                              type="text"
                              placeholder="搜尋用戶"
                            />
                            <UserOptionItem
                              v-for="user in getFilteredRelatedUsers(task.submission)"
                              :key="user.mail"
                              :user="user"
                              :selected="isAssigneeSelected(followUp, user.mail)"
                              @select="toggleAssignee(followUp, user, task.submission.related_users || [])"
                            />
                          </div>
                        </div>
                      </div>
                      <div class="followup-meta-block">
                        <span class="followup-meta-label">結束時間</span>
                        <span class="followup-meta-value">{{ formatDateTimeDisplay(task.submission.end_at) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.followup-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
}

.followup-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
}

.followup-modal-card {
  position: relative;
  background: #fff;
  border-radius: 24px;
  padding: 1.8rem;
  width: min(1100px, 92vw);
  height: 90vh;
  max-height: 90vh;
  overflow: auto;
  padding-right: 2.2rem;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
  display: grid;
  gap: 1.5rem;
  align-content: start;
  align-items: start;
}

.followup-modal-card::-webkit-scrollbar {
  width: 8px;
}

.followup-modal-card::-webkit-scrollbar-track {
  background: rgba(148, 163, 184, 0.2);
  border-radius: 24px;
}

.followup-modal-card::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #111827, #334155);
  border-radius: 24px;
}

.followup-modal-card::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #1f2937, #475569);
}

.followup-modal-card {
  scrollbar-color: #1f2937 rgba(148, 163, 184, 0.2);
  scrollbar-width: thin;
}

.followup-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.followup-modal-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.8rem;
}

.followup-filter-field {
  position: relative;
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #475569;
}

.followup-filter-label {
  font-weight: 600;
}

.followup-filter-input {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.45rem 0.75rem;
  font-size: 0.9rem;
  color: #0f172a;
  background: #fff;
}

.followup-filter-input:focus {
  outline: 2px solid rgba(59, 130, 246, 0.4);
  border-color: #3b82f6;
}

.followup-filter-menu {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  max-height: 220px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  padding: 0.3rem;
  z-index: 5;
}

.followup-filter-option {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  color: #0f172a;
  font-size: 0.9rem;
  cursor: pointer;
}

.followup-filter-option:hover {
  background: #f1f5f9;
}

.followup-modal-eyebrow {
  margin: 0;
  color: #94a3b8;
  font-size: 0.75rem;
}

.followup-modal-title {
  margin: 0.3rem 0 0;
  font-size: 1.25rem;
  color: #0f172a;
}

.followup-modal-close {
  border: none;
  background: #f1f5f9;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 1rem;
}

.followup-modal-empty {
  color: #64748b;
  text-align: center;
  padding: 2rem 0;
}

.followup-modal-body {
  display: grid;
  gap: 1rem;
}

.followup-task {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1rem 1.2rem;
  display: grid;
  gap: 0.8rem;
  background: #f8fafc;
  margin-bottom: 1rem;
}

.followup-task:last-child {
  margin-bottom: 0;
}

.followup-task-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.3rem;
}

.followup-task-title {
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  cursor: pointer;
}

.followup-task-title:hover {
  text-decoration: underline;
}

.followup-task-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.followup-task-tag {
  font-size: 0.85rem;
  font-weight: 600;
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
}

.followup-task-meta {
  color: #64748b;
  font-size: 0.85rem;
  margin-left: auto;
}

.followup-list {
  display: grid;
  gap: 0.8rem;
}

.followup-item {
  border-radius: 12px;
  background: #f8fafc;
  padding: 0.8rem;
  display: grid;
  gap: 0.8rem;
}

.followup-item-content {
  border: none;
  background: transparent;
  text-align: left;
  font-weight: 600;
  color: #0f172a;
}

.followup-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  align-items: flex-start;
}

.followup-meta-block {
  display: grid;
  gap: 0.35rem;
}

.followup-meta-label {
  font-size: 0.75rem;
  color: #94a3b8;
}

.followup-meta-value {
  font-size: 0.85rem;
  color: #1f2937;
}

.followup-actions {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  flex-wrap: wrap;
  flex: 1;
}

.status-select {
  position: relative;
  min-width: 160px;
}

.status-select-button {
  width: 100%;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  color: #0f172a;
}

.status-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 10;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
  padding: 0.6rem;
  width: 200px;
  display: grid;
  gap: 0.4rem;
}

.status-search {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
}

.status-item {
  border: none;
  background: #f8fafc;
  border-radius: 10px;
  padding: 0.35rem 0.6rem;
  text-align: left;
  cursor: pointer;
  font-size: 0.85rem;
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.assignee-select {
  position: relative;
  min-width: 220px;
  flex: 1;
}

.select-field {
  width: 100%;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  color: #0f172a;
}

.option-list {
  position: absolute;
  top: calc(100% + 0.4rem);
  left: 0;
  right: 0;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 0.4rem;
  display: grid;
  gap: 0.3rem;
  max-height: 180px;
  overflow: auto;
  z-index: 10;
  box-shadow: 0 18px 30px rgba(15, 23, 42, 0.12);
}

.option-search {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  background: #fff;
}

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
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}
</style>
