<script setup>
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import WorkspaceSidebar from '../components/WorkspaceSidebar.vue'
import ResultModal from '../components/ResultModal.vue'
import DifyAutoFillPanel from '../components/DifyAutoFillPanel.vue'
import ScrollPanel from '../components/element/ScrollPanel.vue'
import { apiBaseUrl } from '../scripts/apiBaseUrl.js'
import { normalizeFollowUpContent as normalizeFollowUpText } from '../scripts/followUpUtils.js'
import { filterUserOptions, normalizeUserOptions } from '../scripts/user-options/index.js'

const clients = ref([])
const vendors = ref([])
const products = ref([])
const tags = ref([])

const selectedClient = ref('')
const selectedVendor = ref('')
const selectedProduct = ref('')
const selectedTags = ref([])
const selectedRelatedUsers = ref([])
const activeList = ref(null)
const selectedStartAt = ref('')
const selectedEndAt = ref('')
const followUpInput = ref('')
const followUpItems = ref([])
const editingFollowUpIndex = ref(null)
const followUpEditValue = ref('')
const activeFollowUpAssigneeMenu = ref(null)
const activeQuickAssignMenu = ref(false)
const showRequiredHints = ref(false)
const searchQuery = reactive({
  client: '',
  vendor: '',
  product: '',
  tag: '',
  user: '',
})

const activeModal = ref(null)
const newOption = ref('')
const optionMessage = ref('')
const optionMessageType = ref('')
const draftKey = 'innerai_task_draft'
const showDraftSaved = ref(false)
const showResult = ref(false)
const resultTitle = ref('')
const resultMessage = ref('')
const isSubmitting = ref(false)
const router = getCurrentInstance().appContext.config.globalProperties.$router
const activePath = computed(() => router?.currentRoute?.value?.path || '')

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

const openModal = (type) => {
  activeModal.value = type
  newOption.value = ''
  optionMessage.value = ''
  optionMessageType.value = ''
  fetchOptions(type).catch((error) => console.error(error))
}

const fetchOptions = async (type) => {
  const response = await fetch(`${apiBaseUrl}/api/options/${type}`)
  if (!response.ok) {
    throw new Error('Failed to load options')
  }
  const data = await response.json()
  if (type === 'client') clients.value = data
  if (type === 'vendor') vendors.value = data
  if (type === 'product') products.value = data
  if (type === 'tag') tags.value = data
}

const fetchUsers = async () => {
  const auth = readAuthStorage()
  if (!auth) return
  const response = await fetch(`${apiBaseUrl}/api/users`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  })
  if (!response.ok) {
    throw new Error('Failed to load users')
  }
  const data = await response.json()
  relatedUsers.value = normalizeUserOptions(data?.data ?? [])
}

const relatedUsers = ref([])

const loadAllOptions = async () => {
  await Promise.all(['client', 'vendor', 'product', 'tag'].map((type) => fetchOptions(type)))
}

const openList = async (type) => {
  if (activeList.value === type) {
    activeList.value = null
    return
  }
  activeList.value = type
  searchQuery[type] = ''
  try {
    if (type === 'user') {
      await fetchUsers()
    } else {
      await fetchOptions(type)
    }
  } catch (error) {
    console.error(error)
  }
}

const optionExists = (type, value) => {
  if (!value) return false
  const source =
    type === 'client'
      ? clients.value
      : type === 'vendor'
        ? vendors.value
        : type === 'product'
          ? products.value
          : tags.value
  return source.includes(value)
}

const optionStatus = (type, value) => {
  if (!value) return ''
  return optionExists(type, value) ? '' : '不存在，提交後將自動建立'
}

const optionStatusClass = (type, value) => {
  if (!value) return ''
  return optionExists(type, value) ? 'exists' : 'missing'
}

