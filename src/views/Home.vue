<script setup>
import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from 'vue'
import WorkspaceSidebar from '../components/WorkspaceSidebar.vue'
import MonthlyCalendar from '../components/MonthlyCalendar.vue'
import FollowUpSummaryModal from '../components/FollowUpSummaryModal.vue'
import UserOptionItem from '../components/UserOptionItem.vue'
import { formatDateTimeDisplay, toDateKey, getTaipeiTodayKey } from '../scripts/time.js'
import { apiBaseUrl } from '../scripts/apiBaseUrl.js'
import { countPendingFollowUps } from '../scripts/followUps.js'
import { filterUserOptions, normalizeUserOptions } from '../scripts/user-options/index.js'
import {
  buildFollowUpItems,
  buildStatusNameById,
  buildSummaryCounts,
  getUserSubmissions,
} from '../scripts/dashboardData.js'

const router = getCurrentInstance().appContext.config.globalProperties.$router
const username = ref('hi')
const activePath = computed(() => router?.currentRoute?.value?.path || '')
const submissions = ref([])
const followUpStatuses = ref([])
const selectedDate = ref(getTaipeiTodayKey())
const activeStatusMenu = ref(null)
const statusSearch = ref('')
const statusModalOpen = ref(false)
const statusInput = ref('')
const statusColor = ref('#fde68a')
const defaultStatusColors = ['#fca5a5', '#fde68a', '#86efac']
const showColorPicker = ref(false)
const statusMessage = ref('')
const statusMessageType = ref('')
const isTimelineLoading = ref(false)
const assigneeSearch = ref('')
const activeAssigneeMenu = ref(null)
const summaryModalOpen = ref(false)
const summaryModalFilter = ref('all')
const summaryModalTitle = ref('任務總數')
const connectionStatus = ref({
  backend: null,
  mysql: null,
  dify: null,
})

const goToNewTask = () => {
  router?.push('/tasks/new')
}

const goToTaskList = () => {
  router?.push('/tasks/view')
}

const goToMeetingRecords = () => {
  router?.push('/meetings')
}
const goToUserDashboard = () => {
  router?.push('/users/dashboard')
}

const goToHome = () => {
  router?.push('/home')
}

const goToProfile = () => {
  router?.push('/settings')
}

const loadUser = () => {
  const raw = window.localStorage.getItem('innerai_user')
  if (!raw) return
  try {
    const user = JSON.parse(raw)
    username.value = user.username || 'hi'
  } catch {
    // ignore
  }
}

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

