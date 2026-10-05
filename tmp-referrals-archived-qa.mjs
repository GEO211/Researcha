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

  const showArchived = page.getByRole('button', { name: /show all archived/i });
  await showArchived.waitFor({ timeout: 10000 });

  const liveStatuses = await page.locator('table tbody tr td:nth-child(3)').allInnerTexts();
  const liveHasArchived = liveStatuses.some((text) => /archived/i.test(text));

  await showArchived.click();
  await page.getByRole('heading', { name: /all archived referrals/i }).waitFor({ timeout: 10000 });
  const archivedStatuses = await page.locator('table tbody tr td:nth-child(3)').allInnerTexts();
  const archivedOnly = archivedStatuses.length === 0 || archivedStatuses.every((text) => /archived/i.test(text));

  await page.getByRole('button', { name: /show all referrals/i }).click();
  await page.getByRole('heading', { name: /^all referrals$/i }).waitFor({ timeout: 10000 });
  const backStatuses = await page.locator('table tbody tr td:nth-child(3)').allInnerTexts();
  const backHasArchived = backStatuses.some((text) => /archived/i.test(text));

  return {
    hasShowArchivedButton: true,
    liveHasArchived,
    archivedOnly,
    archivedRowCount: archivedStatuses.length,
    backHasArchived,
    ok: !liveHasArchived && archivedOnly && !backHasArchived && archivedStatuses.length > 0,
  };
}
