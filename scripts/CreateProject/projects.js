export const fetchProjects = async (connection, { q } = {}) => {
  const conditions = []
  const params = []
  if (q) {
    conditions.push('name LIKE ?')
    params.push(`%${q}%`)
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const [rows] = await connection.query(
    `SELECT id, name, owner_mail, created_at, updated_at
     FROM projects
     ${whereClause}
     ORDER BY created_at ASC`,
    params
  )
  return rows
}