const ensureOptionExists = async (type, value) => {
  if (!value || optionExists(type, value)) return
  const response = await fetch(`${apiBaseUrl}/api/options/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: value }),
  })
  if (!response.ok) {
    throw new Error('Failed to add option')
  }
  const created = await response.json()
  if (type === 'client') clients.value.unshift(created.name)
  if (type === 'vendor') vendors.value.unshift(created.name)
  if (type === 'product') products.value.unshift(created.name)
  if (type === 'tag') tags.value.unshift(created.name)
}

const getFilteredOptions = (type) => {
  const query = searchQuery[type]?.trim().toLowerCase() ?? ''
  const source =
    type === 'client'
      ? clients.value
      : type === 'vendor'
        ? vendors.value
        : type === 'product'
          ? products.value
          : type === 'tag'
            ? tags.value
            : relatedUsers.value
  if (!query) return source
  if (type === 'user') {
    return filterUserOptions(source, query)
  }
  return source.filter((item) => item.toLowerCase().includes(query))
}

const getFilteredRelatedUsers = () => {
  return filterUserOptions(selectedRelatedUsers.value, searchQuery.user)
}

const selectOption = (type, item) => {
  if (type === 'client') {
    selectedClient.value = item
  }
  if (type === 'vendor') {
    selectedVendor.value = item
  }
  if (type === 'product') {
    selectedProduct.value = item
  }
  if (type === 'tag') {
    if (selectedTags.value.includes(item)) {
      selectedTags.value = selectedTags.value.filter((tag) => tag !== item)
    } else {
      selectedTags.value = [...selectedTags.value, item]
    }
  }
  activeList.value = null
}

const removeTag = (tag) => {
  selectedTags.value = selectedTags.value.filter((item) => item !== tag)
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

const toggleQuickAssignMenu = () => {
  activeQuickAssignMenu.value = !activeQuickAssignMenu.value
  if (activeQuickAssignMenu.value) {
    activeFollowUpAssigneeMenu.value = null
  }
  searchQuery.user = ''
}

const toggleFollowUpAssigneeMenu = (index) => {
  activeFollowUpAssigneeMenu.value =
    activeFollowUpAssigneeMenu.value === index ? null : index
  if (activeFollowUpAssigneeMenu.value !== null) {
    activeQuickAssignMenu.value = false
  }
  searchQuery.user = ''
}

const applyQuickAssign = (user) => {
  if (!user?.mail) return
  followUpItems.value = followUpItems.value.map((item) => ({
    ...item,
    assignees: item.assignees?.includes(user.mail)
      ? item.assignees
      : [...(item.assignees || []), user.mail],
  }))
  activeQuickAssignMenu.value = false
}

const isFollowUpAssigneeSelected = (item, user) =>
  (item.assignees || []).includes(user.mail)

const isQuickAssignSelected = (user) => {
  if (!user?.mail) return false
  if (followUpItems.value.length === 0) return false
  return followUpItems.value.every((item) => (item.assignees || []).includes(user.mail))
}

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
    .map((user) => user.username || 'user')
  return assigneeNames.length > 0 ? assigneeNames.join('、') : '設定跟進人'
}

const closeModal = () => {
  activeModal.value = null
  newOption.value = ''
  optionMessage.value = ''
  optionMessageType.value = ''
}

const requiredText = (isMissing) => (showRequiredHints.value && isMissing ? '*必填' : '*')

const addOption = async () => {
  const value = newOption.value.trim()
  if (!value) return
  try {
    const response = await fetch(`${apiBaseUrl}/api/options/${activeModal.value}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: value }),
    })
    if (!response.ok) {
      throw new Error('Failed to add option')
    }
    const created = await response.json()
    if (activeModal.value === 'client') {
      clients.value.unshift(created.name)
      selectedClient.value = created.name
    }
    if (activeModal.value === 'vendor') {
      vendors.value.unshift(created.name)
      selectedVendor.value = created.name
    }
    if (activeModal.value === 'product') {
      products.value.unshift(created.name)
      selectedProduct.value = created.name
    }
    if (activeModal.value === 'tag') {
      tags.value.unshift(created.name)
      if (!selectedTags.value.includes(created.name)) {
        selectedTags.value = [...selectedTags.value, created.name]
      }
    }
    optionMessage.value = `"${created.name}" 新增成功`
    optionMessageType.value = 'success'
    newOption.value = ''
  } catch (error) {
    console.error(error)
    optionMessage.value = '新增失敗'
    optionMessageType.value = 'error'
  }
}

