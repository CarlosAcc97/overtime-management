import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { systemConfig } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { ok } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { onlyAdmin, anyRole } from '../../middleware/authorize.js';
import { logAudit } from '../../middleware/auditLogger.js';
import { DEFAULT_CONFIG } from '../../config/constants.js';

const router = Router();
router.use(authenticate);

router.get('/', anyRole, async (req, res) => {
  const rows = await db.select().from(systemConfig);
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  ok(res, { config });
});

router.put('/', onlyAdmin, async (req, res) => {
  const schema = z.record(z.string());
  const updates = schema.parse(req.body);

  for (const [key, value] of Object.entries(updates)) {
    const [existing] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
    if (existing) {
      await db.update(systemConfig).set({ value, updatedBy: req.user.id, updatedAt: new Date().toISOString() }).where(eq(systemConfig.key, key));
    } else {
      await db.insert(systemConfig).values({ key, value, updatedBy: req.user.id });
    }
  }

  await logAudit({ userId: req.user.id, action: 'config.update', entityType: 'system_config', newValues: updates, req });
  const rows = await db.select().from(systemConfig);
  ok(res, { config: Object.fromEntries(rows.map(r => [r.key, r.value])) }, 'Configuración actualizada');
});

export default router;
