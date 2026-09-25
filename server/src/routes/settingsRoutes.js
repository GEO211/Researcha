import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { listPriorityRules, listSystemSettings, updatePriorityRule, upsertSystemSetting } from '../lib/supabase/store.js';
import { audit } from '../services/auditService.js';
import { PERMISSIONS } from '../../../shared/rbac.js';

const router = Router();

const settingSchema = z.object({
  setting_value: z.string().min(1),
  description: z.string().optional().nullable(),
});

const priorityRuleSchema = z.object({
  name: z.string().min(2).optional(),
  score_value: z.coerce.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

router.get('/', authenticate, authorize(PERMISSIONS.SETTINGS_MANAGE), async (_req, res, next) => {
  try {
    const [settings, rules] = await Promise.all([listSystemSettings(), listPriorityRules()]);
    res.json({ settings, rules });
  } catch (error) {
    next(error);
  }
});

router.patch('/:key', authenticate, authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const data = settingSchema.parse(req.body);
    await upsertSystemSetting(req.params.key, data);

    await audit(req, 'setting.updated', 'system_setting', null, null, { setting_key: req.params.key, ...data });
    res.json({ setting_key: req.params.key, ...data });
  } catch (error) {
    next(error);
  }
});

router.patch('/priority-rules/:id', authenticate, authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = priorityRuleSchema.parse(req.body);
    const rules = await listPriorityRules();
    const existing = rules.find((rule) => rule.id === id);

    if (!existing) {
      return res.status(404).json({ message: 'Priority rule not found.' });
    }

    const nextRule = await updatePriorityRule(id, { ...existing, ...data });
    await audit(req, 'priority_rule.updated', 'priority_rule', id, existing, data);
    return res.json({ rule: nextRule });
  } catch (error) {
    return next(error);
  }
});

export default router;
