(() => {
  'use strict';
  const annotate = () => {
    document.querySelectorAll('.topic table.method-table, .topic table.decision-table').forEach((table) => {
      const rows = [...table.rows];
      if (!rows.length) return;
      const headerRow = rows.find((row) => row.querySelector('th')) || rows[0];
      const headers = [...headerRow.cells].map((cell) => cell.textContent.trim());
      const columns = Math.max(headers.length, ...rows.map((row) => row.cells.length));
      table.dataset.columns = String(columns);
      headerRow.classList.add('table-header-row');
      rows.forEach((row) => {
        if (row === headerRow) return;
        [...row.cells].forEach((cell, index) => {
          cell.dataset.label = headers[index] || `第 ${index + 1} 列`;
        });
      });
      const wrapper = table.closest('.table-scroll');
      if (wrapper) wrapper.classList.toggle('table-card-mode', columns >= 3);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(annotate), { once: true });
  else requestAnimationFrame(annotate);
})();
