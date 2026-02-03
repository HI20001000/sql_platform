export const fetchTasksWithParents = async (connection, { q, status, assignee } = {}) => {
  const conditions = []
  const params = []

  if (status?.length) {
    conditions.push(`t.current_status IN (${status.map(() => '?').join(',')})`)
    params.push(...status)
  }

  if (assignee?.length) {
    conditions.push(`t.assignee_user_id IN (${assignee.map(() => '?').join(',')})`)
    params.push(...assignee)
  }

  if (q) {
    conditions.push('(pr.name LIKE ? OR p.name LIKE ? OR t.title LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const [rows] = await connection.query(
    `SELECT
        t.id AS task_id,
        t.product_id,
        t.title AS task_title,
        t.current_status,
        t.assignee_user_id,
        t.created_by AS task_created_by,
        t.created_at AS task_created_at,
        t.updated_at AS task_updated_at,
        p.id AS product_id,
        p.project_id,
        p.name AS product_name,
        p.created_by AS product_created_by,
        p.created_at AS product_created_at,
        p.updated_at AS product_updated_at,
        pr.id AS project_id,
        pr.name AS project_name,
        pr.owner_mail AS project_owner_mail,
        pr.created_at AS project_created_at,
        pr.updated_at AS project_updated_at
     FROM tasks t
     JOIN products p ON p.id = t.product_id
     JOIN projects pr ON pr.id = p.project_id
     ${whereClause}
     ORDER BY pr.created_at ASC, p.created_at ASC, t.created_at ASC`,
    params
  )
  return rows
}

export const createTask = async (
  connection,
  { productId, title, currentStatus, createdBy, assigneeUserId }
) => {
  const [result] = await connection.query(
    `INSERT INTO tasks (product_id, title, current_status, created_by, assignee_user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [productId, title, currentStatus, createdBy, assigneeUserId ?? null]
  )
  return result.insertId
}