const deleteOption = async (type, name) => {
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/options/${type}?name=${encodeURIComponent(name)}`,
      {
        method: 'DELETE',
      }
    )
    if (!response.ok) {
      throw new Error('Failed to delete option')
    }
    if (type === 'client') {
      clients.value = clients.value.filter((item) => item !== name)
      if (selectedClient.value === name) selectedClient.value = ''
    }
    if (type === 'vendor') {
      vendors.value = vendors.value.filter((item) => item !== name)
      if (selectedVendor.value === name) selectedVendor.value = ''
    }
    if (type === 'product') {
      products.value = products.value.filter((item) => item !== name)
      if (selectedProduct.value === name) selectedProduct.value = ''
    }
    if (type === 'tag') {
      tags.value = tags.value.filter((item) => item !== name)
      if (selectedTags.value.includes(name)) {
        selectedTags.value = selectedTags.value.filter((tag) => tag !== name)
      }
    }
  } catch (error) {
    console.error(error)
  }
}

const saveDraft = () => {
  const payload = {
    selectedClient: selectedClient.value,
    selectedVendor: selectedVendor.value,
    selectedProduct: selectedProduct.value,
    selectedTags: selectedTags.value,
    selectedRelatedUsers: selectedRelatedUsers.value,
    selectedStartAt: selectedStartAt.value,
    selectedEndAt: selectedEndAt.value,
    followUpItems: followUpItems.value.map((item) => ({
      ...item,
      content: normalizeFollowUpText(item.content),
    })),
  }
  window.localStorage.setItem(draftKey, JSON.stringify(payload))
  showDraftSaved.value = true
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

const parseJsonSafe = async (response) => {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

const normalizeFollowUpContent = (value) => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    if (typeof value.content === 'string') return value.content
    if (typeof value.text === 'string') return value.text
    if (typeof value.title === 'string') return value.title
  }
  return ''
}

const resetOptionalFields = () => {
  selectedStartAt.value = ''
  selectedEndAt.value = ''
  followUpInput.value = ''
  followUpItems.value = []
  editingFollowUpIndex.value = null
  followUpEditValue.value = ''
  activeFollowUpAssigneeMenu.value = null
  activeQuickAssignMenu.value = false
  activeList.value = null
  searchQuery.user = ''
  showRequiredHints.value = false
}

const submitTask = async () => {
  if (isSubmitting.value) return
  const payload = {
    client: selectedClient.value,
    vendor: selectedVendor.value,
    product: selectedProduct.value,
    tag: selectedTags.value,
    related_user_mail: selectedRelatedUsers.value.map((user) => user.mail),
    start_at: selectedStartAt.value,
    end_at: selectedEndAt.value,
    follow_up: followUpItems.value.map((item) => ({
      content: item.content,
      assignees: item.assignees || [],
    })),
  }
  if (
    !selectedClient.value ||
    !selectedVendor.value ||
    !selectedProduct.value ||
    selectedTags.value.length === 0 ||
    selectedRelatedUsers.value.length === 0
  ) {
    showRequiredHints.value = true
    return
  }
  showRequiredHints.value = false
  try {
    const auth = readAuthStorage()
    if (!auth) {
      resultTitle.value = '建立失敗'
      resultMessage.value = '請先登入再建立任務。'
      showResult.value = true
      return
    }
    isSubmitting.value = true
    await loadAllOptions().catch(() => {})
    await ensureOptionExists('client', selectedClient.value)
    await ensureOptionExists('vendor', selectedVendor.value)
    await ensureOptionExists('product', selectedProduct.value)
    for (const tag of selectedTags.value) {
      await ensureOptionExists('tag', tag)
    }
    const response = await fetch(`${apiBaseUrl}/api/task-submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify(payload),
    })
    const data = await parseJsonSafe(response)
    if (!response.ok || !data?.success) {
      resultTitle.value = '建立失敗'
      resultMessage.value = data?.message || '任務建立失敗'
      showResult.value = true
      return
    }
    resultTitle.value = '建立成功'
    resultMessage.value = data?.message || '任務建立成功'
    showResult.value = true
    window.localStorage.removeItem(draftKey)
    resetOptionalFields()
  } catch (error) {
    console.error(error)
    resultTitle.value = '建立失敗'
    resultMessage.value = '任務建立失敗，請稍後再試。'
    showResult.value = true
  } finally {
    isSubmitting.value = false
  }
}