const readUserMail = () => {
  const raw = window.localStorage.getItem('innerai_user')
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    return data?.mail || null
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

const getStatusClass = (value) => {
  if (value === true) return 'status-ok'
  if (value === false) return 'status-fail'
  return 'status-pending'
}

const readConnectionStatusKey = () => {
  const mail = readUserMail() || 'guest'
  return `innerai_connection_status_${mail}`
}

const loadStoredConnectionStatus = () => {
  const key = readConnectionStatusKey()
  const raw = window.localStorage.getItem(key)
  if (!raw) return false
  try {
    const data = JSON.parse(raw)
    connectionStatus.value = {
      backend: data?.backend ?? null,
      mysql: data?.mysql ?? null,
      dify: data?.dify ?? null,
    }
    return true
  } catch {
    return false
  }
}

const storeConnectionStatus = (data) => {
  const key = readConnectionStatusKey()
  window.localStorage.setItem(key, JSON.stringify(data))
}

const pingConnections = async () => {
  try {
    const response = await fetch(`${apiBaseUrl}/api/health`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.success) {
      connectionStatus.value = { backend: false, mysql: false, dify: false }
      storeConnectionStatus(connectionStatus.value)
      return
    }
    const nextStatus = {
      backend: Boolean(data?.data?.backend),
      mysql: Boolean(data?.data?.mysql),
      dify: Boolean(data?.data?.dify),
    }
    connectionStatus.value = nextStatus
    storeConnectionStatus(nextStatus)
  } catch (error) {
    console.error(error)
    const fallback = { backend: false, mysql: false, dify: false }
    connectionStatus.value = fallback
    storeConnectionStatus(fallback)
  }
}

const ensureConnectionStatus = async () => {
  const auth = readAuthStorage()
  if (!auth) return
  loadStoredConnectionStatus()
  await pingConnections()
}

const fetchSubmissions = async () => {
  const auth = readAuthStorage()
  if (!auth) return
  isTimelineLoading.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/task-submissions`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await response.json()
    if (!response.ok || !data?.success) return
    submissions.value = data.data || []
  } catch (error) {
    console.error(error)
  } finally {
    isTimelineLoading.value = false
  }
}

const fetchStatuses = async () => {
  const auth = readAuthStorage()
  if (!auth) return
  try {
    const response = await fetch(`${apiBaseUrl}/api/follow-up-statuses`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await response.json()
    if (!response.ok || !data?.success) return
    followUpStatuses.value = data.data || []
  } catch (error) {
    console.error(error)
  }
}

const timelineItems = computed(() => {
  const mail = readUserMail()
  if (!mail) return []
  return submissions.value
    .filter((item) => {
      const relatedUsers = Array.isArray(item?.related_users) ? item.related_users : []
      if (!relatedUsers.some((user) => user.mail === mail)) return false
      return toDateKey(item.end_at) === selectedDate.value
    })
    .sort((a, b) => String(a.end_at || '').localeCompare(String(b.end_at || '')))
})

const getSubmissionTags = (item) => {
  const raw = item?.tags ?? item?.tag ?? []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  return []
}

const formatTimeOnly = (value) => {
  const formatted = formatDateTimeDisplay(value)
  if (!formatted) return ''
  const parts = formatted.split(' ')
  return parts.length > 1 ? parts[1].slice(0, 5) : formatted
}

const timelineTitle = computed(() => {
  const date = selectedDate.value
  if (!date) return ''
  const [year, month, day] = date.split('-')
  if (!year || !month || !day) return ''
  return `${year}年${month}月${day}日`
})

const pendingFollowUpCount = computed(() => countPendingFollowUps(timelineItems.value))
const hasTimelineFollowUps = computed(() =>
  timelineItems.value.some(
    (item) => Array.isArray(item?.follow_ups) && item.follow_ups.length > 0
  )
)
const isSelectedDatePast = computed(
  () => selectedDate.value && selectedDate.value < getTaipeiTodayKey()
)
const pendingBadge = computed(() => {
  if (pendingFollowUpCount.value === 0) {
    if (!hasTimelineFollowUps.value) {
      return { text: '無任務', className: 'panel-badge-empty' }
    }
    return { text: '已完成', className: 'panel-badge-complete' }
  }
  if (isSelectedDatePast.value) {
    return { text: `${pendingFollowUpCount.value} 未完成`, className: 'panel-badge-overdue' }
  }
  return { text: `待處理 ${pendingFollowUpCount.value}`, className: 'panel-badge-pending' }
})

const userSubmissions = computed(() => getUserSubmissions(submissions.value, readUserMail()))

const statusNameById = computed(() => buildStatusNameById(followUpStatuses.value))

const followUpItems = computed(() =>
  buildFollowUpItems(userSubmissions.value, statusNameById.value)
)

const summaryCounts = computed(() => buildSummaryCounts(followUpItems.value, new Date()))
const totalCount = computed(() => summaryCounts.value.totalCount)
const completedCount = computed(() => summaryCounts.value.completedCount)
const incompleteCount = computed(() => summaryCounts.value.incompleteCount)
const inProgressCount = computed(() => summaryCounts.value.inProgressCount)
const unassignedCount = computed(() => summaryCounts.value.unassignedCount)

const openSummaryModal = (filter, title) => {
  summaryModalFilter.value = filter
  summaryModalTitle.value = title
  summaryModalOpen.value = true
}

const closeSummaryModal = () => {
  summaryModalOpen.value = false
}

const handleSummarySelectDate = (dateKey) => {
  if (!dateKey) return
  selectedDate.value = dateKey
}

const updateFollowUpStatus = async (followUp, status) => {
  const auth = readAuthStorage()
  if (!auth) return
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
  const response = await fetch(`${apiBaseUrl}/api/task-submission-followups/${followUp.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({ assignees }),
  })
  const data = await response.json()
  if (!response.ok || !data?.success) return
  const selected = normalizeUserOptions(relatedUsers).filter((user) =>
    assignees.includes(user.mail)
  )
  followUp.assignees = selected
}

