export default async function run(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.getByRole('button', { name: /patient/i }).first().click();
  await page.getByPlaceholder(/referral \/ tracking code/i).waitFor({ timeout: 15000 });
  await page.getByPlaceholder(/referral \/ tracking code/i).fill('CL-20261005-Y7C68D');
  await page.getByPlaceholder(/must match the patient record/i).fill('Ayco');
  await page.getByRole('button', { name: /view my queue/i }).click();
  await page.getByText('S-005').first().waitFor({ timeout: 25000 });
  return { ok: true };
}
