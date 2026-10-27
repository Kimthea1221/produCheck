// extension/js/nav.js
import { loadPartial } from "./partial-loader.js";

document.addEventListener('DOMContentLoaded', async () => {
  const navSlot = document.getElementById('nav-slot');
  if (navSlot) {
    await loadPartial('partials/nav.html', 'nav-slot');
    highlightActiveNav();
  }
});

function highlightActiveNav() {
  const currentPage = window.location.pathname.split('/').pop();
  document.querySelectorAll('.navigation-button').forEach(link => {
    link.classList.toggle('active', link.dataset.page === currentPage);
  });
}