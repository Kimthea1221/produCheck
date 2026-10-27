// extension/scripts/background.js
import { TERMS_VERSION, WELCOME_PAGE } from '../utils/agreement.js';

console.log("Background service worker started");

const PRODUCT_HOSTS = /(^|\.)(shopee\.ph|lazada\.com\.ph|facebook\.com|tiktok\.com)$/;
const FDA_CONTACT_LINE = 'FDA hotline (02) 8857-1900 · info@fda.gov.ph';

// ----- Terms agreement -----
// If the Terms date changed since the person agreed, switch the agreement off so they are asked again
async function syncAgreement() {
  const { termsAgreed, agreedTermsVersion } = await chrome.storage.local.get(['termsAgreed', 'agreedTermsVersion']);
  if (termsAgreed === true && agreedTermsVersion !== TERMS_VERSION) {
    await chrome.storage.local.set({ termsAgreed: false });
    return false;
  }
  return termsAgreed === true;
}

function openWelcomePage() {
  chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) });
}

// On a new install (or when the extension is reloaded/updated), open the welcome page if they have not agreed
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install' && details.reason !== 'update') return;
  const agreed = await syncAgreement();
  if (!agreed) openWelcomePage();
});

syncAgreement(); // also check every time the background worker wakes up

// ── Notification on revisit ──────────────────────────────────────────────────
// Fires an OS notification every time the user visits (or returns to) a product
// page they have already checked.  On each visit the stored product title is
// re-verified against our own backend so the user is notified immediately if a
// previously suspicious/unregistered product has since become registered.
// A short cooldown (5 s) deduplicates rapid duplicate tab events only.
const NOTIFICATION_COOLDOWN_MS = 5000;

/**
 * Check a tab URL against seenProducts and fire the OS notification whenever
 * the user lands on a previously-checked suspicious/unregistered product.
 * Uses a short time-based cooldown per (tabId, key) instead of a session-wide
 * once-only guard, so revisits (scroll away → scroll back, tab switch, browser
 * reopen) always get a fresh notification.
 */
async function checkTabForNotification(tabId, url) {
  const { termsAgreed } = await chrome.storage.local.get('termsAgreed');
  if (termsAgreed !== true) return;
  try { if (!PRODUCT_HOSTS.test(new URL(url).hostname)) return; } catch { return; }

  const key = productKey(url);
  // productKey() falls back to the full origin+path for unrecognised URLs
  if (!key || /^https?:\/\//.test(key)) return;

  const seenProducts = await migrateSeenProducts();
  const entry = seenProducts[key];
  if (!entry) return; // never checked on this product

  const storedStatus = typeof entry === 'object' ? entry.status : entry;
  const storedTitle = typeof entry === 'object' ? entry.title : null;
  if (!storedStatus || storedStatus === 'registered') return;

  const { notifiedTabs = {} } = await chrome.storage.session.get('notifiedTabs');
  const stampKey = `${tabId}:${key}`;
  const lastTime = notifiedTabs[stampKey] ?? 0;
  // Skip only if we already fired within the cooldown window (rapid duplicate events)
  if (Date.now() - lastTime < NOTIFICATION_COOLDOWN_MS) return;

  notifiedTabs[stampKey] = Date.now();
  await chrome.storage.session.set({ notifiedTabs });

  // If we have the stored product title, silently re-check the current status from
  // our own backend.  This is NOT automation — it is triggered purely by the user
  // navigating to the page, and it never touches the platform itself.
  if (storedTitle) {
    try {
      const res = await fetch('https://everify.store/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: storedTitle, top_k: 1 })
      });
      if (res.ok) {
        const data = await res.json();
        const freshVerdict = data?.verdict;
        const freshStatus = (!freshVerdict || freshVerdict === 'no_match') ? 'suspicious' : freshVerdict;

        if (freshStatus !== storedStatus) {
          // Status changed — persist the updated entry
          const updated = { ...seenProducts, [key]: { status: freshStatus, title: storedTitle } };
          await chrome.storage.local.set({ seenProducts: updated });

          if (freshStatus === 'registered') {
            // Great news — notify and stop (don't show the 'checked before' notice)
            showNotification(`status-${key}`, 'Product Now Registered!',
              `"${storedTitle}" is now in the FDA-registered products list. Click Check Product to see the full result.`);
            return;
          }
          // For other status changes (e.g. suspicious → unregistered), fall through
          // and show the notice using the fresh status
          showNotification(`status-${key}`, 'You checked this product before',
            `Status updated: ${statusLabel(freshStatus)}. Click Check Product for the full result.`,
            FDA_CONTACT_LINE);
          return;
        }
      }
    } catch { /* network unavailable — fall through to show the stored status */ }
  }

  // Default: show the stored status (backend unreachable or no title stored yet)
  showNotification(`status-${key}`, 'You checked this product before',
    `Your earlier result was: ${statusLabel(storedStatus)}. Results can change, so click Check Product again for the latest result.`,
    FDA_CONTACT_LINE);
}

