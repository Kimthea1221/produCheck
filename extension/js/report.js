// extension/js/report.js
import { whenSessionReady, isUserLoggedIn, getCurrentUser, submitComplaint } from "../scripts/session.js";
import {
  LIMITS, validateProductName, validateUrl, validateStoreName,
  validateDescription, validateImageFile, liveLengthCheck
} from "../utils/validation.js";

let currentVerificationResult = 'unregistered';

function showReportView(viewId) {
  const views = document.querySelectorAll('.report-view, .report-view-guest');
  views.forEach(view => {
    view.classList.toggle('hidden', view.id !== viewId);
  });
}

function populateDetectedProduct(title, url) {
  // Guests no longer have a fillable form (sign-in required to report),
  // so there's nothing to populate for them.
  if (!isUserLoggedIn()) return;

  const nameEl = document.getElementById('complaint-product-name-user');
  const urlEl = document.getElementById('complaint-product-url-user');

  if (nameEl) nameEl.value = title || '';
  if (urlEl) urlEl.value = url || '';
}

function initAttachBoxes() {
  document.querySelectorAll('.report-attach-box').forEach(attachBox => {
    const attachInput = attachBox.querySelector('.report-attach-input');
    const attachText = attachBox.querySelector('.report-attach-text');
    const uploadIcon = attachBox.querySelector('.report-upload-icon');

    if (!attachInput) return;

    attachBox.addEventListener('click', () => attachInput.click());

    attachInput.addEventListener('change', () => {
      const errorEl = document.getElementById('report-attach-error');
      if (errorEl) errorEl.textContent = '';

      if (attachInput.files.length > 0) {
        const file = attachInput.files[0];

        const fileError = validateImageFile(file);
        if (fileError) {
          if (errorEl) errorEl.textContent = fileError;
          attachInput.value = '';                                  // discard the invalid file
          const oldPreview = attachBox.querySelector('.attach-preview-img');
          if (oldPreview) oldPreview.remove();                     // and any earlier preview
          if (attachText) attachText.classList.remove('hidden');
          if (uploadIcon) uploadIcon.classList.remove('hidden');
          return;
        }

        const reader = new FileReader();

        reader.onload = () => {
          let previewImg = attachBox.querySelector('.attach-preview-img');
          if (!previewImg) {
            previewImg = document.createElement('img');
            previewImg.className = 'attach-preview-img';
            attachBox.appendChild(previewImg);
          }
          previewImg.src = reader.result; // data URL — portable across chrome.storage.local and other pages

          if (attachText) attachText.classList.add('hidden');
          if (uploadIcon) uploadIcon.classList.add('hidden');
        };

        reader.readAsDataURL(file);
      }
    });
  });
}

function getActiveAttachment() {
  const isGuest = !isUserLoggedIn();
  const containerId = isGuest ? 'report-form-view-guest' : 'report-form-view';
  const container = document.getElementById(containerId);
  if (!container) return { data: null, name: null };

  const previewImg = container.querySelector('.attach-preview-img');
  const attachInput = container.querySelector('.report-attach-input');
  const file = attachInput?.files?.[0];

  return {
    data: previewImg ? previewImg.src : null,
    name: file ? file.name : null
  };
}

// function collectReportFormData(containerId) {
//   const container = document.getElementById(containerId);
//   if (!container) return null;

//   const productName = container.querySelector('#complaint-product-name')?.value.trim() || '';
//   const link = container.querySelector('#complaint-product-url')?.value.trim() || '';
//   const storeName = container.querySelector('#store-name')?.value.trim() || '';
//   const description = container.querySelector('#complaint-description')?.value.trim() || '';
//   const previewImg = container.querySelector('.attach-preview-img');
//   const attachment = previewImg ? previewImg.src : null; // demo-only object URL; not persisted past this session

//   return { productName, link, storeName, description, attachment };
// }

function validateReportForm({ productNameInput, productUrlInput, storeNameInput, descriptionInput }) {
  const checks = [
    [productNameInput, 'complaint-product-name-error', validateProductName(productNameInput.value)],
    [productUrlInput, 'complaint-product-url-error', validateUrl(productUrlInput.value)],
    [storeNameInput, 'store-name-error', validateStoreName(storeNameInput.value)],
    [descriptionInput, 'complaint-description-error', validateDescription(descriptionInput.value)],
  ];
  let isValid = true;
  checks.forEach(([input, errorId, message]) => {
    const errorEl = document.getElementById(errorId);
    if (errorEl) errorEl.textContent = message;
    input.classList.toggle('is-invalid', Boolean(message));
    if (message) isValid = false;
  });
  return isValid;
}

