(() => {
  'use strict';

  const root = document.documentElement;
  const canvasDrawers = new Map();
  const canvasQueue = new Set();
  let canvasFrame = 0;
  let paletteCache = null;
  const color = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const storageGet = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };
  const storageSet = (key, value) => { try { window.localStorage.setItem(key, value); } catch { /* opaque/file origins may deny storage */ } };

  const palette = () => paletteCache || (paletteCache = {
    ink: color('--ink'),
    muted: color('--muted'),
    paper: color('--paper'),
    surface: color('--surface'),
    surface2: color('--surface-2'),
    line: color('--line'),
    lineStrong: color('--line-strong'),
    cyan: color('--cyan'),
    coral: color('--coral'),
    amber: color('--amber'),
    green: color('--green'),
    violet: color('--violet')
  });

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
      return;
    }
    const fallback = {
      moon: '◐', sun: '☀', menu: '☰', x: '×', 'arrow-down-right': '↘',
      'chevron-down': '⌄', 'arrow-right': '→', 'arrow-left': '←', 'arrow-down': '↓',
      check: '✓', 'external-link': '↗', link: '—', 'more-horizontal': '⋯',
      activity: '∿', 'arrow-up': '↑', circle: '○', 'circle-check': '✓'
    };
    document.querySelectorAll('i[data-lucide]').forEach((icon) => {
      if (!icon.textContent.trim()) icon.textContent = fallback[icon.dataset.lucide] || '·';
    });
  }

  function invalidatePalette() {
    paletteCache = null;
  }

  function flushCanvasQueue() {
    canvasFrame = 0;
    const jobs = Array.from(canvasQueue);
    canvasQueue.clear();
    jobs.forEach((render) => {
      const canvas = render.canvas;
      if (!canvas?.isConnected || canvas.closest('[hidden]')) return;
      try { render(); } catch (error) { console.error(`Canvas render failed: ${canvas.id || 'unnamed'}`, error); }
    });
  }

  function scheduleCanvasRender(render, force = false) {
    const canvas = render?.canvas;
    if (!canvas?.isConnected) return;
    if (canvas.closest('[hidden]')) {
      canvas.__vizDirty = true;
      return;
    }
    if (!force && canvas.__vizNear === false) {
      canvas.__vizDirty = true;
      return;
    }
    canvas.__vizDirty = false;
    canvasQueue.add(render);
    if (!canvasFrame) canvasFrame = requestAnimationFrame(flushCanvasQueue);
  }

  function releaseCanvas(canvas) {
    const release = () => {
      if (canvas.__vizNear || !canvas.isConnected) return;
      if (canvas.width > 1 || canvas.height > 1) {
        canvas.width = 1;
        canvas.height = 1;
        canvas.__vizDirty = true;
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(release, { timeout: 1200 });
    else window.setTimeout(release, 480);
  }

  const canvasIntersection = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const canvas = entry.target;
          canvas.__vizNear = entry.isIntersecting;
          if (entry.isIntersecting && canvas.__vizRender) scheduleCanvasRender(canvas.__vizRender, true);
          else if (!entry.isIntersecting) releaseCanvas(canvas);
        });
      }, { rootMargin: '1100px 0px', threshold: 0 })
    : null;

  const canvasResize = 'ResizeObserver' in window
    ? new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const render = entry.target.__vizRender;
          if (render) scheduleCanvasRender(render);
        });
      })
    : null;

  function attachCanvas(canvas, render) {
    if (!canvas || !render) return () => {};
    if (canvas.__vizRender && canvas.__vizRender !== render) canvasDrawers.delete(canvas);
    render.canvas = canvas;
    canvas.__vizRender = render;
    const rect = canvas.getBoundingClientRect();
    canvas.__vizNear = rect.bottom >= -1100 && rect.top <= window.innerHeight + 1100;
    canvasDrawers.set(canvas, render);
    canvasIntersection?.observe(canvas);
    canvasResize?.observe(canvas);
    scheduleCanvasRender(render, canvas.__vizNear);
    return () => scheduleCanvasRender(render, true);
  }

  function scheduleVisibleCanvases() {
    canvasDrawers.forEach((render, canvas) => {
      if (canvas.__vizNear !== false) scheduleCanvasRender(render, true);
      else canvas.__vizDirty = true;
    });
  }

  function registerCanvas(id, draw) {
    const canvas = document.getElementById(id);
    if (!canvas) return () => {};

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(rect.width * dpr);
      const pixelHeight = Math.round(rect.height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      draw(ctx, rect.width, rect.height, palette());
    };

    return attachCanvas(canvas, render);
  }

  window.__canvasRuntime = {
    attach(canvas, draw) {
      const render = () => draw();
      return attachCanvas(canvas, render);
    },
    invalidatePalette,
    scheduleVisible: scheduleVisibleCanvases
  };

  function drawGrid(ctx, width, height, p, margins = { left: 46, right: 22, top: 22, bottom: 38 }) {
    const x0 = margins.left;
    const x1 = width - margins.right;
    const y0 = margins.top;
    const y1 = height - margins.bottom;
    ctx.save();
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    for (let i = 0; i <= 5; i += 1) {
      const x = x0 + (x1 - x0) * i / 5;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i += 1) {
      const y = y0 + (y1 - y0) * i / 4;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = p.lineStrong;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.stroke();
    ctx.restore();
    return { x0, x1, y0, y1 };
  }

  function label(ctx, text, x, y, p, align = 'left', size = 11.5) {
    const canvasWidth = ctx.canvas?.getBoundingClientRect().width || 480;
    const sizeFloor = canvasWidth < 360 ? 11.5 : canvasWidth < 520 ? 12 : 12.6;
    const legibleSize = Math.max(sizeFloor, Math.min(18, (Number(size) || 11.5) * 1.08));
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = 0.84;
    ctx.font = `600 ${legibleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function initTheme() {
    const stored = storageGet('numerical-guide-theme');
    const preferredDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = stored || (preferredDark ? 'dark' : 'light');
    root.dataset.theme = initial;
    const button = document.getElementById('theme-toggle');

    const updateButton = () => {
      const isDark = root.dataset.theme === 'dark';
      button.setAttribute('aria-label', isDark ? '切换浅色模式' : '切换深色模式');
      button.setAttribute('title', isDark ? '切换浅色模式' : '切换深色模式');
      button.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}">${isDark ? '☀' : '◐'}</i>`;
      refreshIcons();
    };

    updateButton();
    button.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      storageSet('numerical-guide-theme', root.dataset.theme);
      updateButton();
      invalidatePalette();
      scheduleVisibleCanvases();
    });
  }

  function initHeaderAndProgress() {
    const header = document.getElementById('site-header');
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
      root.style.setProperty('--reading-progress', `${progress * 100}%`);
      header.classList.toggle('scrolled', window.scrollY > 28);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
  }

  function initDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const backdrop = document.getElementById('drawer-backdrop');
    const openButton = document.getElementById('menu-toggle');
    const closeButton = document.getElementById('menu-close');
    const drawerNav = drawer.querySelector('.drawer-nav');
    const sourceLinks = document.querySelectorAll('#topic-nav a');

    drawerNav.innerHTML = `
      <a href="#reference-map"><span>I</span>全书索引</a>
      <a href="#method-selector"><span>N</span>问题导航</a>
      ${Array.from(sourceLinks).map((link) => `<a href="${link.getAttribute('href')}">${link.innerHTML}</a>`).join('')}
      <a href="#application-map"><span>A</span>应用映射</a>
      <a href="#references"><span>R</span>参考文献</a>
    `;

    const close = () => {
      drawer.classList.remove('open');
      drawer.inert = true;
      openButton.setAttribute('aria-expanded', 'false');
      backdrop.hidden = true;
      document.body.classList.remove('drawer-open');
    };

    const open = () => {
      drawer.classList.add('open');
      drawer.inert = false;
      openButton.setAttribute('aria-expanded', 'true');
      backdrop.hidden = false;
      document.body.classList.add('drawer-open');
      closeButton.focus();
    };

    openButton.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    drawerNav.addEventListener('click', (event) => {
      if (event.target.closest('a')) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drawer.classList.contains('open')) close();
    });
  }

  function initFilters() {
    const buttons = Array.from(document.querySelectorAll('.content-toolbar [data-filter]'));
    const topics = Array.from(document.querySelectorAll('.topic[data-category]'));
    const headings = Array.from(document.querySelectorAll('[data-category-heading]'));
    const navLinks = Array.from(document.querySelectorAll('#topic-nav a'));
    const search = document.getElementById('chapter-search');
    const clear = document.getElementById('search-clear');
    const count = document.getElementById('search-result-count');
    let activeFilter = 'all';
    let searchTimer = 0;

    const normalize = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const searchIndex = new Map(topics.map((topic) => [
      topic,
      normalize(`${topic.dataset.keywords || ''} ${topic.textContent || ''}`)
    ]));

    const apply = () => {
      const query = normalize(search?.value);
      const tokens = query ? query.split(' ') : [];
      let visibleCount = 0;
      topics.forEach((topic) => {
        const categoryOK = activeFilter === 'all' || topic.dataset.category === activeFilter;
        const haystack = searchIndex.get(topic) || '';
        const queryOK = !tokens.length || tokens.every((token) => haystack.includes(token));
        const show = categoryOK && queryOK;
        topic.hidden = !show;
        if (show) visibleCount += 1;
      });
      headings.forEach((heading) => {
        const category = heading.dataset.categoryHeading;
        heading.hidden = !topics.some((topic) => !topic.hidden && topic.dataset.category === category);
      });
      navLinks.forEach((link) => {
        const id = link.getAttribute('href')?.slice(1);
        const topic = id ? document.getElementById(id) : null;
        link.hidden = Boolean(topic?.hidden);
      });
      if (count) count.textContent = `${visibleCount} / ${topics.length} 章`;
      requestAnimationFrame(scheduleVisibleCanvases);
    };

    const scheduleApply = () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(apply, 70);
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        activeFilter = button.dataset.filter;
        buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        apply();
      });
    });
    search?.addEventListener('input', scheduleApply);
    clear?.addEventListener('click', () => {
      search.value = '';
      search.focus();
      apply();
    });
    apply();
  }

  function initTopicObserver() {
    const links = new Map(
      Array.from(document.querySelectorAll('#topic-nav a')).map((link) => [link.getAttribute('href').slice(1), link])
    );
    const topics = Array.from(document.querySelectorAll('.topic[id]'));
    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
        else visible.delete(entry.target.id);
      });
      const activeId = [...visible.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0]?.[0];
      links.forEach((link, id) => link.classList.toggle('active', id === activeId));
      topics.forEach((topic) => topic.classList.toggle('is-current', topic.id === activeId));
    }, { rootMargin: '-24% 0px -58% 0px', threshold: 0.03 });
    topics.forEach((topic) => observer.observe(topic));
  }

  function initSpectrum() {
    const slider = document.getElementById('precondition-strength');
    const output = document.getElementById('precondition-output');
    const condition = document.getElementById('condition-number');
    const steps = document.getElementById('gmres-steps');

    const draw = registerCanvas('spectrum-canvas', (ctx, width, height, p) => {
      const strength = Number(slider.value) / 100;
      const plot = drawGrid(ctx, width, height, p);
      const mapX = (x) => plot.x0 + (x + 1.2) / 9.5 * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (y + 4) / 8 * (plot.y1 - plot.y0);

      const oneX = mapX(1);
      const zeroY = mapY(0);
      ctx.save();
      ctx.strokeStyle = p.green;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(oneX, zeroY, Math.max(8, 30 - strength * 14), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      label(ctx, 'λ ≈ 1', oneX + 10, zeroY - 22, p, 'left', 9);

      for (let i = 0; i < 36; i += 1) {
        const phase = i * 1.817;
        const radius = 0.8 + (i % 9) * 0.36;
        const originalX = 0.05 + radius * 1.72 + 0.42 * Math.sin(phase * 0.7);
        const originalY = Math.sin(phase) * (0.5 + radius * 0.72);
        const targetX = 1 + 0.16 * Math.sin(phase * 1.9);
        const targetY = 0.14 * Math.cos(phase * 1.3);
        const easing = 1 - Math.pow(1 - strength, 1.35);
        const x = originalX * (1 - easing) + targetX * easing;
        const y = originalY * (1 - easing) + targetY * easing;
        ctx.beginPath();
        ctx.arc(mapX(x), mapY(y), 3.2, 0, Math.PI * 2);
        ctx.fillStyle = i % 5 === 0 ? p.coral : p.cyan;
        ctx.globalAlpha = 0.82;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      label(ctx, 'Re(λ)', plot.x1, plot.y1 + 23, p, 'right');
      label(ctx, 'Im(λ)', plot.x0 - 8, plot.y0 - 8, p, 'left');
    });

    const update = () => {
      const strength = Number(slider.value) / 100;
      const kappa = Math.pow(10, 4.8 - 2.2 * strength);
      const iterationCount = Math.round(18 + 72 * Math.pow(1 - strength, 1.5));
      output.value = `${slider.value}%`;
      condition.textContent = kappa >= 1000 ? `${(kappa / 1000).toFixed(1)}e3` : kappa.toFixed(0);
      steps.textContent = String(iterationCount);
      draw();
    };
    slider.addEventListener('input', update);
    update();
  }

  function initContinuation() {
    const slider = document.getElementById('continuation-step');
    const output = document.getElementById('continuation-output');

    const branch = (t) => ({ lambda: 0.54 * (t * t * t - 3 * t), u: t });
    const draw = registerCanvas('continuation-canvas', (ctx, width, height, p) => {
      const step = Number(slider.value);
      const plot = drawGrid(ctx, width, height, p, { left: 50, right: 24, top: 24, bottom: 42 });
      const mapX = (x) => plot.x0 + (x + 1.25) / 2.5 * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (y + 2.25) / 4.5 * (plot.y1 - plot.y0);
      const points = Array.from({ length: 121 }, (_, i) => branch(-2.1 + 4.2 * i / 120));

      ctx.strokeStyle = p.lineStrong;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = mapX(point.lambda);
        const y = mapY(point.u);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      const trackedT = -2.05 + 4.1 * (step - 1) / 13;
      const trackedPoints = points.filter((_, index) => -2.1 + 4.2 * index / 120 <= trackedT);
      ctx.strokeStyle = p.coral;
      ctx.lineWidth = 4;
      ctx.beginPath();
      trackedPoints.forEach((point, index) => {
        if (index === 0) ctx.moveTo(mapX(point.lambda), mapY(point.u));
        else ctx.lineTo(mapX(point.lambda), mapY(point.u));
      });
      ctx.stroke();

      for (let i = 0; i < step; i += 1) {
        const t = -2.05 + 4.1 * i / 13;
        const point = branch(t);
        ctx.beginPath();
        ctx.arc(mapX(point.lambda), mapY(point.u), i === step - 1 ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = i === step - 1 ? p.amber : p.coral;
        ctx.fill();
      }

      const current = branch(trackedT);
      const dLambda = 0.54 * (3 * trackedT * trackedT - 3);
      const tangentScale = 0.22 / Math.max(1, Math.abs(dLambda));
      const x0 = mapX(current.lambda - dLambda * tangentScale);
      const y0 = mapY(current.u - tangentScale);
      const x1 = mapX(current.lambda + dLambda * tangentScale);
      const y1 = mapY(current.u + tangentScale);
      ctx.strokeStyle = p.cyan;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);

      [-1, 1].forEach((fold) => {
        const point = branch(fold);
        const x = mapX(point.lambda);
        const y = mapY(point.u);
        ctx.strokeStyle = p.amber;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 5);
        ctx.lineTo(x + 5, y + 5);
        ctx.moveTo(x + 5, y - 5);
        ctx.lineTo(x - 5, y + 5);
        ctx.stroke();
      });

      label(ctx, '参数 λ', plot.x1, plot.y1 + 25, p, 'right');
      label(ctx, '状态 u', plot.x0 - 9, plot.y0 - 8, p, 'left');
      label(ctx, 'turning point', mapX(branch(1).lambda) - 6, mapY(1) - 18, p, 'right', 9);
    });

    const update = () => {
      output.value = `${slider.value} / 14`;
      draw();
    };
    slider.addEventListener('input', update);
    update();
  }

  function makeTicks(container, count, endpoints = true) {
    container.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const tick = document.createElement('i');
      const denominator = endpoints ? count - 1 : count + 1;
      const position = endpoints ? i / Math.max(1, denominator) : (i + 1) / denominator;
      tick.style.left = `${position * 100}%`;
      container.appendChild(tick);
    }
  }

  function initMultirate() {
    if (!document.getElementById('slow-ticks')) return;
    const regimes = {
      mild: { slow: 6, fast: 9, solve: 3, ratio: '1 : 4', method: 'ESDIRK' },
      stiff: { slow: 5, fast: 5, solve: 5, ratio: '1 : 18', method: 'IMEX-ARK' },
      multi: { slow: 3, fast: 19, solve: 3, ratio: '1 : 24', method: 'MRIStep' }
    };
    const buttons = document.querySelectorAll('[data-regime]');
    const slow = document.getElementById('slow-ticks');
    const fast = document.getElementById('fast-ticks');
    const solve = document.getElementById('solve-ticks');
    const ratio = document.getElementById('scale-ratio');
    const method = document.getElementById('integrator-choice');

    const select = (name) => {
      const regime = regimes[name];
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.regime === name)));
      makeTicks(slow, regime.slow);
      makeTicks(fast, regime.fast);
      makeTicks(solve, regime.solve, false);
      ratio.textContent = regime.ratio;
      method.textContent = regime.method;
    };
    buttons.forEach((button) => button.addEventListener('click', () => select(button.dataset.regime)));
    select('multi');
  }

  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersects = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }


  function fluxPotential(z) {
    return 0.25 * z ** 4 - 0.5 * z ** 2;
  }

  function fluxContourPoints(energy, delta = 0.28, samples = 150) {
    const disc = Math.sqrt(Math.max(0, 1 + 4 * energy));
    const zLow = Math.sqrt(Math.max(0, 1 - disc));
    const zHigh = Math.sqrt(Math.max(0, 1 + disc));
    const right = [];
    const left = [];
    for (let i = 0; i <= samples; i += 1) {
      const z = zLow + (zHigh - zLow) * i / samples;
      const x = Math.sqrt(Math.max(0, 2 * (energy - fluxPotential(z))));
      const shift = delta * z * (z - 1);
      right.push({ x: x + shift, z });
      left.push({ x: -x + shift, z });
    }
    return [...right, ...left.reverse()];
  }

  function drawFluxPath(ctx, points, map, stroke, width = 1.5, dash = []) {
    if (!points.length) return;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach((point, index) => {
      const m = map(point.x, point.z);
      if (index === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function makeFluxMapper(box, world = { xmin: -1.35, xmax: 1.55, zmin: -0.68, zmax: 1.55 }) {
    return (x, z) => ({
      x: box.x0 + (x - world.xmin) / (world.xmax - world.xmin) * (box.x1 - box.x0),
      y: box.y1 - (z - world.zmin) / (world.zmax - world.zmin) * (box.y1 - box.y0)
    });
  }

  function drawSeparatrixLegs(ctx, map, delta, stroke, width = 2.4) {
    const right = [];
    const left = [];
    for (let i = 0; i <= 60; i += 1) {
      const z = -0.62 * i / 60;
      const x = Math.sqrt(Math.max(0, z * z - 0.5 * z ** 4));
      const shift = delta * z * (z - 1);
      right.push({ x: x + shift, z });
      left.push({ x: -x + shift, z });
    }
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    [right, left].forEach((branch) => {
      ctx.beginPath();
      branch.forEach((point, index) => {
        const m = map(point.x, point.z);
        if (index === 0) ctx.moveTo(m.x, m.y);
        else ctx.lineTo(m.x, m.y);
      });
      ctx.stroke();
    });
    ctx.restore();
  }

  function initHero() {
    registerCanvas('hero-canvas', (ctx, width, height) => {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#071014');
      gradient.addColorStop(0.52, '#0d2026');
      gradient.addColorStop(1, '#071013');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = '#7eb3ba';
      ctx.lineWidth = 1;
      const spacing = Math.max(34, width / 38);
      for (let x = 0; x < width; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      ctx.restore();

      const box = { x0: width * 0.48, x1: width * 0.96, y0: height * 0.07, y1: height * 0.95 };
      const map = makeFluxMapper(box);
      const energies = [-0.235, -0.205, -0.17, -0.13, -0.09, -0.052, -0.018];
      energies.forEach((e, i) => drawFluxPath(ctx, fluxContourPoints(e, 0.30), map, i % 2 ? '#25b7c8' : '#6cb8bd', 1.3));
      drawFluxPath(ctx, fluxContourPoints(0, 0.30), map, '#f27559', 3.1);
      drawSeparatrixLegs(ctx, map, 0.30, '#f27559', 3.1);

      const axis = map(0, 1);
      const xpoint = map(0, 0);
      ctx.fillStyle = '#f0b84c';
      ctx.beginPath(); ctx.arc(axis.x, axis.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f0b84c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(xpoint.x - 7, xpoint.y - 7); ctx.lineTo(xpoint.x + 7, xpoint.y + 7); ctx.moveTo(xpoint.x + 7, xpoint.y - 7); ctx.lineTo(xpoint.x - 7, xpoint.y + 7); ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.36;
      ctx.fillStyle = '#d8eeef';
      ctx.font = `${Math.max(11, width * 0.008)}px ui-monospace, monospace`;
      const equations = ['PA = LU', 'J(u)δu = −F(u)', 'Mẏ = fᴱ + fᴵ', '∇·B = 0', 'Rᵤᵀλ = Jᵤᵀ'];
      equations.forEach((text, i) => ctx.fillText(text, width * 0.73 + (i % 2) * width * 0.12, height * (0.13 + 0.13 * i)));
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.22;
      for (let i = 0; i < 220; i += 1) {
        const x = width * (0.38 + 0.59 * ((i * 0.6180339887) % 1));
        const y = height * ((i * 0.4142135623) % 1);
        ctx.fillStyle = i % 7 === 0 ? '#f27559' : '#7eb3ba';
        ctx.fillRect(x, y, i % 7 === 0 ? 2.2 : 1.1, i % 7 === 0 ? 2.2 : 1.1);
      }
      ctx.restore();
    });
  }

  function initRoundoff() {
    const slider = document.getElementById('roundoff-h');
    const output = document.getElementById('roundoff-output');
    const errorNode = document.getElementById('roundoff-error');
    const sourceNode = document.getElementById('roundoff-source');
    if (!slider) return;

    const relativeError = (k) => {
      const h = 10 ** (-k);
      const approx = (Math.exp(1 + h) - Math.exp(1 - h)) / (2 * h);
      return Math.abs(approx - Math.E) / Math.E;
    };

    const draw = registerCanvas('roundoff-canvas', (ctx, width, height, p) => {
      const plot = drawGrid(ctx, width, height, p, { left: 58, right: 18, top: 20, bottom: 43 });
      const xMin = -16; const xMax = -0.5; const yMin = -16; const yMax = 0;
      const mapX = (x) => plot.x0 + (x - xMin) / (xMax - xMin) * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (y - yMin) / (yMax - yMin) * (plot.y1 - plot.y0);
      const curve = [];
      for (let i = 0; i <= 220; i += 1) {
        const k = 0.5 + 15.5 * i / 220;
        curve.push({ x: -k, y: Math.log10(Math.max(1e-16, relativeError(k))) });
      }
      ctx.strokeStyle = p.cyan; ctx.lineWidth = 2.4; ctx.beginPath();
      curve.forEach((pt, i) => { if (i === 0) ctx.moveTo(mapX(pt.x), mapY(pt.y)); else ctx.lineTo(mapX(pt.x), mapY(pt.y)); });
      ctx.stroke();

      ctx.strokeStyle = p.coral; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.beginPath();
      for (let i = 0; i <= 160; i += 1) {
        const k = 0.5 + 15.5 * i / 160; const h = 10 ** (-k);
        const model = h * h / 6 + Number.EPSILON / h;
        const x = mapX(-k); const y = mapY(Math.log10(Math.min(1, Math.max(1e-16, model))));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);

      const k = Number(slider.value) / 10;
      const xSel = mapX(-k); const ySel = mapY(Math.log10(Math.max(1e-16, relativeError(k))));
      ctx.strokeStyle = p.amber; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(xSel, plot.y0); ctx.lineTo(xSel, plot.y1); ctx.stroke();
      ctx.fillStyle = p.amber; ctx.beginPath(); ctx.arc(xSel, ySel, 4.5, 0, Math.PI * 2); ctx.fill();
      label(ctx, 'log₁₀(h)', plot.x1, plot.y1 + 25, p, 'right');
      label(ctx, 'log₁₀(relative error)', plot.x0 - 8, plot.y0 - 8, p, 'left', 9);
      label(ctx, '实际误差', mapX(-11.8), mapY(-9.6), p, 'left', 9);
      label(ctx, 'h² + u/h 模型', mapX(-6.7), mapY(-7.0), p, 'left', 9);
    });

    const update = () => {
      const k = Number(slider.value) / 10;
      const h = 10 ** (-k);
      const err = relativeError(k);
      output.value = `k=${k.toFixed(1)}`;
      errorNode.textContent = err.toExponential(2).replace('e-', 'e−');
      sourceNode.textContent = h * h / 6 > Number.EPSILON / h ? '截断误差' : '舍入/消去';
      draw();
    };
    slider.addEventListener('input', update); update();
  }

  function barycentricWeights(xs) {
    return xs.map((xj, j) => {
      let product = 1;
      for (let m = 0; m < xs.length; m += 1) if (m !== j) product *= (xj - xs[m]);
      return 1 / product;
    });
  }

  function barycentricEval(x, xs, ys, ws) {
    let numerator = 0; let denominator = 0;
    for (let j = 0; j < xs.length; j += 1) {
      const d = x - xs[j];
      if (Math.abs(d) < 1e-13) return ys[j];
      const q = ws[j] / d;
      numerator += q * ys[j]; denominator += q;
    }
    return numerator / denominator;
  }

  function initInterpolation() {
    const slider = document.getElementById('interp-nodes');
    const output = document.getElementById('interp-output');
    const errorNode = document.getElementById('interp-error');
    const riskNode = document.getElementById('interp-risk');
    const buttons = document.querySelectorAll('[data-node-mode]');
    if (!slider) return;
    let mode = 'chebyshev';
    const runge = (x) => 1 / (1 + 25 * x * x);

    const getNodes = () => {
      const n = Number(slider.value);
      if (mode === 'chebyshev') return Array.from({ length: n }, (_, j) => Math.cos((2 * j + 1) * Math.PI / (2 * n))).sort((a, b) => a - b);
      return Array.from({ length: n }, (_, j) => -1 + 2 * j / (n - 1));
    };

    const draw = registerCanvas('interpolation-canvas', (ctx, width, height, p) => {
      const xs = getNodes(); const ys = xs.map(runge); const ws = barycentricWeights(xs);
      const samples = Array.from({ length: 420 }, (_, i) => -1 + 2 * i / 419);
      const values = samples.map((x) => barycentricEval(x, xs, ys, ws));
      const plot = drawGrid(ctx, width, height, p, { left: 44, right: 16, top: 20, bottom: 38 });
      const mapX = (x) => plot.x0 + (x + 1) / 2 * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (Math.max(-1.4, Math.min(2.4, y)) + 1.4) / 3.8 * (plot.y1 - plot.y0);

      ctx.strokeStyle = p.lineStrong; ctx.lineWidth = 2; ctx.beginPath();
      samples.forEach((x, i) => { const y = mapY(runge(x)); if (i === 0) ctx.moveTo(mapX(x), y); else ctx.lineTo(mapX(x), y); }); ctx.stroke();
      ctx.strokeStyle = p.coral; ctx.lineWidth = 2.2; ctx.beginPath();
      samples.forEach((x, i) => { const y = mapY(values[i]); if (i === 0) ctx.moveTo(mapX(x), y); else ctx.lineTo(mapX(x), y); }); ctx.stroke();
      xs.forEach((x, i) => { ctx.fillStyle = p.cyan; ctx.beginPath(); ctx.arc(mapX(x), mapY(ys[i]), 3.2, 0, Math.PI * 2); ctx.fill(); });
      label(ctx, 'x', plot.x1, plot.y1 + 22, p, 'right'); label(ctx, 'f(x)', plot.x0 - 8, plot.y0 - 7, p, 'left');
      label(ctx, '真实 Runge 函数', mapX(-0.86), mapY(0.52), p, 'left', 9);
      label(ctx, '插值多项式', mapX(0.43), mapY(1.75), p, 'left', 9);
    });

    const update = () => {
      const xs = getNodes(); const ys = xs.map(runge); const ws = barycentricWeights(xs);
      let maxErr = 0;
      for (let i = 0; i <= 1000; i += 1) {
        const x = -1 + 2 * i / 1000;
        maxErr = Math.max(maxErr, Math.abs(barycentricEval(x, xs, ys, ws) - runge(x)));
      }
      output.value = String(xs.length);
      errorNode.textContent = maxErr.toExponential(2).replace('e-', 'e−');
      riskNode.textContent = mode === 'equispaced' && xs.length > 15 ? '高：端点振荡' : mode === 'chebyshev' ? '受控' : '中等';
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.nodeMode === mode)));
      draw();
    };
    buttons.forEach((b) => b.addEventListener('click', () => { mode = b.dataset.nodeMode; update(); }));
    slider.addEventListener('input', update); update();
  }

  function chebBasis(x, degree) {
    const values = new Array(degree + 1).fill(0); values[0] = 1;
    if (degree >= 1) values[1] = x;
    for (let k = 2; k <= degree; k += 1) values[k] = 2 * x * values[k - 1] - values[k - 2];
    return values;
  }

  function ridgeLeastSquaresQR(xs, ys, degree, lambda) {
    const m = degree + 1;
    const rows = xs.length + m;
    const columns = Array.from({ length: m }, () => new Array(rows).fill(0));
    const b = new Array(rows).fill(0);
    xs.forEach((x, i) => {
      const basis = chebBasis(x, degree);
      for (let j = 0; j < m; j += 1) columns[j][i] = basis[j];
      b[i] = ys[i];
    });
    const rootLambda = Math.sqrt(lambda);
    for (let j = 0; j < m; j += 1) columns[j][xs.length + j] = rootLambda;

    const Q = []; const R = Array.from({ length: m }, () => new Array(m).fill(0));
    for (let j = 0; j < m; j += 1) {
      const v = columns[j].slice();
      for (let i = 0; i < j; i += 1) {
        let dot = 0; for (let r = 0; r < rows; r += 1) dot += Q[i][r] * v[r];
        R[i][j] = dot; for (let r = 0; r < rows; r += 1) v[r] -= dot * Q[i][r];
      }
      let norm = Math.sqrt(v.reduce((sum, q) => sum + q * q, 0));
      if (norm < 1e-13) norm = 1e-13;
      R[j][j] = norm; Q[j] = v.map((q) => q / norm);
    }
    const qtb = Q.map((q) => q.reduce((sum, value, r) => sum + value * b[r], 0));
    const c = new Array(m).fill(0);
    for (let i = m - 1; i >= 0; i -= 1) {
      let rhs = qtb[i]; for (let j = i + 1; j < m; j += 1) rhs -= R[i][j] * c[j];
      c[i] = rhs / R[i][i];
    }
    return c;
  }

  function initFitting() {
    const degreeSlider = document.getElementById('fit-degree');
    const lambdaSlider = document.getElementById('fit-lambda');
    if (!degreeSlider || !lambdaSlider) return;
    const degreeOutput = document.getElementById('fit-degree-output');
    const lambdaOutput = document.getElementById('fit-lambda-output');
    const trainNode = document.getElementById('fit-train');
    const validNode = document.getElementById('fit-valid');
    const truth = (x) => 0.65 * Math.sin(2.5 * x) + 0.24 * Math.cos(5.2 * x) + 0.12 * x;
    const xs = Array.from({ length: 34 }, (_, i) => -1 + 2 * i / 33);
    const noise = (i) => 0.16 * (2 * (((Math.sin((i + 3) * 91.731) * 43758.5453) % 1 + 1) % 1) - 1);
    const ys = xs.map((x, i) => truth(x) + noise(i));
    let coeffs = [];
    const evalFit = (x) => chebBasis(x, coeffs.length - 1).reduce((sum, v, i) => sum + v * coeffs[i], 0);

    const draw = registerCanvas('fitting-canvas', (ctx, width, height, p) => {
      const plot = drawGrid(ctx, width, height, p, { left: 45, right: 16, top: 20, bottom: 38 });
      const mapX = (x) => plot.x0 + (x + 1) / 2 * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (y + 1.25) / 2.5 * (plot.y1 - plot.y0);
      ctx.strokeStyle = p.lineStrong; ctx.lineWidth = 1.8; ctx.beginPath();
      for (let i = 0; i <= 320; i += 1) { const x = -1 + 2 * i / 320; const y = mapY(truth(x)); if (i === 0) ctx.moveTo(mapX(x), y); else ctx.lineTo(mapX(x), y); } ctx.stroke();
      ctx.strokeStyle = p.coral; ctx.lineWidth = 2.4; ctx.beginPath();
      for (let i = 0; i <= 320; i += 1) { const x = -1 + 2 * i / 320; const y = mapY(evalFit(x)); if (i === 0) ctx.moveTo(mapX(x), y); else ctx.lineTo(mapX(x), y); } ctx.stroke();
      xs.forEach((x, i) => { ctx.fillStyle = p.cyan; ctx.beginPath(); ctx.arc(mapX(x), mapY(ys[i]), 2.8, 0, Math.PI * 2); ctx.fill(); });
      label(ctx, 'x', plot.x1, plot.y1 + 22, p, 'right'); label(ctx, 'y', plot.x0 - 7, plot.y0 - 7, p, 'left');
    });

    const update = () => {
      const degree = Number(degreeSlider.value); const logLambda = Number(lambdaSlider.value); const lambda = 10 ** logLambda;
      coeffs = ridgeLeastSquaresQR(xs, ys, degree, lambda);
      const trainRmse = Math.sqrt(xs.reduce((sum, x, i) => sum + (evalFit(x) - ys[i]) ** 2, 0) / xs.length);
      let valid = 0; const nv = 240;
      for (let i = 0; i < nv; i += 1) { const x = -0.995 + 1.99 * i / (nv - 1); valid += (evalFit(x) - truth(x)) ** 2; }
      valid = Math.sqrt(valid / nv);
      degreeOutput.value = String(degree); lambdaOutput.value = String(logLambda).replace('-', '−');
      trainNode.textContent = trainRmse.toFixed(3); validNode.textContent = valid.toFixed(3); draw();
    };
    degreeSlider.addEventListener('input', update); lambdaSlider.addEventListener('input', update); update();
  }

  function fftRadix2(real, imag) {
    const n = real.length;
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const angle = -2 * Math.PI / len;
      const wlenR = Math.cos(angle); const wlenI = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let wr = 1; let wi = 0;
        for (let j = 0; j < len / 2; j += 1) {
          const uR = real[i + j]; const uI = imag[i + j];
          const vR = real[i + j + len / 2] * wr - imag[i + j + len / 2] * wi;
          const vI = real[i + j + len / 2] * wi + imag[i + j + len / 2] * wr;
          real[i + j] = uR + vR; imag[i + j] = uI + vI;
          real[i + j + len / 2] = uR - vR; imag[i + j + len / 2] = uI - vI;
          const nextWr = wr * wlenR - wi * wlenI; wi = wr * wlenI + wi * wlenR; wr = nextWr;
        }
      }
    }
  }

  function initFFT() {
    const freqSlider = document.getElementById('fft-freq'); const sizeSlider = document.getElementById('fft-size');
    if (!freqSlider || !sizeSlider) return;
    const freqOutput = document.getElementById('fft-freq-output'); const sizeOutput = document.getElementById('fft-size-output');
    const binNode = document.getElementById('fft-bin'); const leakNode = document.getElementById('fft-leak');
    const buttons = document.querySelectorAll('[data-window]'); let windowName = 'rect'; let cache = null;
    const windowValue = (j, n) => {
      if (windowName === 'hann') return 0.5 - 0.5 * Math.cos(2 * Math.PI * j / (n - 1));
      if (windowName === 'blackman') return 0.42 - 0.5 * Math.cos(2 * Math.PI * j / (n - 1)) + 0.08 * Math.cos(4 * Math.PI * j / (n - 1));
      return 1;
    };
    const compute = () => {
      const n = 2 ** Number(sizeSlider.value); const frequency = Number(freqSlider.value) / 10;
      const signal = Array.from({ length: n }, (_, j) => Math.sin(2 * Math.PI * frequency * j / n));
      const real = signal.map((v, j) => v * windowValue(j, n)); const imag = new Array(n).fill(0); fftRadix2(real, imag);
      const norm = Array.from({ length: n }, (_, j) => windowValue(j, n)).reduce((a, b) => a + b, 0);
      const mag = real.slice(0, n / 2).map((r, k) => 2 * Math.hypot(r, imag[k]) / norm);
      let peak = 1; for (let k = 2; k < mag.length; k += 1) if (mag[k] > mag[peak]) peak = k;
      const power = mag.reduce((sum, v) => sum + v * v, 0);
      let mainPower = 0; for (let k = Math.max(0, peak - 1); k <= Math.min(mag.length - 1, peak + 1); k += 1) mainPower += mag[k] ** 2;
      cache = { n, frequency, signal, mag, peak, leakage: Math.max(0, 1 - mainPower / Math.max(power, 1e-16)) };
    };
    const draw = registerCanvas('fft-canvas', (ctx, width, height, p) => {
      if (!cache) compute(); const { n, signal, mag } = cache;
      const left = 48; const right = 16; const top = 18; const mid = height * 0.47; const bottom = height - 34;
      ctx.strokeStyle = p.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, mid); ctx.lineTo(width - right, mid); ctx.moveTo(left, top); ctx.lineTo(left, mid - 18); ctx.moveTo(left, mid + 20); ctx.lineTo(left, bottom); ctx.lineTo(width - right, bottom); ctx.stroke();
      ctx.strokeStyle = p.cyan; ctx.lineWidth = 1.7; ctx.beginPath();
      signal.forEach((v, i) => { const x = left + i / (n - 1) * (width - right - left); const y = top + (1.2 - v) / 2.4 * (mid - top - 18); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
      const maxBin = Math.min(mag.length - 1, 40); const maxMag = Math.max(0.01, ...mag.slice(0, maxBin + 1));
      ctx.strokeStyle = p.coral; ctx.lineWidth = Math.max(1, (width - right - left) / (maxBin + 1) * 0.48);
      for (let k = 0; k <= maxBin; k += 1) { const x = left + k / maxBin * (width - right - left); const y = bottom - mag[k] / maxMag * (bottom - mid - 34); ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, y); ctx.stroke(); }
      label(ctx, 'time samples', width - right, mid - 8, p, 'right', 9); label(ctx, 'frequency bin k', width - right, bottom + 20, p, 'right', 9); label(ctx, 'amplitude', left - 8, mid + 24, p, 'left', 9);
    });
    const update = () => {
      compute(); freqOutput.value = cache.frequency.toFixed(1); sizeOutput.value = String(cache.n); binNode.textContent = String(cache.peak); leakNode.textContent = `${(100 * cache.leakage).toFixed(1)}%`;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.window === windowName))); draw();
    };
    buttons.forEach((b) => b.addEventListener('click', () => { windowName = b.dataset.window; update(); }));
    freqSlider.addEventListener('input', update); sizeSlider.addEventListener('input', update); update();
  }

  function drawMatrixBlock(ctx, x, y, rows, cols, cell, p, pattern, title) {
    ctx.save();
    for (let i = 0; i < rows; i += 1) for (let j = 0; j < cols; j += 1) {
      const active = pattern(i, j); ctx.fillStyle = active ? p.cyan : p.surface2; ctx.globalAlpha = active ? 0.32 + 0.5 * ((i + j) % 3) / 2 : 0.34;
      ctx.fillRect(x + j * cell, y + i * cell, cell - 1, cell - 1);
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = p.lineStrong; ctx.strokeRect(x, y, cols * cell, rows * cell);
    label(ctx, title, x + cols * cell / 2, y - 12, p, 'center', 10); ctx.restore();
  }

  function initFactorization() {
    const buttons = document.querySelectorAll('[data-factor]'); const caption = document.getElementById('factorization-caption');
    if (!buttons.length) return; let selected = 'lu';
    const descriptions = {
      lu: '一般方阵：部分主元 LU 平衡适用性与成本。', chol: '对称正定：Cholesky 只存一个三角因子，速度与内存更优。',
      ldlt: '对称不定：Bunch–Kaufman 通过 1×1/2×2 主元稳定分解。', qr: '高矩形最小二乘：Householder QR 避免平方条件数。',
      svd: '秩亏/伪逆：SVD 最稳健但成本较高。', band: '严格三对角可用 Thomas；一般窄带系统使用紧凑存储与带状 LU。'
    };
    const draw = registerCanvas('factorization-canvas', (ctx, width, height, p) => {
      const midY = height * 0.38; const cell = Math.max(8, Math.min(14, width / 55));
      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);
      if (selected === 'lu') {
        drawMatrixBlock(ctx, width * 0.07, midY, 8, 8, cell, p, () => true, 'P A');
        label(ctx, '=', width * 0.35, midY + 4 * cell, p, 'center', 18);
        drawMatrixBlock(ctx, width * 0.43, midY, 8, 8, cell, p, (i, j) => i >= j, 'L');
        drawMatrixBlock(ctx, width * 0.69, midY, 8, 8, cell, p, (i, j) => i <= j, 'U');
      } else if (selected === 'chol') {
        drawMatrixBlock(ctx, width * 0.08, midY, 8, 8, cell, p, (i, j) => true, 'A = Aᵀ > 0'); label(ctx, '=', width * 0.36, midY + 4 * cell, p, 'center', 18);
        drawMatrixBlock(ctx, width * 0.44, midY, 8, 8, cell, p, (i, j) => i >= j, 'L'); drawMatrixBlock(ctx, width * 0.70, midY, 8, 8, cell, p, (i, j) => i <= j, 'Lᵀ');
      } else if (selected === 'ldlt') {
        drawMatrixBlock(ctx, width * 0.03, midY, 8, 8, cell, p, () => true, 'Pᵀ A P'); label(ctx, '=', width * 0.27, midY + 4 * cell, p, 'center', 18);
        drawMatrixBlock(ctx, width * 0.34, midY, 8, 8, cell, p, (i, j) => i >= j, 'L');
        drawMatrixBlock(ctx, width * 0.57, midY, 8, 8, cell, p, (i, j) => Math.floor(i / 2) === Math.floor(j / 2), 'D');
        drawMatrixBlock(ctx, width * 0.80, midY, 8, 8, cell, p, (i, j) => i <= j, 'Lᵀ');
      } else if (selected === 'qr') {
        drawMatrixBlock(ctx, width * 0.08, midY - 2 * cell, 12, 7, cell, p, () => true, 'A (m×n)'); label(ctx, '=', width * 0.34, midY + 3 * cell, p, 'center', 18);
        drawMatrixBlock(ctx, width * 0.43, midY - 2 * cell, 12, 7, cell, p, () => true, 'Q'); drawMatrixBlock(ctx, width * 0.72, midY, 7, 7, cell, p, (i, j) => i <= j, 'R');
      } else if (selected === 'svd') {
        drawMatrixBlock(ctx, width * 0.02, midY - cell, 10, 7, cell, p, () => true, 'A'); label(ctx, '=', width * 0.24, midY + 3 * cell, p, 'center', 18);
        drawMatrixBlock(ctx, width * 0.31, midY - cell, 10, 7, cell, p, () => true, 'U');
        drawMatrixBlock(ctx, width * 0.58, midY, 7, 7, cell, p, (i, j) => i === j && i < 5, 'Σ');
        drawMatrixBlock(ctx, width * 0.82, midY, 7, 7, cell, p, () => true, 'Vᵀ');
      } else {
        drawMatrixBlock(ctx, width * 0.08, midY - cell, 12, 12, cell, p, (i, j) => Math.abs(i - j) <= 2, 'A：半带宽 2'); label(ctx, '→', width * 0.48, midY + 4 * cell, p, 'center', 22);
        drawMatrixBlock(ctx, width * 0.58, midY - cell, 12, 12, cell, p, (i, j) => Math.abs(i - j) <= 2, '紧凑带 LU');
      }
      label(ctx, descriptions[selected], width / 2, height - 32, p, 'center', 10);
    });
    const update = () => { buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.factor === selected))); caption.textContent = descriptions[selected]; draw(); };
    buttons.forEach((b) => b.addEventListener('click', () => { selected = b.dataset.factor; update(); })); update();
  }

  function complexAbsSquared(re, im) { return re * re + im * im; }
  function stabilityAbs(method, x, y) {
    if (method === 'ee') return Math.hypot(1 + x, y);
    if (method === 'rk4') {
      let zr = x; let zi = y; let pr = 1; let pi = 0; let rr = 1; let ri = 0; let fact = 1;
      for (let k = 1; k <= 4; k += 1) {
        if (k > 1) { const nr = pr * zr - pi * zi; const ni = pr * zi + pi * zr; pr = nr; pi = ni; } else { pr = zr; pi = zi; }
        fact *= k; rr += pr / fact; ri += pi / fact;
      }
      return Math.hypot(rr, ri);
    }
    if (method === 'be') return 1 / Math.hypot(1 - x, -y);
    const nr = 1 + x / 2; const ni = y / 2; const dr = 1 - x / 2; const di = -y / 2;
    return Math.hypot(nr, ni) / Math.hypot(dr, di);
  }

  function initStability() {
    const buttons = document.querySelectorAll('[data-stability]'); const caption = document.getElementById('stability-caption');
    if (!buttons.length) return; let method = 'rk4';
    const captions = { ee: '显式 Euler 的稳定域是以 −1 为圆心、半径 1 的圆盘。', rk4: 'RK4 的稳定域有限，不能解除扩散/反应刚性带来的步长限制。', be: '隐式 Euler 为 L-stable，强衰减负实谱被压到零。', trap: '梯形法 A-stable 但不是 L-stable，极强刚性模态可能产生数值振荡。' };
    const draw = registerCanvas('stability-canvas', (ctx, width, height, p) => {
      const plot = drawGrid(ctx, width, height, p, { left: 48, right: 18, top: 18, bottom: 40 });
      const xmin = -6; const xmax = 2; const ymin = -5; const ymax = 5;
      const mapX = (x) => plot.x0 + (x - xmin) / (xmax - xmin) * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (y - ymin) / (ymax - ymin) * (plot.y1 - plot.y0);
      const step = 4;
      ctx.save(); ctx.globalAlpha = 0.20; ctx.fillStyle = p.cyan;
      for (let px = plot.x0; px < plot.x1; px += step) for (let py = plot.y0; py < plot.y1; py += step) {
        const x = xmin + (px - plot.x0) / (plot.x1 - plot.x0) * (xmax - xmin);
        const y = ymax - (py - plot.y0) / (plot.y1 - plot.y0) * (ymax - ymin);
        if (stabilityAbs(method, x, y) <= 1 + 1e-10) ctx.fillRect(px, py, step + 0.3, step + 0.3);
      }
      ctx.restore();
      ctx.strokeStyle = p.lineStrong; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(mapX(0), plot.y0); ctx.lineTo(mapX(0), plot.y1); ctx.moveTo(plot.x0, mapY(0)); ctx.lineTo(plot.x1, mapY(0)); ctx.stroke();
      const lambdas = [{x:-0.8,y:0.5},{x:-2.2,y:1.4},{x:-4.8,y:0}];
      lambdas.forEach((q,i)=>{ctx.fillStyle=i===2?p.coral:p.amber;ctx.beginPath();ctx.arc(mapX(q.x),mapY(q.y),4,0,Math.PI*2);ctx.fill();});
      label(ctx, 'Re(z)', plot.x1, plot.y1 + 24, p, 'right'); label(ctx, 'Im(z)', plot.x0 - 8, plot.y0 - 8, p, 'left'); label(ctx, '|R(z)|≤1', mapX(-4.8), mapY(4.3), p, 'left', 9);
    });
    const update = () => { buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stability === method))); caption.textContent = captions[method]; draw(); };
    buttons.forEach((b) => b.addEventListener('click', () => { method = b.dataset.stability; update(); })); update();
  }

  function initPDE() {
    const buttons = document.querySelectorAll('[data-pde]'); const caption = document.getElementById('pde-caption'); const formula = document.getElementById('pde-formula');
    if (!buttons.length) return; let method = 'fdm';
    const info = {
      fdm: ['\\((u_{i+1}-2u_i+u_{i-1})/h^2\\)', '节点值直接构造差分模板；边界闭合决定全局阶数和稳定性。'],
      fvm: ['\\(d\\bar u_i/dt=-(\\widehat F_{i+1/2}-\\widehat F_{i-1/2})/\\Delta x\\)', '控制体平均值通过共享面通量更新，局部守恒由通量抵消保证。'],
      fem: ['\\(a(u_h,v_h)=\\ell(v_h)\\;\\forall v_h\\in V_h\\)', '弱形式、单元积分与局部基函数组装出稀疏矩阵，复杂几何自然进入。'],
      dg: ['\\(\\int_K u_t v-\\int_K F(u)\\cdot\\nabla v+\\int_{\\partial K}\\widehat Fv=0\\)', '单元内高阶多项式可不连续，面通量耦合相邻单元。'],
      spectral: ['\\(u_N(x)=\\sum_{k=0}^{N}\\hat u_k\\phi_k(x)\\)', '全局 Fourier/Chebyshev 基对光滑解快速收敛，但边界、间断和混叠需谨慎。']
    };
    const draw = registerCanvas('pde-canvas', (ctx, width, height, p) => {
      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);
      const x0 = 48; const x1 = width - 30; const y = height * 0.48;
      if (method === 'fdm') {
        ctx.strokeStyle = p.lineStrong; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        for (let i=0;i<9;i+=1){const x=x0+(x1-x0)*i/8;ctx.fillStyle=(i>=3&&i<=5)?p.coral:p.cyan;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();label(ctx,`i${i-4>=0?'+':''}${i-4}`,x,y+25,p,'center',8);}
        ctx.strokeStyle=p.coral;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x0+(x1-x0)*3/8,y-35);ctx.quadraticCurveTo(x0+(x1-x0)*4/8,y-65,x0+(x1-x0)*5/8,y-35);ctx.stroke();
        label(ctx,'三点扩散模板',width/2,y-82,p,'center',11);
      } else if (method === 'fvm') {
        const n=7;const w=(x1-x0)/n;for(let i=0;i<n;i+=1){ctx.fillStyle=i===3?p.coral:p.surface2;ctx.globalAlpha=i===3?.24:.7;ctx.fillRect(x0+i*w,y-55,w-2,110);ctx.globalAlpha=1;ctx.strokeStyle=p.lineStrong;ctx.strokeRect(x0+i*w,y-55,w-2,110);label(ctx,`ū${i}`,x0+(i+.5)*w,y,p,'center',9);}ctx.strokeStyle=p.cyan;ctx.lineWidth=3;[3,4].forEach((f)=>{const x=x0+f*w-1;ctx.beginPath();ctx.moveTo(x-18,y-80);ctx.lineTo(x+18,y-80);ctx.lineTo(x+11,y-87);ctx.moveTo(x+18,y-80);ctx.lineTo(x+11,y-73);ctx.stroke();});label(ctx,'共享面通量 F̂',width/2,y-105,p,'center',11);
      } else if (method === 'fem') {
        const rows=4,cols=8;const dx=(x1-x0)/cols,dy=70;ctx.strokeStyle=p.lineStrong;for(let r=0;r<=rows;r+=1)for(let c=0;c<=cols;c+=1){const x=x0+c*dx+(r%2)*dx*.25;const yy=y-rows*dy/2+r*dy;if(c<cols){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+dx,yy);ctx.stroke();}if(r<rows){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+(r%2?-.25:.25)*dx,yy+dy);ctx.stroke();if(c<cols){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+(.75)*dx,yy+dy);ctx.stroke();}}}const cx=width*.52,cy=y;ctx.fillStyle=p.coral;ctx.globalAlpha=.18;ctx.beginPath();ctx.moveTo(cx,cy-90);ctx.lineTo(cx-80,cy+60);ctx.lineTo(cx+80,cy+60);ctx.closePath();ctx.fill();ctx.globalAlpha=1;label(ctx,'局部基函数 / 弱形式',width/2,y-130,p,'center',11);
      } else if (method === 'dg') {
        const n=6,w=(x1-x0)/n;ctx.strokeStyle=p.lineStrong;for(let i=0;i<=n;i+=1){const x=x0+i*w;ctx.beginPath();ctx.moveTo(x,y-80);ctx.lineTo(x,y+80);ctx.stroke();}for(let i=0;i<n;i+=1){ctx.strokeStyle=i%2?p.cyan:p.coral;ctx.lineWidth=2;ctx.beginPath();for(let j=0;j<=40;j+=1){const t=j/40;const x=x0+(i+t)*w;const yy=y+35*Math.sin((t+.17*i)*Math.PI*1.4)-15*(i%2);if(j===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();}label(ctx,'单元内多项式可跳跃；界面用 F̂',width/2,y-115,p,'center',11);
      } else {
        ctx.strokeStyle=p.lineStrong;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();const n=14;for(let j=0;j<n;j+=1){const xx=Math.cos(Math.PI*j/(n-1));const x=x0+(xx+1)/2*(x1-x0);ctx.fillStyle=p.cyan;ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();}ctx.strokeStyle=p.coral;ctx.lineWidth=2.2;ctx.beginPath();for(let i=0;i<=220;i+=1){const t=i/220;const x=x0+t*(x1-x0);const yy=y-80*Math.sin(2*Math.PI*t)-20*Math.sin(6*Math.PI*t);if(i===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();label(ctx,'全局基 / Chebyshev 聚点',width/2,y-135,p,'center',11);
      }
    });
    const update = () => { buttons.forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.pde===method))); const template=document.getElementById(`pde-formula-${method}`); if(template) formula.replaceChildren(template.content.cloneNode(true)); else formula.textContent=info[method][0]; caption.textContent=info[method][1]; draw(); };
    buttons.forEach((b)=>b.addEventListener('click',()=>{method=b.dataset.pde;update();}));update();
  }

  function canvasCallout(ctx, text, anchorX, anchorY, boxX, boxY, p, align = 'left') {
    ctx.save();
    ctx.font = '600 12.25px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
    const paddingX = 9; const paddingY = 6;
    const width = ctx.measureText(text).width + paddingX * 2;
    const height = 27;
    const left = align === 'right' ? boxX - width : boxX;
    const connectorX = align === 'right' ? left + width : left;
    ctx.strokeStyle = p.lineStrong; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(connectorX, boxY + height / 2); ctx.stroke();
    ctx.globalAlpha = 0.94; ctx.fillStyle = p.surface; ctx.fillRect(left, boxY, width, height); ctx.globalAlpha = 1;
    ctx.strokeStyle = p.line; ctx.strokeRect(left, boxY, width, height);
    ctx.fillStyle = p.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, left + paddingX, boxY + height / 2 + 0.5);
    ctx.restore();
  }

  function initXPoint() {
    const deltaSlider = document.getElementById('xpoint-delta'); const levelsSlider = document.getElementById('xpoint-levels');
    if (!deltaSlider || !levelsSlider) return;
    const deltaOutput = document.getElementById('xpoint-delta-output'); const levelsOutput = document.getElementById('xpoint-level-output');
    const draw = registerCanvas('xpoint-canvas', (ctx, width, height, p) => {
      const delta = Number(deltaSlider.value) / 100; const levels = Number(levelsSlider.value);
      const box = { x0: 44, x1: width - 30, y0: 20, y1: height - 38 }; const map = makeFluxMapper(box);
      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);
      for (let i = 1; i <= levels; i += 1) {
        const t = i / (levels + 1); const e = -0.25 + 0.235 * t ** 1.25;
        drawFluxPath(ctx, fluxContourPoints(e, delta), map, i === levels ? p.cyan : p.lineStrong, i === levels ? 2 : 1.1);
      }
      drawFluxPath(ctx, fluxContourPoints(0, delta), map, p.coral, 3.0); drawSeparatrixLegs(ctx, map, delta, p.coral, 3.0);
      const axis=map(0,1),xp=map(0,0);ctx.fillStyle=p.amber;ctx.beginPath();ctx.arc(axis.x,axis.y,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle=p.amber;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xp.x-7,xp.y-7);ctx.lineTo(xp.x+7,xp.y+7);ctx.moveTo(xp.x+7,xp.y-7);ctx.lineTo(xp.x-7,xp.y+7);ctx.stroke();
      const plateY=map(0,-0.58).y;ctx.strokeStyle=p.lineStrong;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(map(-0.9,-0.58).x,plateY);ctx.lineTo(map(-0.3,-0.58).x,plateY-10);ctx.moveTo(map(0.3,-0.58).x,plateY-10);ctx.lineTo(map(0.9,-0.58).x,plateY);ctx.stroke();
      canvasCallout(ctx, '磁轴 / O 点', axis.x, axis.y, Math.min(width - 145, axis.x + 45), Math.max(30, axis.y - 52), p);
      canvasCallout(ctx, 'X 点：∇ψ=0, det H<0', xp.x, xp.y, Math.min(width - 195, xp.x + 55), xp.y + 8, p);
      const sepAnchor = map(0.76, 0.62);
      canvasCallout(ctx, 'LCFS / ψ=ψX separatrix', sepAnchor.x, sepAnchor.y, width - 185, Math.max(34, sepAnchor.y - 38), p);
      const legAnchor = map(0.42, -0.37);
      canvasCallout(ctx, 'divertor legs', legAnchor.x, legAnchor.y, Math.min(width - 120, legAnchor.x + 40), Math.min(height - 58, legAnchor.y + 18), p);
      label(ctx,'R',box.x1,box.y1+22,p,'right');label(ctx,'Z',box.x0-8,box.y0-7,p,'left');
    });
    const update=()=>{deltaOutput.value=(Number(deltaSlider.value)/100).toFixed(2);levelsOutput.value=levelsSlider.value;draw();};deltaSlider.addEventListener('input',update);levelsSlider.addEventListener('input',update);update();
  }

  function initMesh() {
    const slider = document.getElementById('adaptivity-level');
    const output = document.getElementById('adaptivity-output');
    const dofs = document.getElementById('mesh-dofs');
    const error = document.getElementById('goal-error');
    const goalButtons = document.querySelectorAll('[data-mesh-goal]');
    if (!slider) return;
    let goal = 'axis';

    const draw = registerCanvas('mesh-canvas', (ctx, width, height, p) => {
      const level = Number(slider.value); const delta = 0.28;
      const box = { x0: 35, x1: width - 24, y0: 20, y1: height - 35 };
      const map = makeFluxMapper(box, { xmin: -1.35, xmax: 1.55, zmin: -0.08, zmax: 1.55 });
      const polygonWorld = fluxContourPoints(0, delta, 180);
      const polygon = polygonWorld.map((q) => map(q.x, q.z));
      const targetWorld = goal === 'axis' ? { x: 0, z: 1 } : { x: 0, z: 0.055 };
      const target = map(targetWorld.x, targetWorld.z);

      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath(); polygon.forEach((q,i)=>{if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.closePath();ctx.clip();
      [-0.22,-0.17,-0.12,-0.07,-0.025].forEach((e)=>drawFluxPath(ctx,fluxContourPoints(e,delta),map,p.line,0.8));
      const x0=box.x0, y0=box.y0, totalW=box.x1-box.x0, totalH=box.y1-box.y0;
      ctx.strokeStyle=p.lineStrong;ctx.lineWidth=.65;
      const intersectsPolygon=(x,y,w,h)=>{
        const tests=[{x:x+w/2,y:y+h/2},{x,y},{x:x+w,y},{x,y:y+h},{x:x+w,y:y+h}];
        return tests.some((q)=>pointInPolygon(q.x,q.y,polygon));
      };
      const drawCell=(x,y,w,h,depth)=>{
        if(!intersectsPolygon(x,y,w,h))return;
        const cx=x+w/2,cy=y+h/2;const dx=(cx-target.x)/(totalW*.42),dy=(cy-target.y)/(totalH*.48);const dist=Math.hypot(dx,dy);
        const boundaryBias=goal==='xpoint'?Math.abs(cy-map(0,0).y)/(totalH):1;
        const refine=depth<level && (dist<0.72-depth*0.055 || (goal==='xpoint'&&boundaryBias<0.14+0.02*level));
        if(refine){drawCell(x,y,w/2,h/2,depth+1);drawCell(x+w/2,y,w/2,h/2,depth+1);drawCell(x,y+h/2,w/2,h/2,depth+1);drawCell(x+w/2,y+h/2,w/2,h/2,depth+1);return;}
        ctx.fillStyle=dist<0.42?p.coral:p.cyan;ctx.globalAlpha=0.08+0.18*Math.max(0,1-dist);ctx.fillRect(x,y,w,h);ctx.globalAlpha=.72;ctx.strokeRect(x,y,w,h);
        if(w>7&&h>7){ctx.beginPath();if((Math.round(x/w)+Math.round(y/h))%2){ctx.moveTo(x,y);ctx.lineTo(x+w,y+h);}else{ctx.moveTo(x+w,y);ctx.lineTo(x,y+h);}ctx.stroke();}
      };
      const nx=6,ny=6;for(let i=0;i<nx;i+=1)for(let j=0;j<ny;j+=1)drawCell(x0+i*totalW/nx,y0+j*totalH/ny,totalW/nx,totalH/ny,0);
      ctx.restore();
      ctx.strokeStyle=p.ink;ctx.lineWidth=2.3;ctx.beginPath();polygon.forEach((q,i)=>{if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.closePath();ctx.stroke();
      drawSeparatrixLegs(ctx,map,delta,p.coral,2.3);
      ctx.strokeStyle=p.amber;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(target.x-8,target.y);ctx.lineTo(target.x+8,target.y);ctx.moveTo(target.x,target.y-8);ctx.lineTo(target.x,target.y+8);ctx.stroke();
      label(ctx,goal==='axis'?'目标：磁轴位置':'目标：X 点/边界位置',target.x+11,target.y-12,p,'left',9);
      label(ctx,'DWR-weighted refinement',13,height-14,p,'left',9);
    });

    const update = () => {
      const level = Number(slider.value); output.value = String(level);
      const factor = 1 + (goal === 'axis' ? 0.58 : 0.72) * level;
      dofs.textContent = `${factor.toFixed(1)}×`;
      error.textContent = (0.041 * Math.pow(goal === 'axis' ? 0.35 : 0.39, level)).toExponential(1).replace('e-', 'e−');
      goalButtons.forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.meshGoal===goal))); draw();
    };
    goalButtons.forEach((b)=>b.addEventListener('click',()=>{goal=b.dataset.meshGoal;update();}));
    slider.addEventListener('input', update); update();
  }

  function gaussian(x, mean, sigma) {
    const z = (x - mean) / sigma;
    return Math.exp(-0.5 * z * z) / sigma;
  }

  function initPosterior() {
    const slider = document.getElementById('noise-level');
    const output = document.getElementById('noise-output');

    const draw = registerCanvas('posterior-canvas', (ctx, width, height, p) => {
      const noise = Number(slider.value) / 100;
      const prior = { mean: -0.65, sigma: 1.12 };
      const likelihood = { mean: 0.72, sigma: 0.28 + noise * 1.15 };
      const priorPrecision = 1 / (prior.sigma * prior.sigma);
      const likelihoodPrecision = 1 / (likelihood.sigma * likelihood.sigma);
      const posteriorSigma = Math.sqrt(1 / (priorPrecision + likelihoodPrecision));
      const posteriorMean = posteriorSigma * posteriorSigma * (prior.mean * priorPrecision + likelihood.mean * likelihoodPrecision);
      const posterior = { mean: posteriorMean, sigma: posteriorSigma };
      const plot = drawGrid(ctx, width, height, p, { left: 42, right: 18, top: 20, bottom: 38 });
      const mapX = (x) => plot.x0 + (x + 3.2) / 6.4 * (plot.x1 - plot.x0);
      const samples = Array.from({ length: 180 }, (_, i) => -3.2 + 6.4 * i / 179);
      const maxDensity = Math.max(...samples.map((x) => gaussian(x, posterior.mean, posterior.sigma))) * 1.08;
      const mapY = (density) => plot.y1 - density / maxDensity * (plot.y1 - plot.y0);

      const curve = (distribution, stroke, fill = null) => {
        ctx.beginPath();
        samples.forEach((x, index) => {
          const px = mapX(x);
          const py = mapY(gaussian(x, distribution.mean, distribution.sigma));
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        if (fill) {
          ctx.lineTo(mapX(samples[samples.length - 1]), plot.y1);
          ctx.lineTo(mapX(samples[0]), plot.y1);
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.globalAlpha = 0.12;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = stroke === p.cyan ? 3 : 2;
        ctx.stroke();
      };

      curve(prior, p.lineStrong);
      curve(likelihood, p.coral);
      curve(posterior, p.cyan, p.cyan);
      label(ctx, '参数 m', plot.x1, plot.y1 + 23, p, 'right');
      label(ctx, '密度', plot.x0 - 8, plot.y0 - 7, p, 'left');
      label(ctx, `μpost=${posterior.mean.toFixed(2)}`, mapX(posterior.mean), plot.y0 + 12, p, 'center', 9);
    });

    const update = () => {
      output.value = (Number(slider.value) / 100).toFixed(2);
      draw();
    };
    slider.addEventListener('input', update);
    update();
  }

  function initPseudospectrum() {
    const slider = document.getElementById('nonnormality');
    const output = document.getElementById('nonnormal-output');
    const growth = document.getElementById('transient-growth');

    const draw = registerCanvas('pseudospectrum-canvas', (ctx, width, height, p) => {
      const amount = Number(slider.value) / 100;
      const plot = drawGrid(ctx, width, height, p, { left: 45, right: 18, top: 20, bottom: 38 });
      const mapX = (x) => plot.x0 + (x + 2.8) / 3.6 * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (y + 1.8) / 3.6 * (plot.y1 - plot.y0);

      const levels = [0.28, 0.48, 0.72, 1.0];
      levels.forEach((scale, index) => {
        const centerX = -1.25 + amount * 0.34 * scale;
        const widthX = 0.22 + scale * (0.22 + amount * 0.72);
        const heightY = 0.18 + scale * 0.58;
        ctx.strokeStyle = [p.green, p.cyan, p.amber, p.coral][index];
        ctx.globalAlpha = 0.82;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 100; i += 1) {
          const angle = 2 * Math.PI * i / 100;
          const skew = amount * 0.24 * Math.pow(Math.cos(angle), 3);
          const x = centerX + widthX * Math.cos(angle) + skew;
          const y = heightY * Math.sin(angle) * (0.8 + 0.2 * Math.cos(angle));
          if (i === 0) ctx.moveTo(mapX(x), mapY(y));
          else ctx.lineTo(mapX(x), mapY(y));
        }
        ctx.closePath();
        ctx.stroke();
      });

      const eigenvalues = [
        { x: -1.9, y: 0.72 }, { x: -1.9, y: -0.72 },
        { x: -1.25, y: 0.22 }, { x: -1.25, y: -0.22 },
        { x: -0.72, y: 0 }
      ];
      eigenvalues.forEach((point) => {
        ctx.fillStyle = p.ink;
        ctx.beginPath();
        ctx.arc(mapX(point.x), mapY(point.y), 3.4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.coral;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(mapX(0), plot.y0);
      ctx.lineTo(mapX(0), plot.y1);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, 'Re(z)', plot.x1, plot.y1 + 23, p, 'right');
      label(ctx, 'Im(z)', plot.x0 - 7, plot.y0 - 7, p, 'left');
      label(ctx, '不稳定半平面', mapX(0) + 8, plot.y0 + 12, p, 'left', 9);
    });

    const update = () => {
      const amount = Number(slider.value) / 100;
      output.value = amount.toFixed(2);
      growth.textContent = `${(1 + 33.6 * amount * amount).toFixed(1)}×`;
      draw();
    };
    slider.addEventListener('input', update);
    update();
  }

  function initOperatorCanvases() {
    registerCanvas('input-function-canvas', (ctx, width, height, p) => {
      ctx.strokeStyle = p.line;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.72);
      ctx.lineTo(width, height * 0.72);
      ctx.stroke();
      ctx.strokeStyle = p.coral;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= 80; i += 1) {
        const t = i / 80;
        const x = t * width;
        const y = height * (0.58 - 0.22 * Math.sin(t * Math.PI * 2.6) * Math.exp(-t * 0.8));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    registerCanvas('output-function-canvas', (ctx, width, height, p) => {
      ctx.strokeStyle = p.line;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.72);
      ctx.lineTo(width, height * 0.72);
      ctx.stroke();
      ctx.strokeStyle = p.cyan;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= 80; i += 1) {
        const t = i / 80;
        const x = t * width;
        const y = height * (0.68 - 0.5 * t * (1 - t) - 0.08 * Math.sin(t * Math.PI * 4));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }

  function initQuadrature() {
    const slider = document.getElementById('quadrature-tol');
    const output = document.getElementById('quadrature-tol-output');
    const evalNode = document.getElementById('quadrature-evals');
    const valueNode = document.getElementById('quadrature-value');
    if (!slider) return;
    let result = null;

    const f = (x) => Math.exp(-55 * (x - 0.31) ** 2)
      + 0.18 * Math.sin(16 * Math.PI * x) ** 2
      + 0.12 / (1 + 420 * (x - 0.79) ** 2);

    const integrate = (tol) => {
      const cache = new Map();
      let evals = 0;
      const feval = (x) => {
        const key = x.toPrecision(16);
        if (!cache.has(key)) {
          cache.set(key, f(x));
          evals += 1;
        }
        return cache.get(key);
      };
      const accepted = [];
      const simp = (a, b, fa, fm, fb) => (b - a) * (fa + 4 * fm + fb) / 6;
      const recurse = (a, b, fa, fm, fb, whole, localTol, depth) => {
        const m = 0.5 * (a + b);
        const lm = 0.5 * (a + m);
        const rm = 0.5 * (m + b);
        const flm = feval(lm);
        const frm = feval(rm);
        const left = simp(a, m, fa, flm, fm);
        const right = simp(m, b, fm, frm, fb);
        const err = left + right - whole;
        if (depth >= 16 || Math.abs(err) <= 15 * localTol) {
          accepted.push([a, b, Math.abs(err) / 15]);
          return left + right + err / 15;
        }
        return recurse(a, m, fa, flm, fm, left, localTol / 2, depth + 1)
          + recurse(m, b, fm, frm, fb, right, localTol / 2, depth + 1);
      };
      const a = 0;
      const b = 1;
      const m = 0.5;
      const fa = feval(a);
      const fm = feval(m);
      const fb = feval(b);
      return { value: recurse(a, b, fa, fm, fb, simp(a, b, fa, fm, fb), tol, 0), evals, accepted };
    };

    const draw = registerCanvas('quadrature-canvas', (ctx, width, height, p) => {
      if (!result) return;
      const plot = drawGrid(ctx, width, height, p, { left: 46, right: 18, top: 18, bottom: 42 });
      const mapX = (x) => plot.x0 + x * (plot.x1 - plot.x0);
      const samples = Array.from({ length: 360 }, (_, i) => ({ x: i / 359, y: f(i / 359) }));
      const ymax = Math.max(...samples.map((v) => v.y)) * 1.08;
      const mapY = (y) => plot.y1 - y / ymax * (plot.y1 - plot.y0);

      ctx.save();
      result.accepted.forEach(([a, b], i) => {
        const x = mapX(a);
        const w = mapX(b) - x;
        ctx.fillStyle = i % 2 ? p.cyan : p.green;
        ctx.globalAlpha = 0.055;
        ctx.fillRect(x, plot.y0, Math.max(1, w), plot.y1 - plot.y0);
      });
      ctx.globalAlpha = 0.36;
      ctx.strokeStyle = p.lineStrong;
      result.accepted.forEach(([a]) => {
        ctx.beginPath();
        ctx.moveTo(mapX(a), plot.y0);
        ctx.lineTo(mapX(a), plot.y1);
        ctx.stroke();
      });
      ctx.restore();

      ctx.strokeStyle = p.coral;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      samples.forEach((v, i) => {
        const x = mapX(v.x);
        const y = mapY(v.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      label(ctx, 'x', plot.x1, plot.y1 + 25, p, 'right');
      label(ctx, 'f(x)', plot.x0 - 8, plot.y0 - 7, p, 'left');
      label(ctx, `${result.accepted.length} 个接受区间`, plot.x1, plot.y0 + 11, p, 'right', 9);
    });

    const update = () => {
      const power = Number(slider.value);
      const tol = 10 ** (-power);
      result = integrate(tol);
      output.value = `1e−${power}`;
      evalNode.textContent = String(result.evals);
      valueNode.textContent = result.value.toFixed(9);
      draw();
    };
    slider.addEventListener('input', update);
    update();
  }

  function initSpecialFunction() {
    const slider = document.getElementById('bessel-x');
    const output = document.getElementById('bessel-x-output');
    const breakNode = document.getElementById('bessel-break');
    const errorNode = document.getElementById('bessel-error');
    if (!slider) return;
    let data = null;

    const besselJ = (n, x) => {
      let term = 1;
      for (let k = 1; k <= n; k += 1) term *= (x / 2) / k;
      let sum = term;
      for (let m = 1; m < 220; m += 1) {
        term *= -(x * x / 4) / (m * (m + n));
        sum += term;
        if (Math.abs(term) < 1e-18 * Math.max(1, Math.abs(sum))) break;
      }
      return sum;
    };

    const compute = (x) => {
      const nmax = 34;
      const ref = Array.from({ length: nmax + 1 }, (_, n) => besselJ(n, x));
      const forward = Array(nmax + 1).fill(0);
      forward[0] = ref[0];
      forward[1] = ref[1] * (1 + 2e-13);
      for (let n = 1; n < nmax; n += 1) forward[n + 1] = 2 * n / x * forward[n] - forward[n - 1];
      const errors = ref.map((v, n) => Math.abs(forward[n] - v) / Math.max(Math.abs(v), 1e-300));
      return { ref, forward, errors };
    };

    const draw = registerCanvas('special-function-canvas', (ctx, width, height, p) => {
      if (!data) return;
      const plot = drawGrid(ctx, width, height, p, { left: 54, right: 18, top: 20, bottom: 42 });
      const nmax = data.errors.length - 1;
      const mapX = (n) => plot.x0 + n / nmax * (plot.x1 - plot.x0);
      const mapY = (v) => {
        const logv = Math.max(-16, Math.min(10, Math.log10(Math.max(v, 1e-16))));
        return plot.y1 - (logv + 16) / 26 * (plot.y1 - plot.y0);
      };
      ctx.strokeStyle = p.coral;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      data.errors.forEach((v, n) => {
        const x = mapX(n);
        const y = mapY(v);
        if (n === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = p.amber;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(plot.x0, mapY(1e-6));
      ctx.lineTo(plot.x1, mapY(1e-6));
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, '阶数 n', plot.x1, plot.y1 + 25, p, 'right');
      label(ctx, 'log₁₀ 相对误差', plot.x0 - 8, plot.y0 - 7, p, 'left');
      label(ctx, '1e−6', plot.x0 + 5, mapY(1e-6) - 8, p, 'left', 9);
      [-16, -12, -8, -4, 0, 4, 8].forEach((v) => label(ctx, String(v), plot.x0 - 8, mapY(10 ** v), p, 'right', 8));
    });

    const update = () => {
      const x = Number(slider.value) / 10;
      data = compute(x);
      const first = data.errors.findIndex((v) => v > 1e-6);
      const maxError = Math.max(...data.errors);
      output.value = x.toFixed(1);
      breakNode.textContent = first < 0 ? '> 34' : `n ≈ ${first}`;
      errorNode.textContent = maxError > 1e9 ? '> 1e9' : maxError.toExponential(1).replace('e+', 'e');
      draw();
    };
    slider.addEventListener('input', update);
    update();
  }

  function initOptimization() {
    const buttons = Array.from(document.querySelectorAll('[data-optimizer]'));
    const stepsNode = document.getElementById('optimization-steps');
    const gradNode = document.getElementById('optimization-grad');
    if (!buttons.length) return;
    let method = 'bfgs';
    let result = null;

    const value = ([x, y]) => 100 * (y - x * x) ** 2 + (1 - x) ** 2;
    const grad = ([x, y]) => [-400 * x * (y - x * x) - 2 * (1 - x), 200 * (y - x * x)];
    const norm = (v) => Math.hypot(...v);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
    const add = (x, d, a) => [x[0] + a * d[0], x[1] + a * d[1]];
    const lineSearch = (x, d, g) => {
      let direction = d;
      let gd = dot(g, direction);
      if (!(gd < 0)) {
        direction = [-g[0], -g[1]];
        gd = -dot(g, g);
      }
      const f0 = value(x);
      let alpha = 1;
      for (let i = 0; i < 28; i += 1) {
        if (value(add(x, direction, alpha)) <= f0 + 1e-4 * alpha * gd) break;
        alpha *= 0.5;
      }
      return { alpha, direction };
    };

    const solve = (name) => {
      let x = [-1.45, 1.65];
      let g = grad(x);
      let H = [[1, 0], [0, 1]];
      const path = [x.slice()];
      const maxIter = name === 'gradient' ? 900 : 120;
      let k = 0;
      for (; k < maxIter && norm(g) > 2e-6; k += 1) {
        let d;
        if (name === 'gradient') {
          d = [-g[0], -g[1]];
        } else if (name === 'bfgs') {
          d = [-(H[0][0] * g[0] + H[0][1] * g[1]), -(H[1][0] * g[0] + H[1][1] * g[1])];
        } else {
          const [xx, yy] = x;
          let a = 1200 * xx * xx - 400 * yy + 2;
          const b = -400 * xx;
          let c = 200;
          let damping = 0;
          let det = a * c - b * b;
          while ((det <= 1e-8 || a + damping <= 0 || c + damping <= 0) && damping < 1e6) {
            damping = damping === 0 ? 1e-3 : damping * 10;
            det = (a + damping) * (c + damping) - b * b;
          }
          a += damping;
          c += damping;
          det = a * c - b * b;
          d = [(-c * g[0] + b * g[1]) / det, (b * g[0] - a * g[1]) / det];
        }
        const ls = lineSearch(x, d, g);
        const xNew = add(x, ls.direction, ls.alpha);
        const gNew = grad(xNew);
        if (name === 'bfgs') {
          const s = [xNew[0] - x[0], xNew[1] - x[1]];
          const y = [gNew[0] - g[0], gNew[1] - g[1]];
          const ys = dot(y, s);
          if (ys > 1e-12) {
            const rho = 1 / ys;
            const IminusSY = [[1 - rho * s[0] * y[0], -rho * s[0] * y[1]], [-rho * s[1] * y[0], 1 - rho * s[1] * y[1]]];
            const IminusYS = [[1 - rho * y[0] * s[0], -rho * y[0] * s[1]], [-rho * y[1] * s[0], 1 - rho * y[1] * s[1]]];
            const mult = (A, B) => [[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]], [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]];
            const temp = mult(IminusSY, H);
            const updated = mult(temp, IminusYS);
            H = [[updated[0][0] + rho * s[0] * s[0], updated[0][1] + rho * s[0] * s[1]], [updated[1][0] + rho * s[1] * s[0], updated[1][1] + rho * s[1] * s[1]]];
          }
        }
        x = xNew;
        g = gNew;
        if (path.length < 180 || k % 5 === 0) path.push(x.slice());
      }
      return { path, steps: k, gradNorm: norm(g), x };
    };

    const draw = registerCanvas('optimization-canvas', (ctx, width, height, p) => {
      if (!result) return;
      const plot = drawGrid(ctx, width, height, p, { left: 45, right: 18, top: 18, bottom: 40 });
      const mapX = (x) => plot.x0 + (x + 2) / 4 * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (y + 0.7) / 3.8 * (plot.y1 - plot.y0);
      const nx = 72;
      const ny = 58;
      ctx.save();
      for (let iy = 0; iy < ny; iy += 1) {
        for (let ix = 0; ix < nx; ix += 1) {
          const x = -2 + 4 * (ix + 0.5) / nx;
          const y = -0.7 + 3.8 * (iy + 0.5) / ny;
          const z = Math.log10(1 + value([x, y]));
          ctx.fillStyle = z < 0.6 ? p.green : p.cyan;
          ctx.globalAlpha = 0.035 + 0.15 * Math.min(1, z / 4);
          const px0 = plot.x0 + ix / nx * (plot.x1 - plot.x0);
          const py0 = plot.y0 + iy / ny * (plot.y1 - plot.y0);
          ctx.fillRect(px0, py0, (plot.x1 - plot.x0) / nx + 1, (plot.y1 - plot.y0) / ny + 1);
        }
      }
      ctx.restore();
      ctx.strokeStyle = p.coral;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      result.path.forEach((v, i) => {
        if (i === 0) ctx.moveTo(mapX(v[0]), mapY(v[1]));
        else ctx.lineTo(mapX(v[0]), mapY(v[1]));
      });
      ctx.stroke();
      result.path.forEach((v, i) => {
        if (i % Math.max(1, Math.floor(result.path.length / 18)) !== 0 && i !== result.path.length - 1) return;
        ctx.fillStyle = i === result.path.length - 1 ? p.green : p.amber;
        ctx.beginPath();
        ctx.arc(mapX(v[0]), mapY(v[1]), i === result.path.length - 1 ? 4.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      label(ctx, 'x', plot.x1, plot.y1 + 24, p, 'right');
      label(ctx, 'y', plot.x0 - 8, plot.y0 - 7, p, 'left');
      label(ctx, '极小点 (1,1)', mapX(1) + 8, mapY(1) - 13, p, 'left', 9);
    });

    const update = (name) => {
      method = name;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.optimizer === name)));
      result = solve(name);
      stepsNode.textContent = String(result.steps);
      gradNode.textContent = result.gradNorm.toExponential(1).replace('e-', 'e−');
      draw();
    };
    buttons.forEach((button) => button.addEventListener('click', () => update(button.dataset.optimizer)));
    update(method);
  }

  function initMeshQuality() {
    const slider = document.getElementById('mesh-distortion');
    const output = document.getElementById('mesh-distortion-output');
    const jacNode = document.getElementById('mesh-jacobian');
    const aspectNode = document.getElementById('mesh-aspect');
    if (!slider) return;
    let mesh = null;

    const build = (amount) => {
      const n = 5;
      const nodes = Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, i) => ({ x: i / (n - 1), y: j / (n - 1) })));
      nodes[2][2] = { x: 0.5 + 0.34 * amount, y: 0.5 - 0.30 * amount };
      const cells = [];
      const ideal = (1 / (n - 1) / 2) ** 2;
      for (let j = 0; j < n - 1; j += 1) {
        for (let i = 0; i < n - 1; i += 1) {
          const p00 = nodes[j][i];
          const p10 = nodes[j][i + 1];
          const p11 = nodes[j + 1][i + 1];
          const p01 = nodes[j + 1][i];
          const dxXi = 0.25 * (-p00.x + p10.x + p11.x - p01.x);
          const dyXi = 0.25 * (-p00.y + p10.y + p11.y - p01.y);
          const dxEta = 0.25 * (-p00.x - p10.x + p11.x + p01.x);
          const dyEta = 0.25 * (-p00.y - p10.y + p11.y + p01.y);
          const det = (dxXi * dyEta - dxEta * dyXi) / ideal;
          const points = [p00, p10, p11, p01];
          const lengths = points.map((a, k) => {
            const b = points[(k + 1) % 4];
            return Math.hypot(a.x - b.x, a.y - b.y);
          });
          cells.push({ points, det, aspect: Math.max(...lengths) / Math.max(1e-12, Math.min(...lengths)) });
        }
      }
      return { nodes, cells };
    };

    const draw = registerCanvas('mesh-quality-canvas', (ctx, width, height, p) => {
      if (!mesh) return;
      const pad = 42;
      const mapX = (x) => pad + x * (width - 2 * pad);
      const mapY = (y) => height - pad - y * (height - 2 * pad);
      mesh.cells.forEach((cell) => {
        ctx.beginPath();
        cell.points.forEach((v, i) => {
          const x = mapX(v.x);
          const y = mapY(v.y);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = cell.det <= 0 ? p.coral : (cell.det < 0.45 ? p.amber : p.cyan);
        ctx.globalAlpha = cell.det <= 0 ? 0.28 : 0.08 + 0.12 * Math.min(1, 1 / Math.max(0.15, cell.aspect));
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = cell.det <= 0 ? p.coral : p.lineStrong;
        ctx.lineWidth = cell.det <= 0 ? 2.2 : 1;
        ctx.stroke();
      });
      mesh.nodes.flat().forEach((v) => {
        ctx.fillStyle = p.ink;
        ctx.beginPath();
        ctx.arc(mapX(v.x), mapY(v.y), 2.3, 0, Math.PI * 2);
        ctx.fill();
      });
      const center = mesh.nodes[2][2];
      ctx.fillStyle = p.coral;
      ctx.beginPath();
      ctx.arc(mapX(center.x), mapY(center.y), 5, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, '移动节点', mapX(center.x) + 9, mapY(center.y) - 11, p, 'left', 9);
    });

    const update = () => {
      const amount = Number(slider.value) / 100;
      mesh = build(amount);
      const minDet = Math.min(...mesh.cells.map((c) => c.det));
      const maxAspect = Math.max(...mesh.cells.map((c) => c.aspect));
      output.value = amount.toFixed(2);
      jacNode.textContent = minDet.toFixed(3);
      aspectNode.textContent = maxAspect.toFixed(2);
      draw();
    };
    slider.addEventListener('input', update);
    update();
  }

  function initIntegralTree() {
    const slider = document.getElementById('tree-opening');
    const output = document.getElementById('tree-opening-output');
    const directNode = document.getElementById('tree-direct');
    const groupsNode = document.getElementById('tree-groups');
    if (!slider) return;
    const frac = (x) => x - Math.floor(x);
    const points = Array.from({ length: 92 }, (_, i) => ({
      x: 0.04 + 0.88 * frac(Math.sin((i + 1) * 12.9898) * 43758.5453),
      y: 0.04 + 0.88 * frac(Math.sin((i + 1) * 78.233) * 12345.6789)
    }));
    const target = { x: 0.82, y: 0.72 };
    let traversal = null;

    const buildNode = (indices, x0, y0, x1, y1, depth = 0) => {
      const node = { indices, x0, y0, x1, y1, depth, children: [] };
      if (indices.length <= 4 || depth >= 7) return node;
      const mx = 0.5 * (x0 + x1);
      const my = 0.5 * (y0 + y1);
      const boxes = [[x0, y0, mx, my], [mx, y0, x1, my], [x0, my, mx, y1], [mx, my, x1, y1]];
      boxes.forEach((box) => {
        const ids = indices.filter((id) => {
          const q = points[id];
          return q.x >= box[0] && q.x <= box[2] && q.y >= box[1] && q.y <= box[3];
        });
        if (ids.length) node.children.push(buildNode(ids, ...box, depth + 1));
      });
      return node;
    };
    const rootNode = buildNode(points.map((_, i) => i), 0, 0, 1, 1);

    const traverse = (theta) => {
      const groups = [];
      const direct = [];
      const visit = (node) => {
        const cx = 0.5 * (node.x0 + node.x1);
        const cy = 0.5 * (node.y0 + node.y1);
        const size = Math.max(node.x1 - node.x0, node.y1 - node.y0);
        const dist = Math.hypot(cx - target.x, cy - target.y);
        const containsTarget = target.x >= node.x0 && target.x <= node.x1 && target.y >= node.y0 && target.y <= node.y1;
        if (!containsTarget && node.indices.length > 4 && size / Math.max(dist, 1e-12) < theta) {
          groups.push(node);
        } else if (!node.children.length) {
          direct.push(...node.indices);
        } else {
          node.children.forEach(visit);
        }
      };
      visit(rootNode);
      return { groups, direct: [...new Set(direct)] };
    };

    const draw = registerCanvas('integral-tree-canvas', (ctx, width, height, p) => {
      if (!traversal) return;
      const pad = 30;
      const mapX = (x) => pad + x * (width - 2 * pad);
      const mapY = (y) => height - pad - y * (height - 2 * pad);
      points.forEach((q) => {
        ctx.fillStyle = p.lineStrong;
        ctx.globalAlpha = 0.62;
        ctx.beginPath();
        ctx.arc(mapX(q.x), mapY(q.y), 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      traversal.groups.forEach((node) => {
        const x = mapX(node.x0);
        const y = mapY(node.y1);
        const w = mapX(node.x1) - x;
        const h = mapY(node.y0) - y;
        ctx.strokeStyle = p.green;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        const cx = 0.5 * (node.x0 + node.x1);
        const cy = 0.5 * (node.y0 + node.y1);
        ctx.fillStyle = p.green;
        ctx.beginPath();
        ctx.arc(mapX(cx), mapY(cy), 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.moveTo(mapX(target.x), mapY(target.y));
        ctx.lineTo(mapX(cx), mapY(cy));
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
      traversal.direct.forEach((id) => {
        const q = points[id];
        ctx.fillStyle = p.coral;
        ctx.beginPath();
        ctx.arc(mapX(q.x), mapY(q.y), 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = p.amber;
      ctx.lineWidth = 2;
      const tx = mapX(target.x);
      const ty = mapY(target.y);
      ctx.beginPath();
      ctx.moveTo(tx - 7, ty); ctx.lineTo(tx + 7, ty);
      ctx.moveTo(tx, ty - 7); ctx.lineTo(tx, ty + 7);
      ctx.stroke();
      label(ctx, '目标点', tx - 8, ty - 13, p, 'right', 9);
      label(ctx, '绿色框：远场分组；红点：近场逐点', pad, height - 13, p, 'left', 9);
    });

    const update = () => {
      const theta = Number(slider.value) / 100;
      traversal = traverse(theta);
      output.value = theta.toFixed(2);
      directNode.textContent = String(traversal.direct.length);
      groupsNode.textContent = String(traversal.groups.length);
      draw();
    };
    slider.addEventListener('input', update);
    update();
  }

  function initPIC() {
    const buttons = Array.from(document.querySelectorAll('[data-pic]'));
    const slider = document.getElementById('particle-position');
    const output = document.getElementById('particle-position-output');
    const supportNode = document.getElementById('pic-support');
    const chargeNode = document.getElementById('pic-charge');
    if (!buttons.length || !slider) return;
    let method = 'cic';
    let weights = [];

    const computeWeights = (x) => {
      const values = Array(9).fill(0);
      if (method === 'ngp') {
        values[Math.max(0, Math.min(8, Math.round(x)))] = 1;
      } else if (method === 'cic') {
        const i = Math.floor(x);
        values[i] += i + 1 - x;
        values[i + 1] += x - i;
      } else {
        for (let i = 0; i <= 8; i += 1) {
          const r = Math.abs(x - i);
          if (r < 0.5) values[i] = 0.75 - r * r;
          else if (r < 1.5) values[i] = 0.5 * (1.5 - r) ** 2;
        }
        const sum = values.reduce((a, b) => a + b, 0);
        values.forEach((_, i) => { values[i] /= sum; });
      }
      return values;
    };

    const draw = registerCanvas('pic-canvas', (ctx, width, height, p) => {
      const xParticle = Number(slider.value) / 100;
      const left = 48;
      const right = width - 25;
      const base = height * 0.72;
      const mapX = (x) => left + x / 8 * (right - left);
      ctx.strokeStyle = p.lineStrong;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(left, base);
      ctx.lineTo(right, base);
      ctx.stroke();
      weights.forEach((w, i) => {
        const x = mapX(i);
        const barH = w * height * 0.42;
        ctx.fillStyle = w > 0 ? p.cyan : p.line;
        ctx.globalAlpha = w > 0 ? 0.55 : 0.28;
        ctx.fillRect(x - 12, base - barH, 24, barH);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.lineStrong;
        ctx.beginPath();
        ctx.moveTo(x, base - 5);
        ctx.lineTo(x, base + 6);
        ctx.stroke();
        label(ctx, String(i), x, base + 19, p, 'center', 9);
        if (w > 1e-12) label(ctx, w.toFixed(3), x, base - barH - 10, p, 'center', 8);
      });
      const px = mapX(xParticle);
      ctx.fillStyle = p.coral;
      ctx.beginPath();
      ctx.arc(px, height * 0.19, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.coral;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(px, height * 0.19 + 9);
      ctx.lineTo(px, base);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, `xₚ=${xParticle.toFixed(2)}`, px + 10, height * 0.19 - 10, p, 'left', 9);
    });

    const update = () => {
      const x = Number(slider.value) / 100;
      weights = computeWeights(x);
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pic === method)));
      output.value = x.toFixed(2);
      supportNode.textContent = String(weights.filter((w) => w > 1e-12).length);
      chargeNode.textContent = weights.reduce((a, b) => a + b, 0).toFixed(3);
      draw();
    };
    buttons.forEach((button) => button.addEventListener('click', () => { method = button.dataset.pic; update(); }));
    slider.addEventListener('input', update);
    update();
  }

  function initCoupling() {
    const buttons = Array.from(document.querySelectorAll('[data-coupling]'));
    const slider = document.getElementById('coupling-strength');
    const output = document.getElementById('coupling-strength-output');
    const iterNode = document.getElementById('coupling-iterations');
    const omegaNode = document.getElementById('coupling-omega');
    if (!buttons.length || !slider) return;
    let method = 'aitken';
    let history = null;

    const simulate = (q) => {
      const G = (x) => q * Math.cos(x) + 0.16;
      let x = 1.85;
      let omega = method === 'relax' ? 0.48 : 1;
      let prevR = null;
      let prevOmega = omega;
      const residuals = [];
      const omegas = [];
      for (let k = 0; k < 55; k += 1) {
        const r = G(x) - x;
        residuals.push(Math.abs(r));
        if (Math.abs(r) < 1e-11) break;
        if (method === 'aitken' && prevR !== null) {
          const denom = r - prevR;
          if (Math.abs(denom) > 1e-14) omega = Math.max(-1.6, Math.min(1.6, -prevOmega * prevR / denom));
        } else if (method === 'plain') omega = 1;
        else if (method === 'relax') omega = 0.48;
        omegas.push(omega);
        x += omega * r;
        prevR = r;
        prevOmega = omega;
      }
      return { residuals, omegas, omega };
    };

    const draw = registerCanvas('coupling-canvas', (ctx, width, height, p) => {
      if (!history) return;
      const plot = drawGrid(ctx, width, height, p, { left: 54, right: 18, top: 20, bottom: 42 });
      const nmax = Math.max(12, history.residuals.length - 1);
      const mapX = (k) => plot.x0 + k / nmax * (plot.x1 - plot.x0);
      const mapY = (r) => {
        const v = Math.max(-11, Math.min(0, Math.log10(Math.max(r, 1e-11))));
        return plot.y1 - (v + 11) / 11 * (plot.y1 - plot.y0);
      };
      ctx.strokeStyle = p.coral;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      history.residuals.forEach((r, k) => {
        const x = mapX(k);
        const y = mapY(r);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = p.green;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(plot.x0, mapY(1e-6));
      ctx.lineTo(plot.x1, mapY(1e-6));
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, '耦合迭代 k', plot.x1, plot.y1 + 25, p, 'right');
      label(ctx, 'log₁₀ |rₖ|', plot.x0 - 8, plot.y0 - 7, p, 'left');
      label(ctx, '1e−6', plot.x0 + 6, mapY(1e-6) - 8, p, 'left', 9);
    });

    const update = () => {
      const q = Number(slider.value) / 100;
      history = simulate(q);
      const hit = history.residuals.findIndex((r) => r < 1e-6);
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.coupling === method)));
      output.value = q.toFixed(2);
      iterNode.textContent = hit < 0 ? '> 54' : `${hit} 步`;
      omegaNode.textContent = (history.omegas.at(-1) ?? 1).toFixed(3);
      draw();
    };
    buttons.forEach((button) => button.addEventListener('click', () => { method = button.dataset.coupling; update(); }));
    slider.addEventListener('input', update);
    update();
  }

  function initRoofline() {
    const buttons = Array.from(document.querySelectorAll('[data-kernel]'));
    const slider = document.getElementById('machine-balance');
    const output = document.getElementById('machine-balance-output');
    const intensityNode = document.getElementById('roofline-intensity');
    const boundNode = document.getElementById('roofline-bound');
    if (!buttons.length || !slider) return;
    const kernels = {
      spmv: { name: 'SpMV', intensity: 0.18, efficiency: 0.62 },
      fft: { name: 'FFT', intensity: 1.35, efficiency: 0.48 },
      stencil: { name: 'Stencil', intensity: 0.55, efficiency: 0.70 },
      gemm: { name: 'GEMM', intensity: 48, efficiency: 0.86 }
    };
    let kernel = 'spmv';

    const draw = registerCanvas('roofline-canvas', (ctx, width, height, p) => {
      const balance = Number(slider.value);
      const peak = 1000;
      const bandwidth = peak / balance;
      const item = kernels[kernel];
      const plot = drawGrid(ctx, width, height, p, { left: 58, right: 18, top: 20, bottom: 45 });
      const lx0 = Math.log10(0.05);
      const lx1 = Math.log10(100);
      const ly0 = Math.log10(1);
      const ly1 = Math.log10(1600);
      const mapX = (x) => plot.x0 + (Math.log10(x) - lx0) / (lx1 - lx0) * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (Math.log10(y) - ly0) / (ly1 - ly0) * (plot.y1 - plot.y0);
      ctx.strokeStyle = p.cyan;
      ctx.lineWidth = 2.7;
      ctx.beginPath();
      for (let i = 0; i <= 160; i += 1) {
        const x = 10 ** (lx0 + (lx1 - lx0) * i / 160);
        const y = Math.min(peak, bandwidth * x);
        if (i === 0) ctx.moveTo(mapX(x), mapY(y));
        else ctx.lineTo(mapX(x), mapY(y));
      }
      ctx.stroke();
      const attainable = Math.min(peak, bandwidth * item.intensity) * item.efficiency;
      ctx.fillStyle = p.coral;
      ctx.beginPath();
      ctx.arc(mapX(item.intensity), mapY(attainable), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.coral;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mapX(item.intensity), mapY(attainable));
      ctx.lineTo(mapX(item.intensity), plot.y1);
      ctx.stroke();
      ctx.setLineDash([]);
      [0.1, 1, 10, 100].forEach((v) => label(ctx, String(v), mapX(v), plot.y1 + 17, p, 'center', 8));
      [1, 10, 100, 1000].forEach((v) => label(ctx, String(v), plot.x0 - 8, mapY(v), p, 'right', 8));
      label(ctx, '算术强度 [flop/byte]', plot.x1, plot.y1 + 32, p, 'right');
      label(ctx, '性能 [GFLOP/s]', plot.x0 - 8, plot.y0 - 8, p, 'left');
      label(ctx, item.name, mapX(item.intensity) + 9, mapY(attainable) - 10, p, 'left', 9);
      label(ctx, `平衡点 ${balance}`, mapX(balance), mapY(peak) + 15, p, 'center', 9);
    });

    const update = () => {
      const balance = Number(slider.value);
      const item = kernels[kernel];
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kernel === kernel)));
      output.value = `${balance} flop/byte`;
      intensityNode.textContent = `${item.intensity} flop/byte`;
      boundNode.textContent = item.intensity < balance ? '内存带宽' : '计算吞吐';
      draw();
    };
    buttons.forEach((button) => button.addEventListener('click', () => { kernel = button.dataset.kernel; update(); }));
    slider.addEventListener('input', update);
    update();
  }

  const methodAdvisorData = window.__methodAdvisorData || {};

  function initMethodAdvisor() {
    const domainButtons = Array.from(document.querySelectorAll('[data-advisor-domain]'));
    const optionsNode = document.getElementById('advisor-options');
    const resultNode = document.getElementById('advisor-result');
    if (!domainButtons.length || !optionsNode || !resultNode) return;

    const pathNode = document.getElementById('advisor-path');
    const titleNode = document.getElementById('advisor-title');
    const summaryNode = document.getElementById('advisor-summary');
    const startNode = document.getElementById('advisor-start');
    const upgradeNode = document.getElementById('advisor-upgrade');
    const checksNode = document.getElementById('advisor-checks');
    const chaptersNode = document.getElementById('advisor-chapters');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const preferred = { linear: 'matrixfree' };
    let activeDomain = 'linear';
    let activeOption = preferred.linear;
    let updateTimer = null;

    const listHTML = (items) => `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
    const chapterLinkHTML = (number) => {
      const topic = document.getElementById(`topic-${number}`);
      const route = window.__numericalMethodsChapters?.[number];
      const title = topic?.querySelector('.topic-title h2')?.textContent?.trim() || route?.title || `第 ${number} 章`;
      const shortTitle = title.length > 18 ? `${title.slice(0, 18)}…` : title;
      const href = topic ? `#topic-${number}` : route?.href || `#topic-${number}`;
      return `<a href="${href}"><span>${String(number).padStart(2, '0')}</span>${shortTitle}</a>`;
    };

    const paintResult = (option) => {
      const domain = methodAdvisorData[activeDomain];
      pathNode.textContent = `${domain.label} / ${option.label}`;
      titleNode.textContent = option.title;
      summaryNode.textContent = option.summary;
      startNode.innerHTML = listHTML(option.start);
      upgradeNode.innerHTML = listHTML(option.upgrade);
      checksNode.innerHTML = option.checks.map((item) => `<li>${item}</li>`).join('');
      chaptersNode.innerHTML = option.chapters.map(chapterLinkHTML).join('');
    };

    const selectOption = (optionId, animate = true) => {
      const domain = methodAdvisorData[activeDomain];
      const option = domain.options.find((item) => item.id === optionId) || domain.options[0];
      activeOption = option.id;
      optionsNode.querySelectorAll('button').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.advisorOption === activeOption));
      });
      if (updateTimer) window.clearTimeout(updateTimer);
      if (!animate || reduceMotion) {
        paintResult(option);
        resultNode.classList.remove('is-updating');
        return;
      }
      resultNode.classList.add('is-updating');
      updateTimer = window.setTimeout(() => {
        paintResult(option);
        resultNode.classList.remove('is-updating');
      }, 115);
    };

    const renderOptions = (domainName, animate = true) => {
      activeDomain = domainName;
      const domain = methodAdvisorData[activeDomain];
      domainButtons.forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.advisorDomain === activeDomain));
      });
      optionsNode.innerHTML = domain.options.map((option) => (
        `<button type="button" data-advisor-option="${option.id}" aria-pressed="false">${option.label}</button>`
      )).join('');
      optionsNode.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => selectOption(button.dataset.advisorOption));
      });
      const nextOption = preferred[activeDomain] || domain.options[0].id;
      selectOption(nextOption, animate);
    };

    domainButtons.forEach((button) => {
      button.addEventListener('click', () => renderOptions(button.dataset.advisorDomain));
    });
    renderOptions('linear', false);
  }

  function initReveal() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const nodes = Array.from(document.querySelectorAll(
      '.map-part, .advisor-shell, .part-intro, .topic, .application-rows > div, .reference-list li'
    ));
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        currentObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -9% 0px', threshold: 0.025 });

    nodes.forEach((node, index) => {
      node.classList.add('reveal-ready');
      node.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 45}ms`);
      observer.observe(node);
    });
  }

  function initCanvases() {
    const specs = [
      ['hero-canvas', initHero, true],
      ['roundoff-canvas', initRoundoff],
      ['interpolation-canvas', initInterpolation],
      ['factorization-canvas', initFactorization],
      ['stability-canvas', initStability],
      ['pde-canvas', initPDE],
      ['xpoint-canvas', initXPoint],
      ['posterior-canvas', initPosterior],
      ['input-function-canvas', initOperatorCanvases],
      ['quadrature-canvas', initQuadrature],
      ['optimization-canvas', initOptimization],
      ['pic-canvas', initPIC],
      ['coupling-canvas', initCoupling],
      ['roofline-canvas', initRoofline]
    ];
    const started = new Set();
    const start = (id, init) => {
      if (started.has(id)) return;
      started.add(id);
      init();
    };

    specs.filter(([, , immediate]) => immediate).forEach(([id, init]) => start(id, init));
    const deferred = specs.filter(([, , immediate]) => !immediate);
    if (!('IntersectionObserver' in window)) {
      deferred.forEach(([id, init]) => start(id, init));
      return;
    }

    const observer = new IntersectionObserver((entries, current) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        const spec = deferred.find(([targetId]) => targetId === id);
        if (spec) start(spec[0], spec[1]);
        current.unobserve(entry.target);
      });
    }, { rootMargin: '1200px 0px', threshold: 0 });

    deferred.forEach(([id, init]) => {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
    });
  }


  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initHeaderAndProgress();
    initDrawer();
    initMethodAdvisor();
    initFilters();
    initTopicObserver();
    initMultirate();
    initReveal();
    initCanvases();
    refreshIcons();
  });
})();
