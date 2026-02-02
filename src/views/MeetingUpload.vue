<script setup>
import { computed, getCurrentInstance, ref } from 'vue'
import WorkspaceSidebar from '../components/WorkspaceSidebar.vue'
import MeetingUploadForm from '../components/MeetingUploadForm.vue'

const router = getCurrentInstance().appContext.config.globalProperties.$router
const activePath = computed(() => router?.currentRoute?.value?.path || '')
const uploadFormRef = ref(null)

const goToNewTask = () => router?.push('/tasks/new')
const goToTaskList = () => router?.push('/tasks/view')
const goToHome = () => router?.push('/home')
const goToProfile = () => router?.push('/settings')
const goToMeetingRecords = () => router?.push('/meetings')
const goToUserDashboard = () => router?.push('/users/dashboard')

const submitFromHeader = () => {
  uploadFormRef.value?.submitMeetingRecords()
}
</script>

<template>
  <div class="meeting-page">
    <WorkspaceSidebar
      :on-create-task="goToNewTask"
      :on-view-tasks="goToTaskList"
      :on-go-home="goToHome"
      :on-go-profile="goToProfile"
      :active-path="activePath"
      :on-view-meetings="goToMeetingRecords"
      :on-view-user-dashboard="goToUserDashboard"
    />
    <header class="meeting-header">
      <div>
        <p class="eyebrow">上傳會議記錄</p>
        <h1 class="headline">會議記錄資料夾</h1>
        <p class="subhead">選擇客戶、廠家與產品後，上傳包含多個會議記錄的資料夾。</p>
      </div>
      <div class="header-actions">
        <button class="primary-button" type="button" @click="submitFromHeader">
          上傳會議記錄
        </button>
      </div>
    </header>

    <section class="meeting-layout">
      <MeetingUploadForm ref="uploadFormRef" :show-internal-submit="false" />
    </section>
  </div>
</template>

<style scoped>
.meeting-page {
  min-height: 100vh;
  padding: 3.5rem 6vw 4.5rem calc(6vw + 88px);
  background: #f6f7fb;
  color: #0f172a;
  display: grid;
  gap: 2.5rem;
}

.meeting-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 2rem;
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

.header-actions {
  display: flex;
  gap: 1rem;
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
</style>
