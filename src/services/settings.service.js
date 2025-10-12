import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Settings Service
 * Manages application settings stored in the database
 */

/**
 * Get all settings
 * @param {string} category - Optional category filter
 * @returns {Array} Array of settings
 */
export function getAllSettings(category = null) {
  try {
    const db = getDatabase();
    let sql = 'SELECT * FROM settings';
    const params = [];

    if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }

    sql += ' ORDER BY category, key';

    const stmt = db.prepare(sql);
    const settings = stmt.all(...params);

    // Parse values based on type
    return settings.map(parseSettingValue);
  } catch (error) {
    logger.error('Error getting settings:', error);
    throw error;
  }
}

/**
 * Get a single setting by key
 * @param {string} key - Setting key
 * @returns {Object|null} Setting object or null if not found
 */
export function getSetting(key) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM settings WHERE key = ?');
    const setting = stmt.get(key);

    if (!setting) {
      return null;
    }

    return parseSettingValue(setting);
  } catch (error) {
    logger.error(`Error getting setting ${key}:`, error);
    throw error;
  }
}

/**
 * Get setting value (parsed)
 * @param {string} key - Setting key
 * @param {any} defaultValue - Default value if not found
 * @returns {any} Parsed setting value or default
 */
export function getSettingValue(key, defaultValue = null) {
  const setting = getSetting(key);
  return setting ? setting.parsedValue : defaultValue;
}

/**
 * Create or update a setting
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 * @param {string} type - Value type (string, int, float, bool, json)
 * @param {string} category - Setting category
 * @param {string} description - Setting description
 * @returns {Object} Updated setting
 */
export function setSetting(key, value, type = 'string', category = null, description = null) {
  try {
    const db = getDatabase();

    // Convert value to string for storage
    const stringValue = serializeValue(value, type);

    // Check if setting exists
    const existing = getSetting(key);

    if (existing) {
      // Update existing setting
      const stmt = db.prepare(`
        UPDATE settings
        SET value = ?, type = ?, category = COALESCE(?, category), description = COALESCE(?, description)
        WHERE key = ?
      `);
      stmt.run(stringValue, type, category, description, key);
      logger.info(`Setting updated: ${key} = ${stringValue}`);
    } else {
      // Insert new setting
      const stmt = db.prepare(`
        INSERT INTO settings (key, value, type, category, description)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(key, stringValue, type, category, description);
      logger.info(`Setting created: ${key} = ${stringValue}`);
    }

    return getSetting(key);
  } catch (error) {
    logger.error(`Error setting ${key}:`, error);
    throw error;
  }
}

/**
 * Update multiple settings at once
 * @param {Array} settings - Array of {key, value, type?, category?, description?}
 * @returns {Array} Updated settings
 */
export function updateSettings(settings) {
  try {
    const db = getDatabase();

    const transaction = db.transaction(() => {
      for (const setting of settings) {
        setSetting(
          setting.key,
          setting.value,
          setting.type,
          setting.category,
          setting.description
        );
      }
    });

    transaction();

    // Return all updated settings
    const keys = settings.map(s => s.key);
    const stmt = db.prepare(`SELECT * FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`);
    return stmt.all(...keys).map(parseSettingValue);
  } catch (error) {
    logger.error('Error updating settings:', error);
    throw error;
  }
}

/**
 * Delete a setting
 * @param {string} key - Setting key
 * @returns {boolean} True if deleted
 */
export function deleteSetting(key) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM settings WHERE key = ?');
    const result = stmt.run(key);

    if (result.changes > 0) {
      logger.info(`Setting deleted: ${key}`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Error deleting setting ${key}:`, error);
    throw error;
  }
}

/**
 * Get all setting categories
 * @returns {Array} Array of unique categories
 */
export function getCategories() {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT DISTINCT category FROM settings WHERE category IS NOT NULL ORDER BY category');
    return stmt.all().map(row => row.category);
  } catch (error) {
    logger.error('Error getting categories:', error);
    throw error;
  }
}

/**
 * Reset settings to defaults
 * @param {string} category - Optional category to reset
 * @returns {number} Number of settings reset
 */
export function resetSettings(category = null) {
  try {
    const db = getDatabase();

    // This would require storing default values somewhere
    // For now, just log a warning
    logger.warn('Reset settings not fully implemented - would need default values');

    return 0;
  } catch (error) {
    logger.error('Error resetting settings:', error);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse setting value based on type
 * @param {Object} setting - Raw setting from database
 * @returns {Object} Setting with parsed value
 */
function parseSettingValue(setting) {
  let parsedValue;

  switch (setting.type) {
    case 'int':
      parsedValue = parseInt(setting.value, 10);
      break;
    case 'float':
      parsedValue = parseFloat(setting.value);
      break;
    case 'bool':
      parsedValue = setting.value === 'true' || setting.value === '1';
      break;
    case 'json':
      try {
        parsedValue = JSON.parse(setting.value);
      } catch {
        parsedValue = setting.value;
      }
      break;
    default:
      parsedValue = setting.value;
  }

  return {
    ...setting,
    parsedValue,
  };
}

/**
 * Serialize value to string for storage
 * @param {any} value - Value to serialize
 * @param {string} type - Value type
 * @returns {string} Serialized value
 */
function serializeValue(value, type) {
  switch (type) {
    case 'json':
      return JSON.stringify(value);
    case 'bool':
      return value ? 'true' : 'false';
    default:
      return String(value);
  }
}

export default {
  getAllSettings,
  getSetting,
  getSettingValue,
  setSetting,
  updateSettings,
  deleteSetting,
  getCategories,
  resetSettings,
};
