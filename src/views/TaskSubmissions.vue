<script setup>
import { computed, getCurrentInstance, onMounted, onUnmounted, reactive, ref } from 'vue'
import WorkspaceSidebar from '../components/WorkspaceSidebar.vue'
import ResultModal from '../components/ResultModal.vue'
import RelatedUsersTooltip from '../components/RelatedUsersTooltip.vue'
import { normalizeFollowUpContent as normalizeFollowUpText } from '../scripts/followUpUtils.js'
import { formatDateTimeDisplay, formatDateTimeInput } from '../scripts/time.js'
import { filterUserOptions, normalizeUserOptions } from '../scripts/user-options/index.js'
import {
  deleteTaskSubmission,
  fetchTagOptions as fetchTagOptionsRequest,
  fetchTaskSubmissions,
  fetchUsers as fetchUsersRequest,
  updateTaskSubmission,
} from '../scripts/taskSubmissions.js'

const router = getCurrentInstance().appContext.config.globalProperties.$router
const activePath = computed(() => router?.currentRoute?.value?.path || '')
const submissions = ref([])
const isLoading = ref(false)
const editingId = ref(null)
const tagOptions = ref([])
const relatedUsers = ref([])
const selectedTags = ref([])
const selectedRelatedUsers = ref([])
const activeList = ref(null)
const searchQuery = reactive({
  tag: '',
  user: '',
})
const followUpInput = ref('')
const followUpItems = ref([])
const editingFollowUpIndex = ref(null)
const followUpEditValue = ref('')
const activeFollowUpAssigneeMenu = ref(null)
const editForm = ref({
  client: '',
  vendor: '',
  product: '',
  start_at: '',
  end_at: '',
})
const showResult = ref(false)
const resultTitle = ref('')
const resultMessage = ref('')
const filterState = reactive({
  fields: ['all'],
  query: '',
})

const filteredSubmissions = computed(() => {
  const query = filterState.query.trim().toLowerCase()
  if (!query) return submissions.value
  return submissions.value.filter((item) => {
    const tags = Array.isArray(item.tags) ? item.tags.join(' ') : ''
    const fields = {
      all: `${item.client_name ?? ''} ${item.vendor_name ?? ''} ${item.product_name ?? ''} ${
        item.created_by_email ?? ''
      } ${tags}`,
      client: item.client_name ?? '',
      vendor: item.vendor_name ?? '',
      product: item.product_name ?? '',
      creator: item.created_by_email ?? '',
      tag: tags,
    }
    const activeFields = filterState.fields.length ? filterState.fields : ['all']
    if (activeFields.includes('all')) {
      return fields.all.toLowerCase().includes(query)
    }
    return activeFields.some((field) => (fields[field] ?? '').toLowerCase().includes(query))
  })
})

const toggleFilterField = (field) => {
  const currentFields = filterState.fields
  if (field === 'all') {
    filterState.fields = ['all']
    return
  }
  const nextFields = currentFields.filter((item) => item !== 'all')
  if (nextFields.includes(field)) {
    filterState.fields = nextFields.filter((item) => item !== field)
  } else {
    filterState.fields = [...nextFields, field]
  }
  if (filterState.fields.length === 0) {
    filterState.fields = ['all']
  }
}

const goToNewTask = () => {
  router?.push('/tasks/new')
}

const goToHome = () => {
  router?.push('/home')
}

