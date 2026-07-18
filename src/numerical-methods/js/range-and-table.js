(() => {
  'use strict';
  const syncRange = (input) => {
    const min = Number.isFinite(Number(input.min)) ? Number(input.min) : 0;
    const max = Number.isFinite(Number(input.max)) ? Number(input.max) : 100;
    const value = Number.isFinite(Number(input.value)) ? Number(input.value) : min;
    const fraction = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
    input.style.setProperty('--range-progress', `${(fraction * 100).toFixed(3)}%`);
  };
  const init = () => {
    document.querySelectorAll('input[type="range"]').forEach(syncRange);
    document.querySelectorAll('.topic table.method-table, .topic table.decision-table').forEach((table) => {
      if (table.parentElement?.classList.contains('table-scroll')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('tabindex', '0');
      wrapper.setAttribute('aria-label', table.classList.contains('method-table') ? '方法比较表，可横向滚动' : '决策比较表，可横向滚动');
      table.before(wrapper);
      wrapper.appendChild(table);
    });
  };
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'range') syncRange(target);
  }, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
