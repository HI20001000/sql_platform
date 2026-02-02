import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_LOG_FILE_SIZE = Number(process.env.LOG_MAX_BYTES || 10 * 1024 * 1024)
const LOG_ROOT = path.resolve(fileURLToPath(new URL('../../logs', import.meta.url)))
let currentDate = ''
let currentBatch = 1

const pad = (value) => String(value).padStart(2, '0')

const formatTaipeiDate = (date) => {
  const taipeiMs = date.getTime() + 8 * 60 * 60 * 1000
  const taipei = new Date(taipeiMs)
  return {
    yyyymmdd: `${taipei.getUTCFullYear()}${pad(taipei.getUTCMonth() + 1)}${pad(
      taipei.getUTCDate()
    )}`,
    timestamp: `${taipei.getUTCFullYear()}-${pad(taipei.getUTCMonth() + 1)}-${pad(
      taipei.getUTCDate()
    )} ${pad(taipei.getUTCHours())}:${pad(taipei.getUTCMinutes())}:${pad(
      taipei.getUTCSeconds()
    )}`,
  }
}

const resolveLogFile = async () => {
  const { yyyymmdd } = formatTaipeiDate(new Date())
  if (currentDate !== yyyymmdd) {
    currentDate = yyyymmdd
    currentBatch = 1
  }
  const dir = path.join(LOG_ROOT, yyyymmdd)
  await fs.mkdir(dir, { recursive: true })
  while (true) {
    const filePath = path.join(dir, `${yyyymmdd}_${currentBatch}_log`)
    try {
      const stats = await fs.stat(filePath)
      if (stats.size < MAX_LOG_FILE_SIZE) {
        return filePath
      }
      currentBatch += 1
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return filePath
      }
      throw error
    }
  }
}

const appendLog = async (line) => {
  const filePath = await resolveLogFile()
  await fs.appendFile(filePath, `${line}\n`, 'utf8')
}

const logWithLevel = async (level, message) => {
  const { timestamp } = formatTaipeiDate(new Date())
  const line = `[${timestamp}] [${level}] ${message}`
  if (level === 'ERROR') {
    console.error(line)
  } else {
    console.log(line)
  }
  try {
    await appendLog(line)
  } catch (error) {
    console.error(`[${timestamp}] [ERROR] Failed to write log:`, error)
  }
}

const createLogger = () => {
  return {
    info: (message) => logWithLevel('INFO', message),
    warn: (message) => logWithLevel('WARN', message),
    error: (message) => logWithLevel('ERROR', message),
  }
}

export default createLogger