function clearReportForm(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const suffix = containerId.endsWith('-guest') ? '-guest' : '-user';
  const nameEl = document.getElementById('complaint-product-name' + suffix);
  const urlEl = document.getElementById('complaint-product-url' + suffix);
  const storeEl = document.getElementById('store-name' + suffix);
  const descEl = document.getElementById('complaint-description' + suffix);
  if (nameEl) nameEl.value = '';
  if (urlEl) urlEl.value = '';
  if (storeEl) storeEl.value = '';
  if (descEl) descEl.value = '';

  // clear leftover red error texts and red borders
  ['complaint-product-name-error', 'complaint-product-url-error', 'store-name-error',
   'complaint-description-error', 'report-attach-error'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  [nameEl, urlEl, storeEl, descEl].forEach((el) => { if (el) el.classList.remove('is-invalid'); });

  const attachBox = container.querySelector('.report-attach-box');
  if (attachBox) {
    const previewImg = attachBox.querySelector('.attach-preview-img');
    if (previewImg) previewImg.remove();

    const attachInput = attachBox.querySelector('.report-attach-input');
    if (attachInput) attachInput.value = '';

    const attachText = attachBox.querySelector('.report-attach-text');
    const uploadIcon = attachBox.querySelector('.report-upload-icon');
    if (attachText) attachText.classList.remove('hidden');
    if (uploadIcon) uploadIcon.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {

  whenSessionReady(() => {
     initAttachBoxes();

    [
      ['complaint-product-name-user', 'complaint-product-name-error', 'Product name', LIMITS.PRODUCT_NAME_MAX],
      ['complaint-product-url-user', 'complaint-product-url-error', 'Link/URL', LIMITS.URL_MAX],
      ['store-name-user', 'store-name-error', 'Store name', LIMITS.STORE_NAME_MAX],
      ['complaint-description-user', 'complaint-description-error', 'Description', LIMITS.DESCRIPTION_MAX],
    ].forEach(([inputId, errorId, label, max]) =>
      liveLengthCheck(document.getElementById(inputId), document.getElementById(errorId), label, max));

    document.querySelectorAll('.report-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const isGuest = !isUserLoggedIn();
        showReportView(isGuest ? 'report-cancelled-view-guest' : 'report-cancelled-view');
      });
    });

    document.querySelectorAll('.report-submit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!isUserLoggedIn()) {
          // don't submit — send them to sign in
          window.location.href = 'auth.html'; // or however you route to sign-in
          return;
        }

        let productNameInput = isActive('complaint-product-name');
        let productUrlInput = isActive('complaint-product-url');
        let storeNameInput = isActive('store-name');
        let descriptionInput = isActive('complaint-description');

        // stop here if anything is invalid (red text is shown under the fields)
        if (!validateReportForm({ productNameInput, productUrlInput, storeNameInput, descriptionInput })) return;

        showReportView('report-success-view');

        let url = sanitizeUrl(productUrlInput.value.trim());
        const attachment = getActiveAttachment();

        submitComplaint({ 
            productName: productNameInput.value.trim(),
            productUrl: url, 
            storeName: storeNameInput.value.trim(),
            platform: platform(url),
            description: descriptionInput.value.trim(),
            verificationResult: currentVerificationResult,
            attachmentData: attachment.data,      
            attachmentName: attachment.name
          }, (success, e) => {
            if (!success) {
              console.error("Complaint submission failed:", e);
            }
          });
      });
    });

    document.querySelectorAll('.submit-another-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const isGuest = !isUserLoggedIn();
        const formViewId = isGuest ? 'report-form-view-guest' : 'report-form-view';

        clearReportForm(formViewId);
        showReportView(formViewId);
      });
    });

    document.querySelectorAll('.back-to-report-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const isGuest = !isUserLoggedIn();
        const formViewId = isGuest ? 'report-form-view-guest' : 'report-form-view';

        clearReportForm(formViewId);
        showReportView(formViewId);
      });
    });
    
    applyAuthView();

    //babalikan 2
    chrome.storage.local.get(
      ['productTitle', 'productStatus', 'productUrl'],
      (data) => {
        const isGuest = !isUserLoggedIn();
        const status = data.productStatus;
        currentVerificationResult = status || 'unregistered';

        if (status === 'unregistered' || status === 'registered' || status === 'suspicious') {
          populateDetectedProduct(data.productTitle, data.productUrl);
          // Guests see the sign-in-required version of this view instead of a fillable form
          showReportView(isGuest ? 'report-form-view-guest' : 'report-form-view');
        } else {
          showReportView(isGuest ? 'report-default-view-guest' : 'report-default-view');
        }
      }
    );

  });

  // autoFillUrl();
});

//babalikan 1
function applyAuthView() {
  const loggedIn = typeof isUserLoggedIn === 'function' ? isUserLoggedIn() : false;

  if (loggedIn && typeof getCurrentUser === 'function') {
    const usernameEl = document.getElementById('home-username');
    if (usernameEl) usernameEl.textContent = getCurrentUser().username;
  }
}

// who's logged/active
function isActive(id){
  let type = isUserLoggedIn() ? '-user' : '-guest';
  return document.getElementById(id + type);
}

function platform(url) {
  if (url.includes("shopee")) return "shopee";
  if (url.includes("lazada")) return "lazada";
  if (url.includes("facebook")) return "facebook";
  if (url.includes("tiktok")) return "tiktok";
  return "no platform detected";
}

// auto-fill url
function autoFillUrl() {
  let params = new URLSearchParams(window.location.search);
  let productUrl = params.get('productUrl');
  if (productUrl) {
    let input = isActive('complaint-product-url');
    if (input) input.value = decodeURIComponent(productUrl);
  }
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