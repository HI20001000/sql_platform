<script setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import WorkspaceSidebar from '../components/WorkspaceSidebar.vue'
import ResultModal from '../components/ResultModal.vue'
import MeetingUploadForm from '../components/MeetingUploadForm.vue'
import ScrollPanel from '../components/element/ScrollPanel.vue'
import { formatDateTimeDisplay } from '../scripts/time.js'
import { apiBaseUrl } from '../scripts/apiBaseUrl.js'

const props = defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
  onSelectRecords: {
    type: Function,
    default: null,
  },
})

const router = getCurrentInstance()?.appContext?.config?.globalProperties?.$router ?? null
const activePath = computed(() => router?.currentRoute?.value?.path || '')

const records = ref([])
const activeRecord = ref(null)
const activeRecordMeta = ref(null)
const activeClient = ref('')
const activeVendor = ref('')
const activeProduct = ref('')
const activeMeeting = ref(null)
const searchQuery = ref({
  client: '',
  vendor: '',
  product: '',
})
const activeList = ref(null)
const isLoading = ref(false)
const showResult = ref(false)
const resultTitle = ref('')
const resultMessage = ref('')
const isUploading = ref(false)
const isDeletingMeeting = ref(false)
const uploadInput = ref(null)
const activeReport = ref(null)
const activeReportMeta = ref(null)
const reportLoadingIds = ref(new Set())
const showUploadModal = ref(false)
const uploadPrefill = ref({
  client: '',
  vendor: '',
  product: '',
})
const goToNewTask = () => router?.push('/tasks/new')
const goToTaskList = () => router?.push('/tasks/view')
const goToMeetingRecords = () => router?.push('/meetings')
const goToHome = () => router?.push('/home')
const goToProfile = () => router?.push('/settings')
const goToUserDashboard = () => router?.push('/users/dashboard')

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

const formatContent = (record) => {
  if (record?.content_text) return record.content_text
  return '目前僅支援文字與 Word（.txt／.docx）預覽。'
}

const formatReportContent = (report) => {
  if (report?.content_text) return report.content_text
  return '尚無會議報告內容。'
}

const previewTitle = computed(() => {
  if (activeReport.value) return '會議報告'
  if (activeRecord.value) return activeRecord.value.file_name
  return '檔案預覽'
})

const previewMeta = computed(() => {
  if (activeReportMeta.value) return activeReportMeta.value
  return activeRecordMeta.value
})

const previewContent = computed(() => {
  if (activeReport.value) return formatReportContent(activeReport.value)
  if (activeRecord.value) return formatContent(activeRecord.value)
  return '請先選擇會議記錄。'
})

const showPanelActions = computed(() => Boolean(activeRecord.value || activeReport.value))
const previewMeeting = computed(
  () => activeReportMeta.value || activeRecordMeta.value || activeMeeting.value
)
const canDownloadReport = computed(() => Boolean(activeReport.value && previewContent.value))

