export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.getByRole('button', { name: /^patient$/i }).click();
  await page.getByPlaceholder(/referral \/ tracking code/i).fill('CL-20261005-Y7C68D');
  await page.getByPlaceholder(/must match the patient record/i).fill('Ayco');
  await page.getByRole('button', { name: /view my queue/i }).click();
  await page.getByRole('button', { name: /^history$/i }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: /^history$/i }).click();
  await page.getByRole('button', { name: /view details/i }).first().waitFor({ timeout: 15000 });
  const list = await page.locator('body').innerText();
  await page.getByRole('button', { name: /view details/i }).first().click();
  await page.getByText(/visit timeline/i).waitFor({ timeout: 15000 });
  const details = await page.locator('body').innerText();
  return {
    listHasVisit: /CL-20261005-Y7C68D|S-005/.test(list),
    hasTimeline: /visit created/i.test(details) && /waiting/i.test(details),
    hasStatus: /waiting|queued|completed/i.test(details),
  };
}
