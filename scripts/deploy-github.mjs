import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'client', 'dist');
const pagesDir = join(root, '.gh-pages');
const remote = process.argv[2] || process.env.GITHUB_REMOTE || '';

console.log('Building client…');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

if (!existsSync(dist)) {
  console.error('Build failed: client/dist was not created.');
  process.exit(1);
}

rmSync(pagesDir, { recursive: true, force: true });
mkdirSync(pagesDir, { recursive: true });

for (const entry of ['assets', 'index.html', 'images']) {
  const source = join(dist, entry);
  if (existsSync(source)) {
    cpSync(source, join(pagesDir, entry), { recursive: true });
  }
}

writeFileSync(join(pagesDir, '.nojekyll'), '');

execSync('git init', { cwd: pagesDir, stdio: 'inherit' });
execSync('git checkout -b gh-pages', { cwd: pagesDir, stdio: 'inherit' });
execSync('git add -A', { cwd: pagesDir, stdio: 'inherit' });

try {
  execSync('git commit -m "Deploy production build"', { cwd: pagesDir, stdio: 'inherit' });
} catch {
  console.log('Nothing new to deploy.');
  process.exit(0);
}

if (!remote) {
  console.log('\nBuild ready in .gh-pages/ (production files only).');
  console.log('Push to GitHub:');
  console.log('  cd .gh-pages');
  console.log('  git remote add origin https://github.com/<user>/<repo>.git');
  console.log('  git push -u origin gh-pages --force');
  console.log('\nOr rerun with remote URL:');
  console.log('  npm run deploy:github -- https://github.com/<user>/<repo>.git');
  process.exit(0);
}

execSync(`git remote add origin ${remote}`, { cwd: pagesDir, stdio: 'inherit' });
execSync('git push -u origin gh-pages --force', { cwd: pagesDir, stdio: 'inherit' });
console.log('Deployed build to gh-pages branch.');
