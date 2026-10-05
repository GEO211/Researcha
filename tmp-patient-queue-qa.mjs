export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.getByRole('button', { name: /^patient$/i }).click();
  await page.getByPlaceholder(/referral \/ tracking code/i).fill('CL-20261005-Y7C68D');
  await page.getByPlaceholder(/must match the patient record/i).fill('Ayco');
  await page.getByRole('button', { name: /view my queue/i }).click();
  await page.getByRole('heading', { name: /queue status/i }).waitFor({ timeout: 25000 });
  await page.getByText(/your queue/i).first().waitFor({ timeout: 15000 });
  const body = await page.locator('body').innerText();
  return {
    queueNumber: /S-005/.test(body),
    serving: /currently serving/i.test(body),
    ahead: /patients ahead/i.test(body),
    wait: /estimated wait/i.test(body),
    progress: /registration/i.test(body) && /waiting/i.test(body),
    line: /current queue/i.test(body) && /you/i.test(body),
    info: /your information/i.test(body) && /Louise Ayco/i.test(body),
  };
}