const handleSelectDate = (dateKey) => {
  selectedDate.value = dateKey
}

const toggleStatusMenu = (followUpId) => {
  activeStatusMenu.value = activeStatusMenu.value === followUpId ? null : followUpId
  statusSearch.value = ''
}

const toggleAssigneeMenu = (followUpId) => {
  activeAssigneeMenu.value = activeAssigneeMenu.value === followUpId ? null : followUpId
  assigneeSearch.value = ''
}

const handleTimelineOutsideClick = (event) => {
  if (!activeStatusMenu.value && !activeAssigneeMenu.value) return
  const target = event.target
  if (!(target instanceof Element)) return
  const withinStatusMenu = target.closest('.status-menu')
  const withinStatusSelect = target.closest('.status-select')
  const withinAssigneeMenu = target.closest('.option-list')
  const withinAssigneeSelect = target.closest('.assignee-select')
  if (activeStatusMenu.value && !withinStatusMenu && !withinStatusSelect) {
    activeStatusMenu.value = null
  }
  if (activeAssigneeMenu.value && !withinAssigneeMenu && !withinAssigneeSelect) {
    activeAssigneeMenu.value = null
  }
}

const isAssigneeSelected = (followUp, mail) =>
  Array.isArray(followUp?.assignees) && followUp.assignees.some((user) => user.mail === mail)

const toggleAssignee = async (followUp, user, relatedUsers) => {
  const mail = user?.mail
  if (!mail) return
  const current = Array.isArray(followUp?.assignees) ? followUp.assignees : []
  const mails = current.map((assignee) => assignee.mail)
  const next = mails.includes(mail)
    ? mails.filter((item) => item !== mail)
    : [...mails, mail]
  await updateFollowUpAssignees(followUp, next, relatedUsers)
}

const filteredStatuses = computed(() => {
  const query = statusSearch.value.trim().toLowerCase()
  if (!query) return followUpStatuses.value
  return followUpStatuses.value.filter((status) => status.name.toLowerCase().includes(query))
})

const getFilteredRelatedUsers = (item) => {
  const relatedUsers = Array.isArray(item?.related_users) ? item.related_users : []
  return filterUserOptions(relatedUsers, assigneeSearch.value)
}

const getAssigneeButtonText = (followUp) => {
  const assignees = followUp?.assignees || []
  if (assignees.length === 0) return '選擇跟進人'
  if (assignees.length > 1) {
    const names = assignees
      .map((user) => user.username || 'user')
      .filter(Boolean)
    return names.length > 0 ? names.join('、') : '選擇跟進人'
  }
  const names = assignees.map((user) => user.username || user.mail).filter(Boolean)
  return names.length > 0 ? names.join('、') : '選擇跟進人'
}

const openStatusModal = () => {
  statusModalOpen.value = true
  statusInput.value = ''
  statusColor.value = '#fde68a'
  showColorPicker.value = false
  statusMessage.value = ''
  statusMessageType.value = ''
}

const closeStatusModal = () => {
  statusModalOpen.value = false
  statusInput.value = ''
  statusColor.value = '#fde68a'
  showColorPicker.value = false
  statusMessage.value = ''
  statusMessageType.value = ''
}

const addStatus = async () => {
  const name = statusInput.value.trim()
  if (!name) return
  const auth = readAuthStorage()
  if (!auth) return
  try {
    const response = await fetch(`${apiBaseUrl}/api/follow-up-statuses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ name, bg_color: statusColor.value }),
    })
    const data = await response.json()
    if (!response.ok || !data?.success) {
      statusMessage.value = data?.message || '新增失敗'
      statusMessageType.value = 'error'
      return
    }
    followUpStatuses.value = [...followUpStatuses.value, data.data]
    statusMessage.value = `"${data.data.name}" 新增成功`
    statusMessageType.value = 'success'
    statusInput.value = ''
    statusColor.value = '#fde68a'
    showColorPicker.value = false
  } catch (error) {
    console.error(error)
    statusMessage.value = '新增失敗'
    statusMessageType.value = 'error'
  }
}

const deleteStatus = async (status) => {
  const auth = readAuthStorage()
  if (!auth) return
  try {
    const response = await fetch(`${apiBaseUrl}/api/follow-up-statuses/${status.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    })
    const data = await response.json()
    if (!response.ok || !data?.success) {
      statusMessage.value = data?.message || '刪除失敗'
      statusMessageType.value = 'error'
      return
    }
    followUpStatuses.value = followUpStatuses.value.filter((item) => item.id !== status.id)
    statusMessage.value = `"${status.name}" 已刪除`
    statusMessageType.value = 'success'
  } catch (error) {
    console.error(error)
    statusMessage.value = '刪除失敗'
    statusMessageType.value = 'error'
  }
}

