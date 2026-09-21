(function () {
  'use strict';
  const data = window.BRA_DATA;
  if (!data || !data.metrics) return;
  document.querySelectorAll('[data-metric]').forEach((node) => {
    const key = node.getAttribute('data-metric');
    if (Object.prototype.hasOwnProperty.call(data.metrics, key)) {
      node.textContent = data.metrics[key];
    }
  });
  const generated = document.querySelector('[data-generated-at]');
  if (generated) generated.textContent = data.generatedAt;
})();
