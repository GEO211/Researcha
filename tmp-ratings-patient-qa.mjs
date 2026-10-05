export default async function run(page) {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.getByRole('button', { name: /^patient$/i }).click();
  await page.getByPlaceholder(/referral \/ tracking code/i).fill('CL-20261005-P0526');
  await page.getByPlaceholder(/must match the patient record/i).fill('Presdemo TF');
  await page.getByRole('button', { name: /view my queue/i }).click();
  await page.getByRole('button', { name: /ratings & feedback/i }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: /ratings & feedback/i }).click();
  await page.getByRole('button', { name: /rate now/i }).waitFor({ timeout: 15000 });
  const before = await page.locator('[class*="max-w-7xl"]').first().innerText();
  await page.getByRole('button', { name: /rate now/i }).click();
  await page.getByText(/how was your experience/i).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /5 stars — excellent/i }).first().click();
  await page.getByPlaceholder(/staff were accommodating/i).fill('Staff were very accommodating.');
  await page.getByRole('button', { name: /submit rating/i }).click();
  await page.getByText(/thank you for your feedback/i).waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const afterModal = await page.locator('body').innerText();
  await page.keyboard.press('Escape');
  await page.getByText(/your previous ratings/i).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const after = await page.locator('[class*="max-w-7xl"]').first().innerText();
  return {
    beforeHasRateNow: /rate now/i.test(before),
    submitted: /thank you for your feedback|staff were very accommodating/i.test(afterModal + after),
    afterHasView: /view rating/i.test(after),
    afterHasStars: /5\/5/i.test(after),
  };
}
