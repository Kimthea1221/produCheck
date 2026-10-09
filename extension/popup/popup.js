
// extension/popup/popup.js
import { whenSessionReady, isUserLoggedIn, getCurrentUser } from "../scripts/session.js";
import { LIMITS, liveLengthCheck } from "../utils/validation.js";

let lastProductTitle = '';
let lastProductUrl = '';
let lastVerificationStatus = 'unregistered';

document.addEventListener("DOMContentLoaded", () => {

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "closeEverifyModal" });
    }
  });

  whenSessionReady(() => {

    const verifyToggle = document.getElementById('verify-toggle');

    // load saved state (default true if never set)
    chrome.storage.local.get(['verifyButtonEnabled'], (result) => {
      verifyToggle.checked = result.verifyButtonEnabled !== false;
    });

    // save on change
    verifyToggle.addEventListener('change', () => {
      chrome.storage.local.set({ verifyButtonEnabled: verifyToggle.checked });
    });

    // popup always open home page first instead result page
    lastProductTitle = '';
    lastProductUrl = '';
    lastVerificationStatus = 'home';

    chrome.storage.local.set({
      productTitle: '',
      productUrl: '',
      productStatus: 'home'
    });

    showState('home');

    //babalikan 3
    // chrome.storage.local.get(
    //   ['productTitle', 'productPlatform', 'productUrl', 'productStatus'],
    //   (data) => {

    //     const title = data.productTitle;
    //     const url = data.productUrl;
    //     const status = data.productStatus || 'idle'; // here are the states: 'registered', 'unregistered', 'suspicious', 'home', 'idle', 'scanning'

    //     lastProductTitle = title || '';
    //     lastProductUrl = url || '';
    //     lastVerificationStatus = status;

    //     chrome.storage.local.set({
    //       productTitle: title,
    //       productUrl: url,
    //       productStatus: 'home'
    //     });

    //     if (status === 'registered') {
    //       const el = document.getElementById('product-name-registered');
    //       if (el) el.value = title;
    //       showState('registered');

    //     } else if (status === 'unregistered') {
    //       const el = document.getElementById('product-name-unregistered');
    //       if (el) el.value = title;
    //       showState('unregistered');

    //     } else if (status === 'suspicious') {
    //       const el = document.getElementById('product-name-suspicious');
    //       if (el) el.value = title;
    //       showState('suspicious');

    //     } else if (status === 'home') {
    //       showState('home');

    //     } else if (status === 'scanning') {
    //       showState('scanning');

    //     } else {
    //       showState('idle');
    //     }
    //   }
    // );

    applyAuthView();

    document.querySelectorAll('.btn-report').forEach(btn => {
      btn.addEventListener('click', () => {
        const complaintUrl = chrome.runtime.getURL('pages/report-complaint.html');
        chrome.tabs.create({ url: complaintUrl });
      });
    });

    // passed the extracted url on report.js
    // document.querySelectorAll('.btn-report').forEach(btn => {
    //   btn.addEventListener('click', async() => {
    //     const nameEl = document.getElementById('rf-product-name');
    //     const urlEl = document.getElementById('rf-product-url');
    //     if (nameEl) nameEl.value = lastProductTitle;
    //     if (urlEl) urlEl.value = sanitizeUrl(lastProductUrl);
    //     document.getElementById('rf-store-name').value = '';
    //     document.getElementById('rf-description').value = '';
    //     showState('report-form');
    //   });
    // });

    document.querySelectorAll('.btn-skip').forEach(btn => {
      btn.addEventListener('click', () => window.close());
    });

    const btnSigninHeader = document.getElementById('link-sign-in-up');
    if (btnSigninHeader) {
      btnSigninHeader.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/auth.html') });
      });
    }

    const btnAbout = document.getElementById('btn-about');
    if (btnAbout) {
      btnAbout.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/about.html') });
      });
    }

    const btnComplaintHistory = document.getElementById('history-btn');
    if (btnComplaintHistory) {
      btnComplaintHistory.addEventListener('click', (e) => {
        if (!isUserLoggedIn()) {
          e.preventDefault();
          chrome.tabs.create({ url: chrome.runtime.getURL('pages/auth.html') });
          return;
        }
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/history.html') });
      });
    }

    const btnComplaintStatus = document.getElementById('status-btn');
    if (btnComplaintStatus) {
      btnComplaintStatus.addEventListener('click', (e) => {
        if (!isUserLoggedIn()) {
          e.preventDefault();
          chrome.tabs.create({ url: chrome.runtime.getURL('pages/auth.html') });
          return;
        }
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/complaint-status.html') });
      });
    }

    document.querySelectorAll('.back-to-home-btn').forEach(btn => {
      btn.addEventListener('click', () => showState('home'));
    });

    liveLengthCheck(
      document.getElementById('manual-product-name'),
      document.getElementById('manual-input-error'),
      'Product name',
      LIMITS.PRODUCT_NAME_MAX
    );

    const btnManualInput = document.getElementById('manual-input-btn');
    if (btnManualInput) {
      btnManualInput.addEventListener('click', () => {
        const errorEl = document.getElementById('manual-input-error');
        const inputEl = document.getElementById('manual-product-name');
        if (errorEl) errorEl.textContent = '';
        if (inputEl) inputEl.value = '';
        showState('manual-input');
      });
    }

    const btnCancelManual = document.getElementById('btn-cancel-manual');
    if (btnCancelManual) {
      btnCancelManual.addEventListener('click', () => showState('home'));
    }

    const btnConfirmManual = document.getElementById('btn-confirm-manual');
    if (btnConfirmManual) {
      btnConfirmManual.addEventListener('click', async () => {
        const inputEl = document.getElementById('manual-product-name');
        const errorEl = document.getElementById('manual-input-error');
        const value = inputEl ? inputEl.value.trim() : '';

        if (!value) {
          if (errorEl) errorEl.textContent = 'Please enter the product name.';
          return;
        }

        if (value.length > LIMITS.PRODUCT_NAME_MAX) {
          if (errorEl) errorEl.textContent = `Product name must be ${LIMITS.PRODUCT_NAME_MAX} characters or fewer (currently ${value.length}).`;
          return;
        }
        
        if (errorEl) errorEl.textContent = '';

        lastProductTitle = value;

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        lastProductUrl = tab?.url || '';

        showState('scanning');

        chrome.runtime.sendMessage({
          action: "extractedTitle",
          title: lastProductTitle,
          platform: platform(lastProductUrl),
          url: lastProductUrl
        }, (response) => {
          const verdict = response?.data?.verdict || 'no_match';
          const status = verdict === 'no_match' ? 'suspicious' : verdict;
          lastVerificationStatus = status;
          const results = response?.data?.top5_registered || [];
          renderResult(status, lastProductTitle, results);
        });
      });
    }

    // const btnSkip = document.getElementById('btn-skip');
    // if (btnSkip) {
    //   btnSkip.addEventListener('click', () => window.close());
    // }

    const btnGuest = document.getElementById('btn-guest');
    if (btnGuest) {
      btnGuest.addEventListener('click', () => window.close());
    }

    const btnExit = document.getElementById('exit-btn');
    if (btnExit) {
      btnExit.addEventListener('click', () => window.close());
    }

  }); // end whenSessionReady

}); // end DOMContentLoaded