const applyAutoFill = (payload) => {
  if (typeof payload !== 'object' || !payload) return
  if (payload.client) selectedClient.value = payload.client
  if (payload.vendor) selectedVendor.value = payload.vendor
  if (payload.product) selectedProduct.value = payload.product
  if (payload.tag) {
    const tags = Array.isArray(payload.tag) ? payload.tag : [payload.tag]
    selectedTags.value = tags.filter(Boolean)
  }
  if (payload.start_at) selectedStartAt.value = payload.start_at
  if (payload.end_at) selectedEndAt.value = payload.end_at
  if (!payload.start_at && payload.scheduled_at) {
    selectedStartAt.value = payload.scheduled_at
  }
  if (payload.follow_up) {
    const followUps = Array.isArray(payload.follow_up) ? payload.follow_up : [payload.follow_up]
    followUpItems.value = followUps
      .map((item) => {
        if (typeof item === 'string') {
          return { content: item, assignees: [] }
        }
        if (typeof item === 'object' && item?.content) {
          return {
            content: normalizeFollowUpText(item.content),
            assignees: Array.isArray(item.assignees) ? item.assignees : [],
          }
        }
        if (typeof item === 'object') {
          const content = normalizeFollowUpText(item)
          if (!content) return null
          return { content, assignees: [] }
        }
        return null
      })
      .filter(Boolean)
  }
}

const loadDraft = () => {
  const raw = window.localStorage.getItem(draftKey)
  if (!raw) return
  try {
    const payload = JSON.parse(raw)
    selectedClient.value = payload.selectedClient ?? ''
    selectedVendor.value = payload.selectedVendor ?? ''
    selectedProduct.value = payload.selectedProduct ?? ''
    selectedTags.value = payload.selectedTags ?? []
    selectedRelatedUsers.value = normalizeUserOptions(payload.selectedRelatedUsers ?? [])
    selectedStartAt.value = payload.selectedStartAt ?? ''
    selectedEndAt.value = payload.selectedEndAt ?? ''
    followUpItems.value = Array.isArray(payload.followUpItems)
      ? payload.followUpItems.map((item) => {
          if (typeof item === 'string') {
            return { content: item, assignees: [] }
          }
          if (item && typeof item === 'object') {
            const content = normalizeFollowUpText(item.content ?? item)
            if (!content) return null
            return {
              content,
              assignees: Array.isArray(item.assignees) ? item.assignees : [],
            }
          }
          return null
        }).filter(Boolean)
      : []
  } catch {
    window.localStorage.removeItem(draftKey)
  }
}

onMounted(() => {
  loadDraft()
  loadAllOptions().catch((error) => console.error(error))
  fetchUsers().catch((error) => console.error(error))
})

const closeMenusOnOutsideClick = (event) => {
  const target = event.target
  if (!(target instanceof Element)) {
    activeList.value = null
    activeQuickAssignMenu.value = false
    activeFollowUpAssigneeMenu.value = null
    return
  }
  const withinSelectField = target.closest('.select-field-wrapper')
  const withinQuickAssign = target.closest('.quick-assign-wrapper')
  const withinAssignee = target.closest('.follow-up-assignee')
  const withinAssigneeMenu = target.closest('.assignee-list')

  if (!withinSelectField && !withinQuickAssign && !withinAssignee && !withinAssigneeMenu) {
    activeList.value = null
  }
  if (activeQuickAssignMenu.value && !withinQuickAssign) {
    activeQuickAssignMenu.value = false
  }
  if (activeFollowUpAssigneeMenu.value !== null && !withinAssignee && !withinAssigneeMenu) {
    activeFollowUpAssigneeMenu.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', closeMenusOnOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenusOnOutsideClick)
})
</script>

