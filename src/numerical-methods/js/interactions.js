(() => {
  'use strict';

  const init = () => {
    const root = document.documentElement;
    const body = document.body;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    root.classList.add('research-ui');
    body.dataset.interface = 'research-reference';

    /* Subtle pointer parallax: decorative only, disabled for reduced motion/coarse input. */
    const hero = document.querySelector('.hero');
    if (hero && !reduceMotion.matches && window.matchMedia('(pointer: fine)').matches) {
      let frame = 0;
      let nextX = 0;
      let nextY = 0;

      const commit = () => {
        frame = 0;
        root.style.setProperty('--hero-x', `${nextX * -7}px`);
        root.style.setProperty('--hero-y', `${nextY * -5}px`);
        root.style.setProperty('--hero-copy-x', `${nextX * 3.5}px`);
        root.style.setProperty('--hero-copy-y', `${nextY * 2.5}px`);
      };

      hero.addEventListener('pointermove', (event) => {
        const box = hero.getBoundingClientRect();
        nextX = ((event.clientX - box.left) / box.width - 0.5) * 2;
        nextY = ((event.clientY - box.top) / box.height - 0.5) * 2;
        if (!frame) frame = requestAnimationFrame(commit);
      }, { passive: true });

      hero.addEventListener('pointerleave', () => {
        nextX = 0;
        nextY = 0;
        if (!frame) frame = requestAnimationFrame(commit);
      }, { passive: true });
    }

    /* Compact, icon-only return control for a very long reference page. */
    const backToTop = document.createElement('button');
    backToTop.className = 'back-to-top';
    backToTop.type = 'button';
    backToTop.setAttribute('aria-label', '返回页面顶部');
    backToTop.setAttribute('title', '返回页面顶部');
    backToTop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m6.5 10.5 5.5-5.5 5.5 5.5"/></svg>';
    body.appendChild(backToTop);

    let scrollFrame = 0;
    const updateBackToTop = () => {
      scrollFrame = 0;
      backToTop.classList.toggle('is-visible', window.scrollY > Math.max(900, window.innerHeight * 1.15));
    };
    updateBackToTop();
    window.addEventListener('scroll', () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateBackToTop);
    }, { passive: true });
    backToTop.addEventListener('click', () => {
      if (reduceMotion.matches) {
        window.scrollTo(0, 0);
        return;
      }

      const start = window.scrollY;
      const startedAt = performance.now();
      const duration = 760;
      const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

      const animate = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const position = Math.round(start * (1 - easeOutQuint(progress)));
        document.documentElement.scrollTop = position;
        document.body.scrollTop = position;
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    });

    /* Search shortcut for keyboard-heavy technical reading. */
    const search = document.getElementById('chapter-search');
    if (search) {
      search.setAttribute('aria-keyshortcuts', '/');
      document.addEventListener('keydown', (event) => {
        const target = event.target;
        const isEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
        if (event.key === '/' && !isEditing && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          search.focus({ preventScroll: false });
          search.select();
        }
        if (event.key === 'Escape' && document.activeElement === search) search.blur();
      });
    }

    /* Keep browser chrome synchronized with the existing theme switch. */
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const syncThemeColor = () => {
      if (!themeMeta) return;
      themeMeta.setAttribute('content', root.dataset.theme === 'dark' ? '#101517' : '#101416');
    };
    syncThemeColor();
    new MutationObserver(syncThemeColor).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
