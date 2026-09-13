(async function () {
  try {
    const response = await fetch('/app-version.json', { cache: 'no-store' });
    if (!response.ok) return;
    const { version } = await response.json();
    if (typeof version !== 'string' || !version.trim()) return;
    const footer = document.createElement('footer');
    footer.className = 'app-footer';
    footer.textContent = `Tentacles v${version}`;
    document.body.appendChild(footer);
  } catch (error) {
    console.warn('Unable to load application version.', error);
  }
})();