const goToProfile = () => {
  router?.push('/settings')
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

const getRelatedUsers = (item) => item.related_users || []

const fetchTagOptions = async () => {
  try {
    tagOptions.value = await fetchTagOptionsRequest()
  } catch (error) {
    console.error(error)
  }
}

const fetchUsers = async () => {
  const auth = readAuthStorage()
  if (!auth) return
  try {
    const result = await fetchUsersRequest(auth.token)
    if (!result?.success) return
    relatedUsers.value = normalizeUserOptions(result.data || [])
  } catch (error) {
    console.error(error)
  }
}

const fetchSubmissions = async () => {
  const auth = readAuthStorage()
  if (!auth) {
    resultTitle.value = '無法載入'
    resultMessage.value = '請先登入再檢視任務。'
    showResult.value = true
    return
  }
  isLoading.value = true
  try {
    const { response, data } = await fetchTaskSubmissions(auth.token)
    if (!response.ok || !data?.success) {
      resultTitle.value = '讀取失敗'
      resultMessage.value = data?.message || '無法讀取任務資料'
      showResult.value = true
      return
    }
    submissions.value = data.data || []
  } catch (error) {
    console.error(error)
    resultTitle.value = '讀取失敗'
    resultMessage.value = '無法讀取任務資料'
    showResult.value = true
  } finally {
    isLoading.value = false
  }
}

const openList = async (type) => {
  if (activeList.value === type) {
    activeList.value = null
    return
  }
  activeList.value = type
  searchQuery[type] = ''
  if (type === 'tag') {
    await fetchTagOptions()
  }
  if (type === 'user') {
    await fetchUsers()
  }
}

const getFilteredOptions = (type) => {
  const query = searchQuery[type]?.trim().toLowerCase() ?? ''
  const source = type === 'tag' ? tagOptions.value : relatedUsers.value
  if (!query) return source
  if (type === 'user') {
    return filterUserOptions(source, query)
  }
  return source.filter((item) => item.toLowerCase().includes(query))
}

const getFilteredRelatedUsers = () => {
  return filterUserOptions(selectedRelatedUsers.value, searchQuery.user)
}

const toggleTag = (tag) => {
  if (selectedTags.value.includes(tag)) {
    selectedTags.value = selectedTags.value.filter((item) => item !== tag)
  } else {
    selectedTags.value = [...selectedTags.value, tag]
  }
}

const removeTag = (tag) => {
  selectedTags.value = selectedTags.value.filter((item) => item !== tag)
}

const isRelatedUserSelected = (item) =>
  selectedRelatedUsers.value.some((user) => user.mail === item.mail)

const cleanupFollowUpAssignees = () => {
  const allowedMails = new Set(selectedRelatedUsers.value.map((user) => user.mail))
  followUpItems.value = followUpItems.value.map((item) => ({
    ...item,
    assignees: (item.assignees || []).filter((mail) => allowedMails.has(mail)),
  }))
}

const toggleRelatedUser = (item) => {
  if (isRelatedUserSelected(item)) {
    selectedRelatedUsers.value = selectedRelatedUsers.value.filter(
      (user) => user.mail !== item.mail
    )
    cleanupFollowUpAssignees()
    return
  }
  selectedRelatedUsers.value = [...selectedRelatedUsers.value, item]
}

const addFollowUpItem = () => {
  const value = followUpInput.value.trim()
  if (!value) return
  followUpItems.value = [
    ...followUpItems.value,
    {
      content: value,
      assignees: [],
    },
  ]
  followUpInput.value = ''
}

const removeFollowUpItem = (index) => {
  followUpItems.value = followUpItems.value.filter((_, idx) => idx !== index)
  if (editingFollowUpIndex.value === index) {
    editingFollowUpIndex.value = null
    followUpEditValue.value = ''
  }
}

const editFollowUpItem = (item, index) => {
  editingFollowUpIndex.value = index
  followUpEditValue.value = normalizeFollowUpText(item.content)
}

const confirmFollowUpEdit = () => {
  const value = followUpEditValue.value.trim()
  if (!value || editingFollowUpIndex.value === null) return
  followUpItems.value = followUpItems.value.map((item, index) => {
    if (index !== editingFollowUpIndex.value) return item
    return {
      ...item,
      content: normalizeFollowUpText(value),
    }
  })
  editingFollowUpIndex.value = null
  followUpEditValue.value = ''
}

const toggleFollowUpAssigneeMenu = (index) => {
  activeFollowUpAssigneeMenu.value =
    activeFollowUpAssigneeMenu.value === index ? null : index
  searchQuery.user = ''
}

const isFollowUpAssigneeSelected = (item, user) => (item.assignees || []).includes(user.mail)

const toggleFollowUpAssignee = (item, user) => {
  if (!user?.mail) return
  followUpItems.value = followUpItems.value.map((followUpItem) => {
    if (followUpItem !== item) return followUpItem
    const assignees = followUpItem.assignees || []
    const nextAssignees = assignees.includes(user.mail)
      ? assignees.filter((mail) => mail !== user.mail)
      : [...assignees, user.mail]
    return {
      ...followUpItem,
      assignees: nextAssignees,
    }
  })
}

const getFollowUpAssigneeLabel = (item) => {
  const assignees = item.assignees || []
  if (assignees.length === 0) return '設定跟進人'
  const assigneeNames = relatedUsers.value
    .filter((user) => assignees.includes(user.mail))
    .map((user) => user.username || user.mail)
  return assigneeNames.length > 0 ? assigneeNames.join('、') : '設定跟進人'
}

const startEdit = (submission) => {
  editingId.value = submission.id
  selectedTags.value = Array.isArray(submission.tags) ? submission.tags : []
  selectedRelatedUsers.value = normalizeUserOptions(
    Array.isArray(submission.related_users) ? submission.related_users : []
  )
  followUpItems.value = Array.isArray(submission.follow_ups)
    ? submission.follow_ups
        .map((entry) => {
          if (!entry) return null
          if (typeof entry === 'string') {
            return {
              content: entry,
              assignees: [],
            }
          }
          const content = normalizeFollowUpText(entry.content ?? entry)
          if (!content) return null
          const assignees = Array.isArray(entry.assignees)
            ? entry.assignees
                .map((item) => (typeof item === 'string' ? item : item?.mail))
                .filter((mail) => typeof mail === 'string' && mail.trim())
            : []
          return {
            content,
            assignees,
          }
        })
        .filter((entry) => entry?.content)
    : []
  followUpInput.value = ''
  editingFollowUpIndex.value = null
  followUpEditValue.value = ''
  activeList.value = null
  activeFollowUpAssigneeMenu.value = null
  searchQuery.tag = ''
  searchQuery.user = ''
  editForm.value = {
    client: submission.client_name,
    vendor: submission.vendor_name,
    product: submission.product_name,
    start_at: formatDateTimeInput(submission.start_at),
    end_at: formatDateTimeInput(submission.end_at),
  }
}

const cancelEdit = () => {
  editingId.value = null
  activeList.value = null
  activeFollowUpAssigneeMenu.value = null
}

const saveEdit = async (id) => {
  const tagItems = selectedTags.value
  const relatedUserMails = selectedRelatedUsers.value.map((user) => user.mail)
  const followUpPayload = followUpItems.value.map((item) => ({
    content: item.content,
    assignees: Array.isArray(item.assignees)
      ? item.assignees
          .map((assignee) => (typeof assignee === 'string' ? assignee : assignee?.mail))
          .filter((mail) => typeof mail === 'string' && mail.trim())
      : [],
  }))
  if (
    !editForm.value.client?.trim() ||
    !editForm.value.vendor?.trim() ||
    !editForm.value.product?.trim() ||
    tagItems.length === 0 ||
    relatedUserMails.length === 0
  ) {
    resultTitle.value = '更新失敗'
    resultMessage.value = '請完整填寫客戶、廠家、產品、標籤與關聯用戶。'
    showResult.value = true
    return
  }
  const auth = readAuthStorage()
  if (!auth) {
    resultTitle.value = '更新失敗'
    resultMessage.value = '請先登入再更新任務。'
    showResult.value = true
    return
  }
  try {
    const payload = {
      ...editForm.value,
      tag: tagItems,
      follow_up: followUpPayload,
      related_user_mail: relatedUserMails,
    }
    const { response, data } = await updateTaskSubmission(id, auth.token, payload)
    if (!response.ok || !data?.success) {
      resultTitle.value = '更新失敗'
      resultMessage.value = data?.message || '任務更新失敗'
      showResult.value = true
      return
    }
    resultTitle.value = '更新成功'
    resultMessage.value = data?.message || '任務更新成功'
    showResult.value = true
    await fetchSubmissions()
    editingId.value = null
  } catch (error) {
    console.error(error)
    resultTitle.value = '更新失敗'
    resultMessage.value = '任務更新失敗'
    showResult.value = true
  }
}

const deleteSubmission = async (id) => {
  if (!window.confirm('確定要刪除此任務嗎？')) return
  const auth = readAuthStorage()
  if (!auth) {
    resultTitle.value = '刪除失敗'
    resultMessage.value = '請先登入再刪除任務。'
    showResult.value = true
    return
  }
  try {
    const { response, data } = await deleteTaskSubmission(id, auth.token)
    if (!response.ok || !data?.success) {
      resultTitle.value = '刪除失敗'
      resultMessage.value = data?.message || '任務刪除失敗'
      showResult.value = true
      return
    }
    resultTitle.value = '刪除成功'
    resultMessage.value = data?.message || '任務已刪除'
    showResult.value = true
    submissions.value = submissions.value.filter((item) => item.id !== id)
  } catch (error) {
    console.error(error)
    resultTitle.value = '刪除失敗'
    resultMessage.value = '任務刪除失敗'
    showResult.value = true
  }
}

const handleOutsideClick = (event) => {
  if (!activeList.value && activeFollowUpAssigneeMenu.value === null) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.option-list') || target.closest('.select-field')) return
  if (target.closest('.follow-up-assignee')) return
  activeList.value = null
  activeFollowUpAssigneeMenu.value = null
}

onMounted(() => {
  fetchSubmissions()
  fetchTagOptions()
  fetchUsers()
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<template>
  <div class="task-view-page">
    <WorkspaceSidebar
      :on-create-task="goToNewTask"
      :on-go-home="goToHome"
      :on-go-profile="goToProfile"
      :on-view-tasks="goToTaskList"
      :on-view-meetings="goToMeetingRecords"
      :on-view-user-dashboard="goToUserDashboard"
      :active-path="activePath"
    />

    <header class="task-view-header">
      <div>
        <p class="eyebrow">檢視任務</p>
        <h1 class="headline">任務提交清單</h1>
        <p class="subhead">檢視、編輯或刪除已提交的任務資料。</p>
      </div>
      <div class="task-filter">
        <label class="filter-label" for="task-filter-field">過濾條件</label>
        <div class="filter-controls">
          <div id="task-filter-field" class="filter-options" role="group">
            <button
              type="button"
              class="filter-chip"
              :class="{ active: filterState.fields.includes('all') }"
              @click="toggleFilterField('all')"
            >
              全部欄位
            </button>
            <button
              type="button"
              class="filter-chip"
              :class="{ active: filterState.fields.includes('client') }"
              @click="toggleFilterField('client')"
            >
              客戶
            </button>
            <button
              type="button"
              class="filter-chip"
              :class="{ active: filterState.fields.includes('vendor') }"
              @click="toggleFilterField('vendor')"
            >
              廠家
            </button>
            <button
              type="button"
              class="filter-chip"
              :class="{ active: filterState.fields.includes('product') }"
              @click="toggleFilterField('product')"
            >
              產品
            </button>
            <button
              type="button"
              class="filter-chip"
              :class="{ active: filterState.fields.includes('creator') }"
              @click="toggleFilterField('creator')"
            >
              建立者
            </button>
            <button
              type="button"
              class="filter-chip"
              :class="{ active: filterState.fields.includes('tag') }"
              @click="toggleFilterField('tag')"
            >
              標籤
            </button>
          </div>
          <input
            v-model="filterState.query"
            type="text"
            class="filter-input"
            placeholder="輸入關鍵字"
          />
          <button
            class="ghost-button small"
            type="button"
            :disabled="!filterState.query"
            @click="filterState.query = ''"
          >
            清除
          </button>
        </div>
      </div>
    </header>

    <section class="task-table-section">
      <div v-if="!isLoading && submissions.length === 0" class="empty-state">
        尚無提交紀錄，請先新增任務。
      </div>
      <div v-else-if="!isLoading && filteredSubmissions.length === 0" class="empty-state">
        目前條件沒有符合的任務，請調整過濾條件。
      </div>
      <div v-else class="table-wrapper">
        <table class="task-table">
          <thead>
            <tr>
              <th class="col-client">客戶</th>
              <th class="col-vendor">廠家</th>
              <th class="col-product">廠家產品</th>
              <th class="col-tags">標籤</th>
              <th>開始時間</th>
              <th>結束時間</th>
              <th class="col-followup">需跟進內容</th>
              <th>建立者</th>
              <th>建立時間</th>
              <th class="col-users">關聯用戶</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredSubmissions" :key="item.id">
              <td class="col-client">
                <template v-if="editingId === item.id">
                  <input v-model="editForm.client" type="text" />
                </template>
                <template v-else>{{ item.client_name }}</template>
              </td>
              <td class="col-vendor">
                <template v-if="editingId === item.id">
                  <input v-model="editForm.vendor" type="text" />
                </template>
                <template v-else>{{ item.vendor_name }}</template>
              </td>
              <td class="col-product">
                <template v-if="editingId === item.id">
                  <input v-model="editForm.product" type="text" />
                </template>
                <template v-else>{{ item.product_name }}</template>
              </td>
              <td class="col-tags">
                <template v-if="editingId === item.id">
                  <div class="inline-select">
                    <button class="select-field" type="button" @click="openList('tag')">
                      {{ selectedTags.length > 0 ? selectedTags.join('、') : '選擇標籤' }}
                    </button>
                    <div v-if="activeList === 'tag'" class="option-list">
                      <input
                        v-model="searchQuery.tag"
                        class="option-search"
                        type="text"
                        placeholder="搜尋標籤"
                      />
                      <button
                        v-for="tag in getFilteredOptions('tag')"
                        :key="tag"
                        type="button"
                        class="option-item"
                        @click="toggleTag(tag)"
                      >
                        {{ tag }}
                      </button>
                    </div>
                    <div v-if="selectedTags.length > 0" class="tag-list">
                      <span v-for="tag in selectedTags" :key="tag" class="tag-chip">
                        {{ tag }}
                        <button type="button" class="chip-remove" @click="removeTag(tag)">×</button>
                      </span>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <span v-if="item.tags?.length">{{ item.tags.join('、') }}</span>
                  <span v-else>-</span>
                </template>
              </td>
              <td>
                <template v-if="editingId === item.id">
                  <input v-model="editForm.start_at" type="datetime-local" />
                </template>
                <template v-else>{{ formatDateTimeDisplay(item.start_at) }}</template>
              </td>
              <td>
                <template v-if="editingId === item.id">
                  <input v-model="editForm.end_at" type="datetime-local" />
                </template>
                <template v-else>{{ formatDateTimeDisplay(item.end_at) }}</template>
              </td>
              <td class="col-followup">
                <template v-if="editingId === item.id">
                  <div class="follow-up-edit">
                    <div class="follow-up-input">
                      <input
                        v-model="followUpInput"
                        type="text"
                        placeholder="輸入需跟進內容並加入"
                      />
                      <button type="button" class="primary-button small" @click="addFollowUpItem">
                        新增
                      </button>
                    </div>
                    <div v-if="followUpItems.length > 0" class="follow-up-list follow-up-edit-list">
                      <div
                        v-for="(entry, index) in followUpItems"
                        :key="`${entry.content}-${index}`"
                        class="follow-up-row"
                      >
                        <div class="follow-up-assignee">
                          <button
                            type="button"
                            class="select-field small"
                            :disabled="selectedRelatedUsers.length === 0"
                            @click="toggleFollowUpAssigneeMenu(index)"
                          >
                            {{ getFollowUpAssigneeLabel(entry) }}
                          </button>
                          <div
                            v-if="activeFollowUpAssigneeMenu === index"
                            class="option-list assignee-list"
                          >
                            <input
                              v-model="searchQuery.user"
                              class="option-search"
                              type="text"
                              placeholder="搜尋用戶"
                            />
                            <button
                              v-for="user in getFilteredRelatedUsers()"
                              :key="user.mail"
                              type="button"
                              class="option-item user-option"
                              @click="toggleFollowUpAssignee(entry, user)"
                            >
                              <span
                                class="user-avatar"
                                :style="{ backgroundColor: user.icon_bg || '#e2e8f0' }"
                              >
                                {{ user.icon || '🙂' }}
                              </span>
                              <span class="user-label">{{ user.username || 'user' }}</span>
                              <span v-if="isFollowUpAssigneeSelected(entry, user)" class="user-selected">
                                ✓
                              </span>
                            </button>
                          </div>
                        </div>
                        <div class="follow-up-item">
                          <template v-if="editingFollowUpIndex === index">
                            <input
                              v-model="followUpEditValue"
                              type="text"
                              class="follow-up-edit-input"
                            />
                          </template>
                          <span v-else class="follow-up-content">
                            {{ normalizeFollowUpText(entry.content) }}
                          </span>
                          <div class="follow-up-actions">
                            <button
                              type="button"
                              class="chip-edit"
                              @click="
                                editingFollowUpIndex === index
                                  ? confirmFollowUpEdit()
                                  : editFollowUpItem(entry, index)
                              "
                            >
                              {{ editingFollowUpIndex === index ? '確認' : '✎' }}
                            </button>
                            <button type="button" class="chip-remove" @click="removeFollowUpItem(index)">
                              ×
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <ul v-if="item.follow_ups?.length" class="follow-up-list">
                    <li v-for="entry in item.follow_ups" :key="entry.id || entry">
                      {{ normalizeFollowUpText(entry) }}
                    </li>
                  </ul>
                  <span v-else>-</span>
                </template>
              </td>
              <td>{{ item.created_by_email }}</td>
              <td>{{ formatDateTimeDisplay(item.created_at) }}</td>
              <td class="col-users">
                <template v-if="editingId === item.id">
                  <div class="inline-select">
                    <button class="select-field" type="button" @click="openList('user')">
                      {{
                        selectedRelatedUsers.length > 0
                          ? selectedRelatedUsers.map((user) => user.username || 'user').join(', ')
                          : '選擇關聯用戶'
                      }}
                    </button>
                    <div v-if="activeList === 'user'" class="option-list">
                      <input
                        v-model="searchQuery.user"
                        class="option-search"
                        type="text"
                        placeholder="搜尋用戶"
                      />
                      <button
                        v-for="user in getFilteredOptions('user')"
                        :key="user.mail"
                        type="button"
                        class="option-item user-option"
                        @click="toggleRelatedUser(user)"
                      >
                        <span
                          class="user-avatar"
                          :style="{ backgroundColor: user.icon_bg || '#e2e8f0' }"
                        >
                          {{ user.icon || '🙂' }}
                        </span>
                        <span class="user-label">{{ user.username || 'user' }}</span>
                        <span v-if="isRelatedUserSelected(user)" class="user-selected">已選</span>
                      </button>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <RelatedUsersTooltip :users="getRelatedUsers(item)" />
                </template>
              </td>
              <td class="action-cell col-actions">
                <template v-if="editingId === item.id">
                  <div class="action-buttons">
                    <button class="ghost-button" type="button" @click="cancelEdit">取消</button>
                    <button class="primary-button" type="button" @click="saveEdit(item.id)">
                      儲存
                    </button>
                  </div>
                </template>
                <template v-else>
                  <div class="action-buttons">
                    <button class="ghost-button" type="button" @click="startEdit(item)">
                      編輯
                    </button>
                    <button class="danger-button" type="button" @click="deleteSubmission(item.id)">
                      刪除
                    </button>
                  </div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ResultModal
      :is-open="showResult"
      :title="resultTitle"
      :message="resultMessage"
      @close="showResult = false"
    />
  </div>
</template>

<style scoped>
.task-view-page {
  min-height: 100vh;
  padding: 3.5rem 6vw 4.5rem calc(6vw + 88px);
  background: #f6f7fb;
  color: #0f172a;
  display: grid;
  gap: 2.5rem;
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: hidden;
}

.task-view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 2rem;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
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

.task-filter {
  display: grid;
  gap: 0.6rem;
  min-width: 320px;
  max-width: 100%;
}

.filter-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.filter-input {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  background: #fff;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.filter-chip {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.filter-chip.active {
  border-color: #111827;
  background: #111827;
  color: #fff;
}

.filter-input {
  min-width: 200px;
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

.ghost-button {
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
  color: #475569;
}

.ghost-button.small {
  padding: 0.45rem 0.9rem;
  border-radius: 10px;
  font-size: 0.85rem;
}

.danger-button {
  border: none;
  background: #dc2626;
  color: #fff;
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
}

.follow-up-list {
  margin: 0;
  padding-left: 1.1rem;
  color: #0f172a;
}

.follow-up-edit-list {
  padding-left: 0;
  display: grid;
  gap: 0.5rem;
}

.task-table-section {
  background: #fff;
  padding: 1.5rem;
  border-radius: 24px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  max-height: calc(100vh - 260px);
  margin-bottom: 1.5rem;
  overflow-y: auto;
}

.empty-state {
  color: #64748b;
  font-weight: 500;
  padding: 1rem 0.5rem;
}

.table-wrapper {
  overflow-x: visible;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 960px;
}

.task-table th,
.task-table td {
  text-align: left;
  padding: 0.75rem 0.6rem;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.9rem;
  vertical-align: top;
}

.task-table th {
  color: #64748b;
  font-weight: 600;
}

.task-table input,
.task-table textarea {
  width: 100%;
  min-width: 140px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  font-family: inherit;
}

.inline-select {
  display: grid;
  gap: 0.5rem;
}

.select-field {
  width: 100%;
  min-width: 160px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.select-field.small {
  padding: 0.35rem 0.55rem;
  font-size: 0.8rem;
  min-width: 110px;
}

.option-list {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.5rem;
  display: grid;
  gap: 0.4rem;
  background: #fff;
  max-height: 220px;
  overflow: auto;
}

.option-search {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
}

.option-item {
  border: none;
  background: #f8fafc;
  border-radius: 10px;
  padding: 0.35rem 0.6rem;
  text-align: left;
  cursor: pointer;
  font-size: 0.85rem;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #e2e8f0;
  color: #1f2937;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
}

.chip-remove,
.chip-edit {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
  color: #475569;
}

.user-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}

.user-label {
  flex: 1;
  font-size: 0.85rem;
  color: #0f172a;
}

.user-selected {
  font-size: 0.75rem;
  color: #16a34a;
  font-weight: 600;
}

.task-table textarea {
  resize: vertical;
}

.action-cell {
  vertical-align: middle;
}

.action-buttons {
  display: inline-flex;
  gap: 0.5rem;
  flex-wrap: nowrap;
  align-items: center;
  min-height: 44px;
}

.follow-up-edit {
  display: grid;
  gap: 0.5rem;
}

.follow-up-input {
  display: flex;
  gap: 0.4rem;
}

.follow-up-input input {
  flex: 1;
}

.primary-button.small {
  padding: 0.45rem 0.8rem;
  border-radius: 10px;
  font-size: 0.8rem;
}

.follow-up-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 10px;
  background: #f8fafc;
}

.follow-up-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.follow-up-assignee {
  position: relative;
}

.follow-up-content {
  flex: 1;
  color: #0f172a;
}

.follow-up-assignee .option-list {
  width: max-content;
  min-width: 320px;
  right: auto;
}

.follow-up-actions {
  display: flex;
  gap: 0.4rem;
}

.follow-up-edit-input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
}

.col-client,
.col-vendor,
.col-product {
  min-width: 160px;
}

.col-tags,
.col-users {
  min-width: 220px;
}

.col-followup {
  width: 32rem;
  min-width: 32rem;
  white-space: nowrap;
}

.col-actions {
  min-width: 160px;
}

@media (max-width: 960px) {
  .task-view-page {
    padding: 2.5rem 6vw 3rem;
  }

  .task-view-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .task-filter {
    width: 100%;
  }
}
</style>
