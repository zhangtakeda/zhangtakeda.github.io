import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(repoRoot, 'numerical_methods.html');
const sourceRoot = join(repoRoot, 'src', 'numerical-methods');
const source = readFileSync(sourcePath, 'utf8');

const expectedTopics = 24;
const topicCount = (source.match(/<article class="topic"/g) || []).length;
if (topicCount !== expectedTopics) {
  throw new Error(`Expected ${expectedTopics} topics, found ${topicCount}.`);
}

function write(relativePath, content) {
  const target = join(sourceRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${content.trim()}\n`, 'utf8');
}

function extractBalanced(html, start, tagName) {
  const token = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  token.lastIndex = start;
  let depth = 0;
  let match;

  while ((match = token.exec(html))) {
    const closing = match[0].startsWith('</');
    const selfClosing = match[0].endsWith('/>');
    if (closing) depth -= 1;
    else if (!selfClosing) depth += 1;
    if (depth === 0) return html.slice(start, token.lastIndex);
  }

  throw new Error(`Unbalanced <${tagName}> starting at byte ${start}.`);
}

function decodeEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');
}

function requireReplace(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`Unable to patch ${label}.`);
  return text.replace(search, replacement);
}

const styles = [...source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map((match) => ({
  id: match[1].match(/\bid="([^"]+)"/)?.[1] || '',
  content: match[2].trim()
}));

const styleGroups = {
  'css/01-base.css': [],
  'css/02-editorial.css': [],
  'css/03-mathjax.css': [],
  'css/04-readability.css': []
};

for (const style of styles) {
  if (style.id === 'embedded-styles') styleGroups['css/01-base.css'].push(style.content);
  else if (style.id === 'research-grade-polish') styleGroups['css/02-editorial.css'].push(style.content);
  else if (style.id.startsWith('visual-readability-and-scale-pass')) styleGroups['css/04-readability.css'].push(style.content);
  else styleGroups['css/03-mathjax.css'].push(style.content);
}

for (const [path, blocks] of Object.entries(styleGroups)) {
  write(path, blocks.join('\n\n'));
}

write('css/05-performance.css', `
/* Rendering containment keeps the long reference responsive without removing content from the DOM. */
@supports (content-visibility: auto) {
  .topic {
    content-visibility: auto;
    contain-intrinsic-size: auto 2300px;
  }

  .reference-list > li {
    content-visibility: auto;
    contain-intrinsic-size: auto 72px;
  }
}

html[data-part-page] .category-control [hidden] {
  display: none;
}
`);

const scripts = new Map(
  [...source.matchAll(/<script\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => [match[1], match[2].trim()])
);

let core = scripts.get('embedded-app');
if (!core) throw new Error('Missing embedded-app script.');

const advisorStart = core.indexOf('  const methodAdvisorData = {');
const advisorFunction = core.indexOf('\n\n  function initMethodAdvisor()', advisorStart);
if (advisorStart < 0 || advisorFunction < 0) throw new Error('Unable to extract method advisor data.');

const advisorBlock = core.slice(advisorStart, advisorFunction).trimEnd();
const advisorExpression = advisorBlock
  .replace(/^  const methodAdvisorData = /, '')
  .replace(/;$/, '');
write('data/method-advisor.js', `window.__methodAdvisorData = ${advisorExpression};`);

core = `${core.slice(0, advisorStart)}  const methodAdvisorData = window.__methodAdvisorData || {};${core.slice(advisorFunction)}`;
core = requireReplace(
  core,
  "  function initMultirate() {\n    const regimes = {",
  "  function initMultirate() {\n    if (!document.getElementById('slow-ticks')) return;\n    const regimes = {",
  'multirate page guard'
);
core = requireReplace(
  core,
  `    const chapterLinkHTML = (number) => {
      const topic = document.getElementById(\`topic-\${number}\`);
      const title = topic?.querySelector('.topic-title h2')?.textContent?.trim() || \`第 \${number} 章\`;
      const shortTitle = title.length > 18 ? \`\${title.slice(0, 18)}…\` : title;
      return \`<a href="#topic-\${number}"><span>\${String(number).padStart(2, '0')}</span>\${shortTitle}</a>\`;
    };`,
  `    const chapterLinkHTML = (number) => {
      const topic = document.getElementById(\`topic-\${number}\`);
      const route = window.__numericalMethodsChapters?.[number];
      const title = topic?.querySelector('.topic-title h2')?.textContent?.trim() || route?.title || \`第 \${number} 章\`;
      const shortTitle = title.length > 18 ? \`\${title.slice(0, 18)}…\` : title;
      const href = topic ? \`#topic-\${number}\` : route?.href || \`#topic-\${number}\`;
      return \`<a href="\${href}"><span>\${String(number).padStart(2, '0')}</span>\${shortTitle}</a>\`;
    };`,
  'advisor chapter routes'
);
core = requireReplace(
  core,
  `    deferred.forEach(([id, init]) => {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
      else start(id, init);
    });`,
  `    deferred.forEach(([id, init]) => {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
    });`,
  'core canvas page guard'
);

let audit = scripts.get('scientific-audit-v2');
if (!audit) throw new Error('Missing scientific-audit-v2 script.');
audit = requireReplace(
  audit,
  `    specs.forEach(([id, init]) => {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
      else start(id, init);
    });`,
  `    specs.forEach(([id, init]) => {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
    });`,
  'audited canvas page guard'
);

const scriptFiles = {
  'js/core.js': core,
  'js/interactions.js': scripts.get('research-grade-interactions'),
  'js/scientific-audit.js': audit,
  'js/range-and-table.js': scripts.get('range-and-table-scale-runtime'),
  'js/responsive-tables.js': scripts.get('responsive-table-semantics-runtime')
};

for (const [path, content] of Object.entries(scriptFiles)) {
  if (!content) throw new Error(`Missing script content for ${path}.`);
  write(path, content);
}

const headStart = source.indexOf('<head>') + '<head>'.length;
const headEnd = source.indexOf('</head>');
let head = source.slice(headStart, headEnd)
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

head += `
<link rel="stylesheet" href="{{ASSET_PREFIX}}css/01-base.css">
<link rel="stylesheet" href="{{ASSET_PREFIX}}css/02-editorial.css">
<link rel="stylesheet" href="{{ASSET_PREFIX}}css/03-mathjax.css">
<link rel="stylesheet" href="{{ASSET_PREFIX}}css/04-readability.css">
<link rel="stylesheet" href="{{ASSET_PREFIX}}css/05-performance.css">
<script defer src="{{ASSET_PREFIX}}js/chapter-routes.js"></script>
<script defer src="{{ASSET_PREFIX}}js/method-advisor.js"></script>
<script defer src="{{ASSET_PREFIX}}js/core.js"></script>
<script defer src="{{ASSET_PREFIX}}js/interactions.js"></script>
<script defer src="{{ASSET_PREFIX}}js/scientific-audit.js"></script>
<script defer src="{{ASSET_PREFIX}}js/range-and-table.js"></script>
<script defer src="{{ASSET_PREFIX}}js/responsive-tables.js"></script>`;
write('layouts/head.html', head);

const bodyStart = source.indexOf('<body>') + '<body>'.length;
const bodyEnd = source.lastIndexOf('</body>');
const learningStart = source.indexOf('<div class="learning-shell reference-shell">', bodyStart);
const firstPartStart = source.indexOf('<section class="part-intro"', learningStart);
const applicationStart = source.indexOf('<section aria-labelledby="application-title" class="application-map"', firstPartStart);
const referencesStart = source.indexOf('<section aria-labelledby="references-title" class="references"', applicationStart);
const footerStart = source.indexOf('<footer class="site-footer">', referencesStart);
const cacheStart = source.indexOf('<svg id="MJX-SVG-global-cache"', footerStart);

if ([learningStart, firstPartStart, applicationStart, referencesStart, footerStart, cacheStart].some((index) => index < 0)) {
  throw new Error('Unable to locate one or more document regions.');
}

write('layouts/intro.html', source.slice(bodyStart, learningStart));
write('layouts/reader-open.html', source.slice(learningStart, firstPartStart));
write('layouts/reader-close.html', '</div>\n</div>');
write('content/application-map.html', extractBalanced(source, applicationStart, 'section'));
const referencesHtml = extractBalanced(source, referencesStart, 'section');
write('content/references.html', referencesHtml);
write('layouts/footer.html', extractBalanced(source, footerStart, 'footer'));

const cacheHtml = source.slice(cacheStart, bodyEnd)
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  .trim();
write('content/math-cache.html', cacheHtml);

const partDefinitions = [
  { number: 1, id: 'representation', title: '数值表示与基础算子', start: 1, end: 5 },
  { number: 2, id: 'algebra', title: '代数系统与优化', start: 6, end: 10 },
  { number: 3, id: 'field', title: '微分方程、几何与耦合', start: 11, end: 17 },
  { number: 4, id: 'trust', title: '误差、推断、降阶与实现', start: 18, end: 24 }
];

const slugs = [
  'floating-point', 'interpolation-fitting', 'differentiation-quadrature', 'fft-wavelets', 'special-functions',
  'matrix-factorization', 'krylov-preconditioning', 'nonlinear-solvers', 'optimization', 'eigenvalues-bifurcation',
  'ode-dae', 'pde-discretization', 'meshes-free-boundaries', 'integral-equations', 'conservation-geometry',
  'kinetic-methods', 'multiphysics-coupling', 'error-estimation-verification', 'adjoints-autodiff', 'inverse-uq-stochastic',
  'model-reduction', 'tensor-methods', 'scientific-machine-learning', 'parallel-performance'
];

const chapters = [];
for (const part of partDefinitions) {
  const partMarker = `<section class="part-intro" data-category-heading="${part.id}"`;
  const partStart = source.indexOf(partMarker, firstPartStart);
  if (partStart < 0) throw new Error(`Missing part introduction for ${part.id}.`);
  write(`parts/${String(part.number).padStart(2, '0')}-${part.id}.html`, extractBalanced(source, partStart, 'section'));

  for (let number = part.start; number <= part.end; number += 1) {
    const topicPattern = new RegExp(`<article class="topic"[^>]*data-topic="${number}"[^>]*id="topic-${number}"[^>]*>`);
    const relativeMatch = source.slice(firstPartStart, applicationStart).match(topicPattern);
    if (!relativeMatch) throw new Error(`Missing topic ${number}.`);
    const topicStart = firstPartStart + relativeMatch.index;
    const topicHtml = extractBalanced(source, topicStart, 'article');
    const title = decodeEntities(topicHtml.match(/<div class="topic-title"><h2>(.*?)<\/h2>/s)?.[1] || `第 ${number} 章`);
    const keywords = decodeEntities(topicHtml.match(/\bdata-keywords="([^"]*)"/)?.[1] || '');
    const filename = `${String(number).padStart(2, '0')}-${slugs[number - 1]}.html`;
    write(`chapters/${filename}`, topicHtml);
    chapters.push({ number, slug: slugs[number - 1], title, keywords, part: part.number, category: part.id, file: filename });
  }
}

write('data/chapters.json', JSON.stringify({ parts: partDefinitions, chapters }, null, 2));

const references = [...referencesHtml.matchAll(/<li id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((match) => {
  const body = match[2];
  return {
    id: match[1],
    number: body.match(/<span>(.*?)<\/span>/s)?.[1] || '',
    href: decodeEntities(body.match(/<a href="([^"]+)"/)?.[1] || ''),
    author: decodeEntities(body.match(/<strong>(.*?)<\/strong>/s)?.[1] || ''),
    title: decodeEntities(body.match(/<em>(.*?)<\/em>/s)?.[1] || '')
  };
});
write('data/references.json', JSON.stringify(references, null, 2));

write('source-info.json', JSON.stringify({
  source: 'numerical_methods.html',
  sha256: createHash('sha256').update(source).digest('hex'),
  topics: chapters.length,
  references: references.length,
  stylesheets: Object.keys(styleGroups).length + 1,
  scripts: Object.keys(scriptFiles).length + 2
}, null, 2));

console.log(`Imported ${chapters.length} chapters and ${references.length} references into src/numerical-methods.`);
