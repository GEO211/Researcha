import { Router } from 'express';
import { getPublicActiveQueueBoard, getPublicTracking } from '../lib/supabase/store.js';

const router = Router();

router.get('/queue/active', async (_req, res, next) => {
  try {
    const board = await getPublicActiveQueueBoard();
    return res.json(board);
  } catch (error) {
    return next(error);
  }
});

router.get('/track/:referralCode', async (req, res, next) => {
  try {
    const tracking = await getPublicTracking(req.params.referralCode);

    if (!tracking) {
      return res.status(404).json({ message: 'Referral tracking code not found.' });
    }

    return res.json({ tracking, ...tracking });
  } catch (error) {
    return next(error);
  }
});

export default router;
