import { URL } from 'node:url'

const extractDifyHostname = (difyUrl) => {
  if (!difyUrl) return ''
  const normalized = String(difyUrl).trim()
  const withoutProtocol = normalized.replace(/^https?:\/\//i, '')
  const hostSegment = withoutProtocol.split('/')[0] || ''
  return hostSegment.split(':')[0] || ''
}

const getPingArgs = (hostname) => {
  if (process.platform === 'win32') {
    return ['-n', '1', '-w', '1000', hostname]
  }
  return ['-c', '1', '-W', '1', hostname]
}

const checkDifyHealth = async (difyUrl) => {
  if (!difyUrl) return false
  let targetUrl = ''
  try {
    targetUrl = new URL(difyUrl).toString()
  } catch {
    const hostname = extractDifyHostname(difyUrl)
    if (!hostname) return false
    targetUrl = `http://${hostname}`
  }
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    let response
    try {
      response = await fetch(targetUrl, { method: 'GET', signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
    return Boolean(response)
  } catch (error) {
    // console.warn('Dify health check failed.', error?.message ?? error)
    return false
  }
}

const createHealthCheckers = ({ getConnection, difyUrl }) => {
  const checkMysqlHealth = async () => {
    try {
      const connection = await getConnection()
      await connection.ping()
      return true
    } catch (error) {
      // console.warn('MySQL health check failed.', error?.message ?? error)
      return false
    }
  }

  const checkDifyHealthBound = async () => checkDifyHealth(difyUrl)

  return { checkMysqlHealth, checkDifyHealth: checkDifyHealthBound }
}

const createHealthStatusFetcher = ({ getConnection, difyUrl }) => {
  const { checkMysqlHealth, checkDifyHealth } = createHealthCheckers({
    getConnection,
    difyUrl,
  })

  const getHealthStatus = async () => {
    const [mysqlOk, difyOk] = await Promise.all([checkMysqlHealth(), checkDifyHealth()])
    return {
      backend: true,
      mysql: mysqlOk,
      dify: difyOk,
    }
  }

  return { getHealthStatus }
}

export { createHealthCheckers, createHealthStatusFetcher, extractDifyHostname }
export default createHealthStatusFetcher