// --- Functions below can stay outside, since they don't touch the DOM until called ---
function platform(url) {
  if (url.includes("shopee")) return "shopee";
  if (url.includes("lazada")) return "lazada";
  if (url.includes("facebook")) return "facebook";
  if (url.includes("tiktok")) return "tiktok";
  return "unknown";
}

function renderResult(status, productTitle, results = []) {
  const stateId = ['registered', 'suspicious', 'unregistered'].includes(status)
    ? status
    : 'suspicious';

  const nameEl = document.getElementById(`product-name-${stateId}`);
  if (nameEl) nameEl.textContent = productTitle;

  if (stateId === 'registered' || stateId === 'unregistered') {
    populateMatches(stateId, results);
  }

  showState(stateId);

  chrome.storage.local.set({
    productTitle,
    productUrl: lastProductUrl,
    productStatus: stateId
  });
}

// function resolveManualProduct(title) {
//   chrome.storage.local.get(['productStatus'], (data) => {
//     // Demo-only: real matching isn't built yet, so this reuses whatever
//     // status is currently hardcoded for testing in the DOMContentLoaded block.
//     const status = data.productStatus || 'unregistered';

//     if (status === 'registered') {
//       const el = document.getElementById('product-name-registered');
//       if (el) el.textContent = title;
//       showState('registered');
//     } else if (status === 'suspicious') {
//       const el = document.getElementById('product-name-suspicious');
//       if (el) el.textContent = title;
//       showState('suspicious');
//     } else {
//       const el = document.getElementById('product-name-unregistered');
//       if (el) el.textContent = title;
//       showState('unregistered');
//     }

