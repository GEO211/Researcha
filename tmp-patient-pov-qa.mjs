export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.getByRole('button', { name: /^patient$/i }).click();
  await page.getByPlaceholder(/referral \/ tracking code/i).waitFor({ timeout: 15000 });
  await page.getByPlaceholder(/referral \/ tracking code/i).fill('CL-20261005-Y7C68D');
  await page.getByPlaceholder(/must match the patient record/i).fill('Ayco');
  await page.getByRole('button', { name: /view my queue/i }).click();
  await page.getByRole('heading', { name: /queue status/i }).waitFor({ timeout: 25000 });

  const nav = await page.locator('aside nav').innerText();
  const body = await page.locator('body').innerText();
  const queueHero = await page.locator('p.font-mono').first().innerText().catch(() => '');

  await page.getByRole('button', { name: /^history$/i }).click();
  await page.getByText(/visit history|no medical visit history/i).waitFor({ timeout: 15000 });
  const history = await page.locator('body').innerText();

  await page.getByRole('button', { name: /^profile$/i }).click();
  await page.getByText(/patient id|unable to load/i).waitFor({ timeout: 15000 });
  const profile = await page.locator('body').innerText();

  return {
    nav,
    hasQueueStatusNav: /queue status/i.test(nav),
    hasHistoryNav: /history/i.test(nav),
    hasProfileNav: /profile/i.test(nav),
    hasTrackingNav: /tracking/i.test(nav),
    queueHero,
    hasCurrentlyServing: /currently serving/i.test(body),
    hasPatientsAhead: /patients ahead/i.test(body),
    hasEstimatedWait: /estimated wait/i.test(body),
    hasProgress: /queue progress/i.test(body),
    hasCurrentQueue: /current queue/i.test(body),
    hasYou: /\bYOU\b/i.test(body),
    historyHasVisit: /CL-20261005-Y7C68D|medical visit|no medical visit history/i.test(history),
    profileHasName: /Louise Ayco/i.test(profile),
    ok: /queue status/i.test(nav)
      && /history/i.test(nav)
      && /profile/i.test(nav)
      && !/tracking/i.test(nav)
      && /currently serving/i.test(body),
  };
}
