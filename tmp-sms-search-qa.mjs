export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.locator('input[type="email"]').waitFor({ timeout: 15000 });
  await page.locator('input[type="email"]').fill('city@carelink.local');
  await page.locator('input[type="password"]').fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.getByRole('button', { name: /^referrals$/i }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: /^referrals$/i }).click();
  await page.getByRole('button', { name: /send sms/i }).click();
  await page.getByRole('heading', { name: /manual sms/i }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /select referral/i }).click();
  const search = page.getByPlaceholder(/search tracking code or patient name/i);
  await search.waitFor({ timeout: 5000 });
  await search.fill('Ayco');
  await page.waitForTimeout(300);
  const afterName = await page.locator('body').innerText();
  await search.fill('CL-20261004-P0517');
  await page.waitForTimeout(300);
  const afterCode = await page.locator('body').innerText();
  return {
    hasSearch: true,
    nameMatch: /Ayco/i.test(afterName),
    codeMatch: /CL-20261004-P0517/i.test(afterCode),
  };
}
