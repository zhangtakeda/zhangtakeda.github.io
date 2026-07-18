import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(repoRoot, 'src', 'numerical-methods');
const outputRoot = join(repoRoot, 'numerical-methods');
const manifest = JSON.parse(readFileSync(join(sourceRoot, 'data', 'chapters.json'), 'utf8'));
const references = JSON.parse(readFileSync(join(sourceRoot, 'data', 'references.json'), 'utf8'));
const errors = [];

function read(path) {
  if (!existsSync(path)) {
    errors.push(`Missing file: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

function count(markup, pattern) {
  return (markup.match(pattern) || []).length;
}

function validatePage(path, expectedTopics) {
  const html = read(path);
  if (!html) return;

  const topicCount = count(html, /<article class="topic"/g);
  if (topicCount !== expectedTopics) errors.push(`${path}: expected ${expectedTopics} topics, found ${topicCount}`);

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    errors.push(`${path}: duplicate ids: ${duplicates.join(', ')}`);
  }

  for (const match of html.matchAll(/\bhref="#([^"]+)"/g)) {
    if (!uniqueIds.has(match[1])) errors.push(`${path}: missing local anchor #${match[1]}`);
  }

  for (const match of html.matchAll(/href="(?:\.\.\/|\.\/)part-(\d+)\/#topic-(\d+)"/g)) {
    const targetPath = join(outputRoot, `part-${match[1]}`, 'index.html');
    const target = read(targetPath);
    if (target && !target.includes(`id="topic-${match[2]}"`)) {
      errors.push(`${path}: cross-page target missing topic-${match[2]}`);
    }
  }
}

const landingPath = join(outputRoot, 'index.html');
validatePage(landingPath, 0);

const fullPath = join(outputRoot, 'all', 'index.html');
validatePage(fullPath, manifest.chapters.length);

for (const part of manifest.parts) {
  const expected = manifest.chapters.filter((chapter) => chapter.part === part.number).length;
  validatePage(join(outputRoot, `part-${part.number}`, 'index.html'), expected);
}

const full = read(fullPath);
const fullReferences = count(full, /<li id="ref-/g);
if (fullReferences !== references.length) {
  errors.push(`Full page: expected ${references.length} references, found ${fullReferences}`);
}

for (const chapter of manifest.chapters) {
  if (!full.includes(`id="topic-${chapter.number}"`)) errors.push(`Full page missing topic-${chapter.number}`);
}

const assetFiles = [
  'css/01-base.css', 'css/02-editorial.css', 'css/03-mathjax.css', 'css/04-readability.css', 'css/05-performance.css',
  'js/chapter-routes.js', 'js/method-advisor.js', 'js/core.js', 'js/interactions.js', 'js/scientific-audit.js',
  'js/range-and-table.js', 'js/responsive-tables.js'
];
for (const file of assetFiles) {
  const path = join(outputRoot, 'assets', file);
  if (!existsSync(path) || statSync(path).size === 0) errors.push(`Missing or empty asset: ${path}`);
}

const scriptCorpus = assetFiles
  .filter((file) => file.endsWith('.js'))
  .map((file) => read(join(outputRoot, 'assets', file)))
  .join('\n');
for (const canvasId of [...full.matchAll(/<canvas\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1])) {
  if (!scriptCorpus.includes(canvasId)) errors.push(`No script registration found for canvas #${canvasId}`);
}

if (!read(join(repoRoot, 'numerical_methods.html')).includes('./numerical-methods/')) {
  errors.push('Legacy numerical_methods.html does not point to the modular site.');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const landingKiB = Math.round(statSync(landingPath).size / 1024);
  const fullKiB = Math.round(statSync(fullPath).size / 1024);
  const partKiB = manifest.parts.map((part) => Math.round(statSync(join(outputRoot, `part-${part.number}`, 'index.html')).size / 1024));
  console.log(`Validated ${manifest.chapters.length} chapters, ${references.length} references and all internal anchors.`);
  console.log(`HTML size: landing ${landingKiB} KiB; full ${fullKiB} KiB; parts ${partKiB.join(', ')} KiB.`);
}
