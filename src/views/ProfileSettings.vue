<template>
  <div class="settings-page">
    <WorkspaceSidebar
      :on-create-task="goToNewTask"
      :on-view-tasks="goToTaskList"
      :on-view-meetings="goToMeetingRecords"
      :on-view-user-dashboard="goToUserDashboard"
      :on-go-home="goToHome"
      :on-go-profile="goToProfile"
      :active-path="activePath"
    />
    <header class="settings-header">
      <div>
        <p class="eyebrow">使用者設定</p>
        <h1>個人資料與權限</h1>
        <p class="subhead">更新你的頭像、名稱、權限與密碼。</p>
      </div>
      <div class="header-actions">
        <button class="ghost-button" type="button" @click="handleLogout">登出</button>
        <button class="primary-button" type="button" @click="saveProfile">儲存設定</button>
      </div>
    </header>

    <section class="settings-grid">
      <div class="panel">
        <h2>頭像設定</h2>
        <div class="avatar-preview" :style="{ backgroundColor: localIconBg }">
          {{ localIcon }}
        </div>
        <div class="icon-grid">
          <button
            v-for="icon in iconOptions"
            :key="icon"
            type="button"
            :class="['icon-option', { active: localIcon === icon }]"
            @click="localIcon = icon"
          >
            {{ icon }}
          </button>
          <div v-if="showCustomIcon" class="icon-option custom-input">
            <input
              ref="customIconInput"
              v-model="customIcon"
              type="text"
              inputmode="text"
              placeholder="＋"
              maxlength="4"
              @input="handleCustomIconInput"
              @blur="handleCustomIconInput"
            />
          </div>
          <button v-else class="icon-option add-option" type="button" @click="openCustomIcon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div class="color-grid">
          <button
            v-for="color in iconColors"
            :key="color"
            type="button"
            :class="['color-swatch', { active: localIconBg === color }]"
            :style="{ backgroundColor: color }"
            @click="localIconBg = color"
          ></button>
          <label class="color-swatch add-option">
            <input v-model="customColor" type="color" @input="localIconBg = customColor" />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </label>
        </div>
      </div>

      <div class="panel">
        <h2>基本資訊</h2>
        <label class="field">
          <span>Username</span>
          <input v-model="localUsername" type="text" placeholder="hi" />
        </label>
        <label class="field">
          <span>Role</span>
          <select v-model="localRole">
            <option value="normal">normal</option>
            <option value="admin">admin</option>
          </select>
        </label>
      </div>

      <div class="panel wide">
        <h2>修改密碼</h2>
        <p class="hint">請先輸入舊密碼，再填入新密碼。</p>
        <div class="password-grid">
          <label class="field">
            <span>舊密碼</span>
            <input v-model="currentPassword" type="password" placeholder="輸入舊密碼" />
          </label>
          <label class="field">
            <span>新密碼</span>
            <input v-model="newPassword" type="password" placeholder="輸入新密碼" />
          </label>
        </div>
      </div>
    </section>

    <p v-if="message" class="message">{{ message }}</p>
  </div>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, ref } from 'vue'
import WorkspaceSidebar from '../components/WorkspaceSidebar.vue'
import { apiBaseUrl } from '../scripts/apiBaseUrl.js'

const router = getCurrentInstance().appContext.config.globalProperties.$router
const activePath = computed(() => router?.currentRoute?.value?.path || '')

