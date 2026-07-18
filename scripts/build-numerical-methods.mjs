import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(repoRoot, 'src', 'numerical-methods');
const outputRoot = join(repoRoot, 'numerical-methods');
const manifest = JSON.parse(readFileSync(join(sourceRoot, 'data', 'chapters.json'), 'utf8'));

function read(relativePath) {
  return readFileSync(join(sourceRoot, relativePath), 'utf8').trim();
}

function write(target, content) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${content.trim()}\n`, 'utf8');
}

function assertSafeOutput(target) {
  const resolvedRoot = resolve(repoRoot) + sep;
  const resolvedTarget = resolve(target);
  if (!resolvedTarget.startsWith(resolvedRoot) || resolvedTarget === resolve(repoRoot)) {
    throw new Error(`Refusing to regenerate unsafe output path: ${resolvedTarget}`);
  }
}

assertSafeOutput(outputRoot);
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(join(outputRoot, 'assets'), { recursive: true });
cpSync(join(sourceRoot, 'css'), join(outputRoot, 'assets', 'css'), { recursive: true });
cpSync(join(sourceRoot, 'js'), join(outputRoot, 'assets', 'js'), { recursive: true });
cpSync(join(sourceRoot, 'data', 'chapters.json'), join(outputRoot, 'assets', 'chapters.json'));
cpSync(join(sourceRoot, 'data', 'references.json'), join(outputRoot, 'assets', 'references.json'));
cpSync(join(sourceRoot, 'data', 'method-advisor.js'), join(outputRoot, 'assets', 'js', 'method-advisor.js'));

const routeData = Object.fromEntries(manifest.chapters.map((chapter) => [
  chapter.number,
  {
    title: chapter.title,
    part: chapter.part,
    href: `/numerical-methods/part-${chapter.part}/#topic-${chapter.number}`
  }
]));
write(
  join(outputRoot, 'assets', 'js', 'chapter-routes.js'),
  `window.__numericalMethodsChapters = Object.freeze(${JSON.stringify(routeData, null, 2)});`
);

const headTemplate = read('layouts/head.html');
const intro = read('layouts/intro.html');
const readerOpenTemplate = read('layouts/reader-open.html');
const readerClose = read('layouts/reader-close.html');
const applicationMap = read('content/application-map.html');
const references = read('content/references.html');
const footer = read('layouts/footer.html');
const mathCache = read('content/math-cache.html');

const chapterByNumber = new Map(manifest.chapters.map((chapter) => [chapter.number, chapter]));
const partByNumber = new Map(manifest.parts.map((part) => [part.number, part]));

function partMarkup(partNumber) {
  const part = partByNumber.get(partNumber);
  const partIntro = read(`parts/${String(part.number).padStart(2, '0')}-${part.id}.html`);
  const chapters = manifest.chapters
    .filter((chapter) => chapter.part === partNumber)
    .map((chapter) => read(`chapters/${chapter.file}`))
    .join('\n');
  return `${partIntro}\n${chapters}`;
}

function filterPartNavigation(markup, category) {
  return markup.replace(
    /(<nav\b[^>]*\bid="topic-nav"[^>]*>)([\s\S]*?)(<\/nav>)/,
    (_, open, links, close) => {
      const selected = [...links.matchAll(/<a\b[^>]*data-nav-category="([^"]+)"[^>]*>[\s\S]*?<\/a>/g)]
        .filter((match) => match[1] === category)
        .map((match) => match[0])
        .join('');
      return `${open}${selected}${close}`;
    }
  ).replace(
    /<button([^>]*\bdata-filter="([^"]+)"[^>]*)>/g,
    (button, attributes, filter) => {
      if (filter === 'all' || filter === category) return button;
      return `<button${attributes} hidden>`;
    }
  );
}

function rewriteChapterLinks(markup, pageMode, currentPart = null) {
  return markup.replace(/href="#topic-(\d+)"/g, (_, rawNumber) => {
    const number = Number(rawNumber);
    const chapter = chapterByNumber.get(number);
    if (!chapter || pageMode === 'full' || (pageMode === 'part' && chapter.part === currentPart)) {
      return `href="#topic-${number}"`;
    }
    if (pageMode === 'landing') return `href="./part-${chapter.part}/#topic-${number}"`;
    return `href="../part-${chapter.part}/#topic-${number}"`;
  });
}

