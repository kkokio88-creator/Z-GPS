import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { getVaultRoot } from '../../services/vaultFileService.js';

const router = Router();

/**
 * GET /api/vault/config
 * 런타임 설정 읽기 (API 키 등)
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const configPath = path.join(getVaultRoot(), 'config.json');
    const restore = req.query.restore === 'true';
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(raw);
      if (restore) {
        res.json({ config });
        return;
      }
      const masked: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(config)) {
        if (typeof val === 'string' && key.toLowerCase().includes('key') && val.length > 8) {
          masked[key] = val.substring(0, 4) + '***' + val.substring(val.length - 4);
        } else {
          masked[key] = val;
        }
      }
      res.json({ config: masked });
    } catch {
      res.json({ config: {} });
    }
  } catch (error) {
    console.error('[vault/config] GET error:', error);
    res.status(500).json({ error: '설정 읽기 실패' });
  }
});

/**
 * PUT /api/vault/config
 * 런타임 설정 저장 (API 키 등)
 */
router.put('/config', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Record<string, unknown>;
    const configPath = path.join(getVaultRoot(), 'config.json');

    let config: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(raw);
    } catch { /* 첫 저장 */ }

    const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    for (const key of Object.keys(updates)) {
      if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
        res.status(400).json({ error: 'Invalid config key' });
        return;
      }
    }

    const ALLOWED_STRING_FIELDS = [
      'geminiApiKey', 'dartApiKey', 'dataGoKrApiKey', 'odcloudApiKey',
      'geminiModel', 'language', 'theme'
    ] as const;
    const ALLOWED_BOOL_FIELDS = ['editorAutoSave'] as const;

    for (const field of ALLOWED_STRING_FIELDS) {
      if (field in updates && typeof updates[field] === 'string') {
        config[field] = updates[field];
      }
    }
    for (const field of ALLOWED_BOOL_FIELDS) {
      if (field in updates && typeof updates[field] === 'boolean') {
        config[field] = updates[field];
      }
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    if (typeof config.geminiApiKey === 'string' && updates.geminiApiKey) {
      process.env.GEMINI_API_KEY = config.geminiApiKey;
    }
    if (typeof config.dartApiKey === 'string' && updates.dartApiKey) {
      process.env.DART_API_KEY = config.dartApiKey;
    }
    if (typeof config.dataGoKrApiKey === 'string' && updates.dataGoKrApiKey) {
      process.env.DATA_GO_KR_API_KEY = config.dataGoKrApiKey;
    }
    if (typeof config.odcloudApiKey === 'string' && updates.odcloudApiKey) {
      process.env.ODCLOUD_API_KEY = config.odcloudApiKey;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[vault/config] PUT error:', error);
    res.status(500).json({ error: '설정 저장 실패' });
  }
});

export default router;
