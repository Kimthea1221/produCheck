// extension/js/about.js
import { loadPartial } from "./partial-loader.js";

document.addEventListener('DOMContentLoaded', async () => {
  // show the real version from manifest.json so About can never be out of date
  const versionEl = document.getElementById('about-version');
  if (versionEl) versionEl.textContent = chrome.runtime.getManifest().version;

  // load the shared Terms text into the About page
  if (document.getElementById('terms-slot')) {
    await loadPartial('partials/terms.html', 'terms-slot');
  }
});