onMounted(() => {
  loadUser()
  fetchSubmissions()
  fetchStatuses()
  ensureConnectionStatus()
  document.addEventListener('click', handleTimelineOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleTimelineOutsideClick)
})
</script>

<template>
  <div class="home-page">
    <WorkspaceSidebar
      :on-create-task="goToNewTask"
      :on-view-tasks="goToTaskList"
      :on-view-meetings="goToMeetingRecords"
      :on-view-user-dashboard="goToUserDashboard"
      :on-go-home="goToHome"
      :on-go-profile="goToProfile"
      :active-path="activePath"
    />

    <main class="home-content">
      <header class="home-header">
        <div>
          <p class="eyebrow">工作面板</p>
          <h1 class="headline">{{ username }}的工作面板</h1>
          <p class="subhead">快速掌握正在推進的項目、待辦與今日跟進事項。</p>
        </div>
        <div class="connection-status">
          <p class="connection-title">連線狀況</p>
          <div class="connection-items">
            <span class="connection-item" :class="getStatusClass(connectionStatus.backend)">
              後端
              <span class="status-ring" :class="getStatusClass(connectionStatus.backend)">
                <span class="status-dot" :class="getStatusClass(connectionStatus.backend)"></span>
              </span>
            </span>
            <span class="connection-item" :class="getStatusClass(connectionStatus.mysql)">
              數據庫
              <span class="status-ring" :class="getStatusClass(connectionStatus.mysql)">
                <span class="status-dot" :class="getStatusClass(connectionStatus.mysql)"></span>
              </span>
            </span>
            <span class="connection-item" :class="getStatusClass(connectionStatus.dify)">
              AI服務
              <span class="status-ring" :class="getStatusClass(connectionStatus.dify)">
                <span class="status-dot" :class="getStatusClass(connectionStatus.dify)"></span>
              </span>
            </span>
          </div>
        </div>
      </header>

      <section class="summary-grid">
        <button
          type="button"
          class="summary-card summary-card-button"
          @click="openSummaryModal('all', '任務總數')"
        >
          <p class="card-label">任務總數</p>
          <p class="card-value">{{ totalCount }}</p>
          <p class="card-meta">目前所有跟進任務</p>
        </button>
        <button
          type="button"
          class="summary-card summary-card-success summary-card-button"
          @click="openSummaryModal('completed', '已完成')"
        >
          <p class="card-label">已完成</p>
          <p class="card-value">{{ completedCount }}</p>
          <p class="card-meta">已完成的跟進數量</p>
        </button>
        <button
          type="button"
          class="summary-card summary-card-warning summary-card-button"
          @click="openSummaryModal('in_progress', '進行中')"
        >
          <p class="card-label">進行中</p>
          <p class="card-value">{{ inProgressCount }}</p>
          <p class="card-meta">未完成與已完成以外狀態</p>
        </button>
        <button
          type="button"
          class="summary-card summary-card-warning summary-card-button"
          @click="openSummaryModal('unassigned', '未指派')"
        >
          <p class="card-label">未指派</p>
          <p class="card-value">{{ unassignedCount }}</p>
          <p class="card-meta">尚未安排跟進人</p>
        </button>
        <button
          type="button"
          class="summary-card summary-card-danger summary-card-button"
          @click="openSummaryModal('incomplete', '未完成')"
        >
          <p class="card-label">未完成</p>
          <p class="card-value">{{ incompleteCount }}</p>
          <p class="card-meta">標記為未完成的跟進</p>
        </button>
      </section>

      <FollowUpSummaryModal
        :open="summaryModalOpen"
        :title="summaryModalTitle"
        :status-filter="summaryModalFilter"
        :submissions="userSubmissions"
        :include-overdue-incomplete="true"
        :reference-date="new Date()"
        @close="closeSummaryModal"
        @select-date="handleSummarySelectDate"
      />

      <section class="content-grid">
        <article class="panel wide">
          <header class="panel-header">
            <div class="panel-title-row">
              <h2>{{ timelineTitle }}</h2>
              <span class="panel-badge" :class="pendingBadge.className">
                {{ pendingBadge.text }}
              </span>
            </div>
            <p>依時間快速檢視選取日期需要跟進的項目。</p>
          </header>
          <div class="timeline">
            <p v-if="isTimelineLoading" class="timeline-empty">載入中...</p>
            <p v-else-if="timelineItems.length === 0" class="timeline-empty">
              此日期沒有需要跟進的任務。
            </p>
            <div v-else class="timeline-list">
              <div v-for="item in timelineItems" :key="item.id" class="time-row">
                <span class="time">{{ formatTimeOnly(item.end_at) }}</span>
                <div class="time-card">
                  <div class="time-card-header">
                    <h3 class="time-card-title">
                      {{ item.client_name }}_{{ item.vendor_name }}_{{ item.product_name }}
                    </h3>
                    <span v-if="getSubmissionTags(item).length" class="time-card-tags">
                      <span
                        v-for="tag in getSubmissionTags(item)"
                        :key="tag"
                        class="time-card-tag"
                      >
                        {{ tag }}
                      </span>
                    </span>
                  </div>
                  <div v-if="item.follow_ups?.length" class="follow-up-list">
                    <div
                      v-for="(follow, index) in item.follow_ups"
                      :key="follow.id"
                      class="followup-item"
                    >
                      <div class="followup-item-content">
                        <span class="follow-up-index">{{ index + 1 }}.</span>
                        <span class="follow-up-text">{{ follow.content }}</span>
                      </div>
                      <div class="followup-item-meta">
                        <div class="followup-meta-group">
                          <span class="meta-label">跟進人</span>
                          <span class="meta-value">
                            {{
                              follow.assignees?.length
                                ? follow.assignees.map((user) => user.username).join('、')
                                : '未指派'
                            }}
                          </span>
                        </div>
                        <div class="followup-meta-group">
                          <span class="meta-label">狀態修改者</span>
                          <span class="meta-value">
                            {{ follow.status_updated_by_name || follow.status_updated_by || '尚未更新' }}
                          </span>
                        </div>
                        <div class="status-select">
                          <button
                            type="button"
                            class="status-select-button"
                            @click="toggleStatusMenu(follow.id)"
                          >
                            <span
                              v-if="follow.status_bg_color"
                              class="status-dot"
                              :style="{ backgroundColor: follow.status_bg_color }"
                            ></span>
                            {{ follow.status_name || '選擇狀態' }}
                          </button>
                          <div v-if="activeStatusMenu === follow.id" class="status-menu">
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
                                updateFollowUpStatus(follow, status);
                                activeStatusMenu = null
                              "
                            >
                              <span
                                class="status-dot"
                                :style="{ backgroundColor: status.bg_color || '#e2e8f0' }"
                              ></span>
                              {{ status.name }}
                            </button>
                            <button
                              type="button"
                              class="status-item more"
                              @click="
                                activeStatusMenu = null;
                                openStatusModal()
                              "
                            >
                              更多
                            </button>
                          </div>
                        </div>
                        <div class="assignee-select">
                          <button
                            type="button"
                            class="select-field"
                            @click="toggleAssigneeMenu(follow.id)"
                          >
                            {{ getAssigneeButtonText(follow) }}
                          </button>
                          <div v-if="activeAssigneeMenu === follow.id" class="option-list">
                            <input
                              v-model="assigneeSearch"
                              class="option-search"
                              type="text"
                              placeholder="搜尋用戶"
                            />
                            <UserOptionItem
                              v-for="user in getFilteredRelatedUsers(item)"
                              :key="user.mail"
                              :user="user"
                              :selected="isAssigneeSelected(follow, user.mail)"
                              @select="toggleAssignee(follow, user, item.related_users)"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p v-else class="timeline-note">無任務</p>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article class="panel wide">
          <MonthlyCalendar
            :selected-date="selectedDate"
            :submissions="userSubmissions"
            @select-date="handleSelectDate"
          />
        </article>
      </section>
    </main>

    <div v-if="statusModalOpen" class="modal-overlay" @click.self="closeStatusModal">
      <div class="modal-card">
        <h2>編輯跟進狀態</h2>
        <p>新增或刪除可用的狀態選項。</p>
        <div class="modal-list">
          <div v-for="status in followUpStatuses" :key="status.id" class="modal-list-item">
            <div class="modal-status">
              <span
                class="status-dot"
                :style="{ backgroundColor: status.bg_color || '#e2e8f0' }"
              ></span>
              <span>{{ status.name }}</span>
            </div>
            <div class="modal-actions-inline">
              <button type="button" class="danger-text" @click="deleteStatus(status)">刪除</button>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <input v-model="statusInput" type="text" placeholder="狀態名稱" />
          <div class="color-picker-row">
            <div class="color-swatches">
              <button
                v-for="color in defaultStatusColors"
                :key="color"
                type="button"
                class="color-swatch"
                :style="{ backgroundColor: color }"
                @click="statusColor = color"
              ></button>
              <button
                type="button"
                class="color-swatch add-swatch"
                @click="showColorPicker = !showColorPicker"
              >
                +
              </button>
            </div>
            <input
              v-if="showColorPicker"
              v-model="statusColor"
              type="color"
              class="color-input"
            />
          </div>
          <button type="button" class="primary-button" @click="addStatus">新增</button>
        </div>
        <p v-if="statusMessage" :class="['modal-message', statusMessageType]">
          {{ statusMessage }}
        </p>
        <div class="modal-actions">
          <button type="button" class="ghost-button" @click="closeStatusModal">關閉</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  background: #f6f7fb;
  color: #0f172a;
}