<template>
  <div class="task-page">
    <WorkspaceSidebar
      :on-create-task="goToNewTask"
      :on-view-tasks="goToTaskList"
      :on-view-meetings="goToMeetingRecords"
      :on-view-user-dashboard="goToUserDashboard"
      :on-go-home="goToHome"
      :on-go-profile="goToProfile"
      :active-path="activePath"
    />
    <header class="task-header">
      <div>
        <p class="eyebrow">新增任務</p>
        <h1 class="headline">建立新的工作追蹤</h1>
        <p class="subhead">填寫任務設定，快速建立後續追蹤內容。</p>
      </div>
      <div class="header-actions">
        <button class="ghost-button" type="button" @click="saveDraft">儲存草稿</button>
        <button class="primary-button" type="button" :disabled="isSubmitting" @click="submitTask">
          {{ isSubmitting ? '建立中...' : '建立任務' }}
        </button>
      </div>
    </header>

    <section class="task-layout">
      <ScrollPanel class="task-form-scroll" height="calc(100vh - 260px)">
        <form class="task-form" @submit.prevent="submitTask">
          <div class="field-grid">
            <div class="field select-field-wrapper">
              <div class="field-header">
                <span class="field-title">
                  客戶
                  <span class="required-asterisk">
                    {{ requiredText(!selectedClient) }}
                  </span>
                </span>
                <button class="ghost-mini" type="button" @click="openModal('client')">編輯</button>
              </div>
              <button class="select-field" type="button" @click="openList('client')">
                {{ selectedClient || '選擇客戶' }}
              </button>
              <p
                v-if="selectedClient && optionStatus('client', selectedClient)"
                :class="['option-status', optionStatusClass('client', selectedClient)]"
              >
                {{ optionStatus('client', selectedClient) }}
              </p>
              <div v-if="activeList === 'client'" class="option-list">
                <input
                  v-model="searchQuery.client"
                  class="option-search"
                  type="text"
                  placeholder="搜尋客戶"
                />
                <button
                  v-for="item in getFilteredOptions('client')"
                  :key="item"
                  type="button"
                  class="option-item"
                  @click="selectOption('client', item)"
                >
                  {{ item }}
                </button>
              </div>
            </div>
            <div class="field select-field-wrapper">
              <div class="field-header">
                <span class="field-title">
                  廠家
                  <span class="required-asterisk">
                    {{ requiredText(!selectedVendor) }}
                  </span>
                </span>
                <button class="ghost-mini" type="button" @click="openModal('vendor')">編輯</button>
              </div>
              <button class="select-field" type="button" @click="openList('vendor')">
                {{ selectedVendor || '選擇廠家' }}
              </button>
              <p
                v-if="selectedVendor && optionStatus('vendor', selectedVendor)"
                :class="['option-status', optionStatusClass('vendor', selectedVendor)]"
              >
                {{ optionStatus('vendor', selectedVendor) }}
              </p>
              <div v-if="activeList === 'vendor'" class="option-list">
                <input
                  v-model="searchQuery.vendor"
                  class="option-search"
                  type="text"
                  placeholder="搜尋廠家"
                />
                <button
                  v-for="item in getFilteredOptions('vendor')"
                  :key="item"
                  type="button"
                  class="option-item"
                  @click="selectOption('vendor', item)"
                >
                  {{ item }}
                </button>
              </div>
            </div>
          <div class="field select-field-wrapper">
            <div class="field-header">
              <span class="field-title">
                廠家產品
                <span class="required-asterisk">
                  {{ requiredText(!selectedProduct) }}
                </span>
              </span>
              <button class="ghost-mini" type="button" @click="openModal('product')">編輯</button>
            </div>
            <button class="select-field" type="button" @click="openList('product')">
              {{ selectedProduct || '選擇產品' }}
            </button>
            <p
              v-if="selectedProduct && optionStatus('product', selectedProduct)"
              :class="['option-status', optionStatusClass('product', selectedProduct)]"
            >
              {{ optionStatus('product', selectedProduct) }}
            </p>
            <div v-if="activeList === 'product'" class="option-list">
              <input
                v-model="searchQuery.product"
                class="option-search"
                type="text"
                placeholder="搜尋產品"
              />
              <button
                v-for="item in getFilteredOptions('product')"
                :key="item"
                type="button"
                class="option-item"
                @click="selectOption('product', item)"
              >
                {{ item }}
              </button>
            </div>
          </div>
          <div class="field select-field-wrapper">
            <div class="field-header">
              <span class="field-title">
                任務標籤
                <span class="required-asterisk">
                  {{ requiredText(selectedTags.length === 0) }}
                </span>
              </span>
              <button class="ghost-mini" type="button" @click="openModal('tag')">編輯</button>
            </div>
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
                v-for="item in getFilteredOptions('tag')"
                :key="item"
                type="button"
                class="option-item"
                @click="selectOption('tag', item)"
              >
                {{ item }}
              </button>
            </div>
            <div v-if="selectedTags.length > 0" class="tag-list">
              <span v-for="item in selectedTags" :key="item" class="tag-chip">
                {{ item }}
                <button type="button" class="chip-remove" @click="removeTag(item)">×</button>
              </span>
            </div>
          </div>
          <div class="field select-field-wrapper">
            <div class="field-header">
              <span class="field-title">
                關聯用戶
                <span class="required-asterisk">
                  {{ requiredText(selectedRelatedUsers.length === 0) }}
                </span>
              </span>
            </div>
            <button class="select-field multi-select-field" type="button" @click="openList('user')">
              {{
                selectedRelatedUsers.length > 0
                  ? selectedRelatedUsers
                      .map((user) => user.username || 'user')
                      .join(', ')
                  : '選擇關聯用戶'
              }}
            </button>
            <div v-if="activeList === 'user'" class="option-list user-multi-options">
              <input
                v-model="searchQuery.user"
                class="option-search"
                type="text"
                placeholder="搜尋用戶"
              />
              <button
                v-for="item in getFilteredOptions('user')"
                :key="item.mail"
                type="button"
                class="option-item user-option"
                @click="toggleRelatedUser(item)"
              >
                <span
                  class="user-avatar"
                  :style="{ backgroundColor: item.icon_bg || '#e2e8f0' }"
                >
                  {{ item.icon || '🙂' }}
                </span>
                <span class="user-label">
                  {{ item.username || 'user' }}
                </span>
                <span v-if="isRelatedUserSelected(item)" class="user-selected">已選</span>
              </button>
            </div>
          </div>
          <label class="field">
            <span>開始時間</span>
            <input v-model="selectedStartAt" type="datetime-local" />
          </label>
          <label class="field">
            <span>結束時間</span>
            <input v-model="selectedEndAt" type="datetime-local" />
          </label>
          <label class="field wide">
            <span>需跟進內容</span>
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
            <div v-if="followUpItems.length > 0" class="follow-up-list">
              <div
                v-for="(item, index) in followUpItems"
                :key="`${item.content}-${index}`"
                class="follow-up-row"
              >
                <div class="follow-up-assignee">
                  <button
                    type="button"
                    class="select-field small multi-select-field"
                    :disabled="selectedRelatedUsers.length === 0"
                    @click="toggleFollowUpAssigneeMenu(index)"
                  >
                    {{ getFollowUpAssigneeLabel(item) }}
                  </button>
                  <div
                    v-if="activeFollowUpAssigneeMenu === index"
                    class="option-list assignee-list user-multi-options"
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
                      @click="toggleFollowUpAssignee(item, user)"
                    >
                      <span
                        class="user-avatar"
                        :style="{ backgroundColor: user.icon_bg || '#e2e8f0' }"
                      >
                        {{ user.icon || '🙂' }}
                      </span>
                      <span class="user-label">
                        {{ user.username || 'user' }}
                      </span>
                      <span v-if="isFollowUpAssigneeSelected(item, user)" class="user-selected">
                        已選
                      </span>
                    </button>
                  </div>
                </div>
                <div class="follow-up-item">
                  <template v-if="editingFollowUpIndex === index">
                    <input v-model="followUpEditValue" type="text" class="follow-up-edit-input" />
                  </template>
                  <span v-else class="follow-up-content">
                    {{ normalizeFollowUpText(item.content) }}
                  </span>
                  <div class="follow-up-actions">
                    <button
                      type="button"
                      class="chip-edit"
                      @click="
                        editingFollowUpIndex === index
                          ? confirmFollowUpEdit()
                          : editFollowUpItem(item, index)
                      "
                    >
                      {{ editingFollowUpIndex === index ? '✓' : '✎' }}
                    </button>
                    <button type="button" class="chip-remove" @click="removeFollowUpItem(index)">
                      ×
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="follow-up-quick-assign">
              <div class="quick-assign-wrapper">
                <button
                  type="button"
                  class="ghost-button small"
                  :disabled="selectedRelatedUsers.length === 0 || followUpItems.length === 0"
                  @click="toggleQuickAssignMenu"
                >
                  一鍵指派
                </button>
                <div v-if="activeQuickAssignMenu" class="option-list assignee-list user-multi-options">
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
                    @click="applyQuickAssign(user)"
                  >
                    <span
                      class="user-avatar"
                      :style="{ backgroundColor: user.icon_bg || '#e2e8f0' }"
                    >
                      {{ user.icon || '🙂' }}
                    </span>
                    <span class="user-label">
                      {{ user.username || 'user' }}
                    </span>
                    <span v-if="isQuickAssignSelected(user)" class="user-selected">已選</span>
                  </button>
                </div>
              </div>
            </div>
          </label>
        </div>

        </form>
      </ScrollPanel>

      <aside class="task-summary">
        <div class="summary-card">
          <h2>建立提示</h2>
          <ul>
            <li>請確認客戶與廠家名稱一致。</li>
            <li>開始與結束時間可用於提醒或行程安排。</li>
            <li>跟進內容建議拆分為具體事項。</li>
          </ul>
        </div>
        <DifyAutoFillPanel :on-fill="applyAutoFill" />
      </aside>
    </section>

    <div v-if="activeModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card">
        <h2>
          編輯{{
            activeModal === 'client'
              ? '客戶'
              : activeModal === 'vendor'
                ? '廠家'
                : activeModal === 'product'
                  ? '產品'
                  : '標籤'
          }}
        </h2>
        <p>可新增或刪除清單中的項目。</p>
        <div class="modal-list">
          <div
            v-for="item in activeModal === 'client'
              ? clients
              : activeModal === 'vendor'
                ? vendors
                : activeModal === 'product'
                  ? products
                  : tags"
            :key="item"
            class="modal-list-item"
          >
            <span>{{ item }}</span>
            <button
              class="danger-button"
              type="button"
              @click="deleteOption(activeModal, item)"
            >
              刪除
            </button>
          </div>
        </div>
        <input v-model="newOption" type="text" placeholder="新增項目名稱" />
        <div class="modal-actions">
          <button class="ghost-button" type="button" @click="closeModal">取消</button>
          <button class="primary-button" type="button" @click="addOption">新增</button>
        </div>
        <p v-if="optionMessage" :class="['modal-message', optionMessageType]">
          {{ optionMessage }}
        </p>
      </div>
    </div>

    <div v-if="showDraftSaved" class="modal-overlay" @click.self="showDraftSaved = false">
      <div class="modal-card">
        <h2>儲存成功</h2>
        <p>任務草稿已保存到本機。</p>
        <div class="modal-actions">
          <button class="primary-button" type="button" @click="showDraftSaved = false">確定</button>
        </div>
      </div>
    </div>

    <ResultModal
      :is-open="showResult"
      :title="resultTitle"
      :message="resultMessage"
      @close="showResult = false"
    />
  </div>
