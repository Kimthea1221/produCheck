
export const LIMITS = {
  USERNAME_MAX: 100,
  EMAIL_MAX: 254,
  PASSWORD_MIN: 8,
  PRODUCT_NAME_MAX: 150,
  STORE_NAME_MAX: 100,     
  URL_MAX: 2048,           
  DESCRIPTION_MAX: 500,
  ATTACHMENT_MAX_MB: 5,    
};

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters and include an uppercase letter and a special character.';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function checkText(value, label, max, required) {
  const v = (value || '').trim();
  if (required && !v) return `${label} is required.`;
  if (v.length > max) return `${label} must be ${max} characters or fewer (currently ${v.length}).`;
  return '';
}

export const validateUsername    = (v) => checkText(v, 'Username', LIMITS.USERNAME_MAX, true);
export const validateProductName = (v) => checkText(v, 'Product name', LIMITS.PRODUCT_NAME_MAX, true);
export const validateStoreName   = (v) => checkText(v, 'Store name', LIMITS.STORE_NAME_MAX, true);
export const validateUrl         = (v) => checkText(v, 'Link/URL', LIMITS.URL_MAX, true);
export const validateDescription = (v) => checkText(v, 'Description', LIMITS.DESCRIPTION_MAX, false);

export function validateEmail(value) {
  const v = (value || '').trim();
  if (!v) return 'Email is required.';
  if (v.length > LIMITS.EMAIL_MAX) return `Email must be ${LIMITS.EMAIL_MAX} characters or fewer (currently ${v.length}).`;
  if (!EMAIL_REGEX.test(v)) return 'Enter a valid email address.';
  return '';
}

export function validatePasswordStrength(value) {
  const ok = value.length >= LIMITS.PASSWORD_MIN && /[A-Z]/.test(value) && /[^A-Za-z0-9\s]/.test(value);
  return ok ? '' : PASSWORD_RULE_MESSAGE;
}

export function validateImageFile(file) {
  if (!file) return '';
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Only PNG, JPG, or WEBP images are allowed.';
  if (file.size > LIMITS.ATTACHMENT_MAX_MB * 1024 * 1024) {
    return `Image is too large (${(file.size / 1048576).toFixed(1)} MB). Maximum is ${LIMITS.ATTACHMENT_MAX_MB} MB.`;
  }
  return '';
}

export function liveLengthCheck(inputEl, errorEl, label, max) {
  if (!inputEl || !errorEl) return;
  inputEl.addEventListener('input', () => {
    const len = inputEl.value.trim().length;
    if (len > max) {
      errorEl.textContent = `${label} must be ${max} characters or fewer (currently ${len}).`;
      errorEl.dataset.tooLong = '1';
      inputEl.classList.add('is-invalid');
    } else if (errorEl.dataset.tooLong === '1') {   // only clear our own message
      errorEl.textContent = '';
      delete errorEl.dataset.tooLong;
      inputEl.classList.remove('is-invalid');
    }
  });
}