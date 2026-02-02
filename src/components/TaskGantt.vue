<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toDateKey } from '../scripts/time.js'

const DEFAULT_CLIENT_COLOR = '#e2e8f0'
const GROUP_BADGE_COLOR = '#ef4444'
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000
const DAY_WIDTH_PX = 32

const props = defineProps({
  viewMode: {
    type: String,
    default: 'user',
  },
  submissions: {
    type: Array,
    default: () => [],
  },
  users: {
    type: Array,
    default: () => [],
  },
  selectedUser: {
    type: Object,
    default: null,
  },
  selectedClient: {
    type: Object,
    default: null,
  },
})

const rangeType = ref('month')
const expandedTaskIds = ref(new Set())
const expandedGroupIds = ref(new Set())
const anchorDateInput = ref('')

const toTask = (submission) => {
  if (!submission?.end_at) return null
  const startAt = submission.start_at || submission.end_at
  const endAt = submission.end_at
  if (!startAt || !endAt) return null
  const fallbackLabel = `${submission.client_name || '客戶'}_${submission.vendor_name || '廠家'}_${
    submission.product_name || '產品'
  }`
  const tagLabel = submission.tag || submission.tag_name
  return {
    id: submission.id,
    clientName: submission.client_name,
    vendorName: submission.vendor_name,
    productName: submission.product_name,
    taskLabel:
      tagLabel || submission.label || submission.task_label || fallbackLabel,
    startAt,
    endAt,
    followUps: Array.isArray(submission.follow_ups) ? submission.follow_ups : [],
  }
}

const tasks = computed(() =>
  (props.submissions || [])
    .map((submission) => toTask(submission))
    .filter(Boolean)
)

const groupedTasks = computed(() => {
  if (props.viewMode !== 'user') {
    return []
  }
  const submissionById = new Map(
    (props.submissions || []).map((submission) => [submission.id, submission])
  )
  return (props.users || [])
    .map((user) => {
      const userTasks = tasks.value.filter((task) =>
        (props.submissions || []).some(
          (submission) =>
            submission.id === task.id &&
            (submission.related_users || []).some((related) => related.mail === user.mail)
        )
      )
      const clientNames = new Set()
      let followUpCount = 0
      userTasks.forEach((task) => {
        const submission = submissionById.get(task.id)
        if (submission?.client_name) {
          clientNames.add(submission.client_name)
        }
        followUpCount += Array.isArray(submission?.follow_ups) ? submission.follow_ups.length : 0
      })
      return {
        user,
        tasks: userTasks,
        clientCount: clientNames.size,
        followUpCount,
      }
    })
    .filter((group) => group.tasks.length > 0)
})

const MAX_MONTH_TICKS = 4
const MAX_YEAR_TICKS = 3

const rangeConfig = computed(() => {
  if (rangeType.value === 'day') {
    return { unit: 'day', count: 7, width: 110 }
  }
  if (rangeType.value === 'year') {
    return { unit: 'year', count: MAX_YEAR_TICKS, width: 180 }
  }
  return { unit: 'month', count: MAX_MONTH_TICKS, width: 150 }
})

const anchorDate = ref(new Date())
const formatDateInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
anchorDateInput.value = formatDateInput(anchorDate.value)
watch(anchorDate, (value) => {
  anchorDateInput.value = formatDateInput(value)
})
const handleAnchorDateChange = (event) => {
  const nextValue = event?.target?.value
  if (!nextValue) return
  const nextDate = new Date(`${nextValue}T00:00:00`)
  if (Number.isNaN(nextDate.getTime())) return
  anchorDate.value = nextDate
}

const timelineStart = computed(() => {
  const base = new Date(anchorDate.value)
  if (rangeType.value === 'day') {
    base.setHours(0, 0, 0, 0)
    return base
  }
  if (rangeType.value === 'year') {
    return new Date(base.getFullYear(), 0, 1)
  }
  return new Date(base.getFullYear(), base.getMonth(), 1)
})

const timelineEnd = computed(() => {
  const start = timelineStart.value
  if (rangeType.value === 'day') {
    return new Date(start.getTime() + rangeConfig.value.count * MILLISECONDS_IN_DAY)
  }
  if (rangeType.value === 'year') {
    return new Date(start.getFullYear() + rangeConfig.value.count, start.getMonth(), 1)
  }
  return new Date(start.getFullYear(), start.getMonth() + rangeConfig.value.count, 1)
})

