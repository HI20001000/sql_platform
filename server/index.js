import http from 'node:http'
import crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { URL, fileURLToPath } from 'node:url'
import {
  buildProjectTreeRows,
  createProductNode,
  createProjectNode,
  createTaskNode,
  createTaskStep,
  createStatus,
  deleteProductTree,
  deleteProjectTree,
  deleteTaskTree,
  fetchProducts,
  fetchProjects,
  fetchTaskStepsByTaskId,
  fetchStatuses,
  getConnection as getCreateProjectConnection,
  getDefaultStatusId,
  updateTaskStepStatus,
  updateProductName,
  updateProjectName,
  updateTaskFields,
} from '../src/scripts/CreateProject/index.js'
let createLogger = null
let createSqlAuditWrapper = null
let mysql = null
try {
  mysql = (await import('mysql2/promise')).default
} catch {
  mysql = null
}
try {
  createLogger = (await import('./scripts/logger.js')).default
} catch {
  createLogger = () => ({
    info: (message) => console.log(message),
    warn: (message) => console.warn(message),
    error: (message) => console.error(message),
  })
}
try {
  createSqlAuditWrapper = (await import('./scripts/sqlAudit.js')).default
} catch {
  createSqlAuditWrapper = () => (connection) => connection
}

const loadEnvFile = async (path) => {
  let content = ''
  try {
    content = await fs.readFile(path, 'utf8')
  } catch {
    return
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...rest] = trimmed.split('=')
    if (!key) continue
    const value = rest.join('=').trim()
    if (key && value && !process.env[key]) {
      process.env[key] = value
    }
  }
}

await loadEnvFile(new URL('../.env', import.meta.url))

const {
  MYSQL_HOST = 'localhost',
  MYSQL_PORT = '3306',
  MYSQL_USER = 'root',
  MYSQL_PASSWORD = '12345',
  MYSQL_DATABASE = 'aisql',
} = process.env

const DATABASE_NAME = MYSQL_DATABASE
const TOKEN_TTL_MS = 60 * 60 * 1000
const logger = createLogger()
const MEETING_ROOT_PATH = fileURLToPath(new URL('../meeting_uploads', import.meta.url))

const withCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS,PUT,PATCH,DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