</template>

<style scoped>
.task-page {
  min-height: 100vh;
  padding: 3.5rem 6vw 4.5rem calc(6vw + 88px);
  background: #f6f7fb;
  color: #0f172a;
  display: grid;
  gap: 2.5rem;
}

.task-header {
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

.header-actions {
  display: flex;
  gap: 1rem;
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

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.task-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 2rem;
  align-items: stretch;
  --panel-min-height: 520px;
}

.task-form-scroll {
  overflow-x: hidden;
  min-height: var(--panel-min-height);
}

.task-form-scroll :deep(.scroll-panel__body) {
  min-height: var(--panel-min-height);
}

.task-form {
  background: #fff;
  padding: 2rem;
  border-radius: 24px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  display: grid;
  gap: 2rem;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-weight: 500;
}

.select-field-wrapper {
  position: relative;
}

.field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-title {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
}

.field span {
  font-size: 0.9rem;
  color: #475569;
}

.field .required-asterisk {
  font-size: 0.95rem;
  font-weight: 700;
  color: #dc2626;
  line-height: 1;
}

.field input,
.field textarea {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  font-size: 0.95rem;
  background: #fff;
  resize: vertical;
}

.select-field {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  font-size: 0.95rem;
  background: #fff;
  text-align: left;
  cursor: pointer;
  min-width: 160px;
}

.select-field::after {
  content: '▾';
  float: right;
  color: #94a3b8;
}

.multi-select-field {
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  color: #0f172a;
}

.multi-select-field::after {
  content: none;
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
  max-height: 160px;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 5;
  box-shadow: 0 18px 30px rgba(15, 23, 42, 0.12);
}

.user-multi-options {
  max-height: 180px;
  z-index: 10;
}

.option-search {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  background: #fff;
}

.tag-list {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-chip {
  background: #eef2ff;
  color: #4338ca;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.chip-remove {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.9rem;
  color: inherit;
}

.chip-edit {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.9rem;
  color: inherit;
}

.option-status {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: #64748b;
}

.follow-up-input {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

.follow-up-input input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.6rem 0.8rem;
}

.follow-up-edit-input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
}

.primary-button.small {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
}

.follow-up-list {
  margin-top: 0.6rem;
  display: grid;
  gap: 0.4rem;
}

.follow-up-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.follow-up-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.4rem 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
}

