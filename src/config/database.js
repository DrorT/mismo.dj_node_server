import Database from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

/**
 * Initialize database connection and schema
 * @param {string} dbPath - Path to database file
 * @returns {Database} SQLite database instance
 */
export function initDatabase(dbPath) {
  try {
    // Ensure data directory exists
    const dbDir = path.dirname(dbPath);
    fs.ensureDirSync(dbDir);

    // Create database connection
    db = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null,
    });

    // Enable foreign key constraints
    db.pragma('foreign_keys = ON');

    // Configure for better performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = MEMORY');

    console.log(`Database connected: ${dbPath}`);

    // Initialize schema
    initSchema();

    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Load and execute schema.sql to initialize database structure
 */
function initSchema() {
  try {
    const schemaPath = path.resolve(__dirname, '../../docs/schema.sql');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    let schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Remove single-line comments (lines starting with --)
    schemaSql = schemaSql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    // Remove inline comments (-- followed by text)
    schemaSql = schemaSql.replace(/--[^\n]*/g, '');

    // Execute the entire schema as one script
    db.exec(schemaSql);

    // Verify schema version
    const version = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
    console.log(`Database schema initialized (version ${version.version})`);
  } catch (error) {
    console.error('Failed to initialize schema:', error);
    throw error;
  }
}

/**
 * Get database instance
 * @returns {Database} SQLite database instance
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}

/**
 * Execute a query with error handling
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Array} Query results
 */
export function query(sql, params = []) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Execute a single-row query
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Object|null} Query result or null
 */
export function queryOne(sql, params = []) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(sql);
    return stmt.get(...params) || null;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Execute an insert/update/delete query
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Object} Result with lastInsertRowid, changes
 */
export function execute(sql, params = []) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  } catch (error) {
    console.error('Database execute error:', error);
    throw error;
  }
}

/**
 * Execute multiple queries in a transaction
 * @param {Function} callback - Function containing queries
 * @returns {any} Result of callback
 */
export function transaction(callback) {
  try {
    const db = getDatabase();
    return db.transaction(callback)();
  } catch (error) {
    console.error('Database transaction error:', error);
    throw error;
  }
}

export default {
  initDatabase,
  getDatabase,
  closeDatabase,
  query,
  queryOne,
  execute,
  transaction,
};
