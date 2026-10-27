// extension/js/welcome.js
import { loadPartial } from "./partial-loader.js";
import { TERMS_VERSION } from "../utils/agreement.js";

document.addEventListener('DOMContentLoaded', async () => {
  // show the shared Terms text inside the scroll box
  await loadPartial('partials/terms.html', 'terms-slot');

  const checkbox = document.getElementById('agree-checkbox');
  const continueBtn = document.getElementById('btn-continue');
  const noThanksBtn = document.getElementById('btn-no-thanks');
  const reviewAgainBtn = document.getElementById('btn-review-again');
  const mainView = document.getElementById('welcome-main');
  const doneView = document.getElementById('welcome-done');
  const declinedView = document.getElementById('welcome-declined');

  // Continue stays greyed out until the box is ticked
  checkbox.addEventListener('change', () => {
    continueBtn.disabled = !checkbox.checked;
  });

  // "Continue": remember the agreement (in this browser only) and the Terms date
  continueBtn.addEventListener('click', () => {
    if (!checkbox.checked) return;
    chrome.storage.local.set({
      termsAgreed: true,
      agreedTermsVersion: TERMS_VERSION,
      agreedAt: new Date().toISOString()
    }, () => {
      mainView.classList.add('hidden');
      doneView.classList.remove('hidden');
    });
  });

  // "No, thanks": keep ProduCheck switched off
  noThanksBtn.addEventListener('click', () => {
    chrome.storage.local.set({ termsAgreed: false }, () => {
      mainView.classList.add('hidden');
      declinedView.classList.remove('hidden');
    });
  });

  // "Review the Terms again" after choosing No, thanks
  reviewAgainBtn.addEventListener('click', () => {
    declinedView.classList.add('hidden');
    mainView.classList.remove('hidden');
    checkbox.checked = false;
    continueBtn.disabled = true;
  });

  document.querySelectorAll('.btn-close-tab').forEach((btn) => {
    btn.addEventListener('click', () => window.close());
  });
});
