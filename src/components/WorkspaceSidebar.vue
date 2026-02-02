<template>
  <aside class="workspace-sidebar">
    <div class="sidebar-top">
      <button
        class="sidebar-button"
        :class="{ active: activePath === '/home' }"
        type="button"
        aria-label="返回首頁"
        @click="onGoHome"
      >
        <span class="sidebar-glyph">⌂</span>
        首頁
      </button>
      <button
        class="sidebar-button"
        :class="{ active: activePath === '/tasks/new' }"
        type="button"
        aria-label="新增任務"
        @click="onCreateTask"
      >
        <span class="sidebar-glyph">＋</span>
        新增任務
      </button>
      <button
        class="sidebar-button"
        :class="{ active: activePath === '/tasks/view' }"
        type="button"
        aria-label="檢視任務"
        @click="onViewTasks"
      >
        <span class="sidebar-glyph">◎</span>
        任務總覽
      </button>
      <button
        class="sidebar-button"
        :class="{ active: activePath === '/meetings' }"
        type="button"
        aria-label="檢視會議記錄"
        @click="onViewMeetings"
      >
        <span class="sidebar-glyph">📄</span>
        會議記錄
      </button>
      <button
        class="sidebar-button"
        :class="{ active: activePath === '/users/dashboard' }"
        type="button"
        aria-label="儀表盤"
        @click="onViewUserDashboard"
      >
        <span class="sidebar-glyph">📊</span>
        儀表盤
      </button>
    </div>
    <div class="sidebar-bottom">
      <button
        class="profile-button"
        :class="{ active: activePath === '/settings' }"
        type="button"
        aria-label="個人設定"
        @click="goToProfile"
      >
        <span
          class="profile-avatar"
          :style="{ backgroundColor: currentUser.icon_bg || '#e2e8f0' }"
        >
          {{ currentUser.icon || '🙂' }}
        </span>
      </button>
    </div>
  </aside>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const {
  onCreateTask,
  onGoHome,
  onGoProfile,
  onViewTasks,
  onViewMeetings,
  onViewUserDashboard,
  activePath,
} = defineProps({
  onCreateTask: {
    type: Function,
    default: () => {},
  },
  onViewTasks: {
    type: Function,
    default: () => {},
  },
  onViewMeetings: {
    type: Function,
    default: () => {},
  },
  onViewUserDashboard: {
    type: Function,
    default: () => {},
  },
  onGoHome: {
    type: Function,
    default: () => {},
  },
  onGoProfile: {
    type: Function,
    default: () => {},
  },
  activePath: {
    type: String,
    default: '',
  },
})

const currentUser = ref({})

const loadUser = () => {
  const raw = window.localStorage.getItem('innerai_user')
  if (!raw) {
    currentUser.value = {}
    return
  }
  try {
    currentUser.value = JSON.parse(raw)
  } catch {
    currentUser.value = {}
  }
}

const goToProfile = () => {
  loadUser()
  onGoProfile()
}

const handleStorage = (event) => {
  if (event.key === 'innerai_user') {
    loadUser()
  }
}

const handleUserUpdate = () => {
  loadUser()
}

onMounted(() => {
  loadUser()
  window.addEventListener('storage', handleStorage)
  window.addEventListener('innerai_user_updated', handleUserUpdate)
})

onUnmounted(() => {
  window.removeEventListener('storage', handleStorage)
  window.removeEventListener('innerai_user_updated', handleUserUpdate)
})
</script>

<style scoped>
.workspace-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 88px;
  background: rgba(15, 23, 42, 0.55);
  border-right: 1px solid rgba(148, 163, 184, 0.2);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 2rem 0 1.5rem;
}

.sidebar-top,
.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
}

.sidebar-button {
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: 18px;
  padding: 0.75rem 0.6rem;
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  font-weight: 600;
  font-size: 0.7rem;
  text-align: center;
  line-height: 1.1;
  cursor: pointer;
  box-shadow: 0 14px 26px rgba(147, 147, 147, 0.4);
}

.sidebar-button.active {
  background: rgba(29, 79, 216, 0.8);
  box-shadow: 0 16px 28px rgba(29, 78, 216, 0.5);
}

.sidebar-glyph {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.2);
  font-size: 1.1rem;
  line-height: 1;
}

.sidebar-button .sidebar-glyph {
  margin-bottom: 0.1rem;
}

.sidebar-button.secondary .sidebar-glyph {
  background: rgba(255, 255, 255, 0.28);
}

.profile-button {
  border: none;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.profile-button.active {
  background: rgba(29, 79, 216, 0.5);
}

.profile-button.active .profile-avatar {
  background: rgba(15, 23, 42, 0.2);
  color: #fff;
}

.profile-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 600;
  display: grid;
  place-items: center;
  font-size: 0.8rem;
}

@media (max-width: 960px) {
  .workspace-sidebar {
    position: sticky;
    top: 0;
    width: 100%;
    height: auto;
    flex-direction: row;
    justify-content: space-between;
    padding: 1.2rem 6vw;
    z-index: 10;
  }

  .sidebar-top {
    flex-direction: row;
  }

  .sidebar-button {
    width: auto;
    height: auto;
    padding: 0.8rem 1.2rem;
  }

  .sidebar-button {
    display: inline-flex;
    gap: 0.4rem;
  }

  .sidebar-glyph {
    margin: 0 0.4rem 0 0;
  }

  .sidebar-button .sidebar-glyph {
    margin-bottom: 0;
  }
}
</style>
