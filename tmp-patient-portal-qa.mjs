export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.getByRole('button', { name: /patient/i }).first().click();
  await page.getByPlaceholder(/referral \/ tracking code/i).waitFor({ timeout: 15000 });
  await page.getByPlaceholder(/referral \/ tracking code/i).fill('CL-20261005-Y7C68D');
  await page.getByPlaceholder(/must match the patient record/i).fill('Ayco');
  await page.getByRole('button', { name: /view my queue/i }).click();
  await page.getByRole('button', { name: /queue status/i }).waitFor({ timeout: 25000 });

  const sidebar = await page.locator('aside').innerText();
  const body = await page.locator('main').innerText();
  const hasOtherNames = /Louise|Paolo|Nina|Presdemo|Esteban|Demontano/i.test(body.replace(/Louise Ayco/g, ''));

  await page.getByRole('button', { name: /^history$/i }).click();
  await page.getByRole('heading', { name: /visit history|medical visit/i }).first().waitFor({ timeout: 15000 });
  const history = await page.locator('main').innerText();

  await page.getByRole('button', { name: /^profile$/i }).click();
  await page.getByText(/patient id/i).waitFor({ timeout: 15000 });
  const profile = await page.locator('main').innerText();

  return {
    nav: {
      queue: /queue status/i.test(sidebar),
      history: /history/i.test(sidebar),
      profile: /profile/i.test(sidebar),
      dashboard: /dashboard/i.test(sidebar),
    },
    queueHasNumber: /#|#S-|#V-|#E-|S-00|Y7C68D/i.test(body) || /your queue/i.test(body),
    otherPatientNamesOnQueue: hasOtherNames,
    historyHasVisits: /CL-20261005-Y7C68D|medical visit|no medical visit history/i.test(history),
    profileHasName: /Louise Ayco/i.test(profile),
    ok: /queue status/i.test(sidebar) && /history/i.test(sidebar) && /profile/i.test(sidebar) && !/dashboard/i.test(sidebar),
  };
}