// Covers full page loads (status:'complete') AND SPA pushState URL changes
// (changeInfo.url).  Both event types wake the SW reliably.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || (changeInfo.status === 'complete' ? tab.url : null);
  if (url) checkTabForNotification(tabId, url).catch(console.error);
});

// Covers the case where the user switches to an already-open product tab
// (e.g. after browser restore — no onUpdated fires, but onActivated does).
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) checkTabForNotification(tabId, tab.url).catch(console.error);
  } catch { /* tab not accessible (e.g. chrome:// pages) */ }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  chrome.action.setBadgeText({ text: '', tabId });
  // Clean up all notifiedTabs entries belonging to this tab (keys are "tabId:productKey")
  const { notifiedTabs = {} } = await chrome.storage.session.get('notifiedTabs');
  const prefix = `${tabId}:`;
  const keysToDelete = Object.keys(notifiedTabs).filter(k => k.startsWith(prefix));
  if (keysToDelete.length) {
    keysToDelete.forEach(k => delete notifiedTabs[k]);
    await chrome.storage.session.set({ notifiedTabs });
  }
});

/**
 * One-time migration: older builds stored seenProducts with the raw URL as the
 * key instead of the canonical productKey(). Re-key any such entries so that
 * lookups with the current productKey() format will actually find them.
 */
async function migrateSeenProducts() {
  const { seenProducts = {} } = await chrome.storage.local.get('seenProducts');
  let changed = false;
  const migrated = {};
  for (const [k, v] of Object.entries(seenProducts)) {
    // Normalise the key: legacy keys start with "https://" or "http://"
    const canonical = (k.startsWith('http://') || k.startsWith('https://'))
      ? productKey(k)
      : k;
    if (canonical !== k) {
      changed = true;
      console.log('[seenProducts] migrated key', k, '->', canonical);
    }
    // Normalise the value: old format was a plain string status,
    // new format is { status, title } — upgrade silently.
    const entry = (typeof v === 'string') ? { status: v, title: '' } : v;
    if (typeof v === 'string') changed = true;
    migrated[canonical] = entry;
  }
  if (changed) await chrome.storage.local.set({ seenProducts: migrated });
  return migrated;
}

function productKey(url) {
  try {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname);
    let m;
    if (u.hostname.includes('shopee') && (m = p.match(/-i\.(\d+)\.(\d+)/))) return `shopee:${m[1]}.${m[2]}`;
    if (u.hostname.includes('lazada') && (m = p.match(/-i(\d+)/))) return `lazada:${m[1]}`;
    if (u.hostname.includes('tiktok') && (m = p.match(/\/pdp\/(?:.*\/)?(\d+)\/?$/))) return `tiktok:${m[1]}`;
    if (u.hostname.includes('facebook') && (m = p.match(/\/marketplace\/item\/(\d+)/))) return `facebook:${m[1]}`;
    return u.origin + u.pathname;   // fallback for anything else
  } catch {
    return url;
  }
}

function showNotification(id, title, message, contextMessage) {
  const uniqueId = `${id}-${Date.now()}`;
  chrome.notifications.create(uniqueId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/images/icon128.png'),
    title,
    message,
    ...(contextMessage ? { contextMessage } : {})
  }, () => {
    if (chrome.runtime.lastError) console.error('Notification error:', chrome.runtime.lastError.message);
  });
}

function statusLabel(status) {
  if (status === 'registered') return 'Registered';
  if (status === 'unregistered') return 'Unregistered';
  if (status === 'suspicious') return 'Suspicious';
  return status;
}

