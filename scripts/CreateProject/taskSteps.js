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