const iconOptions = [
  '🙂',
  '😎',
  '🎯',
  '🚀',
  '🧠',
  '📌',
  '✨',
  '🛠️',
  '👩‍💻',
  '👨‍💻',
  '📊',
  '🧩',
  '🧭',
  '📣',
  '🧪',
  '📚',
  '🎨',
  '⚡️',
  '🧱',
  '💡',
]
const iconColors = ['#e2e8f0', '#fde68a', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fecdd3', '#fed7aa']
const showCustomIcon = ref(false)
const customIcon = ref('')
const customColor = ref('#e2e8f0')
const customIconInput = ref(null)

const localIcon = ref('🙂')
const localIconBg = ref('#e2e8f0')
const localUsername = ref('hi')
const localRole = ref('normal')
const currentPassword = ref('')
const newPassword = ref('')
const message = ref('')
const userEmail = ref('')

const goToHome = () => router?.push('/home')
const goToNewTask = () => router?.push('/tasks/new')
const goToTaskList = () => router?.push('/tasks/view')
const goToMeetingRecords = () => router?.push('/meetings')
const goToUserDashboard = () => router?.push('/users/dashboard')
const goToProfile = () => router?.push('/settings')

const handleLogout = () => {
  const rememberedEmail = window.localStorage.getItem('innerai_remember_email')
  window.localStorage.clear()
  if (rememberedEmail) {
    window.localStorage.setItem('innerai_remember_email', rememberedEmail)
  }
  window.sessionStorage.clear()
  router?.push('/')
}

const loadUser = () => {
  const raw = window.localStorage.getItem('innerai_user')
  if (!raw) return
  try {
    const user = JSON.parse(raw)
    userEmail.value = user.mail || ''
    localIcon.value = user.icon || '🙂'
    localIconBg.value = user.icon_bg || '#e2e8f0'
    localUsername.value = user.username || 'hi'
    localRole.value = user.role || 'normal'
  } catch {
    // ignore
  }
}

const normalizeEmoji = (value) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const iterator = segmenter.segment(trimmed)[Symbol.iterator]()
    const first = iterator.next().value
    return first?.segment || ''
  }
  return Array.from(trimmed)[0] || ''
}

const openCustomIcon = () => {
  showCustomIcon.value = true
  customIcon.value = ''
  nextTick(() => {
    if (customIconInput.value) {
      customIconInput.value.focus()
      customIconInput.value.select()
    }
  })
}

const handleCustomIconInput = () => {
  const icon = normalizeEmoji(customIcon.value)
  customIcon.value = icon
  if (!icon) return
  localIcon.value = icon
  showCustomIcon.value = false
}

const saveProfile = async () => {
  message.value = ''
  if (!userEmail.value) {
    message.value = '尚未登入，無法編輯'
    return
  }
  try {
    const response = await fetch(`${apiBaseUrl}/api/users/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail.value,
        icon: localIcon.value,
        icon_bg: localIconBg.value,
        username: localUsername.value,
        role: localRole.value,
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      message.value = data.message || '更新失敗'
      return
    }
    window.localStorage.setItem(
      'innerai_user',
      JSON.stringify({
        mail: userEmail.value,
        icon: localIcon.value,
        icon_bg: localIconBg.value,
        username: localUsername.value,
        role: localRole.value,
      })
    )
    window.dispatchEvent(new Event('innerai_user_updated'))
    message.value = '已更新'
    currentPassword.value = ''
    newPassword.value = ''
    customIcon.value = ''
  } catch (error) {
    console.error(error)
    message.value = '更新失敗'
  }
}

onMounted(loadUser)
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  padding: 3.5rem 6vw 4.5rem calc(6vw + 88px);
  background: #f6f7fb;
  color: #0f172a;
  display: grid;
  gap: 2rem;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 2rem;
}

.header-actions {
  display: flex;
  gap: 0.8rem;
  align-items: center;
}

.ghost-button {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
  padding: 0.7rem 1.4rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
}

.subhead {
  margin: 0.4rem 0 0;
  color: #64748b;
  max-width: 520px;
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

.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 1.6rem;
}

.panel {
  background: #fff;
  border-radius: 24px;
  padding: 2rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  display: grid;
  gap: 1.2rem;
}

.panel.wide {
  grid-column: 1 / -1;
}

.avatar-preview {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  font-size: 2rem;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
  gap: 0.6rem;
}

.icon-option {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  width: 56px;
  height: 56px;
  font-size: 1.2rem;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.icon-option.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

.custom-input {
  padding: 0;
}

.custom-input input {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 1.2rem;
  outline: none;
}

.color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.color-swatch {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 2px solid transparent;
  cursor: pointer;
  display: grid;
  place-items: center;
  position: relative;
}

.color-swatch.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

.add-option {
  border: 1px dashed #cbd5f5;
  color: #6366f1;
}

.add-option svg {
  width: 18px;
  height: 18px;
}

.color-swatch input[type='color'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field span {
  font-size: 0.9rem;
  color: #475569;
}

.field input,
.field select {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem 0.9rem;
  font-size: 0.95rem;
  background: #fff;
}

.password-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.hint {
  margin: 0;
  color: #64748b;
}

.message {
  color: #2563eb;
  font-weight: 500;
}

@media (max-width: 1024px) {
  .settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .settings-page {
    padding: 2.5rem 6vw 3.5rem;
  }

  .settings-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .password-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