.home-content {
  padding: 3.5rem 6vw 4.5rem calc(6vw + 88px);
  background: #f6f7fb;
  color: #0f172a;
  display: grid;
  gap: 2.5rem;
}

.home-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 2rem;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
}

.headline {
  margin: 0.4rem 0;
  font-size: 2.4rem;
  font-weight: 600;
}

.subhead {
  margin: 0;
  color: #64748b;
  max-width: 520px;
}

.connection-status {
  display: grid;
  justify-items: end;
  gap: 0.35rem;
  text-align: right;
}

.connection-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
}

.connection-items {
  display: flex;
  gap: 1rem;
}

.connection-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid transparent;
  background: #e2e8f0;
  font-size: 0.8rem;
  color: #475569;
  font-weight: 600;
}

.connection-item.status-ok {
  background: #dcfce7;
  border-color: #bbf7d0;
}

.connection-item.status-fail {
  background: #fee2e2;
  border-color: #fecaca;
}

.connection-item.status-pending {
  background: #fef9c3;
  border-color: #fef3c7;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #e2e8f0;
  display: inline-block;
}

.status-dot.status-ok {
  background: #22c55e;
}

.status-dot.status-fail {
  background: #ef4444;
}

.status-dot.status-pending {
  background: #facc15;
}

.ghost-button {
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 0.75rem 1.4rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
  color: #475569;
}

