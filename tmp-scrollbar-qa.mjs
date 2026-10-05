export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.getByRole('button', { name: /^staff$/i }).click();
  await page.locator('input[type="email"]').fill('city@carelink.local');
  await page.locator('input[type="password"]').fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.getByRole('button', { name: /ratings & feedback/i }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: /ratings & feedback/i }).click();
  await page.getByText('Average rating').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  const metrics = await page.evaluate(() => {
    const html = document.documentElement;
    return {
      clientWidth: html.clientWidth,
      innerWidth: window.innerWidth,
      gutter: window.innerWidth - html.clientWidth,
      scrollHeight: html.scrollHeight,
      clientHeight: html.clientHeight,
    };
  });
  return metrics;
}
