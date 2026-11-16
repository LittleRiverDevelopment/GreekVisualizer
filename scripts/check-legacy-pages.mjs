import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../_config.yml', import.meta.url), 'utf8');
const body = text
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'))
  .join('\n');

if (body !== '[') {
  console.error(
    '_config.yml must stay invalid YAML. A valid config lets the legacy GitHub Pages Jekyll build publish the repository root and replace the Vite dist with index.html that loads /src/main.tsx.',
  );
  process.exit(1);
}

console.log('Legacy Jekyll publisher is blocked by invalid _config.yml.');
