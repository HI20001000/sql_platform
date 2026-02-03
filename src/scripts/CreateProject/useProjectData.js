import { computed, ref } from 'vue'
import { sampleProjects } from './data.js'
import { flattenProjects } from './flatten.js'

export const useProjectData = () => {
  const searchText = ref('')
  const rows = ref(flattenProjects(sampleProjects))
  const activeTask = ref(null)

  const filteredRows = computed(() => {
    if (!searchText.value.trim()) return rows.value
    const keyword = searchText.value.trim().toLowerCase()
    return rows.value.filter((row) => row.name.toLowerCase().includes(keyword))
  })

  const totalTasks = computed(
    () => rows.value.filter((row) => row.type === 'task').length
  )

  const openTaskSteps = (taskRow) => {
    if (!taskRow || taskRow.type !== 'task') return
    activeTask.value = taskRow.source
  }

  const closeTaskSteps = () => {
    activeTask.value = null
  }

  return {
    searchText,
    filteredRows,
    totalTasks,
    activeTask,
    openTaskSteps,
    closeTaskSteps,
  }
}
