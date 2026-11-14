import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const problems = [];
if (!html.includes('GreekVisualizer')) problems.push('dist/index.html is missing the GreekVisualizer title.');
if (!html.includes('/GreekVisualizer/')) {
  problems.push('dist/index.html does not reference the /GreekVisualizer/ base path.');
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Production index.html uses the /GreekVisualizer/ base path.');
