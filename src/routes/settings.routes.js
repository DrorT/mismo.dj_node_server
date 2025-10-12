import express from 'express';
import * as settingsService from '../services/settings.service.js';
import { validate, schemas } from '../utils/validators.js';
import logger from '../utils/logger.js';
import Joi from 'joi';

const router = express.Router();

/**
 * GET /api/settings
 * Get all settings or filter by category
 */
router.get(
  '/',
  validate(
    Joi.object({
      category: Joi.string(),
    }),
    'query'
  ),
  async (req, res) => {
    try {
      const { category } = req.query;
      const settings = settingsService.getAllSettings(category);

      res.json({
        success: true,
        count: settings.length,
        data: settings,
      });
    } catch (error) {
      logger.error('Error getting settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve settings',
      });
    }
  }
);

/**
 * GET /api/settings/categories
 * Get all setting categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = settingsService.getCategories();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('Error getting categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve categories',
    });
  }
});

/**
 * GET /api/settings/:key
 * Get a single setting by key
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const setting = settingsService.getSetting(key);

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'Setting not found',
      });
    }

    res.json({
      success: true,
      data: setting,
    });
  } catch (error) {
    logger.error('Error getting setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve setting',
    });
  }
});

/**
 * PUT /api/settings/:key
 * Update a single setting
 */
router.put(
  '/:key',
  validate(
    Joi.object({
      value: Joi.required(),
      type: Joi.string().valid('string', 'int', 'float', 'bool', 'json'),
      category: Joi.string().allow(null),
      description: Joi.string().allow(null),
    })
  ),
  async (req, res) => {
    try {
      const { key } = req.params;
      const { value, type, category, description } = req.body;

      const setting = settingsService.setSetting(key, value, type, category, description);

      res.json({
        success: true,
        data: setting,
      });
    } catch (error) {
      logger.error('Error updating setting:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update setting',
      });
    }
  }
);

/**
 * PUT /api/settings
 * Update multiple settings at once
 */
router.put(
  '/',
  validate(
    Joi.object({
      settings: Joi.array()
        .items(
          Joi.object({
            key: Joi.string().required(),
            value: Joi.required(),
            type: Joi.string().valid('string', 'int', 'float', 'bool', 'json'),
            category: Joi.string().allow(null),
            description: Joi.string().allow(null),
          })
        )
        .min(1)
        .required(),
    })
  ),
  async (req, res) => {
    try {
      const { settings } = req.body;
      const updated = settingsService.updateSettings(settings);

      res.json({
        success: true,
        count: updated.length,
        data: updated,
      });
    } catch (error) {
      logger.error('Error updating settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update settings',
      });
    }
  }
);

/**
 * DELETE /api/settings/:key
 * Delete a setting
 */
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const deleted = settingsService.deleteSetting(key);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Setting not found',
      });
    }

    res.json({
      success: true,
      message: 'Setting deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete setting',
    });
  }
});

export default router;
