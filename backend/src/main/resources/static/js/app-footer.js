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
(async function () {
  try {
    const response = await fetch('/api/ui-config', { cache: 'no-store' });
    if (!response.ok) return;
    const { development } = await response.json();
    if (development !== true || document.querySelector('.dev-environment-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'dev-environment-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = 'LOCAL DEV — Test environment';
    document.body.prepend(banner);
    document.title = `[DEV] ${document.title}`;
  } catch (error) {
    console.warn('Unable to load environment indicator.', error);
  }
})();
