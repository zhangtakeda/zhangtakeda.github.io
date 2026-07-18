(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const palette = () => ({
    ink: css('--ink') || '#111416',
    muted: css('--muted') || '#5d6568',
    paper: css('--paper') || '#f6f7f5',
    surface: css('--surface') || '#ffffff',
    surface2: css('--surface-2') || '#ecefec',
    line: css('--line') || '#cfd5d2',
    lineStrong: css('--line-strong') || '#929b98',
    cyan: css('--cyan') || '#008da6',
    coral: css('--coral') || '#f06449',
    amber: css('--amber') || '#e2a72e',
    green: css('--green') || '#3c936f',
    violet: css('--violet') || '#6d63a8'
  });

  function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const width = rect.width;
    const height = rect.height;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return { ctx, width, height, p: palette() };
  }

  function label(ctx, text, x, y, p, align = 'left', size = 11.5, weight = 600) {
    const canvasWidth = ctx.canvas?.getBoundingClientRect().width || 480;
    const sizeFloor = canvasWidth < 360 ? 11.5 : canvasWidth < 520 ? 12 : 12.6;
    const legibleSize = Math.max(sizeFloor, Math.min(18, (Number(size) || 11.5) * 1.08));
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = 0.84;
    ctx.font = `${weight} ${legibleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawGrid(ctx, width, height, p, margins = {}) {
    const x0 = margins.left ?? 52;
    const x1 = width - (margins.right ?? 18);
    const y0 = margins.top ?? 18;
    const y1 = height - (margins.bottom ?? 40);
    ctx.save();
    ctx.strokeStyle = p.line;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const x = x0 + (x1 - x0) * i / 5;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    }
    for (let j = 0; j <= 4; j += 1) {
      const y = y0 + (y1 - y0) * j / 4;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.lineStrong;
    ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke();
    ctx.restore();
    return { x0, x1, y0, y1 };
  }

  function watch(canvas, draw) {
    if (!canvas) return draw;
    if (window.__canvasRuntime?.attach) return window.__canvasRuntime.attach(canvas, draw);
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(canvas);
    schedule();
    return schedule;
  }

  function polyline(ctx, points, stroke, width = 2, dash = []) {
    if (!points.length) return;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach((q, i) => {
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function formatExp(value, digits = 1) {
    if (!Number.isFinite(value)) return '—';
    if (value === 0) return '0';
    return value.toExponential(digits).replace('e+', 'e').replace('-', '−');
  }

  /* ---------- Householder QR fitting ---------- */
  function initAuditedFitting() {
    const canvas = $('fitting-canvas');
    const degreeSlider = $('fit-degree');
    const lambdaSlider = $('fit-lambda');
    if (!canvas || !degreeSlider || !lambdaSlider) return;

    const truth = (x) => 0.65 * Math.sin(2.5 * x) + 0.24 * Math.cos(5.2 * x) + 0.12 * x;
    const xs = Array.from({ length: 34 }, (_, i) => -1 + 2 * i / 33);
    const noise = (i) => 0.16 * (2 * (((Math.sin((i + 3) * 91.731) * 43758.5453) % 1 + 1) % 1) - 1);
    const ys = xs.map((x, i) => truth(x) + noise(i));
    let coeffs = [];

    const basis = (x, degree) => {
      const t = new Array(degree + 1).fill(0);
      t[0] = 1;
      if (degree >= 1) t[1] = x;
      for (let k = 2; k <= degree; k += 1) t[k] = 2 * x * t[k - 1] - t[k - 2];
      return t;
    };

    function householderSolve(Ain, bin) {
      const A = Ain.map((row) => row.slice());
      const b = bin.slice();
      const m = A.length;
      const n = A[0].length;
      for (let k = 0; k < n; k += 1) {
        let norm = 0;
        for (let i = k; i < m; i += 1) norm = Math.hypot(norm, A[i][k]);
        if (norm < 1e-15) continue;
        const alpha = A[k][k] >= 0 ? -norm : norm;
        const v = new Array(m - k);
        for (let i = k; i < m; i += 1) v[i - k] = A[i][k];
        v[0] -= alpha;
        let vv = 0;
        for (const q of v) vv += q * q;
        if (vv < 1e-30) continue;
        const beta = 2 / vv;
        for (let j = k; j < n; j += 1) {
          let dot = 0;
          for (let i = k; i < m; i += 1) dot += v[i - k] * A[i][j];
          dot *= beta;
          for (let i = k; i < m; i += 1) A[i][j] -= dot * v[i - k];
        }
        let dotb = 0;
        for (let i = k; i < m; i += 1) dotb += v[i - k] * b[i];
        dotb *= beta;
        for (let i = k; i < m; i += 1) b[i] -= dotb * v[i - k];
        A[k][k] = alpha;
        for (let i = k + 1; i < m; i += 1) A[i][k] = 0;
      }
      const x = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i -= 1) {
        let rhs = b[i];
        for (let j = i + 1; j < n; j += 1) rhs -= A[i][j] * x[j];
        x[i] = Math.abs(A[i][i]) < 1e-14 ? 0 : rhs / A[i][i];
      }
      return x;
    }

    function compute() {
      const degree = Number(degreeSlider.value);
      const logLambda = Number(lambdaSlider.value);
      const lambda = 10 ** logLambda;
      const n = degree + 1;
      const A = [];
      const b = [];
      xs.forEach((x, i) => { A.push(basis(x, degree)); b.push(ys[i]); });
      const root = Math.sqrt(lambda);
      for (let j = 0; j < n; j += 1) {
        const row = new Array(n).fill(0); row[j] = root;
        A.push(row); b.push(0);
      }
      coeffs = householderSolve(A, b);
      const evalFit = (x) => basis(x, degree).reduce((s, q, i) => s + q * coeffs[i], 0);
      const train = Math.sqrt(xs.reduce((s, x, i) => s + (evalFit(x) - ys[i]) ** 2, 0) / xs.length);
      let valid = 0;
      const nv = 320;
      for (let i = 0; i < nv; i += 1) {
        const x = -0.995 + 1.99 * i / (nv - 1);
        valid += (evalFit(x) - truth(x)) ** 2;
      }
      valid = Math.sqrt(valid / nv);
      $('fit-degree-output').value = String(degree);
      $('fit-lambda-output').value = String(logLambda).replace('-', '−');
      $('fit-train').textContent = train.toFixed(3);
      $('fit-valid').textContent = valid.toFixed(3);
      return { degree, evalFit };
    }

    let model = compute();
    function draw() {
      model = compute();
      const state = prepareCanvas(canvas); if (!state) return;
      const { ctx, width, height, p } = state;
      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);
      const plot = drawGrid(ctx, width, height, p, { left: 47, right: 18, top: 24, bottom: 40 });
      const mapX = (x) => plot.x0 + (x + 1) * 0.5 * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (y + 1.25) / 2.5 * (plot.y1 - plot.y0);
      const truthPts = [], fitPts = [];
      for (let i = 0; i <= 360; i += 1) {
        const x = -1 + 2 * i / 360;
        truthPts.push({ x: mapX(x), y: mapY(truth(x)) });
        fitPts.push({ x: mapX(x), y: mapY(model.evalFit(x)) });
      }
      polyline(ctx, truthPts, p.lineStrong, 1.8, [5, 4]);
      polyline(ctx, fitPts, p.coral, 2.5);
      xs.forEach((x, i) => {
        ctx.fillStyle = p.cyan;
        ctx.beginPath(); ctx.arc(mapX(x), mapY(ys[i]), 2.8, 0, Math.PI * 2); ctx.fill();
      });
      label(ctx, 'x', plot.x1, plot.y1 + 24, p, 'right');
      label(ctx, 'y', plot.x0 - 7, plot.y0 - 8, p, 'left');
      label(ctx, '虚线：无噪声真值', plot.x0 + 8, plot.y0 + 12, p, 'left', 9);
      label(ctx, '红线：Householder QR + ridge', plot.x0 + 8, plot.y0 + 28, p, 'left', 9);
    }
    const schedule = watch(canvas, draw);
    degreeSlider.addEventListener('input', schedule);
    lambdaSlider.addEventListener('input', schedule);
  }

  /* ---------- FFT with window-aware main-lobe accounting ---------- */
  function fftRadix2(real, imag) {
    const n = real.length;
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const angle = -2 * Math.PI / len;
      const wr0 = Math.cos(angle), wi0 = Math.sin(angle);
      for (let base = 0; base < n; base += len) {
        let wr = 1, wi = 0;
        for (let j = 0; j < len / 2; j += 1) {
          const ur = real[base + j], ui = imag[base + j];
          const k = base + j + len / 2;
          const vr = real[k] * wr - imag[k] * wi;
          const vi = real[k] * wi + imag[k] * wr;
          real[base + j] = ur + vr; imag[base + j] = ui + vi;
          real[k] = ur - vr; imag[k] = ui - vi;
          const next = wr * wr0 - wi * wi0;
          wi = wr * wi0 + wi * wr0; wr = next;
        }
      }
    }
  }

  function initAuditedFFT() {
    const canvas = $('fft-canvas'), freqSlider = $('fft-freq'), sizeSlider = $('fft-size');
    if (!canvas || !freqSlider || !sizeSlider) return;
    const buttons = [...document.querySelectorAll('[data-window]')];
    let windowName = buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.window || 'rect';

    const win = (j, n) => {
      if (windowName === 'hann') return 0.5 - 0.5 * Math.cos(2 * Math.PI * j / (n - 1));
      if (windowName === 'blackman') return 0.42 - 0.5 * Math.cos(2 * Math.PI * j / (n - 1)) + 0.08 * Math.cos(4 * Math.PI * j / (n - 1));
      return 1;
    };

    function compute() {
      const n = 2 ** Number(sizeSlider.value);
      const frequency = Number(freqSlider.value) / 10;
      const signal = Array.from({ length: n }, (_, j) => Math.sin(2 * Math.PI * frequency * j / n));
      const real = signal.map((v, j) => v * win(j, n));
      const imag = new Array(n).fill(0);
      fftRadix2(real, imag);
      const coherentGain = Array.from({ length: n }, (_, j) => win(j, n)).reduce((a, b) => a + b, 0);
      const mag = real.slice(0, n / 2).map((r, k) => 2 * Math.hypot(r, imag[k]) / Math.max(coherentGain, 1e-15));
      let peak = 1;
      for (let k = 2; k < mag.length; k += 1) if (mag[k] > mag[peak]) peak = k;
      const halfWidth = { rect: 1, hann: 2, blackman: 3 }[windowName] ?? 1;
      const power = mag.reduce((s, v) => s + v * v, 0);
      let main = 0;
      for (let k = Math.max(0, peak - halfWidth); k <= Math.min(mag.length - 1, peak + halfWidth); k += 1) main += mag[k] ** 2;
      const leakage = Math.max(0, 1 - main / Math.max(power, 1e-30));
      $('fft-freq-output').value = frequency.toFixed(1);
      $('fft-size-output').value = String(n);
      $('fft-bin').textContent = String(peak);
      $('fft-leak').textContent = `${(100 * leakage).toFixed(2)}%`;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.window === windowName)));
      return { n, frequency, signal, mag, peak, halfWidth };
    }

    let data = compute();
    function draw() {
      data = compute();
      const state = prepareCanvas(canvas); if (!state) return;
      const { ctx, width, height, p } = state;
      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);

      const left = width < 380 ? 45 : 54;
      const right = 18;
      const top = 20;
      const mid = height * 0.48;
      const timeBottom = mid - 24;
      const spectrumTop = mid + 28;
      const bottom = height - 40;
      const plotWidth = width - left - right;

      // Two restrained plot frames keep the visual hierarchy of the earlier version.
      ctx.save();
      ctx.strokeStyle = p.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, top); ctx.lineTo(left, timeBottom); ctx.lineTo(width - right, timeBottom);
      ctx.moveTo(left, spectrumTop); ctx.lineTo(left, bottom); ctx.lineTo(width - right, bottom);
      ctx.stroke();
      ctx.restore();

      // Time trace.
      const timeCenter = (top + timeBottom) / 2;
      const timeAmplitude = Math.max(16, (timeBottom - top) * 0.43);
      const timePts = data.signal.map((v, i) => ({
        x: left + i / (data.n - 1) * plotWidth,
        y: timeCenter - v * timeAmplitude
      }));
      polyline(ctx, timePts, p.cyan, 2.05);

      // Restore the earlier, cleaner visual language: cyan time trace and coral linear-amplitude stems.
      // The underlying spectrum still comes from the audited radix-2 FFT and window-aware normalization.
      const maxBin = Math.min(data.mag.length - 1, 40);
      const maxMag = Math.max(...data.mag.slice(0, maxBin + 1), 1e-14);
      const mapX = (k) => left + k / maxBin * plotWidth;
      const mapY = (a) => bottom - a * (bottom - spectrumTop - 8);
      const stemWidth = Math.max(1.5, Math.min(4.2, plotWidth / (maxBin + 1) * 0.48));

      ctx.save();
      ctx.strokeStyle = p.coral;
      ctx.lineWidth = stemWidth;
      ctx.globalAlpha = 0.94;
      for (let k = 0; k <= maxBin; k += 1) {
        const x = mapX(k);
        const y = mapY(data.mag[k] / maxMag);
        ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.restore();

      // Keep labels outside the data-dense regions; omit numeric ticks to preserve the original clarity.
      label(ctx, '时域采样', width - right, timeBottom + 15, p, 'right', 11.5);
      label(ctx, '幅值', left, spectrumTop - 11, p, 'left', 11.5);
      label(ctx, '频率 bin k', width - right, bottom + 22, p, 'right', 11.5);
    }

    const schedule = watch(canvas, draw);
    buttons.forEach((b) => b.addEventListener('click', () => { windowName = b.dataset.window; schedule(); }));
    freqSlider.addEventListener('input', schedule);
    sizeSlider.addEventListener('input', schedule);
  }

  /* ---------- Bessel recurrence: forward versus Miller ---------- */
  function initAuditedBessel() {
    const canvas = $('special-function-canvas'), slider = $('bessel-x');
    if (!canvas || !slider) return;
    function besselJ(n, x) {
      let term = Math.pow(x / 2, n);
      for (let q = 2; q <= n; q += 1) term /= q;
      let sum = term;
      for (let m = 1; m < 240; m += 1) {
        term *= -(x * x / 4) / (m * (m + n));
        sum += term;
        if (Math.abs(term) < 2e-17 * Math.max(1, Math.abs(sum))) break;
      }
      return sum;
    }
    function compute() {
      const x = Number(slider.value) / 10;
      const nmax = 38;
      const ref = Array.from({ length: nmax + 1 }, (_, n) => besselJ(n, x));
      const forward = new Array(nmax + 1).fill(0);
      forward[0] = ref[0] * (1 + 1e-13);
      forward[1] = ref[1] * (1 - 2e-13);
      for (let n = 1; n < nmax; n += 1) forward[n + 1] = 2 * n / x * forward[n] - forward[n - 1];

      const N = Math.max(80, nmax + Math.ceil(2 * x) + 24);
      const y = new Array(N + 2).fill(0);
      y[N] = 1; y[N + 1] = 0;
      for (let n = N; n >= 1; n -= 1) {
        y[n - 1] = 2 * n / x * y[n] - y[n + 1];
        if (Math.max(Math.abs(y[n - 1]), Math.abs(y[n]), Math.abs(y[n + 1])) > 1e120) {
          for (let j = n - 1; j <= N + 1; j += 1) y[j] *= 1e-120;
        }
      }
      const anchor = Math.abs(ref[0]) >= Math.abs(ref[1]) ? 0 : 1;
      const scale = ref[anchor] / y[anchor];
      const miller = Array.from({ length: nmax + 1 }, (_, n) => y[n] * scale);
      const rel = (v, r) => Math.abs(v - r) / Math.max(Math.abs(r), 1e-14);
      const forwardErr = ref.map((r, n) => rel(forward[n], r));
      const millerErr = ref.map((r, n) => rel(miller[n], r));
      const first = forwardErr.findIndex((v) => v > 1e-6);
      const maxMiller = Math.max(...millerErr.filter(Number.isFinite));
      $('bessel-x-output').value = x.toFixed(1);
      $('bessel-break').textContent = first < 0 ? `> ${nmax}` : `n ≈ ${first}`;
      $('bessel-error').textContent = formatExp(maxMiller, 1);
      return { x, nmax, forwardErr, millerErr };
    }
    let data = compute();
    function draw() {
      data = compute();
      const state = prepareCanvas(canvas); if (!state) return;
      const { ctx, width, height, p } = state;
      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);
      const plot = drawGrid(ctx, width, height, p, { left: 58, right: 20, top: 24, bottom: 42 });
      const mapX = (n) => plot.x0 + n / data.nmax * (plot.x1 - plot.x0);
      const mapY = (v) => {
        const lv = Math.max(-16, Math.min(10, Math.log10(Math.max(v, 1e-16))));
        return plot.y1 - (lv + 16) / 26 * (plot.y1 - plot.y0);
      };
      polyline(ctx, data.forwardErr.map((v, n) => ({ x: mapX(n), y: mapY(v) })), p.coral, 2.2);
      polyline(ctx, data.millerErr.map((v, n) => ({ x: mapX(n), y: mapY(v) })), p.cyan, 2.2);
      ctx.strokeStyle = p.amber; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(plot.x0, mapY(1e-6)); ctx.lineTo(plot.x1, mapY(1e-6)); ctx.stroke(); ctx.setLineDash([]);
      [-16, -12, -8, -4, 0, 4, 8].forEach((v) => label(ctx, String(v), plot.x0 - 8, mapY(10 ** v), p, 'right', 8));
      label(ctx, '阶数 n', plot.x1, plot.y1 + 25, p, 'right');
      label(ctx, 'log₁₀ 相对误差', plot.x0 - 8, plot.y0 - 8, p, 'left');
      label(ctx, '红：前向递推', plot.x0 + 8, plot.y0 + 12, p, 'left', 9);
      label(ctx, '青：Miller 反向递推', plot.x0 + 8, plot.y0 + 28, p, 'left', 9);
    }
    const schedule = watch(canvas, draw);
    slider.addEventListener('input', schedule);
  }

  /* ---------- SPD preconditioner / CG bound ---------- */
  function initAuditedSpectrum() {
    const canvas = $('spectrum-canvas'), slider = $('precondition-strength');
    if (!canvas || !slider) return;
    function compute() {
      const s = Number(slider.value) / 100;
      const kappa0 = 1e5;
      const kappa = kappa0 ** (1 - s);
      const q = (Math.sqrt(kappa) - 1) / (Math.sqrt(kappa) + 1);
      const tol = 1e-6;
      const steps = q < 1e-14 ? 1 : Math.max(1, Math.ceil(Math.log(tol / 2) / Math.log(q)));
      $('precondition-output').value = `${slider.value}%`;
      $('condition-number').textContent = kappa >= 1000 ? formatExp(kappa, 1) : kappa.toFixed(kappa < 10 ? 2 : 0);
      $('gmres-steps').textContent = String(steps);
      const original = Array.from({ length: 36 }, (_, i) => 10 ** (5 * i / 35));
      const transformed = original.map((v) => v ** (1 - s));
      return { s, kappa, steps, original, transformed };
    }
    let data = compute();
    function drawRow(ctx, values, y, mapX, p, color, title) {
      ctx.strokeStyle = p.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mapX(1), y); ctx.lineTo(mapX(1e5), y); ctx.stroke();
      values.forEach((v, i) => {
        ctx.fillStyle = i % 6 === 0 ? p.coral : color;
        ctx.globalAlpha = 0.84;
        ctx.beginPath(); ctx.arc(mapX(v), y + 8 * Math.sin(i * 1.71), 3, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      label(ctx, title, mapX(1), y - 24, p, 'left', 10);
    }
    function draw() {
      data = compute();
      const state = prepareCanvas(canvas); if (!state) return;
      const { ctx, width, height, p } = state;
      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);
      const left = 62, right = 22;
      const mapX = (v) => left + Math.log10(Math.max(1, v)) / 5 * (width - left - right);
      [0,1,2,3,4,5].forEach((e) => {
        const x = mapX(10 ** e);
        ctx.strokeStyle = p.line; ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.moveTo(x, 46); ctx.lineTo(x, height - 48); ctx.stroke();
        ctx.globalAlpha = 1; label(ctx, `10^${e}`, x, height - 27, p, 'center', 8);
      });
      drawRow(ctx, data.original, height * 0.34, mapX, p, p.lineStrong, '原算子 A：κ₂ = 10⁵');
      drawRow(ctx, data.transformed, height * 0.66, mapX, p, p.cyan, '理想化 M⁻¹A：λᵢ ↦ λᵢ^(1−s)');
      const min = 1, max = data.kappa;
      ctx.strokeStyle = p.green; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(mapX(min), height * 0.66 + 34); ctx.lineTo(mapX(max), height * 0.66 + 34); ctx.stroke();
      label(ctx, `谱区间 [1, ${data.kappa.toPrecision(3)}]`, (mapX(min)+mapX(max))/2, height * 0.66 + 50, p, 'center', 9);
      label(ctx, `CG: 2((√κ−1)/(√κ+1))^k ≤ 10⁻⁶  ⇒  k ≥ ${data.steps}`, width - right, 25, p, 'right', 9);
      label(ctx, 'log₁₀ λ', width - right, height - 10, p, 'right', 9);
    }
    const schedule = watch(canvas, draw);
    slider.addEventListener('input', schedule);
  }

  /* ---------- Pseudo-arclength continuation ---------- */
  function initAuditedContinuation() {
    const canvas = $('continuation-canvas'), slider = $('continuation-step');
    if (!canvas || !slider) return;
    const branch = (t) => ({ lambda: 0.54 * (t ** 3 - 3 * t), u: t, t });
    const dense = Array.from({ length: 1401 }, (_, i) => branch(-2.1 + 4.2 * i / 1400));
    const cum = [0];
    for (let i = 1; i < dense.length; i += 1) {
      cum.push(cum[i - 1] + Math.hypot(dense[i].lambda - dense[i - 1].lambda, dense[i].u - dense[i - 1].u));
    }
    const total = cum[cum.length - 1];
    function atArc(s) {
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < s) lo = mid; else hi = mid;
      }
      const w = (s - cum[lo]) / Math.max(cum[hi] - cum[lo], 1e-15);
      return {
        lambda: dense[lo].lambda * (1 - w) + dense[hi].lambda * w,
        u: dense[lo].u * (1 - w) + dense[hi].u * w,
        t: dense[lo].t * (1 - w) + dense[hi].t * w
      };
    }
    const arcPoints = Array.from({ length: 14 }, (_, i) => atArc(total * i / 13));

    function draw() {
      const step = Number(slider.value);
      $('continuation-output').value = `${step} / 14`;
      const state = prepareCanvas(canvas); if (!state) return;
      const { ctx, width, height, p } = state;
      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);
      const plot = drawGrid(ctx, width, height, p, { left: 52, right: 24, top: 24, bottom: 44 });
      const mapX = (x) => plot.x0 + (x + 1.75) / 3.5 * (plot.x1 - plot.x0);
      const mapY = (y) => plot.y1 - (y + 2.25) / 4.5 * (plot.y1 - plot.y0);
      const full = dense.map((q) => ({ x: mapX(q.lambda), y: mapY(q.u) }));
      polyline(ctx, full, p.lineStrong, 1.8);

      const current = arcPoints[step - 1];
      const tracked = dense.filter((q) => q.t <= current.t).map((q) => ({ x: mapX(q.lambda), y: mapY(q.u) }));
      polyline(ctx, tracked, p.coral, 3.6);
      arcPoints.slice(0, step).forEach((q, i) => {
        ctx.fillStyle = i === step - 1 ? p.amber : p.coral;
        ctx.beginPath(); ctx.arc(mapX(q.lambda), mapY(q.u), i === step - 1 ? 5 : 3, 0, Math.PI * 2); ctx.fill();
      });

      const fixed = dense.filter((q) => q.t <= -1);
      polyline(ctx, fixed.map((q) => ({ x: mapX(q.lambda), y: mapY(q.u) })), p.cyan, 1.5, [5,4]);
      const fold = branch(-1);
      ctx.strokeStyle = p.amber; ctx.lineWidth = 2;
      const fx = mapX(fold.lambda), fy = mapY(fold.u);
      ctx.beginPath(); ctx.moveTo(fx-6,fy-6);ctx.lineTo(fx+6,fy+6);ctx.moveTo(fx+6,fy-6);ctx.lineTo(fx-6,fy+6);ctx.stroke();
      label(ctx, '固定 λ 延拓在折点终止', fx - 10, fy - 18, p, 'right', 8);

      if (step < arcPoints.length) {
        const dL = 1.62 * (current.t ** 2 - 1);
        const norm = Math.hypot(dL, 1);
        const tau = { l: dL / norm, u: 1 / norm };
        const ds = total / 13;
        const pred = { lambda: current.lambda + ds * tau.l, u: current.u + ds * tau.u };
        const corrected = arcPoints[step];
        ctx.strokeStyle = p.cyan; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(mapX(current.lambda), mapY(current.u)); ctx.lineTo(mapX(pred.lambda), mapY(pred.u)); ctx.stroke();
        ctx.fillStyle = p.cyan; ctx.beginPath(); ctx.arc(mapX(pred.lambda), mapY(pred.u), 4, 0, Math.PI*2); ctx.fill();

        const perp = { l: -tau.u, u: tau.l };
        const h = 0.24;
        ctx.strokeStyle = p.cyan; ctx.globalAlpha = 0.58; ctx.setLineDash([4,4]);
        ctx.beginPath();
        ctx.moveTo(mapX(pred.lambda - h*perp.l), mapY(pred.u - h*perp.u));
        ctx.lineTo(mapX(pred.lambda + h*perp.l), mapY(pred.u + h*perp.u));
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.strokeStyle = p.green; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(mapX(pred.lambda), mapY(pred.u)); ctx.lineTo(mapX(corrected.lambda), mapY(corrected.u)); ctx.stroke();
        ctx.fillStyle = p.green; ctx.beginPath(); ctx.arc(mapX(corrected.lambda), mapY(corrected.u), 4, 0, Math.PI*2); ctx.fill();
        label(ctx, '预测', mapX(pred.lambda)+7, mapY(pred.u)-10, p, 'left', 8);
        label(ctx, '校正到解支', mapX(corrected.lambda)+7, mapY(corrected.u)+11, p, 'left', 8);
      }
      label(ctx, 'λ', plot.x1, plot.y1 + 25, p, 'right');
      label(ctx, 'u', plot.x0 - 8, plot.y0 - 7, p, 'left');
    }
    const schedule = watch(canvas, draw);
    slider.addEventListener('input', schedule);
  }

  /* ---------- Exact 2x2 pseudospectrum and transient gain ---------- */
  function initAuditedPseudospectrum() {
    const canvas = $('pseudospectrum-canvas'), slider = $('nonnormality');
    if (!canvas || !slider) return;
    const sigmaMin = (x, y, alpha) => {
      const a = (x + 1) ** 2 + y ** 2;
      const d = alpha ** 2 + (x + 2) ** 2 + y ** 2;
      const off2 = alpha ** 2 * a;
      const disc = Math.sqrt(Math.max(0, (a - d) ** 2 + 4 * off2));
      return Math.sqrt(Math.max(0, 0.5 * (a + d - disc)));
    };
    const normUpper2 = (a, b, d) => {
      const tr = a*a + b*b + d*d;
      const det = (a*d) ** 2;
      return Math.sqrt(Math.max(0, 0.5 * (tr + Math.sqrt(Math.max(0, tr*tr - 4*det)))));
    };
    const maxGrowth = (alpha) => {
      let best = 1, bestT = 0;
      for (let i = 0; i <= 2400; i += 1) {
        const t = 10 * i / 2400;
        const a = Math.exp(-t), d = Math.exp(-2*t), b = alpha * (a - d);
        const g = normUpper2(a,b,d);
        if (g > best) { best = g; bestT = t; }
      }
      return { best, bestT };
    };
    function edgePoint(edge, i, j, level, grid, nx, ny, xmin, xmax, ymin, ymax) {
      const coords = [
        [i,j,i+1,j], [i+1,j,i+1,j+1], [i+1,j+1,i,j+1], [i,j+1,i,j]
      ][edge];
      const [i0,j0,i1,j1] = coords;
      const v0 = grid[j0][i0], v1 = grid[j1][i1];
      const t = Math.max(0, Math.min(1, (level - v0) / Math.max(v1 - v0, 1e-30)));
      const gx = i0 + t * (i1 - i0), gy = j0 + t * (j1 - j0);
      return {
        x: xmin + gx / nx * (xmax - xmin),
        y: ymin + gy / ny * (ymax - ymin)
      };
    }
    function contourSegments(grid, nx, ny, level, xmin, xmax, ymin, ymax) {
      const segments = [];
      for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
        const vals = [grid[j][i], grid[j][i+1], grid[j+1][i+1], grid[j+1][i]];
        const crossings = [];
        const pairs = [[0,1],[1,2],[2,3],[3,0]];
        pairs.forEach(([a,b], edge) => {
          if ((vals[a] <= level && vals[b] > level) || (vals[a] > level && vals[b] <= level)) crossings.push(edge);
        });
        if (crossings.length === 2) {
          segments.push([
            edgePoint(crossings[0],i,j,level,grid,nx,ny,xmin,xmax,ymin,ymax),
            edgePoint(crossings[1],i,j,level,grid,nx,ny,xmin,xmax,ymin,ymax)
          ]);
        } else if (crossings.length === 4) {
          const center = 0.25 * vals.reduce((a,b)=>a+b,0);
          const pairing = center <= level ? [[crossings[0],crossings[1]],[crossings[2],crossings[3]]]
                                          : [[crossings[0],crossings[3]],[crossings[1],crossings[2]]];
          pairing.forEach(([e0,e1]) => segments.push([
            edgePoint(e0,i,j,level,grid,nx,ny,xmin,xmax,ymin,ymax),
            edgePoint(e1,i,j,level,grid,nx,ny,xmin,xmax,ymin,ymax)
          ]));
        }
      }
      return segments;
    }
    function draw() {
      const alpha = 8 * Number(slider.value) / 100;
      const growth = maxGrowth(alpha);
      $('nonnormal-output').value = alpha.toFixed(2);
      $('spectral-abscissa').textContent = '−1.00';
      $('transient-growth').textContent = `${growth.best.toFixed(2)}×`;
      const state = prepareCanvas(canvas); if (!state) return;
      const { ctx, width, height, p } = state;
      ctx.fillStyle = p.paper; ctx.fillRect(0, 0, width, height);
      const plot = { x0: 50, x1: width - 18, y0: 20, y1: height - 42 };
      const xmin=-3.2,xmax=1.0,ymin=-2.1,ymax=2.1;
      const mapX=(x)=>plot.x0+(x-xmin)/(xmax-xmin)*(plot.x1-plot.x0);
      const mapY=(y)=>plot.y1-(y-ymin)/(ymax-ymin)*(plot.y1-plot.y0);
      const nx=92, ny=72;
      const grid=Array.from({length:ny+1},(_,j)=>Array.from({length:nx+1},(_,i)=>{
        const x=xmin+(xmax-xmin)*i/nx, y=ymin+(ymax-ymin)*j/ny;
        return sigmaMin(x,y,alpha);
      }));
      for(let j=0;j<ny;j+=1) for(let i=0;i<nx;i+=1){
        const s=grid[j][i];
        const resolvent=Math.min(5,Math.max(0,Math.log10(1/Math.max(s,1e-8))));
        ctx.fillStyle=p.coral;ctx.globalAlpha=0.018+0.045*resolvent;
        ctx.fillRect(mapX(xmin+(xmax-xmin)*i/nx),mapY(ymin+(ymax-ymin)*(j+1)/ny),
                     (plot.x1-plot.x0)/nx+1,(plot.y1-plot.y0)/ny+1);
      }
      ctx.globalAlpha=1;
      ctx.strokeStyle=p.line;ctx.lineWidth=1;
      [-3,-2,-1,0,1].forEach(x=>{ctx.beginPath();ctx.moveTo(mapX(x),plot.y0);ctx.lineTo(mapX(x),plot.y1);ctx.stroke();label(ctx,String(x),mapX(x),plot.y1+17,p,'center',8);});
      [-2,-1,0,1,2].forEach(y=>{ctx.beginPath();ctx.moveTo(plot.x0,mapY(y));ctx.lineTo(plot.x1,mapY(y));ctx.stroke();label(ctx,String(y),plot.x0-8,mapY(y),p,'right',8);});
      const levels=[0.05,0.1,0.2,0.4], colors=[p.green,p.cyan,p.amber,p.coral];
      levels.forEach((level,k)=>{
        ctx.strokeStyle=colors[k];ctx.lineWidth=1.45;
        contourSegments(grid,nx,ny,level,xmin,xmax,ymin,ymax).forEach(seg=>{
          ctx.beginPath();ctx.moveTo(mapX(seg[0].x),mapY(seg[0].y));ctx.lineTo(mapX(seg[1].x),mapY(seg[1].y));ctx.stroke();
        });
        label(ctx,`ε=${level}`,plot.x1-5,plot.y0+12+15*k,p,'right',8);
      });
      [-2,-1].forEach(x=>{ctx.fillStyle=p.ink;ctx.beginPath();ctx.arc(mapX(x),mapY(0),4,0,Math.PI*2);ctx.fill();});
      ctx.strokeStyle=p.coral;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(mapX(0),plot.y0);ctx.lineTo(mapX(0),plot.y1);ctx.stroke();ctx.setLineDash([]);
      label(ctx,'Re(z)',plot.x1,plot.y1+31,p,'right',9);
      label(ctx,'Im(z)',plot.x0-8,plot.y0-8,p,'left',9);
      label(ctx,`maxₜ ‖eᵗᴬ‖₂=${growth.best.toFixed(2)} at t≈${growth.bestT.toFixed(2)}`,plot.x0+8,plot.y0+12,p,'left',9);
    }
    const schedule = watch(canvas, draw);
    slider.addEventListener('input', schedule);
  }

  /* ---------- Mesh quality sampled over reference cells ---------- */
  function initAuditedMeshQuality() {
    const canvas=$('mesh-quality-canvas'),slider=$('mesh-distortion');
    if(!canvas||!slider)return;
    function singularCondition(a,b,c,d){
      const tr=a*a+b*b+c*c+d*d;
      const det=(a*d-b*c)**2;
      const disc=Math.sqrt(Math.max(0,tr*tr-4*det));
      const lmax=0.5*(tr+disc),lmin=0.5*(tr-disc);
      return Math.sqrt(lmax/Math.max(lmin,1e-30));
    }
    function build(amount){
      const n=5;
      const nodes=Array.from({length:n},(_,j)=>Array.from({length:n},(_,i)=>({x:i/(n-1),y:j/(n-1)})));
      nodes[2][2]={x:0.5+0.1445*amount,y:0.5-0.1330*amount};
      const cells=[];let globalWorst=null;
      const ideal=(1/(n-1)/2)**2;
      for(let j=0;j<n-1;j+=1)for(let i=0;i<n-1;i+=1){
        const pts=[nodes[j][i],nodes[j][i+1],nodes[j+1][i+1],nodes[j+1][i]];
        let minDet=Infinity,maxK=0,worst=null;
        for(let a=0;a<5;a+=1)for(let b=0;b<5;b+=1){
          const xi=-1+2*a/4,eta=-1+2*b/4;
          const [p00,p10,p11,p01]=pts;
          const dxXi=0.25*(-(1-eta)*p00.x+(1-eta)*p10.x+(1+eta)*p11.x-(1+eta)*p01.x);
          const dyXi=0.25*(-(1-eta)*p00.y+(1-eta)*p10.y+(1+eta)*p11.y-(1+eta)*p01.y);
          const dxEta=0.25*(-(1-xi)*p00.x-(1+xi)*p10.x+(1+xi)*p11.x+(1-xi)*p01.x);
          const dyEta=0.25*(-(1-xi)*p00.y-(1+xi)*p10.y+(1+xi)*p11.y+(1-xi)*p01.y);
          const det=(dxXi*dyEta-dxEta*dyXi)/ideal;
          const kappa=singularCondition(dxXi,dxEta,dyXi,dyEta);
          const N=[0.25*(1-xi)*(1-eta),0.25*(1+xi)*(1-eta),0.25*(1+xi)*(1+eta),0.25*(1-xi)*(1+eta)];
          const physical={x:N.reduce((s,q,k)=>s+q*pts[k].x,0),y:N.reduce((s,q,k)=>s+q*pts[k].y,0)};
          if(det<minDet){minDet=det;worst={...physical,det,kappa};}
          if(kappa>maxK)maxK=kappa;
        }
        const cell={pts,minDet,maxK,worst};cells.push(cell);
        if(!globalWorst||cell.minDet<globalWorst.det)globalWorst={...cell.worst,det:cell.minDet};
      }
      return {nodes,cells,globalWorst,minDet:Math.min(...cells.map(c=>c.minDet)),maxK:Math.max(...cells.map(c=>c.maxK))};
    }
    function draw(){
      const amount=Number(slider.value)/100,data=build(amount);
      $('mesh-distortion-output').value=amount.toFixed(2);
      $('mesh-jacobian').textContent=data.minDet.toFixed(3);
      $('mesh-aspect').textContent=data.maxK>999?'> 999':data.maxK.toFixed(2);
      const state=prepareCanvas(canvas);if(!state)return;
      const {ctx,width,height,p}=state;ctx.fillStyle=p.paper;ctx.fillRect(0,0,width,height);
      const pad=43,mapX=x=>pad+x*(width-2*pad),mapY=y=>height-pad-y*(height-2*pad);
      data.cells.forEach(cell=>{
        ctx.beginPath();cell.pts.forEach((q,k)=>{if(k===0)ctx.moveTo(mapX(q.x),mapY(q.y));else ctx.lineTo(mapX(q.x),mapY(q.y));});ctx.closePath();
        const bad=cell.minDet<=0,distorted=cell.minDet<0.35||cell.maxK>8;
        ctx.fillStyle=bad?p.coral:(distorted?p.amber:p.cyan);ctx.globalAlpha=bad?.30:(distorted?.18:.07);ctx.fill();ctx.globalAlpha=1;
        ctx.strokeStyle=bad?p.coral:(distorted?p.amber:p.lineStrong);ctx.lineWidth=bad?2.4:(distorted?1.7:1);ctx.stroke();
      });
      data.nodes.flat().forEach(q=>{ctx.fillStyle=p.ink;ctx.beginPath();ctx.arc(mapX(q.x),mapY(q.y),2.4,0,Math.PI*2);ctx.fill();});
      const c=data.nodes[2][2];ctx.fillStyle=p.coral;ctx.beginPath();ctx.arc(mapX(c.x),mapY(c.y),5,0,Math.PI*2);ctx.fill();
      const w=data.globalWorst;ctx.strokeStyle=p.coral;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(mapX(w.x)-6,mapY(w.y));ctx.lineTo(mapX(w.x)+6,mapY(w.y));ctx.moveTo(mapX(w.x),mapY(w.y)-6);ctx.lineTo(mapX(w.x),mapY(w.y)+6);ctx.stroke();
      label(ctx,'移动节点',mapX(c.x)+9,mapY(c.y)-11,p,'left',9);
      label(ctx,'最小 det J 采样点',mapX(w.x)+8,mapY(w.y)+12,p,'left',8);
    }
    const schedule=watch(canvas,draw);slider.addEventListener('input',schedule);
  }

  /* ---------- Monopole treecode with direct-error audit ---------- */
  function initAuditedTreecode(){
    const canvas=$('integral-tree-canvas'),slider=$('tree-opening');
    if(!canvas||!slider)return;
    const frac=x=>x-Math.floor(x);
    const points=Array.from({length:92},(_,i)=>({
      x:0.04+0.88*frac(Math.sin((i+1)*12.9898)*43758.5453),
      y:0.04+0.88*frac(Math.sin((i+1)*78.233)*12345.6789),
      q:0.65+0.35*Math.sin((i+1)*1.731)
    }));
    const target={x:0.82,y:0.72},soft=0.025;
    function build(indices,x0,y0,x1,y1,depth=0){
      const total=indices.reduce((s,id)=>s+points[id].q,0);
      const cx=indices.reduce((s,id)=>s+points[id].q*points[id].x,0)/Math.max(total,1e-30);
      const cy=indices.reduce((s,id)=>s+points[id].q*points[id].y,0)/Math.max(total,1e-30);
      const node={indices,x0,y0,x1,y1,depth,total,cx,cy,children:[]};
      if(indices.length<=4||depth>=8)return node;
      const mx=.5*(x0+x1),my=.5*(y0+y1);
      [[x0,y0,mx,my],[mx,y0,x1,my],[x0,my,mx,y1],[mx,my,x1,y1]].forEach(box=>{
        const ids=indices.filter(id=>{const q=points[id];return q.x>=box[0]&&q.x<=box[2]&&q.y>=box[1]&&q.y<=box[3];});
        if(ids.length)node.children.push(build(ids,...box,depth+1));
      });
      return node;
    }
    const root=build(points.map((_,i)=>i),0,0,1,1);
    const kernel=(a,b)=>1/Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2+soft**2);
    const directPotential=points.reduce((s,q)=>s+q.q*kernel(target,q),0);
    function traverse(theta){
      const groups=[],direct=[];let potential=0;
      function visit(node){
        const size=Math.max(node.x1-node.x0,node.y1-node.y0);
        const dist=Math.hypot(node.cx-target.x,node.cy-target.y);
        const contains=target.x>=node.x0&&target.x<=node.x1&&target.y>=node.y0&&target.y<=node.y1;
        if(!contains&&node.indices.length>4&&size/Math.max(dist,1e-12)<theta){
          groups.push(node);potential+=node.total/Math.sqrt(dist*dist+soft*soft);
        }else if(!node.children.length){
          node.indices.forEach(id=>{direct.push(id);potential+=points[id].q*kernel(target,points[id]);});
        }else node.children.forEach(visit);
      }
      visit(root);
      return {groups,direct:[...new Set(direct)],potential,error:Math.abs(potential-directPotential)/Math.abs(directPotential)};
    }
    function draw(){
      const theta=Number(slider.value)/100,data=traverse(theta);
      $('tree-opening-output').value=theta.toFixed(2);
      $('tree-direct').textContent=String(data.direct.length);
      $('tree-groups').textContent=formatExp(data.error,2);
      const state=prepareCanvas(canvas);if(!state)return;
      const {ctx,width,height,p}=state;ctx.fillStyle=p.paper;ctx.fillRect(0,0,width,height);
      const pad=30,mapX=x=>pad+x*(width-2*pad),mapY=y=>height-pad-y*(height-2*pad);
      points.forEach(q=>{ctx.fillStyle=p.lineStrong;ctx.globalAlpha=.48;ctx.beginPath();ctx.arc(mapX(q.x),mapY(q.y),2,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;
      data.groups.forEach(node=>{
        const x=mapX(node.x0),y=mapY(node.y1),w=mapX(node.x1)-x,h=mapY(node.y0)-y;
        ctx.strokeStyle=p.green;ctx.lineWidth=1.4;ctx.strokeRect(x,y,w,h);
        ctx.fillStyle=p.green;ctx.beginPath();ctx.arc(mapX(node.cx),mapY(node.cy),3.5,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=p.green;ctx.globalAlpha=.15;ctx.beginPath();ctx.moveTo(mapX(target.x),mapY(target.y));ctx.lineTo(mapX(node.cx),mapY(node.cy));ctx.stroke();ctx.globalAlpha=1;
      });
      data.direct.forEach(id=>{const q=points[id];ctx.fillStyle=p.coral;ctx.beginPath();ctx.arc(mapX(q.x),mapY(q.y),3,0,Math.PI*2);ctx.fill();});
      const tx=mapX(target.x),ty=mapY(target.y);ctx.strokeStyle=p.amber;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(tx-7,ty);ctx.lineTo(tx+7,ty);ctx.moveTo(tx,ty-7);ctx.lineTo(tx,ty+7);ctx.stroke();
      label(ctx,'目标点',tx-8,ty-13,p,'right',9);
      label(ctx,`直接势=${directPotential.toFixed(3)}  tree=${data.potential.toFixed(3)}`,pad,height-12,p,'left',9);
      label(ctx,'绿框：monopole 远场；红点：逐点近场',width-pad,height-12,p,'right',8);
    }
    const schedule=watch(canvas,draw);slider.addEventListener('input',schedule);
  }

  /* ---------- Verifiable 1D goal-oriented adaptivity toy ---------- */
  function initAuditedGoalAdaptivity(){
    const canvas=$('mesh-canvas'),slider=$('adaptivity-level');
    if(!canvas||!slider)return;
    const buttons=[...document.querySelectorAll('[data-mesh-goal]')];
    let goal=buttons.find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.meshGoal||'axis';
    const exact=x=>Math.sin(Math.PI*x)+0.15*Math.sin(5*Math.PI*x);
    const forcing=x=>Math.PI**2*Math.sin(Math.PI*x)+0.15*(5*Math.PI)**2*Math.sin(5*Math.PI*x);
    function solveTri(diag,off,rhs){
      const n=diag.length;if(!n)return[];
      const d=diag.slice(),b=rhs.slice(),u=off.slice();
      for(let i=1;i<n;i++){const m=off[i-1]/d[i-1];d[i]-=m*u[i-1];b[i]-=m*b[i-1];}
      const x=new Array(n);x[n-1]=b[n-1]/d[n-1];
      for(let i=n-2;i>=0;i--)x[i]=(b[i]-u[i]*x[i+1])/d[i];
      return x;
    }
    const gauss=[[-Math.sqrt(3/5),5/9],[0,8/9],[Math.sqrt(3/5),5/9]];
    function assemble(mesh,loadFn){
      const n=mesh.length,diag=new Array(n-2).fill(0),off=new Array(Math.max(0,n-3)).fill(0),rhs=new Array(n-2).fill(0);
      for(let e=0;e<n-1;e++){
        const a=mesh[e],b=mesh[e+1],h=b-a,f=[0,0];
        gauss.forEach(([xi,w])=>{
          const x=.5*(a+b)+.5*h*xi,N=[.5*(1-xi),.5*(1+xi)],val=loadFn(x);
          f[0]+=.5*h*w*val*N[0];f[1]+=.5*h*w*val*N[1];
        });
        if(e>0){diag[e-1]+=1/h;rhs[e-1]+=f[0];}
        if(e+1<n-1){diag[e]+=1/h;rhs[e]+=f[1];}
        if(e>0&&e+1<n-1)off[e-1]+=-1/h;
      }
      const interior=solveTri(diag,off,rhs),u=new Array(n).fill(0);interior.forEach((v,i)=>u[i+1]=v);return u;
    }
    function dualLoadPoint(mesh,xg){
      const n=mesh.length,rhsNodes=new Array(n).fill(0);
      let e=0;while(e<n-2&&mesh[e+1]<xg)e++;
      const h=mesh[e+1]-mesh[e],t=(xg-mesh[e])/h;rhsNodes[e]+=1-t;rhsNodes[e+1]+=t;
      return rhsNodes;
    }
    function solveWithNodalLoad(mesh,nodal){
      const n=mesh.length,diag=new Array(n-2).fill(0),off=new Array(Math.max(0,n-3)).fill(0),rhs=nodal.slice(1,-1);
      for(let e=0;e<n-1;e++){
        const h=mesh[e+1]-mesh[e];
        if(e>0)diag[e-1]+=1/h;
        if(e+1<n-1)diag[e]+=1/h;
        if(e>0&&e+1<n-1)off[e-1]+=-1/h;
      }
      const interior=solveTri(diag,off,rhs),z=new Array(n).fill(0);interior.forEach((v,i)=>z[i+1]=v);return z;
    }
    function solveDual(mesh,kind){
      if(kind==='axis')return solveWithNodalLoad(mesh,dualLoadPoint(mesh,.32));
      const a=.78,b=.96,len=b-a,nodal=new Array(mesh.length).fill(0);
      for(let e=0;e<mesh.length-1;e++){
        const x0=mesh[e],x1=mesh[e+1],h=x1-x0,l=Math.max(x0,a),r=Math.min(x1,b);
        if(r<=l)continue;
        gauss.forEach(([xi,w])=>{
          const x=.5*(l+r)+.5*(r-l)*xi,t=(x-x0)/h,N=[1-t,t];
          nodal[e]+=.5*(r-l)*w*N[0]/len;nodal[e+1]+=.5*(r-l)*w*N[1]/len;
        });
      }
      return solveWithNodalLoad(mesh,nodal);
    }
    function evalFE(mesh,u,x){
      let e=0;while(e<mesh.length-2&&mesh[e+1]<x)e++;
      const t=(x-mesh[e])/(mesh[e+1]-mesh[e]);return u[e]*(1-t)+u[e+1]*t;
    }
    function integrate(fn,a,b){
      let sum=0;const n=120;for(let k=0;k<n;k++){const x0=a+(b-a)*k/n,x1=a+(b-a)*(k+1)/n;
        gauss.forEach(([xi,w])=>{const x=.5*(x0+x1)+.5*(x1-x0)*xi;sum+=.5*(x1-x0)*w*fn(x);});
      }return sum;
    }
    function goalValue(mesh,u,kind){
      if(kind==='axis')return evalFE(mesh,u,.32);
      return integrate(x=>evalFE(mesh,u,x),.78,.96)/(.96-.78);
    }
    const exactGoal={axis:exact(.32),xpoint:integrate(exact,.78,.96)/(.96-.78)};
    function indicators(mesh,u,kind){
      const fine=[];for(let e=0;e<mesh.length-1;e++){fine.push(mesh[e],.5*(mesh[e]+mesh[e+1]));}fine.push(mesh.at(-1));
      const z=solveDual(fine,kind),eta=[];
      for(let e=0;e<mesh.length-1;e++){
        const a=mesh[e],b=mesh[e+1],mid=.5*(a+b),idx=2*e;
        const wmid=z[idx+1]-.5*(z[idx]+z[idx+2]);
        let val=0;
        [[a,mid,0,wmid],[mid,b,wmid,0]].forEach(([l,r,wl,wr])=>{
          gauss.forEach(([xi,w])=>{const x=.5*(l+r)+.5*(r-l)*xi,t=(x-l)/(r-l),wv=wl*(1-t)+wr*t;val+=.5*(r-l)*w*forcing(x)*wv;});
        });
        eta.push(Math.abs(val));
      }
      return eta;
    }
    function refine(mesh,eta){
      const total=eta.reduce((a,b)=>a+b,0),order=eta.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
      const marked=new Set();let accum=0;
      for(const q of order){marked.add(q.i);accum+=q.v;if(accum>=.55*total)break;}
      const next=[];for(let e=0;e<mesh.length-1;e++){next.push(mesh[e]);if(marked.has(e))next.push(.5*(mesh[e]+mesh[e+1]));}next.push(mesh.at(-1));
      return next;
    }
    function sequence(kind){
      const seq=[];let mesh=Array.from({length:9},(_,i)=>i/8);
      for(let level=0;level<=5;level++){
        const u=assemble(mesh,forcing),eta=indicators(mesh,u,kind),J=goalValue(mesh,u,kind);
        seq.push({mesh:mesh.slice(),u,eta,J,error:Math.abs(J-exactGoal[kind])/Math.max(Math.abs(exactGoal[kind]),1e-14)});
        if(level<5)mesh=refine(mesh,eta);
      }
      return seq;
    }
    let seq=sequence(goal);
    function draw(){
      const level=Number(slider.value),data=seq[level];
      $('adaptivity-output').value=String(level);
      $('mesh-dofs').textContent=String(data.mesh.length);
      $('goal-error').textContent=formatExp(data.error,2);
      buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.meshGoal===goal)));
      const state=prepareCanvas(canvas);if(!state)return;
      const {ctx,width,height,p}=state;ctx.fillStyle=p.paper;ctx.fillRect(0,0,width,height);
      const left=50,right=20,top=25,plotBottom=height*.66,meshY=height*.84;
      const mapX=x=>left+x*(width-left-right),mapY=y=>plotBottom-(y+1.2)/2.5*(plotBottom-top);
      ctx.strokeStyle=p.line;for(let j=0;j<=4;j++){const y=top+(plotBottom-top)*j/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();}
      ctx.strokeStyle=p.lineStrong;ctx.beginPath();ctx.moveTo(left,plotBottom);ctx.lineTo(width-right,plotBottom);ctx.moveTo(left,top);ctx.lineTo(left,plotBottom);ctx.stroke();
      const ex=[],fe=[];for(let i=0;i<=500;i++){const x=i/500;ex.push({x:mapX(x),y:mapY(exact(x))});fe.push({x:mapX(x),y:mapY(evalFE(data.mesh,data.u,x))});}
      polyline(ctx,ex,p.lineStrong,1.7,[5,4]);polyline(ctx,fe,p.cyan,2.3);
      if(goal==='axis'){const x=.32;ctx.strokeStyle=p.coral;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(mapX(x),top);ctx.lineTo(mapX(x),plotBottom);ctx.stroke();ctx.setLineDash([]);label(ctx,'点值目标 x=0.32',mapX(x)+6,top+12,p,'left',8);}
      else{ctx.fillStyle=p.coral;ctx.globalAlpha=.10;ctx.fillRect(mapX(.78),top,mapX(.96)-mapX(.78),plotBottom-top);ctx.globalAlpha=1;label(ctx,'边界区平均目标',mapX(.87),top+12,p,'center',8);}
      const maxEta=Math.max(...data.eta,1e-30);
      data.eta.forEach((v,e)=>{const x0=mapX(data.mesh[e]),x1=mapX(data.mesh[e+1]);ctx.fillStyle=p.coral;ctx.globalAlpha=.06+.38*v/maxEta;ctx.fillRect(x0,meshY-22,x1-x0,44);ctx.globalAlpha=1;ctx.strokeStyle=p.line;ctx.strokeRect(x0,meshY-22,x1-x0,44);});
      data.mesh.forEach(x=>{ctx.strokeStyle=p.ink;ctx.beginPath();ctx.moveTo(mapX(x),meshY-27);ctx.lineTo(mapX(x),meshY+27);ctx.stroke();});
      label(ctx,'虚线：解析解；青线：线性 FEM',left,top-10,p,'left',8);
      label(ctx,'单元颜色 ∝ |residual × dual weight|',left,meshY+38,p,'left',8);
      label(ctx,'x',width-right,height-12,p,'right',9);
    }
    const schedule=watch(canvas,draw);
    buttons.forEach(b=>b.addEventListener('click',()=>{goal=b.dataset.meshGoal;seq=sequence(goal);schedule();}));
    slider.addEventListener('input',schedule);
  }

  function initAll() {
    const specs = [
      ['fitting-canvas', initAuditedFitting],
      ['fft-canvas', initAuditedFFT],
      ['special-function-canvas', initAuditedBessel],
      ['spectrum-canvas', initAuditedSpectrum],
      ['continuation-canvas', initAuditedContinuation],
      ['pseudospectrum-canvas', initAuditedPseudospectrum],
      ['mesh-quality-canvas', initAuditedMeshQuality],
      ['integral-tree-canvas', initAuditedTreecode],
      ['mesh-canvas', initAuditedGoalAdaptivity]
    ];
    const started = new Set();
    const start = (id, init) => {
      if (started.has(id)) return;
      started.add(id);
      init();
    };
    if (!('IntersectionObserver' in window)) {
      specs.forEach(([id, init]) => start(id, init));
      return;
    }
    const observer = new IntersectionObserver((entries, current) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const spec = specs.find(([id]) => id === entry.target.id);
        if (spec) start(spec[0], spec[1]);
        current.unobserve(entry.target);
      });
    }, { rootMargin: '1200px 0px', threshold: 0 });
    specs.forEach(([id, init]) => {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
    });
  }


  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();
})();
