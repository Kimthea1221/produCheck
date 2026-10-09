// https://everify.store
console.log("Background service worker started");

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
      `http://localhost:8001/auth/refresh?refresh_token=${encodeURIComponent(refresh_token)}`,
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "checkAuth") {
    chrome.storage.local.get(['access_token'], (data) => {
      sendResponse({ loggedIn: !!data.access_token });
    });
    return true;
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
        const res = await fetch('http://localhost:8001/verify-screenshot', {
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
    //
    (async () => {
      try {
        const response = await fetch('http://localhost:8001/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ title: message.title, top_k: 5 })
        });

        const data = await response.json().catch(() => null);
        console.log('Backend response:', data);
        
        const status = data?.verdict === 'no_match' ? 'suspicious' : data?.verdict || 'unregistered';

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

        const res = await authorizedFetch('http://localhost:8001/submitVerification', {
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

        const response = await fetch('http://localhost:8001/marketplace-detections', { // http://localhost:8001
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
        const res = await authorizedFetch('http://localhost:8001/submitComplaint', {
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

});

function updateBadge(status, tabId) {
  const badgeConfig = {
    registered:   { text: '✓', color: '#16A34A' }, // green
    unregistered: { text: '!', color: '#DC2626' }, // red
    unverified:   { text: '?', color: '#D97706' }, // amber
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