const sanitizeFilename = (name) => name.replace(/[\\/:*?"<>|]/g, '_').trim()

const textEncoder = new TextEncoder()
const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index
  for (let step = 0; step < 8; step += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

const crc32 = (data) => {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const stripMarkdown = (line) =>
  line
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/^>\s?/, '')

const escapeXml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const normalizeReportContent = (text) => text.replace(/\\n/g, '\n')

const formatListLine = (line) => {
  const trimmed = line.trim()
  if (trimmed.startsWith('- ')) {
    return `• ${trimmed.slice(2).trim()}`
  }
  if (trimmed.startsWith('•')) return trimmed
  return line
}

const buildDocxRuns = (line) => {
  const segments = line.split('\t')
  return segments
    .map((segment, index) => {
      const escaped = escapeXml(segment)
      if (index === 0) {
        return `<w:t xml:space="preserve">${escaped}</w:t>`
      }
      return `<w:tab/><w:t xml:space="preserve">${escaped}</w:t>`
    })
    .join('')
}

const buildDocxParagraphs = (markdown = '') => {
  const lines = normalizeReportContent(markdown).split(/\r?\n/)
  const paragraphs = lines.map((rawLine) => {
    const stripped = stripMarkdown(rawLine)
    const formatted = formatListLine(stripped)
    if (!formatted.trim()) {
      return '<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>'
    }
    return `<w:p><w:r>${buildDocxRuns(formatted)}</w:r></w:p>`
  })
  return paragraphs.length
    ? paragraphs.join('')
    : '<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>'
}

const downloadPreviewContent = async () => {
  if (!canDownloadReport.value) return
  const content = previewContent.value || ''
  const baseName = '會議報告'
  const safeName = sanitizeFilename(baseName) || 'meeting-report'
  const paragraphXml = buildDocxParagraphs(content)
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  const relationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  const files = [
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: relationshipsXml },
    { name: 'word/document.xml', content: documentXml },
  ]
  const parts = []
  const entries = []
  let offset = 0

  files.forEach((file) => {
    const nameBytes = textEncoder.encode(file.name)
    const dataBytes =
      typeof file.content === 'string' ? textEncoder.encode(file.content) : file.content
    const crc = crc32(dataBytes)
    const localHeader = new DataView(new ArrayBuffer(30))
    localHeader.setUint32(0, 0x04034b50, true)
    localHeader.setUint16(4, 20, true)
    localHeader.setUint16(6, 0, true)
    localHeader.setUint16(8, 0, true)
    localHeader.setUint16(10, 0, true)
    localHeader.setUint16(12, 0, true)
    localHeader.setUint32(14, crc, true)
    localHeader.setUint32(18, dataBytes.length, true)
    localHeader.setUint32(22, dataBytes.length, true)
    localHeader.setUint16(26, nameBytes.length, true)
    localHeader.setUint16(28, 0, true)
    parts.push(new Uint8Array(localHeader.buffer), nameBytes, dataBytes)
    entries.push({ nameBytes, crc, size: dataBytes.length, offset })
    offset += 30 + nameBytes.length + dataBytes.length
  })

  const centralParts = []
  let centralSize = 0
  entries.forEach((entry) => {
    const centralHeader = new DataView(new ArrayBuffer(46))
    centralHeader.setUint32(0, 0x02014b50, true)
    centralHeader.setUint16(4, 20, true)
    centralHeader.setUint16(6, 20, true)
    centralHeader.setUint16(8, 0, true)
    centralHeader.setUint16(10, 0, true)
    centralHeader.setUint16(12, 0, true)
    centralHeader.setUint16(14, 0, true)
    centralHeader.setUint32(16, entry.crc, true)
    centralHeader.setUint32(20, entry.size, true)
    centralHeader.setUint32(24, entry.size, true)
    centralHeader.setUint16(28, entry.nameBytes.length, true)
    centralHeader.setUint16(30, 0, true)
    centralHeader.setUint16(32, 0, true)
    centralHeader.setUint16(34, 0, true)
    centralHeader.setUint16(36, 0, true)
    centralHeader.setUint32(38, 0, true)
    centralHeader.setUint32(42, entry.offset, true)
    centralParts.push(new Uint8Array(centralHeader.buffer), entry.nameBytes)
    centralSize += 46 + entry.nameBytes.length
  })

  const endRecord = new DataView(new ArrayBuffer(22))
  endRecord.setUint32(0, 0x06054b50, true)
  endRecord.setUint16(4, 0, true)
  endRecord.setUint16(6, 0, true)
  endRecord.setUint16(8, entries.length, true)
  endRecord.setUint16(10, entries.length, true)
  endRecord.setUint32(12, centralSize, true)
  endRecord.setUint32(16, offset, true)
  endRecord.setUint16(20, 0, true)

  const blob = new Blob([...parts, ...centralParts, new Uint8Array(endRecord.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = `${safeName}.docx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const filteredClients = computed(() => {
  const query = searchQuery.value.client.trim().toLowerCase()
  if (!query) return records.value
  return records.value.filter((client) => client.name.toLowerCase().includes(query))
})

const getVendors = () => {
  const client = records.value.find((item) => item.name === activeClient.value)
  return client?.vendors || []
}

const getProducts = () => {
  const vendors = getVendors()
  if (!activeVendor.value) {
    return vendors.flatMap((vendor) => vendor.products)
  }
  const vendor = vendors.find((item) => item.name === activeVendor.value)
  return vendor?.products || []
}

const getMeetings = () => {
  const products = getProducts()
  if (!activeProduct.value) return []
  const product = products.find((item) => item.name === activeProduct.value)
  const meetings = product?.meetings || []
  return [...meetings].sort((a, b) => {
    const timeA = a?.meeting_time ? new Date(a.meeting_time).getTime() : 0
    const timeB = b?.meeting_time ? new Date(b.meeting_time).getTime() : 0
    return timeB - timeA
  })
}

const findMeetingById = (items, meetingId) => {
  for (const client of items || []) {
    for (const vendor of client.vendors || []) {
      for (const product of vendor.products || []) {
        for (const meeting of product.meetings || []) {
          if (meeting.id === meetingId) return meeting
        }
      }
    }
  }
  return null
}

const selectClient = (clientName) => {
  activeClient.value = clientName
  activeVendor.value = ''
  activeProduct.value = ''
  activeMeeting.value = null
  activeRecord.value = null
  activeRecordMeta.value = null
  activeReport.value = null
  activeReportMeta.value = null
  showUploadModal.value = false
}

const selectVendor = (vendorName) => {
  activeVendor.value = vendorName
  activeProduct.value = ''
  activeMeeting.value = null
  activeRecord.value = null
  activeRecordMeta.value = null
  activeReport.value = null
  activeReportMeta.value = null
  showUploadModal.value = false
}

const selectProduct = (productName) => {
  activeProduct.value = productName
  const vendor = getVendors().find((item) =>
    item.products.some((product) => product.name === productName)
  )
  if (vendor) activeVendor.value = vendor.name
  activeMeeting.value = null
  activeRecord.value = null
  activeRecordMeta.value = null
  activeReport.value = null
  activeReportMeta.value = null
  showUploadModal.value = false
}

const selectMeeting = (meeting) => {
  activeMeeting.value = meeting
  activeRecord.value = null
  activeRecordMeta.value = null
  activeReport.value = null
  activeReportMeta.value = null
  showUploadModal.value = false
}

const resetSelections = () => {
  activeClient.value = ''
  activeVendor.value = ''
  activeProduct.value = ''
  activeMeeting.value = null
  activeRecord.value = null
  activeRecordMeta.value = null
  activeReport.value = null
  activeReportMeta.value = null
  showUploadModal.value = false
  searchQuery.value.client = ''
  searchQuery.value.vendor = ''
  searchQuery.value.product = ''
  activeList.value = null
}

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        resolve('')
        return
      }
      const base64 = result.split(',')[1] || ''
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

const useSelectedMeeting = () => {
  if (!props.onSelectRecords || !activeMeeting.value) return
  props.onSelectRecords({
    records: activeMeeting.value.records || [],
    client: activeClient.value,
    vendor: activeVendor.value,
    product: activeProduct.value,
  })
}

const setActiveRecord = (record, meeting) => {
  activeRecord.value = record
  activeRecordMeta.value = meeting || activeMeeting.value
  activeReport.value = null
  activeReportMeta.value = null
  showUploadModal.value = false
}

const setActiveReport = (meeting, report) => {
  activeReport.value = report
  activeReportMeta.value = meeting
  activeRecord.value = null
  activeRecordMeta.value = null
  showUploadModal.value = false
}

const isReportLoading = (meetingId) => reportLoadingIds.value.has(meetingId)

const setReportLoading = (meetingId, isLoading) => {
  const next = new Set(reportLoadingIds.value)
  if (isLoading) {
    next.add(meetingId)
  } else {
    next.delete(meetingId)
  }
  reportLoadingIds.value = next
}

const openList = (type) => {
  if (activeList.value === type) {
    activeList.value = null
    return
  }
  activeList.value = type
}

const triggerUpload = () => {
  if (!activeMeeting.value || isUploading.value) return
  uploadInput.value?.click()
}

const handleUploadChange = async (event) => {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length || !activeMeeting.value) return
  const auth = readAuthStorage()
  if (!auth) {
    resultTitle.value = '上傳失敗'
    resultMessage.value = '請先登入'
    showResult.value = true
    return
  }
  isUploading.value = true
  try {
    const filesPayload = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        path: file.webkitRelativePath || file.name,
        type: file.type,
        contentBase64: await fileToBase64(file),
      }))
    )
    const response = await fetch(`${apiBaseUrl}/api/meeting-records/${activeMeeting.value.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ files: filesPayload }),
    })
    const data = await response.json()
    if (!response.ok || !data?.success) {
      resultTitle.value = '上傳失敗'
      resultMessage.value = data?.message || '會議記錄上傳失敗'
      showResult.value = true
      return
    }
    resultTitle.value = '上傳成功'
    resultMessage.value = data?.message || '會議記錄已更新'
    showResult.value = true
    await fetchMeetingRecords()
  } catch (error) {
    console.error(error)
    resultTitle.value = '上傳失敗'
    resultMessage.value = '會議記錄上傳失敗'
    showResult.value = true
  } finally {
    isUploading.value = false
  }
}

const handleGenerateMeetingReport = async (meeting) => {
  if (!meeting || isReportLoading(meeting.id)) return
  const auth = readAuthStorage()
  if (!auth) {
    resultTitle.value = '無法產生報告'
    resultMessage.value = '請先登入'
    showResult.value = true
    return
  }
  setReportLoading(meeting.id, true)
  try {
    const response = await fetch(`${apiBaseUrl}/api/meeting-reports/${meeting.id}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    })
    const data = await parseJsonSafe(response)
    if (!response.ok || !data?.success) {
      resultTitle.value = '報告產生失敗'
      resultMessage.value = data?.message || '無法產生會議報告'
      showResult.value = true
      return
    }
    const contentText = data?.data?.content_text || ''
    meeting.report = {
      ...(meeting.report || {}),
      content_text: contentText,
      created_at: meeting.report?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setActiveReport(meeting, meeting.report)
  } catch (error) {
    console.error(error)
    resultTitle.value = '報告產生失敗'
    resultMessage.value = '無法產生會議報告'
    showResult.value = true
  } finally {
    setReportLoading(meeting.id, false)
  }
}

const handlePreviewMeetingReport = (meeting) => {
  if (!meeting?.report?.content_text) {
    resultTitle.value = '尚無報告'
    resultMessage.value = '請先產生會議報告'
    showResult.value = true
    return
  }
  setActiveReport(meeting, meeting.report)
}

const handleMeetingReportAction = (meeting) => {
  if (meeting?.report?.content_text) {
    handlePreviewMeetingReport(meeting)
  } else {
    handleGenerateMeetingReport(meeting)
  }
}

const openUploadModal = () => {
  uploadPrefill.value = {
    client: activeClient.value || '',
    vendor: activeVendor.value || '',
    product: activeProduct.value || '',
  }
  showUploadModal.value = true
  activeRecord.value = null
  activeRecordMeta.value = null
  activeReport.value = null
  activeReportMeta.value = null
}

const closeUploadModal = () => {
  showUploadModal.value = false
}

const handleUploadSuccess = async (payload = {}) => {
  if (payload.client) {
    activeClient.value = payload.client
  }
  if (payload.vendor) {
    activeVendor.value = payload.vendor
  }
  if (payload.product) {
    activeProduct.value = payload.product
  }
  await fetchMeetingRecords()
  const meetings = getMeetings()
  if (meetings.length > 0) {
    const targetMeeting =
      meetings.find((meeting) => meeting.id === payload.meetingId) ||
      meetings.find((meeting) => {
        if (!payload.meetingTime) return false
        const meetingTime = new Date(meeting.meeting_time || '').getTime()
        const payloadTime = new Date(payload.meetingTime).getTime()
        if (!Number.isFinite(meetingTime) || !Number.isFinite(payloadTime)) return false
        return meetingTime === payloadTime
      }) ||
      meetings[0]
    activeMeeting.value = targetMeeting
    if ((targetMeeting.records || []).length > 0) {
      setActiveRecord(targetMeeting.records[0], targetMeeting)
    } else {
      activeRecord.value = null
      activeRecordMeta.value = null
      activeReport.value = null
      activeReportMeta.value = null
    }
  }
  showUploadModal.value = false
}

const deleteMeetingRecord = async (record) => {
  if (!record) return
  const auth = readAuthStorage()
  if (!auth) return
  try {
    const response = await fetch(`${apiBaseUrl}/api/meeting-records/${record.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await response.json()
    if (!response.ok || !data?.success) {
      resultTitle.value = '刪除失敗'
      resultMessage.value = data?.message || '會議記錄刪除失敗'
      showResult.value = true
      return
    }
    if (activeMeeting.value) {
      activeMeeting.value.records = (activeMeeting.value.records || []).filter(
        (item) => item.id !== record.id
      )
    }
    if (activeRecord.value?.id === record.id) {
      activeRecord.value = null
      activeRecordMeta.value = null
    }
    if (activeMeeting.value && (activeMeeting.value.records || []).length === 0) {
      activeMeeting.value = null
      activeRecord.value = null
      activeRecordMeta.value = null
      activeReport.value = null
      activeReportMeta.value = null
      await fetchMeetingRecords()
    }
  } catch (error) {
    console.error(error)
    resultTitle.value = '刪除失敗'
    resultMessage.value = '會議記錄刪除失敗'
    showResult.value = true
  }
}

const deleteMeetingFolder = async (meeting = null) => {
  const targetMeeting = meeting || activeMeeting.value
  if (!targetMeeting || isDeletingMeeting.value) return
  const auth = readAuthStorage()
  if (!auth) return
  isDeletingMeeting.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/meeting-folders/${targetMeeting.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await parseJsonSafe(response)
    const notFound = response.status === 404 || data?.message === '找不到會議資料夾'
    if ((!response.ok || !data?.success) && !notFound) {
      resultTitle.value = '刪除失敗'
      resultMessage.value = data?.message || '會議資料夾刪除失敗'
      showResult.value = true
      return
    }
    const removedId = targetMeeting.id
    const vendor = getVendors().find((item) => item.name === activeVendor.value)
    const product = vendor?.products.find((item) => item.name === activeProduct.value)
    if (product) {
      product.meetings = (product.meetings || []).filter((meeting) => meeting.id !== removedId)
    }
    if (activeMeeting.value?.id === removedId) {
      activeMeeting.value = null
      activeRecord.value = null
      activeRecordMeta.value = null
      activeReport.value = null
      activeReportMeta.value = null
    }
    await fetchMeetingRecords()
  } catch (error) {
    console.error(error)
    resultTitle.value = '刪除失敗'
    resultMessage.value = '會議資料夾刪除失敗'
    showResult.value = true
  } finally {
    isDeletingMeeting.value = false
  }
}


const filteredVendors = computed(() => {
  const vendors = getVendors()
  const query = searchQuery.value.vendor.trim().toLowerCase()
  if (!query) return vendors
  return vendors.filter((vendor) => vendor.name.toLowerCase().includes(query))
})

const filteredProducts = computed(() => {
  const products = getProducts()
  const query = searchQuery.value.product.trim().toLowerCase()
  if (!query) return products
  return products.filter((product) => product.name.toLowerCase().includes(query))
})
const fetchMeetingRecords = async () => {
  const auth = readAuthStorage()
  if (!auth) {
    resultTitle.value = '無法載入'
    resultMessage.value = '請先登入再檢視會議記錄。'
    showResult.value = true
    return
  }
  isLoading.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/meeting-records`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await parseJsonSafe(response)
    if (!response.ok || !data?.success) {
      resultTitle.value = '讀取失敗'
      resultMessage.value = data?.message || '無法讀取會議記錄'
      showResult.value = true
      return
    }
    const nextRecords = data.data || []
    records.value = nextRecords
    if (activeMeeting.value?.id) {
      const refreshedMeeting = findMeetingById(nextRecords, activeMeeting.value.id)
      if (refreshedMeeting) {
        activeMeeting.value = refreshedMeeting
        if (activeReport.value) {
          activeReport.value = refreshedMeeting.report || null
          activeReportMeta.value = refreshedMeeting
        }
      }
    }
    if (activeClient.value) {
      const currentClient = nextRecords.find((client) => client.name === activeClient.value)
      if (!currentClient) {
        activeClient.value = ''
        activeVendor.value = ''
        activeProduct.value = ''
        activeMeeting.value = null
        activeRecord.value = null
        activeRecordMeta.value = null
        activeReport.value = null
        activeReportMeta.value = null
      } else if (activeVendor.value) {
        const currentVendor = (currentClient.vendors || []).find(
          (vendor) => vendor.name === activeVendor.value
        )
        if (!currentVendor) {
          activeVendor.value = ''
          activeProduct.value = ''
          activeMeeting.value = null
          activeRecord.value = null
          activeRecordMeta.value = null
          activeReport.value = null
          activeReportMeta.value = null
        } else if (activeProduct.value) {
          const currentProduct = (currentVendor.products || []).find(
            (product) => product.name === activeProduct.value
          )
          if (!currentProduct) {
            activeProduct.value = ''
            activeMeeting.value = null
            activeRecord.value = null
            activeRecordMeta.value = null
            activeReport.value = null
            activeReportMeta.value = null
          }
        }
      }
    }
  } catch (error) {
    console.error(error)
    resultTitle.value = '讀取失敗'
    resultMessage.value = '無法讀取會議記錄'
    showResult.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchMeetingRecords)
</script>

<template>
  <div :class="['meeting-records-page', { embedded: props.embedded }]">
    <WorkspaceSidebar
      v-if="!props.embedded"
      :on-create-task="goToNewTask"
      :on-view-tasks="goToTaskList"
      :on-view-meetings="goToMeetingRecords"
      :on-view-user-dashboard="goToUserDashboard"
      :on-go-home="goToHome"
      :on-go-profile="goToProfile"
      :active-path="activePath"
    />

    <header v-if="!props.embedded" class="meeting-header">
      <div>
        <p class="eyebrow">會議記錄</p>
        <h1 class="headline">會議記錄檢視</h1>
        <p class="subhead">預覽客戶樹級關係與會議記錄檔案內容。</p>
      </div>
    </header>

    <section class="meeting-list">
      <div class="split-layout">
        <aside class="selection-panel">
          <ScrollPanel height="calc(100vh - 240px)">
          <div class="panel-section">
            <div class="panel-header">
              <div class="panel-title">
                <h2>客戶</h2>
              </div>
              <div>
                <button class="ghost-mini" type="button" @click="openUploadModal">
                  上傳
                </button>
                <button class="ghost-mini" type="button" @click="resetSelections">
                  取消
                </button>
              </div>
            </div>
            <button class="select-field" type="button" @click="openList('client')">
              {{ activeClient || '選擇客戶' }}
            </button>
            <div v-if="activeList === 'client'" class="option-list">
              <input
                v-model="searchQuery.client"
                class="option-search"
                type="text"
                placeholder="搜尋客戶"
              />
              <button
                v-for="client in filteredClients"
                :key="client.name"
                type="button"
                class="option-item"
                @click="selectClient(client.name); activeList = null"
              >
                {{ client.name }}
              </button>
            </div>
          </div>

          <div class="panel-section">
            <div class="panel-header">
              <h2>廠家</h2>
            </div>
            <button class="select-field" type="button" @click="openList('vendor')">
              {{ activeVendor || '選擇廠家' }}
            </button>
            <div v-if="activeList === 'vendor'" class="option-list">
              <input
                v-model="searchQuery.vendor"
                class="option-search"
                type="text"
                placeholder="搜尋廠家"
              />
              <button
                v-for="vendor in filteredVendors"
                :key="vendor.name"
                type="button"
                class="option-item"
                @click="selectVendor(vendor.name); activeList = null"
              >
                {{ vendor.name }}
              </button>
            </div>
          </div>

          <div class="panel-section">
            <div class="panel-header">
              <h2>廠家產品</h2>
            </div>
            <button class="select-field" type="button" @click="openList('product')">
              {{ activeProduct || '選擇產品' }}
            </button>
            <div v-if="activeList === 'product'" class="option-list">
              <input
                v-model="searchQuery.product"
                class="option-search"
                type="text"
                placeholder="搜尋產品"
              />
              <button
                v-for="product in filteredProducts"
                :key="product.name"
                type="button"
                class="option-item"
                @click="selectProduct(product.name); activeList = null"
              >
                {{ product.name }}
              </button>
            </div>
          </div>

          <div class="panel-section">
            <div class="panel-header">
              <h2>會議時間</h2>
              <span class="count">共 {{ getMeetings().length }} 筆</span>
            </div>
            <div class="meeting-list-grid">
              <div v-for="meeting in getMeetings()" :key="meeting.id" class="meeting-row">
                <button
                  type="button"
                  class="meeting-card"
                  :class="{ active: activeMeeting?.id === meeting.id }"
                  @click="selectMeeting(meeting)"
                >
                  <div class="meeting-card-main">
                    <strong>{{ formatDateTimeDisplay(meeting.meeting_time) }}</strong>
                    <span class="meeting-meta">
                      <span>
                        建立者：{{ meeting.created_by_email }}｜{{ formatDateTimeDisplay(meeting.created_at) }}
                      </span>
                      <span class="meeting-count">{{ meeting.records.length }} 份記錄</span>
                    </span>
                  </div>
                  <div v-if="!props.embedded" class="meeting-actions">
                    <button
                      type="button"
                      class="meeting-action"
                      :disabled="isUploading || isDeletingMeeting"
                      @click.stop="activeMeeting = meeting; activeRecord = null; activeRecordMeta = null; activeReport = null; activeReportMeta = null; triggerUpload()"
                    >
                      ＋
                    </button>
                    <button
                      type="button"
                      class="meeting-action"
                      :disabled="isDeletingMeeting"
                      @click.stop="activeMeeting = meeting; activeRecord = null; activeRecordMeta = null; activeReport = null; activeReportMeta = null; deleteMeetingFolder(meeting)"
                    >
                      −
                    </button>
                  </div>
                </button>
                <button
                  type="button"
                  class="meeting-report-button"
                  :disabled="isReportLoading(meeting.id)"
                  @click.stop="activeMeeting = meeting; handleMeetingReportAction(meeting)"
                >
                  <span v-if="isReportLoading(meeting.id)" class="loading-spinner"></span>
                  <span v-else aria-hidden="true">
                    {{ meeting.report?.content_text ? '🔍' : '🤖' }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div class="panel-section">
            <div class="panel-header">
              <h2>會議記錄</h2>              
            </div>
            <div class="record-list">
              <div
                v-for="record in activeMeeting?.records || []"
                :key="record.id"
                class="record-item"
              >
                <button
                  type="button"
                  class="record-button"
                  @click="setActiveRecord(record, activeMeeting)"
                >
                  <div class="record-title">
                    <strong>{{ record.file_name }}</strong>
                    <span class="record-path">{{ record.file_path }}</span>
                  </div>
                </button>
                <button
                  v-if="!props.embedded"
                  type="button"
                  class="record-action"
                  @click.stop="deleteMeetingRecord(record)"
                >
                  −
                </button>
              </div>
            </div>
          </div>
          <div v-if="props.embedded" class="panel-section">
            <button
              class="primary-button"
              type="button"
              :disabled="!activeMeeting"
              @click="useSelectedMeeting"
            >
              使用此會議
            </button>
          </div>
          </ScrollPanel>
        </aside>

        <aside class="preview-panel">
          <ScrollPanel height="calc(100vh - 240px)">
          <div class="panel-section">
            <div class="panel-header">
              <h2>{{ previewTitle }}</h2>
              <div v-if="showPanelActions" class="panel-actions">
                <button
                  class="ghost-mini"
                  type="button"
                  :disabled="!previewMeeting || isReportLoading(previewMeeting.id)"
                  @click="handleGenerateMeetingReport(previewMeeting)"
                >
                  重新生成
                </button>
                <button
                  class="ghost-mini"
                  type="button"
                  :disabled="!canDownloadReport"
                  @click="downloadPreviewContent"
                >
                  下載報告
                </button>
              </div>
            </div>
            <p v-if="previewMeta" class="meta">
              會議時間：{{ formatDateTimeDisplay(previewMeta.meeting_time) }}｜建立者：{{
                previewMeta.created_by_email
              }}｜建立時間：{{ formatDateTimeDisplay(previewMeta.created_at) }}
            </p>
            <pre class="record-content">
{{ previewContent }}
            </pre>
          </div>
          </ScrollPanel>
        </aside>
      </div>
    </section>

    <div v-if="showUploadModal" class="modal-overlay" @click.self="closeUploadModal">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <p class="eyebrow">上傳會議記錄</p>
            <h2>確認欄位與資料夾</h2>
          </div>
          <button class="ghost-mini" type="button" @click="closeUploadModal">關閉</button>
        </div>
        <MeetingUploadForm
          compact
          :initial-client="uploadPrefill.client"
          :initial-vendor="uploadPrefill.vendor"
          :initial-product="uploadPrefill.product"
          @uploaded="handleUploadSuccess"
        />
      </div>
    </div>

    <ResultModal
      :is-open="showResult"
      :title="resultTitle"
      :message="resultMessage"
      @close="showResult = false"
    />
    <input
      ref="uploadInput"
      class="sr-only"
      type="file"
      multiple
      @change="handleUploadChange"
    />
  </div>
</template>

<style scoped>
.meeting-records-page {
  min-height: 100vh;
  padding: 3.5rem 6vw 4.5rem calc(6vw + 88px);
  background: #f6f7fb;
  color: #0f172a;
  display: grid;
  gap: 2.5rem;
}

.meeting-records-page.embedded {
  min-height: auto;
  padding: 0;
  gap: 1.5rem;
  background: transparent;
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

.meeting-list {
  display: grid;
  gap: 1.5rem;
}

.split-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 1.5rem;
}

.selection-panel,
.preview-panel {
  background: #fff;
  border-radius: 24px;
  padding: 1.8rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  display: grid;
  gap: 1.5rem;
  height: calc(100vh - 240px);
}

.panel-section {
  display: grid;
  gap: 0.8rem;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}

.panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.panel-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.ghost-button {
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
  color: #475569;
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

.primary-button {
  border: none;
  background: #111827;
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.select-field {
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 0.65rem 0.8rem;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  font-weight: 600;
}

.option-list {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 0.4rem;
  display: grid;
  gap: 0.3rem;
  max-height: 160px;
  overflow: auto;
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

.count {
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 0.85rem;
  font-weight: 600;
}

.record-list {
  display: grid;
  gap: 1rem;
}

.record-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.record-button {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 0.8rem;
  background: #f8fafc;
  text-align: left;
  cursor: pointer;
  display: block;
}

.record-action {
  border: none;
  background: #fee2e2;
  color: #b91c1c;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.record-button:hover {
  background: #e2e8f0;
}

.record-title {
  display: grid;
  gap: 0.2rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.record-meta {
  font-size: 0.75rem;
  color: #64748b;
}

.record-path {
  color: #94a3b8;
  font-size: 0.8rem;
}

.preview-header h2 {
  margin: 0 0 0.2rem;
  font-size: 1.2rem;
}

.record-content {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  color: #1f2937;
}

.meeting-list-grid {
  display: grid;
  gap: 0.8rem;
}

.meeting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.6rem;
  align-items: center;
}

.meeting-report-button {
  border: none;
  background: #e5e7eb;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  font-size: 1.1rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
  transition: background 0.2s ease, transform 0.2s ease;
}

.meeting-report-button:hover {
  background: #d1d5db;
  transform: translateY(-1px);
}

.meeting-report-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.meeting-card {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 0.8rem;
  background: #f8fafc;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.meeting-card-main {
  display: grid;
  gap: 0.35rem;
}

.meeting-actions {
  display: inline-flex;
  gap: 0.4rem;
}

.meeting-action {
  border: none;
  background: rgba(15, 23, 42, 0.08);
  color: inherit;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.meeting-action.wide {
  width: auto;
  padding: 0 0.6rem;
  font-weight: 600;
  font-size: 0.75rem;
}

.meeting-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(15, 23, 42, 0.2);
  border-top-color: rgba(15, 23, 42, 0.7);
  border-radius: 999px;
  animation: spin 0.9s linear infinite;
  display: inline-block;
}

.loading-state {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.meeting-card.active .meeting-action {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
.meeting-card.active {
  border-color: #111827;
  background: #111827;
  color: #fff;
}

.meeting-card.active .meeting-meta,
.meeting-card.active .meeting-count {
  color: rgba(255, 255, 255, 0.8);
}

.meeting-meta {
  font-size: 0.8rem;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.meeting-count {
  font-size: 0.8rem;
  color: #4338ca;
  font-weight: 600;
}

.loading-state,
.empty-state {
  color: #64748b;
  font-weight: 500;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: grid;
  place-items: center;
  padding: 2rem;
  z-index: 30;
}

.modal-card {
  background: #fff;
  border-radius: 24px;
  padding: 2rem;
  width: min(760px, 100%);
  max-height: calc(100vh - 120px);
  overflow: auto;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
  display: grid;
  gap: 1.5rem;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
}

.modal-header h2 {
  margin: 0.4rem 0 0;
  font-size: 1.5rem;
}

@media (max-width: 720px) {
  .meeting-records-page {
    padding: 2.5rem 6vw 3.5rem;
  }

  .split-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
