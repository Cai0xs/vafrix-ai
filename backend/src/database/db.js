// backend/src/database/db.js
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = path.join(__dirname, 'vafrix.sqlite');

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await dbInstance.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'chat',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      attachment_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      title TEXT NOT NULL,
      equipment TEXT,
      problem_description TEXT NOT NULL,
      diagnosis TEXT,
      procedures TEXT,
      result TEXT,
      recommendations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );
  `);

  return dbInstance;
}

module.exports = { getDb };