.primary-button {
  border: none;
  background: #111827;
  color: #fff;
  padding: 0.75rem 1.6rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.5rem;
}

.summary-card {
  background: #fff;
  border-radius: 20px;
  padding: 1.4rem 1.6rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.summary-card-button {
  border: none;
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.summary-card-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
}

.summary-card-button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 4px;
}

.summary-card-success {
  background: #dcfce7;
  color: #166534;
}

.summary-card-warning {
  background: #fef3c7;
  color: #92400e;
}

.summary-card-danger {
  background: #fee2e2;
  color: #b91c1c;
}

.summary-card-success .card-label,
.summary-card-warning .card-label,
.summary-card-danger .card-label,
.summary-card-success .card-meta,
.summary-card-warning .card-meta,
.summary-card-danger .card-meta {
  color: currentColor;
  opacity: 0.75;
}

.summary-card-success .card-value,
.summary-card-warning .card-value,
.summary-card-danger .card-value {
  color: currentColor;
}

.card-label {
  color: #94a3b8;
  font-size: 0.85rem;
  margin: 0;
}

.card-value {
  font-size: 2rem;
  font-weight: 600;
  margin: 0.6rem 0;
}

.card-meta {
  color: #64748b;
  margin: 0;
}

.content-grid {
  display: flex;
  gap: 1.5rem;
  width: 100%;
}

