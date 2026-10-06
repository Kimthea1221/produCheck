//content.js
console.log('FDA Checker content script loaded');
console.log("Hello World from content.js")

const verifyBtn = document.createElement("button");
verifyBtn.textContent = "Check Product";
verifyBtn.style.position = "fixed";
verifyBtn.style.display = "none";
verifyBtn.style.zIndex = "9999";
verifyBtn.style.padding = "6px 12px";
verifyBtn.style.backgroundColor = "#66BB6A";
verifyBtn.style.color = "#256428";
verifyBtn.style.border = "1px solid #256428";
verifyBtn.style.fontWeight = "bold";
verifyBtn.style.borderRadius = "15px";
verifyBtn.style.cursor = "pointer";
verifyBtn.style.top = "24px";
verifyBtn.style.right = "24px";
document.body.appendChild(verifyBtn);

let verifyButtonEnabled = true; // default
let lastStoreName = '';

// checking if its in the product page
function isProductPage() {

    const currentUrl = location.href;

    if ((currentUrl.includes("shopee.ph") && currentUrl.includes("-i.")) || currentUrl.includes("shopee.ph/product")) {
        console.log("Product page of shopee");
        return true;
    }    

    if (currentUrl.includes("lazada.com.ph/products/") && currentUrl.includes(".html")){
        console.log("Product page of lazada");
        return true;
    } 

    if (currentUrl.includes("facebook.com/marketplace/item/")) {
        console.log("Product page of facebook");
        return true;  
    } 

    if (currentUrl.includes("shop.tiktok.com/ph/pdp")) {
        console.log("Product page of tiktok");
        return true;
    }   

    return false;
}

function updateButton() {
  verifyBtn.style.display = (verifyButtonEnabled && isProductPage()) ? "block" : "none";
}

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    updateButton();
  }
}, 500);

chrome.storage.local.get(['verifyButtonEnabled'], (result) => {
  verifyButtonEnabled = result.verifyButtonEnabled !== false;
  updateButton();   // new
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.verifyButtonEnabled) {
    verifyButtonEnabled = changes.verifyButtonEnabled.newValue;
    updateButton();   // replaces the old display = "none" line
  }
});

function platform(url) {
  if (url.includes("shopee")) return "shopee";
  if (url.includes("lazada")) return "lazada";
  if (url.includes("facebook")) return "facebook";
  if (url.includes("tiktok")) return "tiktok";
  return "unknown";
}

let modal = null;
let lastProductTitle = '';
let lastProductUrl = '';
let lastVerificationStatus;
let lastAttachmentPath = null; // base64 data URL
let lastAttachmentName = null;

// Keep in sync with extension/utils/validation.js (content scripts can't import ES modules)
const RF_LIMITS = { PRODUCT_NAME_MAX: 150, STORE_NAME_MAX: 100, DESCRIPTION_MAX: 500, ATTACHMENT_MAX_MB: 5 };
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const RF_FIELDS = [
  { input: '#rf-product-name', error: '#rf-product-name-error', label: 'Product name', max: RF_LIMITS.PRODUCT_NAME_MAX, required: true },
  { input: '#rf-store-name',   error: '#rf-store-name-error',   label: 'Store name',   max: RF_LIMITS.STORE_NAME_MAX,   required: true },
  { input: '#rf-description',  error: '#rf-description-error',  label: 'Description',  max: RF_LIMITS.DESCRIPTION_MAX,  required: false },
];

// live = true while typing: only length is checked, "required" waits for submit
function validateRfField(cfg, live = false) {
  const el = modal.querySelector(cfg.input);
  const errEl = modal.querySelector(cfg.error);
  const value = el.value.trim();
  let msg = '';
  if (!live && cfg.required && !value) msg = `${cfg.label} is required.`;
  else if (value.length > cfg.max) msg = `${cfg.label} must be ${cfg.max} characters or fewer (currently ${value.length}).`;
  errEl.textContent = msg;
  el.classList.toggle('rf-input-invalid', msg !== '');
  return msg === '';
}

function validateReportFormModal() {
  // map() first so every field's error shows at once (not just the first failure)
  return RF_FIELDS.map((f) => validateRfField(f)).every(Boolean);
}

