<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { getTaipeiTodayKey, toDateKey } from '../scripts/time.js'
import { buildFollowUpStatusByDate, countPendingForFollowUps } from '../scripts/followUps.js'
import { apiBaseUrl } from '../scripts/apiBaseUrl.js'

const submissions = ref([])
const isLoading = ref(false)

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

const props = defineProps({
  selectedDate: {
    type: String,
    default: () => getTaipeiTodayKey(),
  },
  submissions: {
    type: Array,
    default: null,
  },
  clientName: {
    type: String,
    default: '',
  },
  userMail: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '顯示與你相關的待辦數量',
  },
})

const emit = defineEmits(['select-date'])
const monthPicker = ref(null)

const fetchSubmissions = async () => {
  const auth = readAuthStorage()
  if (!auth) return
  isLoading.value = true
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
    isLoading.value = false
  }
}

const hasExternalSubmissions = computed(() => Array.isArray(props.submissions))
const submissionsSource = computed(() =>
  hasExternalSubmissions.value ? props.submissions : submissions.value
)

const selectedMonth = ref(new Date())

const syncMonthWithSelectedDate = (value) => {
  const dateKey = toDateKey(value)
  if (!dateKey) return
  const [year, month] = dateKey.split('-').map(Number)
  if (!year || !month) return
  const current = selectedMonth.value
  if (current.getFullYear() === year && current.getMonth() === month - 1) return
  selectedMonth.value = new Date(year, month - 1, 1)
}

const monthLabel = computed(() => {
  const year = selectedMonth.value.getFullYear()
  const month = selectedMonth.value.getMonth() + 1
  return `${year} 年 ${month} 月`
})