const toDayStart = (value) => {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const totalDays = computed(() => {
  const start = toDayStart(timelineStart.value)
  const end = toDayStart(timelineEnd.value)
  const diff = Math.ceil((end.getTime() - start.getTime()) / MILLISECONDS_IN_DAY)
  return Math.max(diff, 1)
})

const axisTicks = computed(() => {
  const ticks = []
  const start = toDayStart(timelineStart.value)
  if (rangeType.value === 'day') {
    for (let i = 0; i <= totalDays.value; i += 1) {
      const date = new Date(start.getTime() + i * MILLISECONDS_IN_DAY)
      ticks.push({
        key: date.toISOString(),
        label: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(
          date.getDate()
        ).padStart(2, '0')}`,
        dayIndex: i,
      })
    }
  } else if (rangeType.value === 'year') {
    for (let i = 0; i <= rangeConfig.value.count; i += 1) {
      const cursor = new Date(start.getFullYear() + i, 0, 1)
      const dayIndex = Math.round(
        (toDayStart(cursor).getTime() - start.getTime()) / MILLISECONDS_IN_DAY
      )
      ticks.push({
        key: cursor.toISOString(),
        label: `${cursor.getFullYear()}年`,
        dayIndex,
        isBoundaryEnd: i === rangeConfig.value.count,
      })
    }
  } else {
    for (let i = 0; i <= rangeConfig.value.count; i += 1) {
      const cursor = new Date(start.getFullYear(), start.getMonth() + i, 1)
      const dayIndex = Math.round(
        (toDayStart(cursor).getTime() - start.getTime()) / MILLISECONDS_IN_DAY
      )
      ticks.push({
        key: cursor.toISOString(),
        label: `${String(cursor.getMonth() + 1).padStart(2, '0')}月`,
        dayIndex,
        isBoundaryEnd: i === rangeConfig.value.count,
      })
    }
  }
  return ticks
})

const gridTicks = computed(() => {
  if (rangeType.value === 'day') return axisTicks.value
  const start = toDayStart(timelineStart.value)
  const ticks = []
  const count = rangeConfig.value.count
  for (let i = 0; i <= count; i += 1) {
    const cursor =
      rangeType.value === 'year'
        ? new Date(start.getFullYear() + i, 0, 1)
        : new Date(start.getFullYear(), start.getMonth() + i, 1)
    const dayIndex = Math.round(
      (toDayStart(cursor).getTime() - start.getTime()) / MILLISECONDS_IN_DAY
    )
    ticks.push({
      key: cursor.toISOString(),
      dayIndex,
    })
  }
  return ticks
})

const getBarColor = (user) => user?.icon_bg || DEFAULT_CLIENT_COLOR

const buildHierarchy = (tasksList) => {
  const hierarchy = new Map()
  tasksList.forEach((task) => {
    const clientName = task.clientName || '客戶'
    const vendorName = task.vendorName || '廠家'
    const productName = task.productName || '產品'
    if (!hierarchy.has(clientName)) {
      hierarchy.set(clientName, new Map())
    }
    const vendorMap = hierarchy.get(clientName)
    if (!vendorMap.has(vendorName)) {
      vendorMap.set(vendorName, new Map())
    }
    const productMap = vendorMap.get(vendorName)
    if (!productMap.has(productName)) {
      productMap.set(productName, [])
    }
    productMap.get(productName).push(task)
  })
  return hierarchy
}

const ganttRows = computed(() => {
  const rows = []
  if (props.viewMode === 'user') {
    groupedTasks.value.forEach(({ user, tasks: userTasks, clientCount, followUpCount }) => {
      const groupId = `group-user-${user?.mail || 'unknown'}`
      const sortedTasks = userTasks
        .map((task) => ({
          ...task,
          startAtDate: new Date(task.startAt),
          endAtDate: new Date(task.endAt),
        }))
        .filter((task) => {
          const hasStart = !Number.isNaN(task.startAtDate.getTime())
          const hasEnd = !Number.isNaN(task.endAtDate.getTime())
          return hasStart && hasEnd
        })
        .sort((a, b) => a.startAtDate.getTime() - b.startAtDate.getTime())
      rows.push({
        id: groupId,
        type: 'group',
        label: user?.username || user?.mail || '用戶',
        icon: user?.icon || '🙂',
        groupId,
        color: getBarColor(user),
        level: 1,
        taskSpans: sortedTasks.map((task) => ({
          startAt: task.startAt,
          endAt: task.endAt,
          color: getBarColor(user),
        })),
        tasks: userTasks,
        meta: `客戶 ${clientCount}｜跟進 ${followUpCount}`,
      })
      if (expandedGroupIds.value.has(groupId)) {
        const hierarchy = buildHierarchy(userTasks)
        Array.from(hierarchy.entries())
          .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
          .forEach(([clientName, vendorMap]) => {
            const clientGroupId = `${groupId}-client-${clientName}`
            const clientTasks = Array.from(vendorMap.values()).flatMap((productMap) =>
              Array.from(productMap.values()).flat()
            )
            rows.push({
              id: clientGroupId,
              type: 'group',
              label: clientName || '客戶',
              icon: '🏷️',
              groupId: clientGroupId,
              color: getBarColor(user),
              level: 2,
              taskSpans: clientTasks.map((task) => ({
                startAt: task.startAt,
                endAt: task.endAt,
                color: getBarColor(user),
              })),
            })
            if (expandedGroupIds.value.has(clientGroupId)) {
              Array.from(vendorMap.entries())
                .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
                .forEach(([vendorName, productMap]) => {
                  const vendorGroupId = `${clientGroupId}-vendor-${vendorName}`
                  const vendorTasks = Array.from(productMap.values()).flat()
            rows.push({
              id: vendorGroupId,
              type: 'group',
              label: vendorName || '廠家',
              labelStyle: 'task',
              showIcon: false,
              groupId: vendorGroupId,
              color: getBarColor(user),
              level: 3,
                    taskSpans: vendorTasks.map((task) => ({
                      startAt: task.startAt,
                      endAt: task.endAt,
                      color: getBarColor(user),
                    })),
                  })
                  if (expandedGroupIds.value.has(vendorGroupId)) {
                    Array.from(productMap.entries())
                      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
                      .forEach(([productName, productTasks]) => {
                        const productGroupId = `${vendorGroupId}-product-${productName}`
                        rows.push({
                          id: productGroupId,
                          type: 'group',
                          label: productName || '產品',
                          labelStyle: 'task',
                          showIcon: false,
                          groupId: productGroupId,
                          color: getBarColor(user),
                          level: 4,
                          taskSpans: productTasks.map((task) => ({
                            startAt: task.startAt,
                            endAt: task.endAt,
                            color: getBarColor(user),
                          })),
                        })
                        if (expandedGroupIds.value.has(productGroupId)) {
                          productTasks.forEach((task) => {
                            rows.push({
                              id: `task-${task.id}`,
                              taskId: task.id,
                              type: 'task',
                              label: task.taskLabel,
                              startAt: task.startAt,
                              endAt: task.endAt,
                              color: getBarColor(user),
                              level: 5,
                            })
                            if (expandedTaskIds.value.has(task.id)) {
                              task.followUps.forEach((followUp) => {
                                rows.push({
                                  id: `followup-${task.id}-${followUp.id || followUp.content}`,
                                  type: 'followup',
                                  label: followUp.content || '跟進任務',
                                  endAt: task.endAt,
                                  color: getBarColor(user),
                                  level: 6,
                                })
                              })
                            }
                          })
                        }
                      })
                  }
                })
            }
          })
      }
    })
  } else if (props.viewMode === 'client') {
    const submissionById = new Map(
      (props.submissions || []).map((submission) => [submission.id, submission])
    )
    const tasksByClient = tasks.value.reduce((result, task) => {
      const name = task.clientName || '客戶'
      if (!result.has(name)) result.set(name, [])
      result.get(name).push(task)
      return result
    }, new Map())
    Array.from(tasksByClient.entries())
      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
      .forEach(([clientName, clientTasks]) => {
        const clientGroupId = `group-client-${clientName || 'unknown'}`
        const relatedMails = new Set()
        let unassignedFollowUps = 0
        clientTasks.forEach((task) => {
          const submission = submissionById.get(task.id)
          if (submission?.related_users) {
            submission.related_users.forEach((related) =>
              related?.mail && relatedMails.add(related.mail)
            )
          }
          const followUps = Array.isArray(submission?.follow_ups) ? submission.follow_ups : []
          followUps.forEach((followUp) => {
            const assignees = Array.isArray(followUp?.assignees) ? followUp.assignees : []
            if (assignees.length === 0) {
              unassignedFollowUps += 1
            }
          })
        })
        rows.push({
          id: clientGroupId,
          type: 'group',
          label: clientName || '客戶',
          icon: '🏷️',
          groupId: clientGroupId,
          color: DEFAULT_CLIENT_COLOR,
          level: 1,
          taskSpans: clientTasks.map((task) => ({
            startAt: task.startAt,
            endAt: task.endAt,
            color: DEFAULT_CLIENT_COLOR,
          })),
          meta: `同事 ${relatedMails.size}｜未指派 ${unassignedFollowUps}`,
        })
        if (expandedGroupIds.value.has(clientGroupId)) {
          const hierarchy = buildHierarchy(clientTasks)
          const vendorMap = hierarchy.get(clientName || '客戶') || new Map()
          Array.from(vendorMap.entries())
            .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
            .forEach(([vendorName, productMap]) => {
              const vendorGroupId = `${clientGroupId}-vendor-${vendorName}`
              const vendorTasks = Array.from(productMap.values()).flat()
              rows.push({
                id: vendorGroupId,
                type: 'group',
                label: vendorName || '廠家',
                labelStyle: 'task',
                showIcon: false,
                groupId: vendorGroupId,
                color: DEFAULT_CLIENT_COLOR,
                level: 2,
                taskSpans: vendorTasks.map((task) => ({
                  startAt: task.startAt,
                  endAt: task.endAt,
                  color: DEFAULT_CLIENT_COLOR,
                })),
              })
              if (expandedGroupIds.value.has(vendorGroupId)) {
                Array.from(productMap.entries())
                  .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
                  .forEach(([productName, productTasks]) => {
                    const productGroupId = `${vendorGroupId}-product-${productName}`
                    rows.push({
                      id: productGroupId,
                      type: 'group',
                      label: productName || '產品',
                      labelStyle: 'task',
                      showIcon: false,
                      groupId: productGroupId,
                      color: DEFAULT_CLIENT_COLOR,
                      level: 3,
                      taskSpans: productTasks.map((task) => ({
                        startAt: task.startAt,
                        endAt: task.endAt,
                        color: DEFAULT_CLIENT_COLOR,
                      })),
                    })
                    if (expandedGroupIds.value.has(productGroupId)) {
                      productTasks.forEach((task) => {
                        rows.push({
                          id: `task-${task.id}`,
                          taskId: task.id,
                          type: 'task',
                          label: task.taskLabel,
                          startAt: task.startAt,
                          endAt: task.endAt,
                          color: DEFAULT_CLIENT_COLOR,
                          level: 4,
                        })
                        if (expandedTaskIds.value.has(task.id)) {
                          task.followUps.forEach((followUp) => {
                            rows.push({
                              id: `followup-${task.id}-${followUp.id || followUp.content}`,
                              type: 'followup',
                              label: followUp.content || '跟進任務',
                              endAt: task.endAt,
                              color: DEFAULT_CLIENT_COLOR,
                              level: 5,
                            })
                          })
                        }
                      })
                    }
                  })
              }
            })
        }
      })
  }

  return rows
})

const getPositionStyle = (startAt, endAt) => {
  const start = toDayStart(startAt)
  const end = toDayStart(endAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { display: 'none' }
  }
  const rangeStart = toDayStart(timelineStart.value)
  const rangeEnd = toDayStart(timelineEnd.value)
  const total = totalDays.value * MILLISECONDS_IN_DAY
  if (total <= 0) return { display: 'none' }
  const endInclusive = end.getTime() + MILLISECONDS_IN_DAY
  if (endInclusive <= rangeStart.getTime() || start.getTime() >= rangeEnd.getTime()) {
    return { display: 'none' }
  }
  const clampedStart = Math.max(start.getTime(), rangeStart.getTime())
  const clampedEnd = Math.min(endInclusive, rangeEnd.getTime())
  const left =
    ((clampedStart - rangeStart.getTime()) / total) * timelineWidth.value
  const width =
    ((clampedEnd - clampedStart) / total) * timelineWidth.value
  if (width <= 0) return { display: 'none' }
  return {
    left: `${Math.max(left, 0)}px`,
    width: `${Math.max(Math.min(width, timelineWidth.value - left), 0)}px`,
  }
}

const getMarkerStyle = (dateValue) => {
  const date = toDayStart(dateValue)
  if (Number.isNaN(date.getTime())) {
    return { display: 'none' }
  }
  const rangeStart = toDayStart(timelineStart.value)
  const rangeEnd = toDayStart(timelineEnd.value)
  if (date.getTime() < rangeStart.getTime() || date.getTime() >= rangeEnd.getTime()) {
    return { display: 'none' }
  }
  const total = totalDays.value * MILLISECONDS_IN_DAY
  if (total <= 0) return { display: 'none' }
  const left =
    ((date.getTime() - rangeStart.getTime()) / total) * timelineWidth.value
  return {
    left: `${Math.min(Math.max(left, 0), timelineWidth.value)}px`,
  }
}

const toggleTask = (taskId) => {
  const next = new Set(expandedTaskIds.value)
  if (next.has(taskId)) {
    next.delete(taskId)
  } else {
    next.add(taskId)
  }
  expandedTaskIds.value = next
}

const isTaskExpanded = (taskId) => expandedTaskIds.value.has(taskId)

const toggleGroup = (groupId) => {
  const next = new Set(expandedGroupIds.value)
  if (next.has(groupId)) {
    next.delete(groupId)
  } else {
    next.add(groupId)
  }
  expandedGroupIds.value = next
}

const isGroupExpanded = (groupId) => expandedGroupIds.value.has(groupId)

const setRangeType = (value) => {
  rangeType.value = value
}

const timelineViewport = ref(null)
const timelineViewportWidth = ref(0)
let timelineObserver = null

const dayWidth = computed(() => {
  if (!timelineViewportWidth.value) return DAY_WIDTH_PX
  const fitWidth = timelineViewportWidth.value / totalDays.value
  if (rangeType.value === 'day') {
    return Math.max(DAY_WIDTH_PX, fitWidth)
  }
  return fitWidth
})

const timelineWidth = computed(() => totalDays.value * dayWidth.value)

onMounted(() => {
  if (!timelineViewport.value) return
  timelineObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry?.contentRect) {
      timelineViewportWidth.value = entry.contentRect.width
    }
  })
  timelineObserver.observe(timelineViewport.value)
})

onBeforeUnmount(() => {
  if (timelineObserver && timelineViewport.value) {
    timelineObserver.unobserve(timelineViewport.value)
  }
  timelineObserver = null
})

const shiftRange = (direction) => {
  if (rangeType.value === 'day') {
    anchorDate.value = new Date(
      anchorDate.value.getTime() + direction * MILLISECONDS_IN_DAY
    )
  } else if (rangeType.value === 'year') {
    anchorDate.value = new Date(
      anchorDate.value.getFullYear() + direction,
      anchorDate.value.getMonth(),
      anchorDate.value.getDate()
    )
  } else {
    anchorDate.value = new Date(
      anchorDate.value.getFullYear(),
      anchorDate.value.getMonth() + direction,
      anchorDate.value.getDate()
    )
  }
}

const wheelAccumulator = ref(0)
const handleWheel = (event) => {
  wheelAccumulator.value += event.deltaY
  if (Math.abs(wheelAccumulator.value) < 120) {
    return
  }
  const direction = wheelAccumulator.value > 0 ? 1 : -1
  wheelAccumulator.value = 0
  shiftRange(direction)
}
</script>

<template>
  <div class="gantt-panel">
    <header class="gantt-header">
      <div>
        <h3 class="gantt-title">甘特圖視圖</h3>
        <div class="gantt-subtitle">
          <span>{{ toDateKey(timelineStart) }} - {{ toDateKey(timelineEnd) }}</span>
          <label class="gantt-date-picker">
            <span class="gantt-date-label">選擇開始時間</span>
            <input
              type="date"
              :value="anchorDateInput"
              class="gantt-date-input"
              @change="handleAnchorDateChange"
            />
          </label>
        </div>
      </div>
      <div class="gantt-controls">
        <div class="gantt-range-toggle">
          <button
            type="button"
            :class="['gantt-range-button', { active: rangeType === 'day' }]"
            @click="setRangeType('day')"
          >
            日
          </button>
          <button
            type="button"
            :class="['gantt-range-button', { active: rangeType === 'month' }]"
            @click="setRangeType('month')"
          >
            月
          </button>
          <button
            type="button"
            :class="['gantt-range-button', { active: rangeType === 'year' }]"
            @click="setRangeType('year')"
          >
            年
          </button>
        </div>
      </div>
    </header>

    <div class="gantt-body">
      <div class="gantt-axis-row">
        <div class="gantt-axis-spacer"></div>
        <div ref="timelineViewport" class="gantt-timeline" @wheel="handleWheel">
          <div class="gantt-axis" :style="{ width: `${timelineWidth}px`, minWidth: '100%' }">
            <span
              v-for="tick in axisTicks"
              :key="tick.key"
              :class="['gantt-tick', 'gantt-tick-major', { 'gantt-tick-end': tick.isBoundaryEnd }]"
              :style="{ left: `${tick.dayIndex * dayWidth}px` }"
            >
              {{ tick.label }}
            </span>
          </div>
        </div>
      </div>
      <div class="gantt-content-row">
        <div class="gantt-sidebar">
          <div
            v-for="row in ganttRows"
            :key="row.id"
            :class="[
              'gantt-label',
              `gantt-label-${row.type}`,
              row.level ? `gantt-label-level-${row.level}` : '',
            ]"
          >
            <button
              v-if="row.type === 'group'"
              type="button"
              class="gantt-group"
              @click="toggleGroup(row.groupId || row.id)"
            >
              <div
                v-if="row.showIcon !== false"
                class="gantt-group-badge"
                :style="{ backgroundColor: row.color }"
              >
                {{ row.icon }}
              </div>
              <div class="gantt-group-text">
                <span
                  :class="[
                    'gantt-group-name',
                    { 'gantt-group-name-task': row.labelStyle === 'task' },
                  ]"
                >
                  {{ row.label }}
                </span>
                <span v-if="row.meta" class="gantt-group-meta">{{ row.meta }}</span>
              </div>
              <span class="gantt-task-toggle">
                {{ isGroupExpanded(row.groupId || row.id) ? '▾' : '▸' }}
              </span>
            </button>
            <button
              v-else-if="row.type === 'task'"
              type="button"
              class="gantt-task-button"
              @click="toggleTask(row.taskId)"
            >
              <span class="gantt-task-text">{{ row.label }}</span>
              <span class="gantt-task-toggle">{{ isTaskExpanded(row.taskId) ? '▾' : '▸' }}</span>
            </button>
            <span v-else class="gantt-followup-text" :data-tooltip="row.label">
              <span class="gantt-followup-text-content">{{ row.label }}</span>
            </span>
          </div>
        </div>
        <div class="gantt-timeline" @wheel="handleWheel">
          <div class="gantt-rows" :style="{ width: `${timelineWidth}px`, minWidth: '100%' }">
            <div class="gantt-grid">
              <span
                v-for="tick in gridTicks"
                :key="`grid-${tick.key}`"
                class="gantt-grid-line"
                :style="{ left: `${tick.dayIndex * dayWidth}px` }"
              ></span>
            </div>
            <div v-for="row in ganttRows" :key="row.id" class="gantt-row">
              <template v-if="row.type === 'group'">
                <div
                  v-for="(span, index) in row.taskSpans || []"
                  :key="`${row.id}-span-${index}`"
                  class="gantt-bar"
                  :style="{
                    backgroundColor: span.color,
                    ...getPositionStyle(span.startAt, span.endAt),
                  }"
                ></div>
              </template>
              <div
                v-else-if="row.type === 'task'"
                class="gantt-bar"
                :style="{
                  backgroundColor: row.color,
                  ...getPositionStyle(row.startAt, row.endAt),
                }"
              ></div>
              <div
                v-else-if="row.type === 'followup'"
                class="gantt-marker"
                :style="{
                  backgroundColor: row.color,
                  ...getMarkerStyle(row.endAt),
                }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.gantt-header {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.gantt-title {
  margin: 0;
  font-size: 1.1rem;
}

.gantt-subtitle {
  margin: 0.3rem 0 0;
  color: #64748b;
  font-size: 0.85rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}

.gantt-date-picker {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}

.gantt-date-label {
  font-size: 0.75rem;
}

.gantt-date-input {
  border: none;
  background: transparent;
  font-size: 0.75rem;
  color: inherit;
  outline: none;
}

.gantt-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.gantt-range-toggle {
  display: inline-flex;
  background: #f1f5f9;
  padding: 0.25rem;
  border-radius: 999px;
  gap: 0.25rem;
}

.gantt-range-button {
  border: none;
  background: transparent;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  color: #475569;
  cursor: pointer;
}

.gantt-range-button.active {
  background: #111827;
  color: #fff;
}

.gantt-body {
  display: grid;
  grid-template-rows: auto 1fr;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
}

.gantt-axis-row,
.gantt-content-row {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
}

.gantt-axis-spacer {
  background: #f8fafc;
  padding: 1rem;
}

.gantt-sidebar {
  background: #f8fafc;
  padding: 1rem;
  display: grid;
  gap: 0.6rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.gantt-label {
  font-size: 0.85rem;
  color: #1f2937;
  height: 36px;
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
}

.gantt-label-level-2 {
  padding-left: 1rem;
}

.gantt-label-level-3 {
  padding-left: 2rem;
}

.gantt-label-level-4 {
  padding-left: 3rem;
}

.gantt-label-level-5 {
  padding-left: 4rem;
}

.gantt-label-level-6 {
  padding-left: 5rem;
}

.gantt-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 600;
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  height: 36px;
}

.gantt-group-badge {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1rem;
}

.gantt-group-name {
  font-size: 0.95rem;
}

.gantt-group-name-task {
  font-size: 0.85rem;
  font-weight: 400;
  padding-left: 0.25rem;
}

.gantt-group-text {
  display: grid;
  gap: 0.15rem;
}

.gantt-group-meta {
  font-size: 0.75rem;
  color: #64748b;
}

.gantt-task-button {
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  color: #1f2937;
  cursor: pointer;
  text-align: left;
  height: 36px;
}

.gantt-task-text {
  padding-left: 0.25rem;
}

.gantt-task-toggle {
  font-size: 0.8rem;
  color: #94a3b8;
}

.gantt-followup-text {
  padding-left: 1.5rem;
  color: #64748b;
  font-size: 0.8rem;
  height: 36px;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 100%;
  min-width: 0;
  position: relative;
}

.gantt-followup-text-content {
  display: block;
  flex: 1;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gantt-followup-text::after {
  content: attr(data-tooltip);
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: #111827;
  color: #f8fafc;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  font-size: 0.75rem;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.2);
  z-index: 10;
}

.gantt-followup-text:hover::after {
  opacity: 1;
}

.gantt-timeline {
  position: relative;
  overflow: hidden;
  padding: 1rem 1.5rem;
  width: 100%;
}

.gantt-axis {
  position: relative;
  height: 24px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 0.75rem;
  width: 100%;
}

.gantt-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 0.75rem;
  color: #94a3b8;
  white-space: nowrap;
}

.gantt-tick-major {
  height: 100%;
}

.gantt-tick-end {
  transform: translateX(-100%);
}

.gantt-rows {
  display: grid;
  gap: 0.6rem;
  width: 100%;
  position: relative;
}

.gantt-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.gantt-grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #e2e8f0;
  opacity: 0.7;
}

.gantt-row {
  position: relative;
  height: 36px;
  border-radius: 999px;
  background: #f8fafc;
}

.gantt-bar {
  position: absolute;
  top: 8px;
  height: 20px;
  border-radius: 999px;
}

.gantt-marker {
  position: absolute;
  top: 14px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

@media (max-width: 960px) {
  .gantt-body {
    grid-template-rows: auto 1fr;
  }

  .gantt-axis-row,
  .gantt-content-row {
    grid-template-columns: 1fr;
  }

  .gantt-sidebar {
    border-bottom: 1px solid #e2e8f0;
  }
}
</style>
