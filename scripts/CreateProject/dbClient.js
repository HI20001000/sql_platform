import mysql from 'mysql2/promise'

const {
  MYSQL_HOST = 'localhost',
  MYSQL_PORT = '3306',
  MYSQL_USER = 'root',
  MYSQL_PASSWORD = '12345',
  MYSQL_DATABASE = 'aisql',
} = process.env

let connection = null

const createConnection = async (withDatabase = true) => {
  return mysql.createConnection({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: withDatabase ? MYSQL_DATABASE : undefined,
  })
}

const ensureDatabase = async () => {
  const baseConnection = await createConnection(false)
  await baseConnection.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\``)
  await baseConnection.end()
}

const ensureCreateProjectTables = async (db) => {
  await db.query(`CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_mail VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_products_project_id (project_id)
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    current_status VARCHAR(64) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    assignee_user_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tasks_product_id (product_id),
    INDEX idx_tasks_status (current_status),
    INDEX idx_tasks_assignee (assignee_user_id)
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS task_steps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    status VARCHAR(64) NOT NULL,
    content TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    assignee_user_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_steps_task_id (task_id)
  )`)
}

const initDatabase = async () => {
  await ensureDatabase()
  const db = await createConnection(true)
  await ensureCreateProjectTables(db)
  return db
}

export const getConnection = async () => {
  if (!connection) {
    connection = await initDatabase()
    return connection
  }
  try {
    await connection.ping()
  } catch {
    try {
      await connection.end()
    } catch {
      // ignore
    }
    connection = await initDatabase()
  }
  return connection
}