function addReadingModeLink(markup, pageMode) {
  const href = pageMode === 'landing' ? './all/' : pageMode === 'part' ? '../all/' : '../';
  const label = pageMode === 'full' ? '分编阅读' : '完整单页';
  return markup.replace(
    '<a class="header-link" href="#references">参考文献</a>',
    `<a class="header-link" href="#references">参考文献</a>\n<a class="header-link" href="${href}">${label}</a>`
  );
}

function buildPage({ mode, partNumber = null }) {
  const isPartPage = mode === 'part';
  const part = isPartPage ? partByNumber.get(partNumber) : null;
  const assetPrefix = mode === 'landing' ? './assets/' : '../assets/';
  let head = headTemplate.replaceAll('{{ASSET_PREFIX}}', assetPrefix);
  if (part) {
    head = head.replace(
      /<title>[\s\S]*?<\/title>/,
      `<title>第${part.number}编 · ${part.title}｜数值方法与数学物理计算工具书</title>`
    );
  }
  if (mode === 'landing') {
    head = head
      .replace(/^<script defer src="\.\/assets\/js\/scientific-audit\.js"><\/script>\n?/m, '')
      .replace(/^<script defer src="\.\/assets\/js\/range-and-table\.js"><\/script>\n?/m, '')
      .replace(/^<script defer src="\.\/assets\/js\/responsive-tables\.js"><\/script>\n?/m, '');
  }

  let readerOpen = readerOpenTemplate;
  if (part) readerOpen = filterPartNavigation(readerOpen, part.id);

  const content = part
    ? partMarkup(part.number)
    : manifest.parts.map((item) => partMarkup(item.number)).join('\n');

  const htmlAttributes = part
    ? `lang="zh-CN" data-part-page="${part.number}" data-part-category="${part.id}"`
    : mode === 'full'
      ? 'lang="zh-CN" data-reference-page="full"'
      : 'lang="zh-CN" data-reference-page="landing"';

  const pageIntro = addReadingModeLink(intro, mode);

  if (mode === 'landing') {
    let landing = `<!DOCTYPE html>
<html ${htmlAttributes}>
<head>
${head}
</head>
<body>
${pageIntro}
${applicationMap}
${references}
</main>
${footer}
${mathCache}
</body>
</html>`;
    landing = rewriteChapterLinks(landing, mode);
    return landing;
  }

  let page = `<!DOCTYPE html>
<html ${htmlAttributes}>
<head>
${head}
</head>
<body>
${pageIntro}
${readerOpen}
${content}
${readerClose}
${applicationMap}
${references}
</main>
${footer}
${mathCache}
</body>
</html>`;

  page = rewriteChapterLinks(page, mode, partNumber);
  return page;
}

write(join(outputRoot, 'index.html'), buildPage({ mode: 'landing' }));
write(join(outputRoot, 'all', 'index.html'), buildPage({ mode: 'full' }));
for (const part of manifest.parts) {
  write(join(outputRoot, `part-${part.number}`, 'index.html'), buildPage({ mode: 'part', partNumber: part.number }));
}

const compatibilityPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=./numerical-methods/">
<link rel="canonical" href="./numerical-methods/">
<title>正在打开数值方法与数学物理计算工具书</title>
</head>
<body>
<p><a href="./numerical-methods/">打开数值方法与数学物理计算工具书</a></p>
<script>
  const topic = /^#topic-(\d+)$/.exec(window.location.hash);
  const chapter = topic ? Number(topic[1]) : 0;
  const part = chapter <= 5 ? 1 : chapter <= 10 ? 2 : chapter <= 17 ? 3 : chapter <= 24 ? 4 : 0;
  const destination = part ? \`./numerical-methods/part-\${part}/\` : './numerical-methods/';
  const target = new URL(destination, window.location.href);
  target.search = window.location.search;
  target.hash = window.location.hash;
  window.location.replace(target);
</script>
</body>
</html>`;
write(join(repoRoot, 'numerical_methods.html'), compatibilityPage);

console.log(`Built landing, full reference and ${manifest.parts.length} part pages in numerical-methods/.`);
