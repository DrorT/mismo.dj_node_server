import { randomUUID } from 'crypto';

/**
 * UUID Utility
 * Helper functions for generating and validating UUIDs
 */

/**
 * Generate a new UUID v4
 * @returns {string} UUID string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateUUID() {
  return randomUUID();
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID string to validate
 * @returns {boolean} True if valid UUID format
 */
export function isValidUUID(uuid) {
  if (typeof uuid !== 'string') {
    return false;
  }

  // UUID v4 regex pattern
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate UUID format (strict check for UUID v4)
 * @param {string} uuid - UUID string to validate
 * @returns {boolean} True if valid UUID v4 format
 */
export function isValidUUIDv4(uuid) {
  return isValidUUID(uuid);
}

/**
 * Generate multiple UUIDs
 * @param {number} count - Number of UUIDs to generate
 * @returns {Array<string>} Array of UUID strings
 */
export function generateUUIDs(count) {
  const uuids = [];
  for (let i = 0; i < count; i++) {
    uuids.push(randomUUID());
  }
  return uuids;
}

/**
 * Generate a UUID with custom prefix for debugging/testing
 * Note: This is NOT a valid UUID and should only be used for testing
 * @param {string} prefix - Prefix for the UUID
 * @returns {string} UUID-like string with prefix
 */
export function generateUUIDWithPrefix(prefix) {
  const uuid = randomUUID();
  // Replace first part with prefix (for debugging only)
  return `${prefix}-${uuid.substring(prefix.length + 1)}`;
}

export default {
  generateUUID,
  isValidUUID,
  isValidUUIDv4,
  generateUUIDs,
  generateUUIDWithPrefix,
};