.content-grid > .panel {
  flex: 1 1 0;
}

.panel {
  background: #fff;
  border-radius: 24px;
  padding: 2rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}

.panel.wide {
  grid-column: 1 / -1;
}

.panel-header h2 {
  margin: 0;
  font-size: 1.35rem;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.panel-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.panel-badge-pending {
  background: #fef3c7;
  color: #92400e;
}

.panel-badge-overdue {
  background: #fee2e2;
  color: #b91c1c;
}

.panel-badge-complete {
  background: #dcfce7;
  color: #166534;
}

.panel-badge-empty {
  background: #f1f5f9;
  color: #94a3b8;
}

.panel-header p {
  margin: 0.4rem 0 0;
  color: #64748b;
}

.timeline {
  display: grid;
  gap: 1.2rem;
  overflow-x: auto;
}

.timeline-list {
  display: grid;
  gap: 1rem;
}

.time-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.time {
  font-weight: 600;
  color: #475569;
}

.time-card {
  padding: 1rem 1.2rem;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.time-card.highlight {
  background: #eef2ff;
  border-color: #c7d2fe;
}

.time-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.3rem;
}

.time-card-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.time-card-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.time-card-tag {
  font-size: 0.85rem;
  font-weight: 600;
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
}

.time-card p {
  margin: 0;
  color: #64748b;
}

.timeline-empty {
  margin: 0;
  color: #94a3b8;
  font-size: 0.9rem;
}

.follow-up-list {
  margin-top: 0.6rem;
  display: grid;
  gap: 0.5rem;
}

.followup-item {
  border-radius: 12px;
  padding: 0.8rem;
  display: grid;
  gap: 0.6rem;
}

.followup-item-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
}

.followup-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  align-items: center;
}

.followup-meta-group {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #94a3b8;
}

.follow-up-text {
  color: #0f172a;
  font-size: 0.9rem;
  white-space: nowrap;
}

.time-card {
  overflow-x: auto;
}

.follow-up-index {
  font-weight: 600;
  color: #64748b;
}

.meta-label {
  font-weight: 600;
  color: #94a3b8;
}

.meta-value {
  color: #475569;
}

.follow-up-actions {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.timeline-note {
  margin: 0.5rem 0 0;
  color: #cbd5e1;
  font-size: 0.85rem;
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

.checkmark {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid #cbd5f5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: #4338ca;
}

.status-item.more {
  background: #eef2ff;
  color: #4338ca;
  font-weight: 600;
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

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: grid;
  place-items: center;
  padding: 2rem;
  z-index: 20;
}

.modal-card {
  background: #fff;
  border-radius: 18px;
  padding: 1.6rem;
  width: min(520px, 90vw);
  display: grid;
  gap: 1rem;
}

.modal-card h2 {
  margin: 0;
  font-size: 1.3rem;
}

.modal-card p {
  margin: 0;
  color: #64748b;
}

.modal-list {
  display: grid;
  gap: 0.6rem;
  max-height: 240px;
  overflow-y: auto;
}

.modal-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.6rem;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.modal-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.modal-actions-inline {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.ghost-mini {
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
}

.color-input {
  width: 40px;
  height: 36px;
  border: none;
  background: transparent;
  padding: 0;
}

.color-picker-row {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.color-swatches {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  padding: 0;
}

.color-swatch.add-swatch {
  background: #fff;
  color: #64748b;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

.modal-actions input[type='text'] {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
}

.modal-message {
  font-size: 0.9rem;
}

.modal-message.success {
  color: #16a34a;
}

.modal-message.error {
  color: #dc2626;
}

.danger-text {
  border: none;
  background: transparent;
  color: #dc2626;
  cursor: pointer;
  font-weight: 600;
}



@media (max-width: 960px) {
  .home-content {
    padding: 2.5rem 6vw 3.5rem;
  }

  .home-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .connection-status {
    justify-items: flex-start;
    text-align: left;
  }

  .connection-items {
    justify-items: flex-start;
  }

  .content-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .home-content {
    padding: 2.5rem 6vw 3.5rem;
  }

}
</style>