const sendJson = (res, status, payload) => {
  withCors(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const parseBody = async (req) => {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  if (chunks.length === 0) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

const createConnection = async (withDatabase = false) => {
  if (!mysql) {
    throw new Error('mysql2 module is not available; please install mysql2 before starting server.')
  }
  const connection = await mysql.createConnection({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: withDatabase ? DATABASE_NAME : undefined,
  })
  return connection
}

const ensureDatabase = async () => {
  const connection = await createConnection(false)
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\``)
  await connection.end()
}

const ensureTables = async (connection) => {
  await connection.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mail VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(255) NOT NULL,
    icon VARCHAR(16) NOT NULL DEFAULT '🙂',
    icon_bg VARCHAR(32) NOT NULL DEFAULT '#e2e8f0',
    username VARCHAR(255) NOT NULL DEFAULT 'hi',
    role VARCHAR(50) NOT NULL DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await connection.query(`CREATE TABLE IF NOT EXISTS auth_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mail VARCHAR(255) NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
}

const ensureMeetingTables = async (connection) => {
  await connection.query(`CREATE TABLE IF NOT EXISTS meeting_days (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    meeting_date DATE NOT NULL,
    created_by VARCHAR(255) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_meeting_day (product_id, meeting_date),
    INDEX idx_meeting_day_product (product_id)
  )`)
  await connection.query(`CREATE TABLE IF NOT EXISTS meeting_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    meeting_day_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(32) NOT NULL,
    file_size INT NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_meeting_files_day (meeting_day_id)
  )`)
}

const ensureMeetingStorage = async () => {
  await fs.mkdir(MEETING_ROOT_PATH, { recursive: true })
}

const seedDefaultUser = async (connection) => {
  const [rows] = await connection.query('SELECT COUNT(*) as count FROM users')
  if ((rows[0]?.count ?? 0) > 0) return
  const email = 'admin@innerai.local'
  const password = 'admin1234'
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = await hashPassword(password, salt)
  await connection.query(
    'INSERT INTO users (mail, password_hash, password_salt, icon, icon_bg, username, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [email, passwordHash, salt, '🙂', '#e2e8f0', 'admin', 'admin']
  )
  await logger.info(`Seeded default user: ${email}`)
}

const initDatabase = async () => {
  await ensureDatabase()
  const connection = await createConnection(true)
  await ensureTables(connection)
  await seedDefaultUser(connection)
  return connection
}

let dbConnection = null
const verificationCodes = new Map()

const getConnection = async () => {
  if (!dbConnection) {
    dbConnection = await initDatabase()
    return dbConnection
  }
  try {
    await dbConnection.ping()
  } catch (error) {
    try {
      await dbConnection.end()
    } catch (closeError) {
      // ignore
    }
    dbConnection = await initDatabase()
  }
  return dbConnection
}

const normalizeIp = (ip) => {
  if (!ip) return 'unknown'
  let normalized = ip.trim()
  if (normalized === '::1') return '127.0.0.1'
  if (normalized.startsWith('::ffff:')) {
    normalized = normalized.slice(7)
  }
  if (normalized.includes('.') && normalized.includes(':')) {
    const lastColon = normalized.lastIndexOf(':')
    const maybePort = normalized.slice(lastColon + 1)
    if (/^\d+$/.test(maybePort)) {
      normalized = normalized.slice(0, lastColon)
    }
  }
  return normalized
}

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return normalizeIp(forwarded.split(',')[0].trim())
  }
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) {
    return normalizeIp(realIp)
  }
  return normalizeIp(req.socket?.remoteAddress)
}

const wrapConnectionWithSqlLogging = createSqlAuditWrapper({ logger, getClientIp })

const getRequestConnection = async (req) =>
  req ? wrapConnectionWithSqlLogging(await getConnection(), req) : getConnection()

const hashPassword = async (password, salt) => {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derivedKey.toString('hex'))
    })
  })
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

const createAuthToken = async (email, req) => {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
  const connection = await getRequestConnection(req)
  await connection.query('DELETE FROM auth_tokens WHERE mail = ? OR expires_at < NOW()', [email])
  await connection.query('INSERT INTO auth_tokens (mail, token_hash, expires_at) VALUES (?, ?, ?)', [
    email,
    tokenHash,
    expiresAt,
  ])
  return { token, expiresAt: expiresAt.toISOString() }
}

const requestVerificationCode = async (req, res) => {
  const body = await parseBody(req)
  const email = body?.email?.trim()
  if (!email) {
    sendJson(res, 400, { message: 'Email is required' })
    return
  }
  await logger.info(`Verification code request received for ${email}`)
  const existing = verificationCodes.get(email)
  const now = Date.now()
  if (existing?.lastSentAt && now - existing.lastSentAt < 60 * 1000) {
    const waitSeconds = Math.ceil((60 * 1000 - (now - existing.lastSentAt)) / 1000)
    sendJson(res, 429, { message: `請${waitSeconds}秒後再試` })
    return
  }
  const code = Math.floor(1000 + Math.random() * 9000).toString()
  const expiresAt = now + 60 * 1000
  verificationCodes.set(email, { code, expiresAt, lastSentAt: now })
  await logger.info(`Verification code for ${email}: ${code}`)
  sendJson(res, 200, { message: 'Verification code sent' })
}

const registerUser = async (req, res) => {
  const body = await parseBody(req)
  const email = body?.email?.trim()
  const password = body?.password
  const code = body?.code?.trim()
  if (!email || !password || !code) {
    sendJson(res, 400, { message: 'Email, password, and code are required' })
    return
  }
  const record = verificationCodes.get(email)
  if (!record || record.expiresAt < Date.now() || record.code !== code) {
    sendJson(res, 400, { message: 'Verification code is invalid or expired' })
    return
  }
  try {
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = await hashPassword(password, salt)
    const connection = await getRequestConnection(req)
    const username = email.split('@')[0] || 'hi'
    await connection.query(
      'INSERT INTO users (mail, password_hash, password_salt, icon, icon_bg, username, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [email, passwordHash, salt, '🙂', '#e2e8f0', username, 'normal']
    )
    verificationCodes.delete(email)
    await logger.info(`User registered: ${email}`)
    sendJson(res, 201, { message: 'User registered' })
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      sendJson(res, 409, { message: 'Email already registered' })
      return
    }
    await logger.error(`Register failed for ${email}: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to register' })
  }
}

const loginUser = async (req, res) => {
  const body = await parseBody(req)
  const email = body?.email?.trim()
  const password = body?.password
  const clientIp = getClientIp(req)
  if (!email || !password) {
    await logger.warn(`Login failed from ${clientIp}: missing credentials`)
    sendJson(res, 400, { message: 'Email and password are required' })
    return
  }
  try {
    const connection = await getRequestConnection(req)
    const [rows] = await connection.query(
      'SELECT mail, password_hash, password_salt, icon, icon_bg, username, role FROM users WHERE mail = ? LIMIT 1',
      [email]
    )
    const user = rows[0]
    if (!user) {
      await logger.warn(`Login failed from ${clientIp} for ${email}`)
      sendJson(res, 401, { message: 'Invalid credentials' })
      return
    }
    const passwordHash = await hashPassword(password, user.password_salt)
    if (passwordHash !== user.password_hash) {
      await logger.warn(`Login failed from ${clientIp} for ${email}`)
      sendJson(res, 401, { message: 'Invalid credentials' })
      return
    }
    const tokenData = await createAuthToken(user.mail, req)
    sendJson(res, 200, {
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      user: {
        mail: user.mail,
        icon: user.icon,
        icon_bg: user.icon_bg,
        username: user.username,
        role: user.role,
      },
    })
    await logger.info(`Login success from ${clientIp} for ${user.mail}`)
  } catch (error) {
    await logger.error(
      `Login error from ${clientIp} for ${email || 'unknown'}: ${error?.message || error}`
    )
    sendJson(res, 500, { message: 'Failed to login' })
  }
}

const fetchCreateProjectTree = async (req, res) => {
  const body = await parseBody(req)
  const q = body?.q?.trim() || ''
  const status = body?.status || []
  const assignee = body?.assignee || []
  const includeEmpty = body?.includeEmpty ?? true
  try {
    const payload = await buildProjectTreeRows({ q, status, assignee, includeEmpty })
    sendJson(res, 200, payload)
  } catch (error) {
    await logger.error(`CreateProject tree load failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to load project tree' })
  }
}

const fetchTaskSteps = async (req, res) => {
  const body = await parseBody(req)
  const taskId = body?.taskId
  if (!taskId) {
    sendJson(res, 400, { message: 'taskId is required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    const steps = await fetchTaskStepsByTaskId(connection, taskId)
    sendJson(res, 200, { steps })
  } catch (error) {
    await logger.error(`Task steps load failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to load task steps' })
  }
}

const addTaskStep = async (req, res) => {
  const body = await parseBody(req)
  const taskId = body?.taskId
  const content = body?.content?.trim()
  if (!taskId || !content) {
    sendJson(res, 400, { message: 'taskId and content are required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    const statusId = body?.status_id ?? (await getDefaultStatusId(connection))
    const step = await createTaskStep(connection, {
      taskId,
      content,
      createdBy: body?.created_by?.trim() || 'system',
      assigneeUserId: normalizeAssigneeId(body?.assignee_user_id),
      statusId,
    })
    sendJson(res, 200, { step })
  } catch (error) {
    await logger.error(`Task step create failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to create task step' })
  }
}

const updateTaskStepStatusHandler = async (req, res) => {
  const body = await parseBody(req)
  const stepId = body?.stepId
  if (!stepId) {
    sendJson(res, 400, { message: 'stepId is required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    const statusId = await resolveStatusId(body?.status_id ?? body?.status)
    if (statusId == null) {
      sendJson(res, 400, { message: 'status_id is required' })
      return
    }
    const [rows] = await connection.query(`SELECT name FROM statuses WHERE id = ? LIMIT 1`, [
      statusId,
    ])
    const statusName = rows[0]?.name || ''
    const step = await updateTaskStepStatus(connection, { stepId, statusId, statusName })
    sendJson(res, 200, { step })
  } catch (error) {
    await logger.error(`Task step status update failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to update task step status' })
  }
}

const updateRow = async (req, res) => {
  const body = await parseBody(req)
  const rowType = body?.rowType
  const id = body?.id
  if (!rowType || !id) {
    sendJson(res, 400, { message: 'rowType and id are required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    if (rowType === 'project') {
      const name = body?.name?.trim()
      if (!name) {
        sendJson(res, 400, { message: 'name is required' })
        return
      }
      await updateProjectName(connection, { projectId: id, name })
    } else if (rowType === 'product') {
      const name = body?.name?.trim()
      if (!name) {
        sendJson(res, 400, { message: 'name is required' })
        return
      }
      await updateProductName(connection, { productId: id, name })
    } else if (rowType === 'task') {
      const statusId = await resolveStatusId(body?.status_id ?? body?.status)
      const assigneeUserId = normalizeAssigneeId(body?.assignee_user_id)
      await updateTaskFields(connection, {
        taskId: id,
        title: body?.name?.trim(),
        statusId: statusId !== undefined ? statusId : undefined,
        assigneeUserId:
          assigneeUserId !== undefined ? assigneeUserId : undefined,
      })
    }
    sendJson(res, 200, { ok: true })
  } catch (error) {
    await logger.error(`Update row failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to update row' })
  }
}

const deleteRow = async (req, res) => {
  const body = await parseBody(req)
  const rowType = body?.rowType
  const id = body?.id
  if (!rowType || !id) {
    sendJson(res, 400, { message: 'rowType and id are required' })
    return
  }
  const connection = await getCreateProjectConnection()
  try {
    await connection.beginTransaction()
    if (rowType === 'project') {
      await deleteProjectTree(connection, { projectId: id })
    } else if (rowType === 'product') {
      await deleteProductTree(connection, { productId: id })
    } else if (rowType === 'task') {
      await deleteTaskTree(connection, { taskId: id })
    }
    await connection.commit()
    sendJson(res, 200, { ok: true })
  } catch (error) {
    try {
      await connection.rollback()
    } catch {
      // ignore rollback errors
    }
    await logger.error(`Delete row failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to delete row' })
  }
}

const createProject = async (req, res) => {
  const body = await parseBody(req)
  const name = body?.name?.trim()
  if (!name) {
    sendJson(res, 400, { message: 'name is required' })
    return
  }
  try {
    const ownerMail = body?.owner_mail?.trim() || 'system'
    const payload = await createProjectNode({
      name,
      ownerMail,
      q: body?.q,
      status: body?.status,
      assignee: body?.assignee,
      includeEmpty: body?.includeEmpty ?? true,
    })
    sendJson(res, 200, payload)
  } catch (error) {
    await logger.error(`Create project failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to create project' })
  }
}

const createProduct = async (req, res) => {
  const body = await parseBody(req)
  const name = body?.name?.trim()
  const projectId = body?.projectId
  if (!name || !projectId) {
    sendJson(res, 400, { message: 'projectId and name are required' })
    return
  }
  try {
    const createdBy = body?.created_by?.trim() || 'system'
    const payload = await createProductNode({
      projectId,
      name,
      createdBy,
      q: body?.q,
      status: body?.status,
      assignee: body?.assignee,
      includeEmpty: body?.includeEmpty ?? true,
    })
    sendJson(res, 200, payload)
  } catch (error) {
    await logger.error(`Create product failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to create product' })
  }
}

const createTask = async (req, res) => {
  const body = await parseBody(req)
  const title = body?.title?.trim()
  const productId = body?.productId
  if (!title || !productId) {
    sendJson(res, 400, { message: 'productId and title are required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    const statusId = body?.status_id ?? (await getDefaultStatusId(connection))
    const payload = await createTaskNode({
      productId,
      title,
      statusId,
      createdBy: body?.created_by?.trim() || 'system',
      assigneeUserId: normalizeAssigneeId(body?.assignee_user_id),
      q: body?.q,
      status: body?.status,
      assignee: body?.assignee,
      includeEmpty: body?.includeEmpty ?? true,
    })
    sendJson(res, 200, payload)
  } catch (error) {
    await logger.error(`Create task failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to create task' })
  }
}

const listStatuses = async (_req, res) => {
  try {
    const connection = await getCreateProjectConnection()
    const statuses = await fetchStatuses(connection)
    sendJson(res, 200, { statuses })
  } catch (error) {
    await logger.error(`Status list load failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to load statuses' })
  }
}

const addStatus = async (req, res) => {
  const body = await parseBody(req)
  const name = body?.name?.trim()
  const color = body?.color?.trim()
  if (!name || !color) {
    sendJson(res, 400, { message: 'name and color are required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    const status = await createStatus(connection, { name, color })
    sendJson(res, 200, { status })
  } catch (error) {
    await logger.error(`Status create failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to create status' })
  }
}

const fetchMeetingTree = async (_req, res) => {
  try {
    const connection = await getCreateProjectConnection()
    await ensureMeetingTables(connection)
    const projects = await fetchProjects(connection)
    const products = await fetchProducts(connection)
    const [meetingRows] = await connection.query(
      `SELECT id, product_id,
              DATE_FORMAT(meeting_date, '%Y-%m-%d') AS meeting_date
       FROM meeting_days
       ORDER BY meeting_date DESC`
    )

    const meetingDaysByProduct = new Map()
    meetingRows.forEach((row) => {
      if (!meetingDaysByProduct.has(row.product_id)) {
        meetingDaysByProduct.set(row.product_id, [])
      }
      meetingDaysByProduct.get(row.product_id).push({
        id: row.id,
        meeting_date: row.meeting_date,
      })
    })

    const productsByProject = new Map()
    products.forEach((product) => {
      if (!productsByProject.has(product.project_id)) {
        productsByProject.set(product.project_id, [])
      }
      productsByProject.get(product.project_id).push({
        id: product.id,
        name: product.name,
        meeting_days: meetingDaysByProduct.get(product.id) || [],
      })
    })

    const tree = projects.map((project) => ({
      id: project.id,
      name: project.name,
      products: productsByProject.get(project.id) || [],
    }))

    sendJson(res, 200, { tree })
  } catch (error) {
    await logger.error(`Meeting tree load failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to load meeting tree' })
  }
}

const createMeetingDay = async (req, res) => {
  const body = await parseBody(req)
  const productId = Number(body?.productId)
  const meetingDate = normalizeMeetingDate(body?.meetingDate)
  if (!productId || !meetingDate) {
    sendJson(res, 400, { message: 'productId and meetingDate are required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    await ensureMeetingTables(connection)
    const [existingRows] = await connection.query(
      `SELECT id FROM meeting_days WHERE product_id = ? AND meeting_date = ? LIMIT 1`,
      [productId, meetingDate]
    )
    let meetingDayId = existingRows[0]?.id
    if (!meetingDayId) {
      const [result] = await connection.query(
        `INSERT INTO meeting_days (product_id, meeting_date, created_by)
         VALUES (?, ?, ?)`,
        [productId, meetingDate, body?.created_by?.trim() || 'system']
      )
      meetingDayId = result.insertId
    }
    await ensureMeetingStorage()
    const { absolutePath } = resolveMeetingDayFolder({ productId, meetingDate })
    await fs.mkdir(absolutePath, { recursive: true })
    sendJson(res, 200, { id: meetingDayId, meeting_date: meetingDate })
  } catch (error) {
    await logger.error(`Meeting day create failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to create meeting day' })
  }
}

const renameMeetingDay = async (req, res) => {
  const body = await parseBody(req)
  const meetingDayId = Number(body?.meetingDayId)
  const meetingDate = normalizeMeetingDate(body?.meetingDate)
  if (!meetingDayId || !meetingDate) {
    sendJson(res, 400, { message: 'meetingDayId and meetingDate are required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    await ensureMeetingTables(connection)
    const [rows] = await connection.query(
      `SELECT product_id, DATE_FORMAT(meeting_date, '%Y-%m-%d') AS meeting_date
       FROM meeting_days
       WHERE id = ?`,
      [meetingDayId]
    )
    if (!rows.length) {
      sendJson(res, 404, { message: 'Meeting day not found' })
      return
    }
    const productId = rows[0].product_id
    const oldMeetingDate = rows[0].meeting_date
    if (oldMeetingDate === meetingDate) {
      sendJson(res, 200, { id: meetingDayId, meeting_date: meetingDate })
      return
    }
    await ensureMeetingStorage()
    const oldFolder = resolveMeetingDayFolder({ productId, meetingDate: oldMeetingDate })
    const newFolder = resolveMeetingDayFolder({ productId, meetingDate })
    await fs.mkdir(path.dirname(newFolder.absolutePath), { recursive: true })
    try {
      await fs.rename(oldFolder.absolutePath, newFolder.absolutePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      await fs.mkdir(newFolder.absolutePath, { recursive: true })
    }
    await connection.query(`UPDATE meeting_days SET meeting_date = ? WHERE id = ?`, [
      meetingDate,
      meetingDayId,
    ])
    const [files] = await connection.query(
      `SELECT id, storage_path FROM meeting_files WHERE meeting_day_id = ?`,
      [meetingDayId]
    )
    for (const file of files) {
      const fileName = path.posix.basename(file.storage_path)
      const nextPath = path.posix.join(String(productId), meetingDate, fileName)
      await connection.query(`UPDATE meeting_files SET storage_path = ? WHERE id = ?`, [
        nextPath,
        file.id,
      ])
    }
    sendJson(res, 200, { id: meetingDayId, meeting_date: meetingDate })
  } catch (error) {
    await logger.error(`Meeting day rename failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to rename meeting day' })
  }
}

const listMeetingFiles = async (req, res, url) => {
  const meetingDayId = Number(url.searchParams.get('meetingDayId'))
  if (!meetingDayId) {
    sendJson(res, 400, { message: 'meetingDayId is required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    await ensureMeetingTables(connection)
    const [rows] = await connection.query(
      `SELECT id, filename, storage_path, file_type, file_size, created_at
       FROM meeting_files
       WHERE meeting_day_id = ?
       ORDER BY created_at DESC`,
      [meetingDayId]
    )
    sendJson(res, 200, { files: rows })
  } catch (error) {
    await logger.error(`Meeting files load failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to load meeting files' })
  }
}

const uploadMeetingFiles = async (req, res, url) => {
  const body = await parseBody(req)
  const meetingDayId = Number(body?.meetingDayId ?? url.searchParams.get('meetingDayId'))
  const files = Array.isArray(body?.files) ? body.files : []
  const uploadedBy = body?.uploadedBy?.trim() || 'system'
  if (!meetingDayId || files.length === 0) {
    sendJson(res, 400, { message: 'meetingDayId and files are required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    await ensureMeetingTables(connection)
    const [rows] = await connection.query(
      `SELECT product_id, DATE_FORMAT(meeting_date, '%Y-%m-%d') AS meeting_date
       FROM meeting_days
       WHERE id = ?`,
      [meetingDayId]
    )
    if (!rows.length) {
      sendJson(res, 404, { message: 'Meeting day not found' })
      return
    }
    const meetingInfo = {
      productId: rows[0].product_id,
      meetingDate: rows[0].meeting_date,
    }
    await ensureMeetingStorage()
    const { absolutePath, relativePath } = resolveMeetingDayFolder({
      productId: meetingInfo.productId,
      meetingDate: meetingInfo.meetingDate,
    })
    await fs.mkdir(absolutePath, { recursive: true })
    for (const file of files) {
      const parsed = parseBase64Payload(file?.content)
      if (!parsed?.buffer) continue
      const originalName = String(file?.name || '')
      const ext = path.extname(originalName)
      const storedName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
      const storedRelativePath = path.posix.join(relativePath, storedName)
      const storedAbsolutePath = path.join(MEETING_ROOT_PATH, storedRelativePath)
      await fs.writeFile(storedAbsolutePath, parsed.buffer)
      await connection.query(
        `INSERT INTO meeting_files (meeting_day_id, filename, storage_path, file_type, file_size, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          meetingDayId,
          originalName || storedName,
          storedRelativePath,
          file?.type || parsed.mimeType || 'application/octet-stream',
          parsed.buffer.length,
          uploadedBy,
        ]
      )
    }
    sendJson(res, 200, { ok: true })
  } catch (error) {
    await logger.error(`Meeting upload failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to upload meeting files' })
  }
}

const downloadMeetingFile = async (req, res, url) => {
  const fileId = Number(url.searchParams.get('fileId'))
  if (!fileId) {
    sendJson(res, 400, { message: 'fileId is required' })
    return
  }
  try {
    const connection = await getCreateProjectConnection()
    await ensureMeetingTables(connection)
    const [rows] = await connection.query(
      `SELECT filename, storage_path, file_type
       FROM meeting_files
       WHERE id = ?`,
      [fileId]
    )
    if (!rows.length) {
      sendJson(res, 404, { message: 'File not found' })
      return
    }
    const file = rows[0]
    const absolutePath = path.join(MEETING_ROOT_PATH, file.storage_path)
    res.writeHead(200, {
      'Content-Type': file.file_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
    })
    const stream = createReadStream(absolutePath)
    stream.on('error', () => {
      sendJson(res, 500, { message: 'Failed to read file' })
    })
    stream.pipe(res)
  } catch (error) {
    await logger.error(`Meeting file download failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to download meeting file' })
  }
}

const listUsers = async (_req, res) => {
  try {
    const connection = await getConnection()
    const [rows] = await connection.query(
      `SELECT id, mail, username, icon, icon_bg
       FROM users
       ORDER BY created_at ASC`
    )
    sendJson(res, 200, { users: rows })
  } catch (error) {
    await logger.error(`User list load failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to load users' })
  }
}

const resolveStatusId = async (value) => {
  if (value === undefined) return undefined
  if (value === null) return null
  const normalized = String(value).trim()
  if (!normalized) return null
  if (/^\d+$/.test(normalized)) return Number(normalized)
  const connection = await getCreateProjectConnection()
  const [rows] = await connection.query(`SELECT id FROM statuses WHERE name = ? LIMIT 1`, [
    normalized,
  ])
  return rows[0]?.id ?? null
}

const normalizeAssigneeId = (value) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const normalized = String(value).trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  if (Number.isNaN(parsed)) return null
  return parsed
}

const normalizeMeetingDate = (value) => {
  if (!value) return null
  const normalized = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  return normalized
}

const resolveMeetingDayFolder = ({ productId, meetingDate }) => {
  const relativePath = path.posix.join(String(productId), meetingDate)
  const absolutePath = path.join(MEETING_ROOT_PATH, relativePath)
  return { relativePath, absolutePath }
}

const parseBase64Payload = (payload) => {
  if (!payload) return null
  const normalized = String(payload)
  const match = normalized.match(/^data:([^;]+);base64,(.+)$/)
  if (match) {
    return {
      buffer: Buffer.from(match[2], 'base64'),
      mimeType: match[1],
    }
  }
  return {
    buffer: Buffer.from(normalized, 'base64'),
    mimeType: null,
  }
}

const start = async () => {
  const port = process.env.PORT || 3001
  const server = http.createServer(async (req, res) => {
    withCors(res)
    if (!req.url) {
      sendJson(res, 404, { message: 'Not found' })
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (url.pathname === '/api/auth/request-code' && req.method === 'POST') {
      await requestVerificationCode(req, res)
      return
    }
    if (url.pathname === '/api/auth/register' && req.method === 'POST') {
      await registerUser(req, res)
      return
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      await loginUser(req, res)
      return
    }
    if (url.pathname === '/api/create-project/tree' && req.method === 'POST') {
      await fetchCreateProjectTree(req, res)
      return
    }
    if (url.pathname === '/api/create-project/task-steps' && req.method === 'POST') {
      await fetchTaskSteps(req, res)
      return
    }
    if (url.pathname === '/api/create-project/task-step' && req.method === 'POST') {
      await addTaskStep(req, res)
      return
    }
    if (url.pathname === '/api/create-project/task-step-status' && req.method === 'POST') {
      await updateTaskStepStatusHandler(req, res)
      return
    }
    if (url.pathname === '/api/create-project/statuses' && req.method === 'GET') {
      await listStatuses(req, res)
      return
    }
    if (url.pathname === '/api/create-project/status' && req.method === 'POST') {
      await addStatus(req, res)
      return
    }
    if (
      url.pathname === '/api/create-project/update-row' &&
      ['POST', 'PUT', 'PATCH'].includes(req.method)
    ) {
      await updateRow(req, res)
      return
    }
    if (
      url.pathname === '/api/create-project/delete-row' &&
      ['POST', 'DELETE'].includes(req.method)
    ) {
      await deleteRow(req, res)
      return
    }
    if (url.pathname === '/api/create-project/project' && req.method === 'POST') {
      await createProject(req, res)
      return
    }
    if (url.pathname === '/api/create-project/product' && req.method === 'POST') {
      await createProduct(req, res)
      return
    }
    if (url.pathname === '/api/create-project/task' && req.method === 'POST') {
      await createTask(req, res)
      return
    }
    if (url.pathname === '/api/meetings/tree' && req.method === 'GET') {
      await fetchMeetingTree(req, res)
      return
    }
    if (url.pathname === '/api/meetings/day' && req.method === 'POST') {
      await createMeetingDay(req, res)
      return
    }
    if (
      url.pathname === '/api/meetings/day' &&
      ['PUT', 'PATCH'].includes(req.method)
    ) {
      await renameMeetingDay(req, res)
      return
    }
    if (url.pathname === '/api/meetings/files' && req.method === 'GET') {
      await listMeetingFiles(req, res, url)
      return
    }
    if (url.pathname === '/api/meetings/upload' && req.method === 'POST') {
      await uploadMeetingFiles(req, res, url)
      return
    }
    if (url.pathname === '/api/meetings/download' && req.method === 'GET') {
      await downloadMeetingFile(req, res, url)
      return
    }
    if (url.pathname === '/api/users' && req.method === 'GET') {
      await listUsers(req, res)
      return
    }
    sendJson(res, 404, { message: 'Not found' })
  })
  server.listen(port, () => {
    console.log(`Server listening on ${port}`)
  })
}

start().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