.follow-up-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}

.follow-up-assignee {
  position: relative;
}

.follow-up-quick-assign {
  margin-top: 0.6rem;
  display: flex;
  justify-content: flex-start;
}

.follow-up-content {
  flex: 1;
  color: #0f172a;
}

.quick-assign-wrapper {
  position: relative;
}

.quick-assign-wrapper .option-list {
  width: max-content;
  min-width: 320px;
  right: auto;
}

.follow-up-assignee .option-list {
  width: max-content;
  min-width: 320px;
  right: auto;
}

.ghost-button.small {
  padding: 0.45rem 0.8rem;
  font-size: 0.85rem;
  min-width: 110px;
}

.ghost-button.small:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.assignee-list {
  max-height: none;
  overflow: visible;
  width: max-content;
}

.option-status.exists {
  color: #16a34a;
}

.option-status.missing {
  color: #dc2626;
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
  white-space: nowrap;
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

.field .user-selected {
  color: #16a34a;
}

.field textarea {
  min-height: 140px;
}

.field.wide {
  grid-column: 1 / -1;
}

.task-summary {
  display: grid;
  gap: 1.5rem;
  min-height: var(--panel-min-height);
  align-content: start;
}

.summary-card {
  background: #fff;
  border-radius: 24px;
  padding: 1.8rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.summary-card h2 {
  margin: 0 0 1rem;
  font-size: 1.2rem;
}

.summary-card ul {
  margin: 0;
  padding-left: 1.2rem;
  color: #64748b;
  display: grid;
  gap: 0.6rem;
}

.summary-card p {
  margin: 0;
  color: #64748b;
}

.focus-list {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.focus-list span {
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 0.85rem;
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
  border-radius: 20px;
  padding: 2rem;
  width: min(420px, 100%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
  display: grid;
  gap: 1rem;
}

.modal-card h2 {
  margin: 0;
  font-size: 1.4rem;
}

.modal-card p {
  margin: 0;
  color: #64748b;
}

.modal-card input {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  font-size: 0.95rem;
}

.modal-list {
  display: grid;
  gap: 0.6rem;
  max-height: 220px;
  overflow: auto;
  padding-right: 0.2rem;
}

.modal-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0.8rem;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.danger-button {
  border: none;
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  cursor: pointer;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.modal-message {
  margin: 0;
  font-weight: 600;
  font-size: 0.9rem;
}

.modal-message.success {
  color: #16a34a;
}

.modal-message.error {
  color: #dc2626;
}

@media (max-width: 1024px) {
  .task-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .task-page {
    padding: 2.5rem 6vw 3.5rem;
  }

  .task-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .field-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
  }
}
</style>
