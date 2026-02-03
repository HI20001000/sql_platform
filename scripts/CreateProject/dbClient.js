import mysql from 'mysql2/promise'

const {
  MYSQL_HOST = 'localhost',
  MYSQL_PORT = '3306',
  MYSQL_USER = 'root',
  MYSQL_PASSWORD = '12345',
  MYSQL_DATABASE = 'aisql',
} = process.env

let connection = null

const createConnection = async () => {
  return mysql.createConnection({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
  })
}

export const getConnection = async () => {
  if (!connection) {
    connection = await createConnection()
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
    connection = await createConnection()
  }
  return connection
}
