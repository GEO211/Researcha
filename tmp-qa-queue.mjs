export default async function run(page, ui) {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"], input[type="password"]', { timeout: 15000 });
  await page.fill('input[type="email"]', 'admin@carelink.local');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/queue|dashboard|admin/i, { timeout: 20000 }).catch(() => {});
  await page.goto('http://localhost:5173/queue', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Priority', { timeout: 15000 });

  const trigger = page.getByRole('button', { name: 'All priorities' });
  await trigger.click();
  await page.waitForTimeout(400);

  const optionLabels = await page.locator('[role="option"]').allTextContents();
  const searchVisible = await page.getByPlaceholder('Search priority…').isVisible();
  const menuBox = await page.locator('[role="listbox"]').boundingBox();

  return {
    optionLabels,
    searchVisible,
    menuBox,
    url: page.url(),
  };
}
