export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.getByRole('button', { name: /^staff$/i }).click();
  await page.locator('input[type="email"]').fill('city@carelink.local');
  await page.locator('input[type="password"]').fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.getByRole('button', { name: /^analytics$/i }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: /^analytics$/i }).click();
  await page.getByText('Total referrals').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const text = await page.locator('body').innerText();
  return {
    hasApiMetrics: /api performance metrics/i.test(text),
    hasPriorityScore: /priority score computation/i.test(text),
    hasAbandonment: /abandonment/i.test(text),
    hasStaffPerformance: /staff performance/i.test(text),
  };
}
