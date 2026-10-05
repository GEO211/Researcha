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
  await page.getByRole('heading', { name: /all referrals/i }).waitFor({ timeout: 20000 });
  const body = await page.locator('body').innerText();
  return {
    hasPwd: /\bPWD\b/.test(body),
    hasSenior: /\bSenior\b/.test(body),
    hasChild: /\bChild\b/.test(body) || /\bInfant\b/.test(body),
  };
}
