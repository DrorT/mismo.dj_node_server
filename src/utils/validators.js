import Joi from 'joi';
import path from 'path';

/**
 * Validation middleware factory
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Property to validate (body, query, params)
 * @returns {Function} Express middleware
 */
export function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    // Replace with validated value
    req[property] = value;
    next();
  };
}

/**
 * Common validation schemas
 */
export const schemas = {
  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(1000).default(50),
    sort: Joi.string(),
    order: Joi.string().valid('asc', 'desc').default('asc'),
  }),

  // ID parameter
  id: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),

  // File path
  filePath: Joi.string()
    .min(1)
    .custom((value, helpers) => {
      try {
        const normalized = path.normalize(value);
        // Check for path traversal attempts
        if (normalized.includes('..')) {
          return helpers.error('any.invalid');
        }
        return normalized;
      } catch (error) {
        return helpers.error('any.invalid');
      }
    }, 'path validation'),

  // Library directory
  libraryDirectory: Joi.object({
    path: Joi.string().required(),
    name: Joi.string().allow('', null),
    is_active: Joi.boolean().default(true),
    is_removable: Joi.boolean().default(false),
    recursive_scan: Joi.boolean().default(true),
    max_depth: Joi.number().integer().min(-1).default(-1),
    scan_patterns: Joi.array().items(Joi.string()),
    exclude_patterns: Joi.array().items(Joi.string()),
    follow_symlinks: Joi.boolean().default(false),
    priority: Joi.number().integer().default(0),
  }),

  // Track metadata
  trackMetadata: Joi.object({
    title: Joi.string().allow('', null),
    artist: Joi.string().allow('', null),
    album: Joi.string().allow('', null),
    album_artist: Joi.string().allow('', null),
    genre: Joi.string().allow('', null),
    year: Joi.number().integer().min(1900).max(2100).allow(null),
    track_number: Joi.number().integer().min(0).allow(null),
    comment: Joi.string().allow('', null),
    rating: Joi.number().integer().min(0).max(5).allow(null),
    color_tag: Joi.string().allow('', null),
    energy_level: Joi.number().integer().min(0).max(10).allow(null),
  }),

  // Track filters
  trackFilters: Joi.object({
    artist: Joi.string(),
    genre: Joi.string(),
    bpm_min: Joi.number(),
    bpm_max: Joi.number(),
    key: Joi.number().integer().min(0).max(11),
    mode: Joi.number().integer().min(0).max(1),
    library_id: Joi.number().integer().positive(),
    is_missing: Joi.boolean(),
    duplicate_group_id: Joi.number().integer().positive(),
    rating_min: Joi.number().integer().min(0).max(5),
    energy_min: Joi.number().integer().min(0).max(10),
    energy_max: Joi.number().integer().min(0).max(10),
    search: Joi.string(),
  }).concat(schemas.pagination),

  // Scan request
  scanRequest: Joi.object({
    strategy: Joi.string().valid('hybrid', 'fast', 'full').default('hybrid'),
    priority: Joi.string().valid('low', 'normal', 'high').default('normal'),
  }),

  // Playlist
  playlist: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().allow('', null),
    is_smart: Joi.boolean().default(false),
    smart_criteria: Joi.object().allow(null),
    color: Joi.string().allow('', null),
    icon: Joi.string().allow('', null),
  }),

  // Playlist tracks
  playlistTracks: Joi.object({
    track_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
    position: Joi.number().integer().min(0),
  }),

  // Settings
  setting: Joi.object({
    key: Joi.string().required(),
    value: Joi.string().required(),
    type: Joi.string().valid('string', 'int', 'float', 'bool', 'json'),
    category: Joi.string(),
    description: Joi.string(),
  }),

  // File operation
  fileMove: Joi.object({
    destination_path: Joi.string().required(),
    library_directory_id: Joi.number().integer().positive().allow(null),
  }),

  fileRename: Joi.object({
    new_name: Joi.string().required(),
  }),

  fileDelete: Joi.object({
    confirm: Joi.boolean().valid(true).required(),
  }),

  // Cleanup options
  cleanup: Joi.object({
    remove_missing_older_than_days: Joi.number().integer().min(0).default(30),
    keep_playlists_intact: Joi.boolean().default(true),
    backup_metadata: Joi.boolean().default(true),
  }),
};

/**
 * Validate file path for security
 * @param {string} filePath - File path to validate
 * @throws {Error} If path is invalid or contains traversal
 */
export function validateFilePath(filePath) {
  const normalized = path.normalize(filePath);

  // Check for path traversal
  if (normalized.includes('..')) {
    throw new Error('Path traversal detected');
  }

  return normalized;
}

/**
 * Validate library directory path
 * @param {string} dirPath - Directory path to validate
 * @returns {string} Normalized path
 */
export function validateDirectoryPath(dirPath) {
  const normalized = path.resolve(dirPath);

  // Additional checks can be added here
  return normalized;
}

export default {
  validate,
  schemas,
  validateFilePath,
  validateDirectoryPath,
};