function createModal() {
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'everifymo-modal';
  modal.style.display = 'none';
  modal.style.position = 'fixed';
  modal.style.top = '20px';
  modal.style.right = '20px';
  modal.style.zIndex = '999999';
  modal.style.background = 'white';
  modal.style.padding = '16px';
  modal.style.borderRadius = '8px';
  modal.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  modal.style.width = '360px';
  modal.style.minHeight = '500px';
  modal.style.maxHeight = '600px';
  modal.style.overflowY = 'auto';
 
  modal.innerHTML = `
    <header class="mo-header">
      <img src="${chrome.runtime.getURL('assets/images/extension_icon.png')}" alt="ProduCheck Logo" class="mo-logo" />
      <h1 class="mo-extension-name">ProduCheck</h1>
      <button id="mo-close-x" class="mo-close-x" type="button" aria-label="Close">✕</button>
    </header>
    
    <main class="main-content">
      <!-- loading ui -->
      <div class="state hidden" id="state-loading">
        <div class="loading-copy">
          <div class="spinner"></div>
          <p class="state-message">Verifying product…</p>
        </div>
      </div>
 
       <!-- ui results for registered products -->
      <div class="state hidden" id="state-registered">
        <div class="registered-banner">
          <div class="icon-placeholder-green" aria-hidden="true">
            <img src="${chrome.runtime.getURL('assets/images/check_green_icon.png')}" alt="check_icon" />
          </div>
          <div class="registered-copy">
            <div class="registered-title">Registered Product!</div>
            <div class="registered-product">Product: <span id="product-name-registered"></span></div>
          </div>
        </div>
 
      <!-- ui top matches result -->
        <div class="top-matches">
          <div class="top-matches-title">Top Matches</div>
          <div class="top-matches-subtitle">Closest registered products to the detected listing.</div>
            <div class="match-legend">
            <div class="legend-item">
              <span class="legend-dot dot-best"></span>
              <span class="legend-label">Best Match</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot dot-high"></span>
              <span class="legend-label">High Match</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot dot-partial"></span>
              <span class="legend-label">Partial Match</span>
            </div>
          </div>
          <div class="match-list">
            <div class="match-card">
              <div class="rank-badge">#1</div>
              <div class="match-content">
                <div class="match-title"></div>
                <div class="progress-bar"><div class="progress-fill" style="width:0%;"></div></div>
              </div>
              <div class="match-score"><span class="match-percent"></span></div>
            </div>
            <div class="match-card">
              <div class="rank-badge">#2</div>
              <div class="match-content">
                <div class="match-title"></div>
                <div class="progress-bar"><div class="progress-fill" style="width:0%;"></div></div>
              </div>
              <div class="match-score"><span class="match-percent"></span></div>
            </div>
            <div class="match-card">
              <div class="rank-badge">#3</div>
              <div class="match-content">
                <div class="match-title"></div>
                <div class="progress-bar"><div class="progress-fill" style="width:0%;"></div></div>
              </div>
              <div class="match-score"><span class="match-percent"></span></div>
            </div>
            <div class="match-card">
              <div class="rank-badge">#4</div>
              <div class="match-content">
                <div class="match-title"></div>
                <div class="progress-bar"><div class="progress-fill" style="width:0%;"></div></div>
              </div>
              <div class="match-score"><span class="match-percent"></span></div>
            </div>
            <div class="match-card">
              <div class="rank-badge">#5</div>
              <div class="match-content">
                <div class="match-title"></div>
                <div class="progress-bar"><div class="progress-fill" style="width:0%;"></div></div>
              </div>
              <div class="match-score"><span class="match-percent"></span></div>
            </div>
          </div>

          <div class="action-buttons-green action-buttons">
            <button class="btn-skip-green btn-skip" type="button">Close</button>
          </div>
        </div>
      </div>

      <!-- ui result for suspicious product -->
      <div class="state hidden" id="state-suspicious">
        <div class="not-found-banner">
          <div class="icon-placeholder-orange" aria-hidden="true">
            <img src="${chrome.runtime.getURL('assets/images/suspicious_icon.png')}" alt="warning_icon" />
          </div>
          <div class="not-found-copy">
            <div class="not-found-title">Product Not Found!</div>
            <div class="not-found-product">Product: <span id="product-name-suspicious"></span></div>
          </div>
        </div>
 
        <div class="further-checking-section">
          <div class="further-checking-title">Further Checking Required</div>
          <div class="further-checking-text">Product not found in our database and
            may not be a cosmetic item the system checks. Registration status
            can't be guaranteed — manual verification is recommended.</div>
        </div>

        <div class="quick-check-guide">
          <div class="quick-check-title">Quick Check Guide</div>
          <div class="quick-check-tip">Look for an FDA CPR (Certificate of Product Registration) number printed on the back label imagery.</div>
          <div class="quick-check-tip">Verify if the manufacturer, country of origin, and complete ingredients list are clearly stated in the product description.</div>
          <div class="quick-check-tip">Be cautious if the price is unrealistically low compared to official brand flagship stores.</div>
        </div>
 
        <!-- report and close btn for suspicious product -->
        <div class="action-buttons-orange action-buttons">
            <button class="btn-report-orange btn-report" type="button">Report</button>
            <button class="btn-skip-orange btn-skip" type="button">Close</button>
        </div>
      </div>

      <!-- ui result for unregistered products -->
      <div class="state hidden" id="state-unregistered">
        <div class="unregistered-banner">
          <div class="icon-placeholder-red" aria-hidden="true">
            <img src="${chrome.runtime.getURL('assets/images/unregistered_icon.png')}" alt="cross_icon" />
          </div>
          <div class="unregistered-copy">
            <div class="unregistered-title">Unregistered Product!</div>
            <div class="unregistered-message">Product: <span id="product-name-unregistered"></span></div>
          </div>
        </div>
 
        <div class="top-matches-red">
          <div class="top-matches-title-red">Top Matches</div>
          <div class="top-matches-subtitle-red">Closest REGISTERED products to the detected listing.</div>
          <div class="match-legend-red">
            <div class="legend-item-red">
              <span class="legend-dot-red dot-best-red"></span>
              <span class="legend-label-red">Best Match</span>
            </div>
            <div class="legend-item-red">
              <span class="legend-dot-red dot-high-red"></span>
              <span class="legend-label-red">High Match</span>
            </div>
            <div class="legend-item-red">
              <span class="legend-dot-red dot-partial-red"></span>
              <span class="legend-label-red">Partial Match</span>
            </div>
          </div>
           <div class="match-list-red">
            <div class="match-card-red">
              <div class="rank-badge-red">#1</div>
              <div class="match-content-red">
                <div class="match-title-red"></div>
                <div class="progress-bar-red"><div class="progress-fill-red" style="width:0%;"></div></div>
              </div>
              <div class="match-score-red"><span class="match-percent-red"></span></div>
            </div>
            <div class="match-card-red">
              <div class="rank-badge-red">#2</div>
              <div class="match-content-red">
                <div class="match-title-red"></div>
                <div class="progress-bar-red"><div class="progress-fill-red" style="width:0%;"></div></div>
              </div>
              <div class="match-score-red"><span class="match-percent-red"></span></div>
            </div>
            <div class="match-card-red">
              <div class="rank-badge-red">#3</div>
              <div class="match-content-red">
                <div class="match-title-red"></div>
                <div class="progress-bar-red"><div class="progress-fill-red" style="width:0%;"></div></div>
              </div>
              <div class="match-score-red"><span class="match-percent-red"></span></div>
            </div>
            <div class="match-card-red">
              <div class="rank-badge-red">#4</div>
              <div class="match-content-red">
                <div class="match-title-red"></div>
                <div class="progress-bar-red"><div class="progress-fill-red" style="width:0%;"></div></div>
              </div>
              <div class="match-score-red"><span class="match-percent-red"></span></div>
            </div>
            <div class="match-card-red">
              <div class="rank-badge-red">#5</div>
              <div class="match-content-red">
                <div class="match-title-red"></div>
                <div class="progress-bar-red"><div class="progress-fill-red" style="width:0%;"></div></div>
              </div>
              <div class="match-score-red"><span class="match-percent-red"></span></div>
            </div>
          </div>

          <div class="action-buttons-red action-buttons">
            <button class="btn-report-red btn-report" type="button">Report</button>
            <button class="btn-skip-red btn-skip" type="button">Close</button>
          </div>
        </div>
      </div>

      <!-- report complaint ui(form) -->
      <div class="state hidden" id="state-report-form">
        <div class="rf-notice-banner">
          <img class="rf-notice-icon" src="${chrome.runtime.getURL('assets/images/report.png')}" alt="Report Icon" />
          <div class="rf-notice-text-container">
            <p class="rf-notice-title">Report this product</p>
            <p class="rf-notice-text">Make sure your details are accurate before submitting.</p>
          </div>
        </div>

        <div class="rf-field">
          <label class="rf-field-label" for="rf-product-name">Product Name/Title</label>
          <textarea id="rf-product-name" class="rf-input"></textarea>
          <div class="rf-field-error" id="rf-product-name-error" aria-live="polite"></div>
        </div>
        <div class="rf-field">
          <label class="rf-field-label" for="rf-product-url">Link/URL</label>
          <textarea id="rf-product-url" class="rf-input" readonly></textarea>
        </div>
        <div class="rf-field">
          <label class="rf-field-label" for="rf-store-name">Store Name</label>
          <textarea id="rf-store-name" class="rf-input" placeholder="Enter Store Name"></textarea>
          <div class="rf-field-error" id="rf-store-name-error" aria-live="polite"></div>
        </div>
        <div class="rf-field">
          <label class="rf-field-label" for="rf-description">Description (optional)</label>
          <textarea id="rf-description" class="rf-input" placeholder="What made this product look suspicious..."></textarea>
          <div class="rf-field-error" id="rf-description-error" aria-live="polite"></div>
        </div>
        <div class="rf-attach-box" id="rf-attach-box" role="button" tabindex="0">
          <input type="file" id="rf-attach-input" accept="image/png,image/jpeg,image/webp" class="hidden" />
          <img class="rf-upload-icon" src="${chrome.runtime.getURL('assets/images/upload_icon.png')}" alt="Upload Icon" />
          <span id="rf-attach-text" class="rf-attach-text">Attach screenshot (optional)</span>
          <img id="rf-attach-preview" class="rf-attach-preview-img" style="display:none;" />
        </div>

        <div class="rf-field-error" id="rf-attach-error" aria-live="polite"></div>

        <div class="rf-action-row">
          <button id="rf-cancel" class="rf-btn-cancel" type="button">Return to Results</button>
          <button id="rf-submit" class="rf-btn-submit" type="button">Submit Report</button>
        </div>
      </div>

      <div class="state hidden rf-result" id="state-report-success">
        <div class="icon-ring icon-ring--success">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="rf-result-title">Complaint Submitted</p>
        <p class="rf-result-message">Your report has been received. You can track its status in your account.</p>
      </div>

      <div class="state hidden rf-result" id="state-report-error">
        <div class="icon-ring icon-ring--error">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16.5v.01" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/></svg>
        </div>
        <p class="rf-result-title">Submission Failed</p>
        <p class="rf-result-message" id="report-error-message">Something went wrong.</p>
        <div class="action-row">
          <button class="btn btn-primary btn-error" id="rf-error-back" type="button">Back to Form</button>
        </div>
      </div>

      <div class="state hidden rf-result" id="state-report-unauthorized">
        <div class="icon-ring icon-ring--neutral">
          <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <p class="rf-result-title">Sign In Required</p>
        <p class="rf-result-message">You'll need an account to submit a report.</p>
        <div class="action-row">
          <button class="btn btn-ghost" id="rf-unauth-back" type="button">Back to Results</button>
          <button class="btn btn-primary" id="rf-unauth-login" type="button">Sign In</button>
        </div>
      </div>

    </main>
  `;
 
  document.body.appendChild(modal);

  // live red text while typing
  RF_FIELDS.forEach((f) => {
    modal.querySelector(f.input).addEventListener('input', () => validateRfField(f, true));
  });

  const attachBox = modal.querySelector('#rf-attach-box');
  const attachInput = modal.querySelector('#rf-attach-input');
  const attachPreview = modal.querySelector('#rf-attach-preview');
  const attachText = modal.querySelector('#rf-attach-text');
  
  attachBox.addEventListener('click', () => attachInput.click());

  attachInput.addEventListener('change', () => {
    const attachError = modal.querySelector('#rf-attach-error');
    attachError.textContent = '';

    const file = attachInput.files[0];
    if (!file) return;

    let fileError = '';
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      fileError = 'Only PNG, JPG, or WEBP images are allowed.';
    } else if (file.size > RF_LIMITS.ATTACHMENT_MAX_MB * 1024 * 1024) {
      fileError = `Image is too large (${(file.size / 1048576).toFixed(1)} MB). Maximum is ${RF_LIMITS.ATTACHMENT_MAX_MB} MB.`;
    }
    if (fileError) {
      attachError.textContent = fileError;
      attachInput.value = '';
      lastAttachmentPath = null;
      lastAttachmentName = null;
      attachPreview.style.display = 'none';
      attachText.style.display = 'block';
      return;
    }

    lastAttachmentName = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      lastAttachmentPath = reader.result; // e.g. "data:image/png;base64,...."
      attachPreview.src = lastAttachmentPath;
      attachPreview.style.display = 'block';
      attachText.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });

  modal.querySelector('#rf-error-back').addEventListener('click', () => {
    showState('state-report-form');
  });
 
  modal.querySelectorAll('.btn-skip').forEach(btn => {
    btn.addEventListener('click', () => { modal.style.display = 'none'; });
  });

  modal.querySelector('#rf-unauth-login').addEventListener('click', () => {
    // window.location.href = 'auth.html';
    chrome.runtime.sendMessage({ action: "openLogin" });
  });

  modal.querySelector('#rf-unauth-back').addEventListener('click', () => {
    showState(lastResultState || 'state-suspicious');
  });

  let lastResultState = '';
  modal.querySelectorAll('.btn-report').forEach(btn => {
    btn.addEventListener('click', () => {  
      chrome.runtime.sendMessage({ action: "checkAuth" }, (res) => {
        if (!res?.loggedIn) {
          lastResultState = btn.closest('.state').id;
          showState('state-report-unauthorized');
          return;
        }

        lastResultState = btn.closest('.state').id;
       
        const productName = modal.querySelector('#rf-product-name');
        const url = modal.querySelector('#rf-product-url');
       
        if (productName) productName.value = lastProductTitle;
        if (url) url.value = sanitizeUrl(lastProductUrl);
       
        modal.querySelector('#rf-store-name').value = lastStoreName;
        modal.querySelector('#rf-description').value = '';

        RF_FIELDS.forEach((f) => {
          modal.querySelector(f.error).textContent = '';
          modal.querySelector(f.input).classList.remove('rf-input-invalid');
        });
        modal.querySelector('#rf-attach-error').textContent = '';
       
        showState('state-report-form');
      });
    });
  });

  modal.querySelector('#rf-cancel').addEventListener('click', () => {
    if (lastResultState) {
      showState(lastResultState);
    } else {
      modal.style.display = 'none';
    }
  });

  modal.querySelector('#rf-submit').addEventListener('click', () => {
    if (!validateReportFormModal()) return;
    chrome.runtime.sendMessage({ action: "checkAuth" }, (authRes) => {
      if (!authRes?.loggedIn) {
        showState('state-report-unauthorized');
        return;
      }

      const complaint = {
        productName: modal.querySelector('#rf-product-name').value,
        productUrl: sanitizeUrl(lastProductUrl),
        storeName: modal.querySelector('#rf-store-name').value,
        description: modal.querySelector('#rf-description').value,
        platform: platform(lastProductUrl),
        verificationResult: lastVerificationStatus,
        attachmentData: lastAttachmentPath,
        attachmentName: lastAttachmentName
      };

      chrome.runtime.sendMessage({ action: "submitComplaint", data: complaint }, (response) => {
        console.log('submitComplaint response:', response);
        if (response?.success) {
          showState('state-report-success');
        } else {
          document.getElementById('report-error-message').textContent = response?.error || 'Failed to submit report. Please try again.';
          showState('state-report-error');
        }
        lastAttachmentPath = null;
        lastAttachmentName = null;
        attachPreview.style.display = 'none';
        attachText.style.display = 'block';
        attachInput.value = '';
      });
    });
  });

  modal.querySelector('#mo-close-x').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  return modal;
}

