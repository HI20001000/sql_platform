import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { URL } from 'node:url'
import {
  buildProjectTreeRows,
  createProductNode,
  createProjectNode,
  createTaskNode,
  createTaskStep,
  deleteProductTree,
  deleteProjectTree,
  deleteTaskTree,
  fetchTaskStepsByTaskId,
  getConnection as getCreateProjectConnection,
  updateProductName,
  updateProjectName,
  updateTaskFields,
} from '../scripts/CreateProject/index.js'
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

const withCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
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
    const step = await createTaskStep(connection, {
      taskId,
      content,
      createdBy: body?.created_by?.trim() || 'system',
      assigneeUserId: body?.assignee_user_id?.trim() || null,
    })
    sendJson(res, 200, { step })
  } catch (error) {
    await logger.error(`Task step create failed: ${error?.message || error}`)
    sendJson(res, 500, { message: 'Failed to create task step' })
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
      const status = body?.status
      const assigneeUserId = body?.assignee_user_id
      await updateTaskFields(connection, {
        taskId: id,
        title: body?.name?.trim(),
        status: status !== undefined ? status?.trim() : undefined,
        assigneeUserId:
          assigneeUserId !== undefined ? assigneeUserId?.trim() || null : undefined,
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
    const payload = await createTaskNode({
      productId,
      title,
      currentStatus: body?.current_status?.trim() || 'todo',
      createdBy: body?.created_by?.trim() || 'system',
      assigneeUserId: body?.assignee_user_id?.trim() || null,
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
    if (url.pathname === '/api/create-project/update-row' && req.method === 'POST') {
      await updateRow(req, res)
      return
    }
    if (url.pathname === '/api/create-project/delete-row' && req.method === 'POST') {
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