async function notifyOnStatusChange(message, status) {
  const key = productKey(message.url);
  // Always migrate first so we are working with canonical keys
  const seenProducts = await migrateSeenProducts();
  const entry = seenProducts[key];
  const previous = typeof entry === 'object' ? entry?.status : entry;
  const title = message.title || (typeof entry === 'object' ? entry?.title : '') || '';

  if (status !== 'registered') {
    showNotification(`status-${key}`, 'Product not confirmed as registered',
      `ProduCheck's result: ${statusLabel(status)}. Please confirm on the FDA Verification Portal (verification.fda.gov.ph).`,
      FDA_CONTACT_LINE);
  } else if (previous && previous !== 'registered') {
    showNotification(`status-${key}`, '🎉 Product Now Registered!',
      `"${title || 'This product'}" is now in the FDA-registered products list. You can double-check on verification.fda.gov.ph.`);
  }

  // Store both status AND title so checkTabForNotification can re-verify on the next visit
  seenProducts[key] = { status, title };
  await chrome.storage.local.set({ seenProducts });
}

async function authorizedFetch(url, options = {}) {
  let { access_token, refresh_token } = await chrome.storage.local.get(['access_token', 'refresh_token']);

  const buildOptions = (token) => ({
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  });

  let res = await fetch(url, buildOptions(access_token));

  if (res.status === 401 && refresh_token) {
    const refreshRes = await fetch(
      `https://everify.store/auth/refresh?refresh_token=${encodeURIComponent(refresh_token)}`,
      { method: 'POST' }
    );

    if (refreshRes.ok) {
      const refreshData = await refreshRes.json();
      await chrome.storage.local.set({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token
      });
      res = await fetch(url, buildOptions(refreshData.access_token)); // retry once
    } else {
      await chrome.storage.local.remove(['access_token', 'refresh_token', 'token_type', 'username', 'email']);
    }
  }

  return res;
}

// These actions do real work (read the page, call the server), so they only run after the person agrees
const NEEDS_AGREEMENT = ['captureScreenshot', 'verifyScreenshot', 'extractedTitle', 'recordDisplayedDetection', 'submitComplaint'];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (NEEDS_AGREEMENT.includes(message.action)) {
    chrome.storage.local.get('termsAgreed', ({ termsAgreed }) => {
      if (termsAgreed === true) {
        handleMessage(message, sender, sendResponse);
      } else {
        sendResponse({ success: false, status: 'error', data: null, error: 'Please agree to the Terms first.' });
      }
    });
    return true; // the answer comes a moment later
  }
  return handleMessage(message, sender, sendResponse);
});

