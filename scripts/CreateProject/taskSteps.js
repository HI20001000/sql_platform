export const fetchTaskStepsByTaskId = async (connection, taskId) => {
  const [rows] = await connection.query(
    `SELECT id, task_id, status, content, assignee_user_id, created_by, created_at
     FROM task_steps
     WHERE task_id = ?
     ORDER BY created_at ASC`,
    [taskId]
  )
  return rows
}

export const createTaskStep = async (
  connection,
  { taskId, status, content, createdBy, assigneeUserId }
) => {
  const [result] = await connection.query(
    `INSERT INTO task_steps (task_id, status, content, created_by, assignee_user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [taskId, status, content, createdBy, assigneeUserId]
  )
  const [rows] = await connection.query(
    `SELECT id, task_id, status, content, assignee_user_id, created_by, created_at
     FROM task_steps
     WHERE id = ?`,
    [result.insertId]
  )
  return rows[0]
}
