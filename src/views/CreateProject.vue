<script setup>
import TaskStepsModal from '../components/CreateProject/TaskStepsModal.vue'
import Toolbar from '../components/toolbar/Toolbar.vue'
import { useProjectData } from '../scripts/CreateProject/useProjectData.js'

const {
  searchText,
  filteredRows,
  totalTasks,
  activeTask,
  openTaskSteps,
  closeTaskSteps,
  toggleExpanded,
  expandedIds,
} = useProjectData()

const depthPadding = (depth) => `${depth * 24}px`
const formatTypeLabel = (type) => {
  switch (type) {
    case 'project':
      return 'Project'
    case 'product':
      return 'Product'
    case 'task':
      return 'Task'
    default:
      return ''
  }
}

const isExpanded = (id) => expandedIds.value.has(id)
const canToggle = (row) => row.type !== 'task'
</script>

<template>
  <section class="create-project">
    <Toolbar />
    <div class="content">
      <div class="toolbar-row">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchText"
            class="search-input"
            type="search"
            placeholder="全局模糊搜尋"
          />
        </div>
        <button class="filter-button" type="button">篩選</button>
        <div class="task-count">任務總數：{{ totalTasks }}</div>
      </div>

      <div class="table">
        <div class="table-row table-row--header">
          <div>層級名稱</div>
          <div>狀態</div>
          <div>負責人</div>
          <div>更新時間</div>
          <div>建立時間</div>
        </div>
        <div
          v-for="row in filteredRows"
          :key="row.id"
          class="table-row"
          :class="{ clickable: row.type === 'task' }"
          @click="row.type === 'task' ? openTaskSteps(row) : null"
        >
          <div class="name-cell" :style="{ paddingLeft: depthPadding(row.depth) }">
            <button
              v-if="canToggle(row)"
              class="toggle-button"
              type="button"
              @click.stop="toggleExpanded(row)"
            >
              {{ isExpanded(row.id) ? '▾' : '▸' }}
            </button>
            <span class="type-tag" :class="`type-tag--${row.type}`">
              {{ formatTypeLabel(row.type) }}
            </span>
            <span class="node-name">{{ row.name }}</span>
          </div>
          <div class="status-cell">
            <span v-if="row.status" class="status-pill">{{ row.status }}</span>
            <span v-else class="status-muted">—</span>
          </div>
          <div>{{ row.ownerId || '—' }}</div>
          <div>{{ row.updatedAt }}</div>
          <div>{{ row.createdAt }}</div>
        </div>
      </div>
    </div>

    <TaskStepsModal :task="activeTask" @close="closeTaskSteps" />
  </section>
</template>

<style scoped>
.create-project {
  min-height: 100vh;
  background: #f8fafc;
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  font-family: "Noto Sans TC", "Segoe UI", sans-serif;
  --project-color: #1d4ed8;
  --product-color: #0f766e;
  --task-color: #7c3aed;
}

.content {
  padding: 2.5rem 3rem;
  display: grid;
  gap: 1.5rem;
  width: 100%;
}

.toolbar-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
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

.filter-button {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
}

.task-count {
  font-weight: 600;
  color: #0f172a;
}

.table {
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
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

.table-row--header {
  background: #f8fafc;
  font-weight: 600;
  color: #475569;
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
  gap: 0.75rem;
}

.toggle-button {
  border: none;
  background: transparent;
  font-size: 1rem;
  color: #64748b;
  cursor: pointer;
}

.type-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: #0f172a;
  background: #e2e8f0;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
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
