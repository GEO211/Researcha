import { createAuditLog } from '../lib/supabase/store.js';

export async function audit(req, action, auditableType, auditableId, oldValues = null, newValues = null) {
  await createAuditLog({
    user_id: req.user?.id || null,
    action,
    auditable_type: auditableType,
    auditable_id: auditableId,
    old_values: oldValues || null,
    new_values: newValues || null,
    ip_address: req.ip || null,
    user_agent: req.headers?.['user-agent'] || null,
  });
}