function sanitizeUrl(rawUrl) {
  try {
    let url = new URL(rawUrl);
    let suspiciousPatterns = /token|session|auth|sp_atk|spm/i;
    [...url.searchParams.keys()].forEach(key => {
        if (suspiciousPatterns.test(key)) {
            url.searchParams.delete(key);
        }
    });
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function showState(stateId) {
  modal.style.display = 'block';
  modal.querySelectorAll('.state').forEach(el => {
    el.classList.add('hidden');
  });
  const target = modal.querySelector(`#${stateId}`);
  target.classList.remove('hidden');

  const closeX = modal.querySelector('#mo-close-x');
  const reportStates = ['state-report-form', 'state-report-success', 'state-report-error'];
  closeX.style.display = reportStates.includes(stateId) ? 'block' : 'none';
}
 
function renderResult(status, productTitle, results = []) {
  const stateId = ['registered', 'suspicious', 'unregistered'].includes(status)
    ? `state-${status}`
    : 'state-suspicious';
 
  const nameSpan = modal.querySelector(`#product-name-${status}`);
  if (nameSpan) nameSpan.textContent = productTitle;
 
  if (status === 'registered' || status === 'unregistered') {
    populateMatches(stateId, results);
  }
 
  showState(stateId);
}

function matchTier(pct) {
  if (pct >= 90) return 'best';
  if (pct >= 70) return 'high';
  return 'partial';
}

function populateMatches(stateId, results) {
  const suffix = stateId === 'state-unregistered' ? '-red' : '';
  const cards = modal.querySelectorAll(`#${stateId} .match-card${suffix}`);
 
  cards.forEach((card, i) => {
    const match = results[i];
    if (!match) { card.style.display = 'none'; return; }
    card.style.display = '';
    card.querySelector(`.match-title${suffix}`).textContent = match.title;
    const pct = Math.round((match.score ?? match.cosine_similarity ?? 0) * 100);
    const tier = matchTier(pct);

    card.querySelector(`.match-percent${suffix}`).textContent = `${pct}%`;

    const fillEl = card.querySelector(`.progress-fill${suffix}`);
    fillEl.style.width = `${pct}%`;
    fillEl.classList.remove(`fill-best${suffix}`, `fill-high${suffix}`, `fill-partial${suffix}`);
    fillEl.classList.add(`fill-${tier}${suffix}`);

    const scoreEl = card.querySelector(`.match-score${suffix}`);
    if (scoreEl) {
      scoreEl.classList.remove(`match-score-best${suffix}`, `match-score-high${suffix}`, `match-score-partial${suffix}`);
      scoreEl.classList.add(`match-score-${tier}${suffix}`);
    }
  });
}

verifyBtn.addEventListener("click", async () => {
  lastProductUrl = location.href;

  // hide our own UI so it doesn't appear in the screenshot
  verifyBtn.style.display = "none";
  if (modal) modal.style.display = "none";

  document.getElementById("debug-shot")?.remove();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  chrome.runtime.sendMessage({ 
    action: "captureScreenshot",
    url: location.href,
    platform: platform(location.href)
  }, (response) => {
    updateButton();
    createModal();
    showState('state-loading');

    if (!response?.success) {
      console.error("Capture failed:", response?.error);
      return;
    }

    lastProductTitle = (response.title || '').slice(0, RF_LIMITS.PRODUCT_NAME_MAX);
    lastStoreName = response.store || '';

    chrome.runtime.sendMessage({
      action: "extractedTitle",
      title: lastProductTitle,
      platform: platform(location.href),
      url: location.href
    }, (res) => {
      const verdict = res?.data?.verdict || 'no_match';
      const status = verdict === 'no_match' ? 'suspicious' : verdict;
      lastVerificationStatus = status;
      renderResult(status, lastProductTitle, res?.data?.top5_registered || []);
    });
  });
});