//     chrome.storage.local.set({ productTitle: title });
//   });
// }

function showState(state) {
  const states = ['idle', 'registered', 'suspicious', 'unregistered', 'home', 'scanning', 'manual-input'];
  states.forEach(s => {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(`state-${state}`);
  if (target) target.classList.remove('hidden');
}

function matchTier(pct) {
  if (pct >= 90) return 'best';
  if (pct >= 70) return 'high';
  return 'partial';
}

function populateMatches(stateId, results) {
  const suffix = stateId === 'unregistered' ? '-red' : '';
  const cards = document.querySelectorAll(`#state-${stateId} .match-card${suffix}`);

  cards.forEach((card, i) => {
    const match = results[i];
    if (!match) { card.style.display = 'none'; return; }
    card.style.display = '';

    const titleEl = card.querySelector(`.match-title${suffix}`);
    const percentEl = card.querySelector(`.match-percent${suffix}`);
    const fillEl = card.querySelector(`.progress-fill${suffix}`);
    const scoreEl = card.querySelector(`.match-score${suffix}`);

    if (titleEl) titleEl.textContent = match.title;
    const pct = Math.round((match.score ?? match.cosine_similarity ?? 0) * 100);
    const tier = matchTier(pct);

    if (percentEl) percentEl.textContent = `${pct}%`;

    if (fillEl) {
      fillEl.style.width = `${pct}%`;
      fillEl.classList.remove(`fill-best${suffix}`, `fill-high${suffix}`, `fill-partial${suffix}`);
      fillEl.classList.add(`fill-${tier}${suffix}`);
    }

    if (scoreEl) {
      scoreEl.classList.remove(`match-score-best${suffix}`, `match-score-high${suffix}`, `match-score-partial${suffix}`);
      scoreEl.classList.add(`match-score-${tier}${suffix}`);
    }
  });
}


function applyAuthView() {
  const loggedIn = typeof isUserLoggedIn === 'function' ? isUserLoggedIn() : false;

  const guestBanner = document.getElementById('home-banner-guest');
  const userBanner = document.getElementById('home-banner-user');
  const complaintsBtn = document.getElementById('status-btn');
  const historyBtn = document.getElementById('history-btn');

  if (guestBanner) guestBanner.classList.toggle('hidden', loggedIn);
  if (userBanner) userBanner.classList.toggle('hidden', !loggedIn);

  [complaintsBtn, historyBtn].forEach(btn => {
    if (btn) btn.classList.toggle('btn-disabled-guest', !loggedIn);
  });

  if (loggedIn && typeof getCurrentUser === 'function') {
    const usernameEl = document.getElementById('home-username');
    if (usernameEl) usernameEl.textContent = getCurrentUser().username;
  }
}
