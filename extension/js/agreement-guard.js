// extension/js/agreement-guard.js
// If the user has not agreed to the Terms yet, send them to the welcome page.
// Only the About page (so people can read the Terms) and the welcome page stay open.

const OPEN_PAGES = ['about.html', 'welcome.html'];
const currentPage = window.location.pathname.split('/').pop();

if (!OPEN_PAGES.includes(currentPage)) {
  chrome.storage.local.get(['termsAgreed'], ({ termsAgreed }) => {
    if (termsAgreed !== true) {
      window.location.href = 'welcome.html';
    }
  });
}
