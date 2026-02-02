const getSqlText = (sql) => {
  if (typeof sql === 'string') return sql
  if (sql?.sql) return sql.sql
  return ''
}

const getSqlMutationMeta = (sql) => {
  const text = getSqlText(sql).trim()
  if (!text) return null
  const upper = text.toUpperCase()
  let action = null
  if (upper.startsWith('INSERT')) action = 'INSERT'
  if (upper.startsWith('UPDATE')) action = 'UPDATE'
  if (upper.startsWith('DELETE')) action = 'DELETE'
  if (!action) return null
  if (upper.includes('ON DUPLICATE KEY UPDATE')) action = 'UPSERT'
  let table = 'unknown'
  if (action === 'INSERT' || action === 'UPSERT') {
    table = text.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+`?([\w-]+)`?/i)?.[1] || table
  } else if (action === 'UPDATE') {
    table = text.match(/UPDATE\s+`?([\w-]+)`?/i)?.[1] || table
  } else if (action === 'DELETE') {
    table = text.match(/DELETE\s+FROM\s+`?([\w-]+)`?/i)?.[1] || table
  }
  return { action, table }
}

const sanitizeSqlValue = (value, depth = 0) => {
  if (value === null || value === undefined) return value
  if (Buffer.isBuffer(value)) return `<Buffer length=${value.length}>`
  if (typeof value === 'string') {
    return value.length > 200 ? `${value.slice(0, 200)}...` : value
  }
  if (Array.isArray(value)) {
    const limited = value.slice(0, 20).map((item) => sanitizeSqlValue(item, depth + 1))
    if (value.length > 20) limited.push('...')
    return limited
  }
  if (typeof value === 'object') {
    if (depth > 2) return '[Object]'
    const entries = Object.entries(value).slice(0, 20)
    const result = {}
    for (const [key, item] of entries) {
      result[key] = sanitizeSqlValue(item, depth + 1)
    }
    if (Object.keys(value).length > 20) {
      result._truncated = '...'
    }
    return result
  }
  return value
}

const formatSqlData = (data) => {
  try {
    const sanitized = sanitizeSqlValue(data ?? [])
    const json = JSON.stringify(sanitized)
    if (json.length > 500) return `${json.slice(0, 500)}...`
    return json
  } catch {
    return String(data)
  }
}

const createSqlAuditWrapper = ({ logger, getClientIp }) => (connection, req) =>
  new Proxy(connection, {
    get(target, prop) {
      if (prop === 'query') {
        return async (sql, params) => {
          const result = await target.query(sql, params)
          const meta = getSqlMutationMeta(sql)
          if (meta) {
            const data = params ?? sql?.values
            logger.info(
              `[SQL] ip=${getClientIp(req)} action=${meta.action} table=${meta.table} data=${formatSqlData(data)}`
            )
          }
          return result
        }
      }
      const value = target[prop]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

export default createSqlAuditWrapper
