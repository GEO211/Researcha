import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  createEvaluationResponse,
  findReferralByCode,
  listEvaluationSummary,
  listPatientSatisfactionSummary,
  listRecentEvaluations,
} from '../lib/supabase/store.js';

const router = Router();

const staffSurveySchema = z.object({
  survey_type: z.enum(['sus', 'tam']),
  respondent_role: z.enum(['super_admin', 'barangay_staff', 'city_staff', 'patient']),
  respondent_name: z.string().optional().nullable(),
  score: z.coerce.number().int().min(0).max(100),
  answers: z.array(z.coerce.number().int().min(1).max(5)).min(1),
  comments: z.string().optional().nullable(),
});

const patientSurveySchema = z.object({
  tracking_code: z.string().min(3),
  rating: z.coerce.number().int().min(1).max(5),
  comments: z.string().optional().nullable(),
});

function calculateSusScore(answers) {
  let sum = 0;
  for (let i = 0; i < answers.length; i += 1) {
    const value = answers[i];
    sum += (i % 2 === 0) ? value - 1 : 5 - value;
  }
  return sum * 2.5;
}

router.post('/patient', async (req, res, next) => {
  try {
    const data = patientSurveySchema.parse(req.body);
    const referral = await findReferralByCode(data.tracking_code);
    if (!referral) {
      return res.status(404).json({ message: 'Referral not found for this tracking code.' });
    }

    const id = await createEvaluationResponse({
      survey_type: 'patient_satisfaction',
      respondent_role: 'patient',
      tracking_code: data.tracking_code,
      rating: data.rating,
      score: data.rating * 20,
      answers: [data.rating],
      comments: data.comments || null,
    });

    return res.status(201).json({ id, message: 'Patient satisfaction recorded.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = staffSurveySchema.parse(req.body);
    const score = data.survey_type === 'sus' ? calculateSusScore(data.answers) : data.score;
    const id = await createEvaluationResponse({ ...data, score });
    res.status(201).json({ id, ...data, score });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticate, authorize('super_admin', 'city_staff'), async (_req, res, next) => {
  try {
    const [summary, recent, patientSummary] = await Promise.all([
      listEvaluationSummary(),
      listRecentEvaluations(),
      listPatientSatisfactionSummary(),
    ]);
    res.json({ summary, recent, responses: recent, patientSummary });
  } catch (error) {
    next(error);
  }
});

router.get('/export.csv', authenticate, authorize('super_admin', 'city_staff'), async (_req, res, next) => {
  try {
    const rows = await listRecentEvaluations(1000);
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const columns = ['id', 'survey_type', 'respondent_role', 'tracking_code', 'rating', 'score', 'comments', 'created_at'];
    const csv = [
      columns.join(','),
      ...rows.map((row) => columns.map((col) => escape(row[col])).join(',')),
    ].join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('carelink-evaluations.csv');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
