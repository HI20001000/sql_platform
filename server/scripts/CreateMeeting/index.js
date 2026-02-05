import crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

const normalizeMeetingDate = (value) => {
  if (!value) return null
  const normalized = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  return normalized
}

const resolveMeetingDayFolder = ({ meetingRootPath, productId, meetingDate }) => {
  const relativePath = path.posix.join(String(productId), meetingDate)
  const absolutePath = path.join(meetingRootPath, relativePath)
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

export const createMeetingHandlers = ({
  getConnection,
  fetchProjects,
  fetchProducts,
  sendJson,
  parseBody,
  logger,
  meetingRootPath,
}) => {
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
    await fs.mkdir(meetingRootPath, { recursive: true })
  }

  const fetchMeetingTree = async (_req, res) => {
    try {
      const connection = await getConnection()
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
      const connection = await getConnection()
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
      const { absolutePath } = resolveMeetingDayFolder({
        meetingRootPath,
        productId,
        meetingDate,
      })
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
      const connection = await getConnection()
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
      const oldFolder = resolveMeetingDayFolder({
        meetingRootPath,
        productId,
        meetingDate: oldMeetingDate,
      })
      const newFolder = resolveMeetingDayFolder({ meetingRootPath, productId, meetingDate })
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

  const listMeetingFiles = async (_req, res, url) => {
    const meetingDayId = Number(url.searchParams.get('meetingDayId'))
    if (!meetingDayId) {
      sendJson(res, 400, { message: 'meetingDayId is required' })
      return
    }
    try {
      const connection = await getConnection()
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
      const connection = await getConnection()
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
        meetingRootPath,
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
        const storedAbsolutePath = path.join(meetingRootPath, storedRelativePath)
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

  const downloadMeetingFile = async (_req, res, url) => {
    const fileId = Number(url.searchParams.get('fileId'))
    if (!fileId) {
      sendJson(res, 400, { message: 'fileId is required' })
      return
    }
    try {
      const connection = await getConnection()
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
      const absolutePath = path.join(meetingRootPath, file.storage_path)
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

  return {
    fetchMeetingTree,
    createMeetingDay,
    renameMeetingDay,
    listMeetingFiles,
    uploadMeetingFiles,
    downloadMeetingFile,
  }
}