const calendarDays = computed(() => {
  const year = selectedMonth.value.getFullYear()
  const monthIndex = selectedMonth.value.getMonth()
  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)
  const startWeekday = firstDay.getDay()
  const totalDays = lastDay.getDate()
  const cells = []

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push({ empty: true, key: `empty-${i}` })
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(
      2,
      '0'
    )}`
    cells.push({ empty: false, day, dateKey })
  }
  return cells
})

const changeMonth = (offset) => {
  const base = selectedMonth.value
  selectedMonth.value = new Date(base.getFullYear(), base.getMonth() + offset, 1)
}

const handleMonthChange = (event) => {
  const value = event.target.value
  if (!value) return
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return
  selectedMonth.value = new Date(year, month - 1, 1)
}

const openMonthPicker = () => {
  if (monthPicker.value?.showPicker) {
    monthPicker.value.showPicker()
    return
  }
  monthPicker.value?.click()
}

const getCalendarDateKey = (item) => toDateKey(item?.end_at)

const buildClientFollowUpStatusByDate = (items, clientName) => {
  if (!clientName) return {}
  return items.reduce((summary, item) => {
    if (item.client_name !== clientName) return summary
    const dateKey = getCalendarDateKey(item)
    if (!dateKey) return summary
    const followUps = Array.isArray(item?.follow_ups) ? item.follow_ups : []
    if (followUps.length === 0) return summary
    const pendingCount = countPendingForFollowUps(followUps)
    if (!summary[dateKey]) {
      summary[dateKey] = { total: 0, pending: 0 }
    }
    summary[dateKey].total += followUps.length
    summary[dateKey].pending += pendingCount
    return summary
  }, {})
}

const buildAllFollowUpStatusByDate = (items) =>
  items.reduce((summary, item) => {
    const dateKey = getCalendarDateKey(item)
    if (!dateKey) return summary
    const followUps = Array.isArray(item?.follow_ups) ? item.follow_ups : []
    if (followUps.length === 0) return summary
    const pendingCount = countPendingForFollowUps(followUps)
    if (!summary[dateKey]) {
      summary[dateKey] = { total: 0, pending: 0 }
    }
    summary[dateKey].total += followUps.length
    summary[dateKey].pending += pendingCount
    return summary
  }, {})

const followUpStatusByDate = computed(() => {
  const items = submissionsSource.value || []
  if (props.clientName) {
    return buildClientFollowUpStatusByDate(items, props.clientName)
  }
  const mail = props.userMail || readUserMail()
  if (mail) {
    return buildFollowUpStatusByDate(items, mail, toDateKey)
  }
  return buildAllFollowUpStatusByDate(items)
})

const todayKey = getTaipeiTodayKey()

onMounted(() => {
  if (!hasExternalSubmissions.value) {
    fetchSubmissions()
  }
})

watch(
  () => props.selectedDate,
  (value) => {
    syncMonthWithSelectedDate(value)
  },
  { immediate: true }
)
</script>

<template>
  <div class="monthly-calendar">
    <header class="calendar-header">
      <div>
        <h3 class="calendar-title">本月行事曆</h3>
        <p class="calendar-subtitle">{{ props.subtitle }}</p>
      </div>
      <div class="calendar-controls">
        <button class="calendar-nav" type="button" @click="changeMonth(-1)">‹</button>
        <button class="calendar-month" type="button" @click="openMonthPicker">
          {{ monthLabel }}
        </button>
        <input
          ref="monthPicker"
          class="calendar-month-input"
          type="month"
          :value="`${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(
            2,
            '0'
          )}`"
          @change="handleMonthChange"
        />
        <button class="calendar-nav" type="button" @click="changeMonth(1)">›</button>
      </div>
    </header>

    <div class="calendar-grid">
      <div class="calendar-weekday" v-for="day in ['日', '一', '二', '三', '四', '五', '六']" :key="day">
        {{ day }}
      </div>

      <button
        v-for="cell in calendarDays"
        :key="cell.key || cell.dateKey"
        :class="[
          'calendar-cell',
          {
            empty: cell.empty,
            selected: !cell.empty && cell.dateKey === props.selectedDate,
            today: !cell.empty && cell.dateKey === todayKey,
          },
        ]"
        type="button"
        :disabled="cell.empty"
        @click="emit('select-date', cell.dateKey)"
      >
        <template v-if="!cell.empty">
          <span class="calendar-date">{{ cell.day }}</span>
          <span
            v-if="followUpStatusByDate[cell.dateKey]"
            :class="[
              'calendar-badge',
              followUpStatusByDate[cell.dateKey].pending === 0
                ? 'calendar-badge-complete'
                : cell.dateKey < todayKey
                  ? 'calendar-badge-overdue'
                  : 'calendar-badge-pending',
            ]"
          >
            {{
              followUpStatusByDate[cell.dateKey].pending === 0
                ? '已完成'
                : cell.dateKey < todayKey
                  ? `${followUpStatusByDate[cell.dateKey].pending} 未完成`
                  : `${followUpStatusByDate[cell.dateKey].pending} 待處理`
            }}
          </span>
        </template>
      </button>
    </div>

    <p v-if="isLoading" class="calendar-loading">載入待辦中...</p>
  </div>
</template>

<style scoped>
.monthly-calendar {
  padding: 0.2rem 0;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.2rem;
}

.calendar-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.calendar-subtitle {
  margin: 0.35rem 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.calendar-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.calendar-nav {
  border: 1px solid #e2e8f0;
  background: #fff;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  font-size: 1rem;
  cursor: pointer;
  color: #475569;
}

.calendar-month {
  border: none;
  background: #f1f5f9;
  font-weight: 600;
  color: #0f172a;
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  cursor: pointer;
}

.calendar-month-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 1px;
  height: 1px;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.45rem;
}

.calendar-weekday {
  text-align: center;
  font-size: 0.85rem;
  color: #94a3b8;
}

.calendar-cell {
  background: #f8fafc;
  border-radius: 14px;
  min-height: 64px;
  padding: 0.45rem 0.55rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.3rem;
  border: none;
  text-align: left;
  cursor: pointer;
}

.calendar-cell.past {
  background: #fff1f2;
}

.calendar-cell.empty {
  background: transparent;
  box-shadow: none;
  cursor: default;
}

.calendar-cell.selected {
  outline: 2px solid #111827;
  background: #eef2ff;
}

.calendar-cell.today {
  background: #dcfce7;
}

.calendar-date {
  font-weight: 600;
  color: #0f172a;
  font-size: 0.9rem;
}

.calendar-badge {
  align-self: flex-start;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
}

.calendar-badge-pending {
  background: #fef3c7;
  color: #92400e;
}

.calendar-badge-overdue {
  background: #fee2e2;
  color: #b91c1c;
}

.calendar-badge-complete {
  background: #dcfce7;
  color: #166534;
}

.calendar-loading {
  margin: 1rem 0 0;
  color: #64748b;
  font-size: 0.85rem;
}
</style>