function handleMessage(message, sender, sendResponse) {
  if (message.action === "checkAuth") {
    chrome.storage.local.get(['access_token'], (data) => {
      sendResponse({ loggedIn: !!data.access_token });
    });
    return true;
  }

  if (message.action === 'pageVisited') {
    // This path only returns the saved status so content.js can show the
    // in-page banner.  The OS notification is now fired by tabs.onUpdated /
    // tabs.onActivated (see above), which wake the SW before this message
    // is ever sent — removing the cold-start race entirely.
    (async () => {
      const key = productKey(message.url);
      const seenProducts = await migrateSeenProducts();
      const status = seenProducts[key];
      console.log('[pageVisited] key:', key, '| status:', status);
      sendResponse({ status: status || null });
    })();
    return true;
  }

  if (message.action === "captureScreenshot") {
    const host = sender.tab ? new URL(sender.tab.url).hostname : "";
    if (!PRODUCT_HOSTS.test(host)) {
      sendResponse({ success: false, error: "Not an allowed site" });
      return;
    }

    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "jpeg", quality: 90 }, async (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ success: true, dataUrl });
    });
    return true;
  }

  if (message.action === "verifyScreenshot") {
    (async () => {
      try {
        const res = await fetch('https://everify.store/verify-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: message.image,
            url: message.url,
            platform: message.platform,
            dpr: message.dpr,
            rect: message.rect
          })
        });

        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        sendResponse({
          success: true,
          title: data.title,
          store: data.store,
          brand: data.brand,
          searchText: data.search_text,
          error: data.error
        });
      } catch (e) {
        sendResponse({
          success: false,
          error: e.message
        });
      }
    })();
    return true;
  }

  if (message.action === "openLogin") {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/auth.html') });
    return true;
  }

  if (message.action === 'extractedTitle') {
    (async () => {
      let verified = false;
      console.log('Background received extractedTitle:', message.title);
      try {
        const response = await fetch('https://everify.store/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ title: message.title, top_k: 5 })
        });

        const data = await response.json().catch(() => null);
        console.log('Backend response:', data);

        if (!response.ok || !data?.verdict) {
          console.error('verify failed:', response.status, data);
          sendResponse({ status: 'error', data: null });
          return;
        }

        const status = data?.verdict === 'no_match' ? 'suspicious' : data?.verdict || 'unregistered';
        notifyOnStatusChange(message, status).catch(console.error);

        // Store the extracted product info in chrome.storage
        chrome.storage.local.set({
          productTitle: message.title,
          productPlatform: message.platform,
          productUrl: message.url,
          productStatus: status
        }, () => {
          console.log('Product info stored:', message.title);
        });

        if (sender.tab && sender.tab.id) {
          updateBadge(status, sender.tab.id);
        }

        sendResponse({ status: 'success', data: data });
        verified = true;

        const res = await authorizedFetch('https://everify.store/submitVerification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_title: message.title,
            platform: message.platform,
            verification_result: status
          })
        });

        const resData = await res.json().catch(() => null);
        if (!res.ok) {
          console.error('submitVerification failed:', resData);
        }

      } catch (error) {
        //
        console.error('Error sending title to backend:', error);
        if (verified) return;
        const status = 'unregistered';
        chrome.storage.local.set({
          productTitle: message.title,
          productPlatform: message.platform,
          productUrl: message.url,
          productStatus: status
        }, () => {
          console.log('Product info stored with error fallback:', message.title);
        });

        if (sender.tab && sender.tab.id) {
          updateBadge(status, sender.tab.id);
        }

        sendResponse({ status: 'error', data: null });
      }
    })();
    return true;
  }

  if (message.action === 'recordDisplayedDetection') {
    (async () => {
      try {
        if (!['registered', 'unregistered'].includes(message.recordType) || !message.displayedTitle) {
          return;
        }

        const response = await fetch('https://everify.store/marketplace-detections', { // http://localhost:8001
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record_type: message.recordType,
            displayed_title: message.displayedTitle
          })
        });
        console.log('recordDisplayedDetection response:', message.recordType, message.displayedTitle, response.status);
        if (!response.ok) {
          console.error('recordDisplayedDetection failed:', await response.text());
        }
      } catch (error) {
        console.error('Error recording displayed detection:', error);
      }
    })();
    return true;
  }

  if (message.action === 'submitComplaint') {
    (async () => {
      try {
        const res = await authorizedFetch('https://everify.store/submitComplaint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_title: message.data.productName,
            product_url: message.data.productUrl,
            store_name: message.data.storeName,
            consumer_description: message.data.description,
            platform: message.data.platform,
            verification_result: message.data.verificationResult,
            attachment_data: message.data.attachmentData,
            attachment_name: message.data.attachmentName
          })
        });

        const resData = await res.json().catch(() => null);

        if (!res.ok) {
          console.error('submitComplaint failed:', resData);
          sendResponse({ success: false, error: resData?.detail || 'Submission failed' });
          return;
        }

        sendResponse({ success: true, data: resData });

      } catch (error) {
        console.error('Error submitting complaint:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

}

function updateBadge(status, tabId) {
  const badgeConfig = {
    registered: { text: '✓', color: '#16A34A' }, // green
    unregistered: { text: '!', color: '#DC2626' }, // red
    suspicious: { text: '?', color: '#D97706' }, // amber
    idle: { text: '', color: '#000000' }  // clears badge
  };

  const config = badgeConfig[status] || badgeConfig.idle;

  chrome.action.setBadgeText({ text: config.text, tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: config.color, tabId: tabId });
}

// Clear the badge when the user navigates away or closes the tab,
// so it doesn't show a stale result on a page with no product
// chrome.tabs.onRemoved.addListener((tabId) => {
//   chrome.action.setBadgeText({ text: '', tabId: tabId });
// });

