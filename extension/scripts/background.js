// extension/scripts/background.js
import { TERMS_VERSION, WELCOME_PAGE } from '../utils/agreement.js';

console.log("Background service worker started");

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

function productKey(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

const FDA_CONTACT_LINE = 'FDA hotline (02) 8857-1900 · info@fda.gov.ph';

function showNotification(id, title, message, contextMessage) {
  chrome.notifications.clear(id, () => {
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/images/icon128.png'),
      title,
      message,
      ...(contextMessage ? { contextMessage } : {})
    }, () => {
      if (chrome.runtime.lastError) console.error('Notification error:', chrome.runtime.lastError.message);
    });
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
  const { seenProducts = {} } = await chrome.storage.local.get('seenProducts');
  const previous = seenProducts[key];

  if (status !== 'registered') {
    showNotification(`status-${key}`, 'Product not confirmed as registered',
      `ProduCheck's result: ${statusLabel(status)}. Please confirm on the FDA Verification Portal (verification.fda.gov.ph).`,
      FDA_CONTACT_LINE);
  } else if (previous && previous !== 'registered') {
    showNotification(`status-${key}`, 'Good news',
      'This product now matches the FDA product list used by ProduCheck. You can double-check on verification.fda.gov.ph.');
  }

  seenProducts[key] = status;
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
const NEEDS_AGREEMENT = ['pageVisited', 'captureScreenshot', 'extractedTitle', 'recordDisplayedDetection', 'submitComplaint'];

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
    (async () => {
      const key = productKey(message.url);
      const { seenProducts = {} } = await chrome.storage.local.get('seenProducts');
      const status = seenProducts[key];
      if (status && status !== 'registered') {
        showNotification(`status-${key}`, 'You checked this product before',
          `Your earlier result was: ${statusLabel(status)}. Results can change, so click Check Product again for the latest result.`,
          FDA_CONTACT_LINE);
      }
    })();
    return;
  }

  if (message.action === "captureScreenshot") {
    const host = sender.tab ? new URL(sender.tab.url).hostname : "";
    if (!/(^|\.)(shopee\.ph|lazada\.com\.ph|facebook\.com|tiktok\.com)$/.test(host)) {
      sendResponse({ success: false, error: "Not an allowed site" });
      return;
    }

    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, async (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      try {
        const res = await fetch('https://everify.store/verify-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl, url: message.url, platform: message.platform })
        });
        const data = await res.json();
        sendResponse({ success: true, dataUrl, title: data.title, store: data.store });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    });
    return true;  
  }

  if (message.action === "openLogin") {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/auth.html') });
    return true;
  }

  console.log('Background received message:', message);
  if (message.action === 'extractedTitle') {
    (async () => {
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
        
        const status = data?.verdict === 'no_match' ? 'suspicious' : data?.verdict || 'unregistered';
        await notifyOnStatusChange(message, status);

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
    registered:   { text: '✓', color: '#16A34A' }, // green
    unregistered: { text: '!', color: '#DC2626' }, // red
    suspicious:   { text: '?', color: '#D97706' }, // amber
    idle:         { text: '',  color: '#000000' }  // clears badge
  };

  const config = badgeConfig[status] || badgeConfig.idle;

  chrome.action.setBadgeText({ text: config.text, tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: config.color, tabId: tabId });
}

// Clear the badge when the user navigates away or closes the tab,
// so it doesn't show a stale result on a page with no product
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.action.setBadgeText({ text: '', tabId: tabId });
});

