// extension/js/partial-loader.js
// Fetches an HTML fragment and injects it into a placeholder div.
// Returns a promise so calling code can wait until it's actually in the DOM.
export async function loadPartial(url, targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const response = await fetch(chrome.runtime.getURL(url));
  const html = await response.text();
  target.innerHTML = html;
}