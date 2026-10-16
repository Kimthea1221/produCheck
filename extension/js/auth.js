//Auth.js
import {
  whenSessionReady,
  isUserLoggedIn,
  getCurrentUser,
  logoutUser,
  resendOtpSession,
  requestPasswordReset,
  verifyResetOtp,
  confirmPasswordReset,
  verifyOtp,
  changePendingUsername,
  registerUser,
  loginUser,
  googleLogin
} from "../scripts/session.js";
import {
  LIMITS, PASSWORD_RULE_MESSAGE, validateUsername, validateEmail,
  validatePasswordStrength, liveLengthCheck
} from "../utils/validation.js";

document.addEventListener('DOMContentLoaded', () => {
  const GOOGLE_LOGIN_ENABLED = false;
  const emailField = document.getElementById('email-field');
  const otpField = document.getElementById('otp-field');
  const otpDigitInputs = Array.from(document.querySelectorAll('#otp-field .otp-digit-input'));
  const otpError = document.getElementById('otp-error');
  const otpDevPreview = document.getElementById('otp-dev-preview');
  const otpVerifyButton = document.getElementById('otp-verify-button');
  const resendOtpLink = document.getElementById('resend-otp-link');
  const backFromOtpLink = document.getElementById('back-from-otp-link');
  const backFromForgotOtpLink = document.getElementById('back-from-forgot-otp-link');
  let otpPendingEmail = '';
  let otpCountdownInterval = null;
  let forgotOtpCountdownInterval = null;
  let otpPendingMode = 'signin';
  const otpCountdownEl = document.getElementById('otp-countdown');
  const forgotOtpCountdownEl = document.getElementById('forgot-otp-countdown');
  let lastEnteredOtp = '';
  const forgotPasswordFields = document.getElementById('forgot-password-fields');
  const forgotConfirmButton = document.getElementById('forgot-confirm-button');
  const newPasswordInput = document.getElementById('new-password');
  const confirmNewPasswordInput = document.getElementById('confirm-new-password');
  const newPasswordError = document.getElementById('new-password-error');
  const confirmNewPasswordError = document.getElementById('confirm-new-password-error');
  const tabsContainer = document.querySelector('.tabs');
  const orDivider = document.querySelector('.or-divider');
  const tabs = document.querySelectorAll('[data-auth-mode]');
  const usernameField = document.getElementById('signup-username-field');
  const usernameInput = document.getElementById('username');
  const usernameError = document.getElementById('username-error');
  const emailInput = document.getElementById('email');
  const signinPasswordField = document.getElementById('signin-password-field');
  const passwordInput = document.getElementById('password');
  const signupPasswordFields = document.getElementById('signup-password-fields');
  const createPasswordInput = document.getElementById('create-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const backToSigninLink = document.getElementById('back-to-signin-link');
  const noticeTitle = document.getElementById('auth-notice-title');
  const noticeText = document.getElementById('auth-notice-text');
  const primaryButton = document.getElementById('auth-primary-button');
  const emailError = document.getElementById('email-error');
  const passwordError = document.getElementById('password-error');
  const createPasswordError = document.getElementById('create-password-error');
  const confirmPasswordError = document.getElementById('confirm-password-error');
  const forgotLink = document.querySelector('.forgot-link');
  const guestBtn = document.getElementById('btn-guest');
  const googleLoginBtn = document.getElementById('google-login-btn');
  const googleError = document.getElementById('googleError');
  const forgotOtpField = document.getElementById('forgot-otp-field');
  const forgotOtpInputs = Array.from(document.querySelectorAll('#forgot-otp-field .forgot-otp-digit-input'));
  const forgotOtpError = document.getElementById('forgot-otp-error');
  const resendForgotOtpLink = document.getElementById('resend-forgot-otp-link');
  const newPasswordField = document.getElementById('new-password-field');
  const confirmNewPasswordField = document.getElementById('confirm-new-password-field');
  const otpUsernameFixField = document.getElementById('otp-username-fix-field');
  const otpNewUsernameInput = document.getElementById('otp-new-username');
  const otpUsernameFixError = document.getElementById('otp-username-fix-error');
  const otpUsernameFixButton = document.getElementById('otp-username-fix-button');

  // live red text if the user types past the limit
  liveLengthCheck(usernameInput, usernameError, 'Username', LIMITS.USERNAME_MAX);
  liveLengthCheck(emailInput, emailError, 'Email', LIMITS.EMAIL_MAX);
  liveLengthCheck(otpNewUsernameInput, otpUsernameFixError, 'Username', LIMITS.USERNAME_MAX);

  // --- Password show/hide eye icon toggle ---
  document.querySelectorAll('.toggle-password-visibility').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      const icon = btn.querySelector('.eye-icon');
      if (!input) return;

      const willShow = input.type === 'password';
      input.type = willShow ? 'text' : 'password';
      if (icon) {
        icon.src = willShow
          ? '../assets/images/eye_close_icon.png'
          : '../assets/images/eye_open_icon.png';
      }
      btn.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
    });
  });

  // --- check if the screen is currently in signin/singup mode
  let currentMode = 'signin';

  // --- text for each mode (swapped in by updateMode() below)
  const authModes = {
    signin: {
      title: 'Signing in is optional',
      text: 'You can still verify products as a guest. Sign in or Sign up to file complaints, and to view your verification history, complaints, and report status.',
      buttonLabel: 'Sign In',
      documentTitle: 'ProduCheck | Sign In'
    },
    signup: {
      title: 'Signing up is optional',
      text: 'You can still verify products as a guest. Sign in or Sign up to file complaints, and to view your verification history, complaints, and report status.',
      buttonLabel: 'Sign Up',
      documentTitle: 'ProduCheck | Sign Up'
    }
  };


  // Wipes every validation error message and red "invalid" outline back to clean
  const clearErrors = () => {
    [emailError, passwordError, createPasswordError, confirmPasswordError, usernameError, googleError, forgotOtpError, otpError].forEach((errorNode) => {
      if (errorNode) {
        errorNode.textContent = '';
        errorNode.classList.remove('is-success');
      }
    });

    [emailInput, passwordInput, createPasswordInput, confirmPasswordInput, usernameInput].forEach((inputNode) => {
      if (inputNode) {
        inputNode.classList.remove('is-invalid');
      }
    });
  };

  // --- put a error message on <p> elements
  const setError = (node, message) => {
    if (node) {
      node.textContent = message;
      node.classList.remove('is-success');
    }
  };

  // --- email / password rules now come from utils/validation.js ---
  const isValidEmail = (value) => validateEmail(value) === '';
  const isStrongPassword = (value) => validatePasswordStrength(value) === '';

  // Switches the whole form between "Sign In" view and "Sign Up" view
  const updateMode = (mode) => {
    currentMode = mode;
    const settings = authModes[mode] || authModes.signin;

    const noticeBanner = document.querySelector('.notice-banner');
    if (noticeBanner) noticeBanner.classList.remove('notice-banner-success');

    tabs.forEach((tab) => {
      const isActive = tab.dataset.authMode === mode;
      tab.classList.toggle('active', isActive);
      tab.classList.toggle('inactive', !isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    if (noticeTitle) {
      noticeTitle.textContent = settings.title;
    }

    if (noticeText) {
      noticeText.textContent = settings.text;
    }

    if (primaryButton) {
      primaryButton.textContent = settings.buttonLabel;
    }

    if (usernameField) {
      usernameField.hidden = mode !== 'signup';
    }

    if (signupPasswordFields) {
      signupPasswordFields.hidden = mode !== 'signup';
    }

    if (signinPasswordField) {
      signinPasswordField.hidden = mode === 'signup';
    }

    if (forgotLink) {
      forgotLink.hidden = mode === 'signup';
    }

    // temporary hide the sign in with google
    const GOOGLE_LOGIN_ENABLED = false;
    if (googleLoginBtn) {
      googleLoginBtn.style.display =
        GOOGLE_LOGIN_ENABLED && currentMode === 'signin' ? 'flex' : 'none';
    }
    
    // hide sign in with google on sign up page
    // if (currentMode === 'signup') {
    //   googleLoginBtn.style.display = "none";
    // } else if (currentMode === 'signin') {
    //   googleLoginBtn.style.display = "block";
    // }

    clearErrors();

    document.title = settings.documentTitle;
    window.location.hash = mode;
  };

  // Reads the 6 individual OTP boxes and joins them into one string
  function getOtpValue() {
    return otpDigitInputs.map(inp => inp.value).join('');
  }

  // Empties all 6 OTP boxes and puts the cursor back in the first one
  function clearOtpInputs() {
    otpDigitInputs.forEach(inp => {
      inp.value = '';
      inp.classList.remove('is-invalid');
    });
    if (otpDigitInputs[0]) otpDigitInputs[0].focus();
  }
  
  // otp countdown ui
  function runCountdown(displayEl, seconds) {
    let remaining = seconds;

    const render = () => {
      if (!displayEl) return;
      const m = Math.floor(remaining / 60).toString().padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
      displayEl.textContent = `Code expires in ${m}:${s}`;
      displayEl.classList.toggle('otp-countdown-warning', remaining <= 30);
    };

    render();
    const id = setInterval(() => {
      remaining -= 1;
      if (remaining < 0) {
        clearInterval(id);
        if (displayEl) {
          displayEl.textContent = 'Code expired. Please resend.';
          displayEl.classList.add('otp-countdown-warning');
        }
        return;
      }
      render();
    }, 1000);

    return id;
  }

  // --- Makes the 6 OTP boxes behave like one connected input ---
  otpDigitInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && index < otpDigitInputs.length - 1) {
        otpDigitInputs[index + 1].focus();
      }
    });

    // Backspace on an empty box: jump back to the previous box
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        otpDigitInputs[index - 1].focus();
      }
    });

    // Pasting a full code: spread the digits across all 6 boxes at once
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, otpDigitInputs.length);
      pasted.split('').forEach((digit, i) => {
        if (otpDigitInputs[i]) {
          otpDigitInputs[i].value = digit;
          otpDigitInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      const nextIndex = Math.min(pasted.length, otpDigitInputs.length - 1);
      otpDigitInputs[nextIndex].focus();
    });
  });

  let forgotStage = 'request';
  let forgotPendingEmail = '';
  let forgotPendingResetToken = '';

  function getForgotOtpValue() {
    return forgotOtpInputs.map(input => input.value).join('');
  }

  function clearForgotOtpInput() {
    forgotOtpInputs.forEach(input => {
      input.value = '';
      input.classList.remove('is-invalid');
    })
  }

  forgotOtpInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && index < forgotOtpInputs.length - 1) {
        forgotOtpInputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        forgotOtpInputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, forgotOtpInputs.length);
      pasted.split('').forEach((digit, i) => {
        if (forgotOtpInputs[i]) {
          forgotOtpInputs[i].value = digit;
          forgotOtpInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      const nextIndex = Math.min(pasted.length, forgotOtpInputs.length - 1);
      forgotOtpInputs[nextIndex].focus();
    });
  });

  // ---- Forgot Password mode switching — defined once, not inside updateMode ----
  function enterForgotMode() {
    forgotStage = 'request';
    forgotPendingEmail = '';

    const noticeBanner = document.querySelector('.notice-banner');
    if (noticeBanner) noticeBanner.classList.remove('notice-banner-success');

    if (tabsContainer) tabsContainer.classList.add('hidden');
    if (backFromForgotOtpLink) backFromForgotOtpLink.hidden = true;
    if (usernameField) usernameField.hidden = true;
    if (signinPasswordField) signinPasswordField.hidden = true;
    if (signupPasswordFields) signupPasswordFields.hidden = true;

    if (forgotOtpCountdownInterval) { clearInterval(forgotOtpCountdownInterval); forgotOtpCountdownInterval = null; }
    if (forgotOtpCountdownEl) forgotOtpCountdownEl.textContent = '';

    if (forgotPasswordFields) forgotPasswordFields.hidden = false;
    if (forgotOtpField) forgotOtpField.hidden = true;
    if (newPasswordField) newPasswordField.hidden = true;
    if (confirmNewPasswordField) confirmNewPasswordField.hidden = true;
    if (resendForgotOtpLink) resendForgotOtpLink.hidden = true;

    if (emailField) emailField.hidden = false;

    if (primaryButton) primaryButton.classList.add('hidden');
    if (forgotConfirmButton) {
      forgotConfirmButton.classList.remove('hidden');
      forgotConfirmButton.textContent = "Send Reset Code";
    }
    if (backToSigninLink) backToSigninLink.classList.remove('hidden');
    if (orDivider) orDivider.classList.add('hidden');
    if (guestBtn) guestBtn.classList.add('hidden');

    if (noticeTitle) noticeTitle.textContent = 'Reset your password.';
    if (noticeText) noticeText.textContent = 'Enter your account email and choose a new password.';

    if (googleLoginBtn) googleLoginBtn.style.display = "none";

    clearErrors();
    if (forgotOtpError) forgotOtpError.textContent = '';
    if (newPasswordError) newPasswordError.textContent = '';
    if (confirmNewPasswordError) confirmNewPasswordError.textContent = '';

    // googleLoginBtn.style.display = "none";
  }
  
  function enterForgotOtpStage(email) {
    forgotStage = 'otp';
    forgotPendingEmail = email;

    if (emailField) emailField.hidden = true;

    if (forgotOtpField) forgotOtpField.hidden = false;

    if (newPasswordField) newPasswordField.hidden = true;
    if (confirmNewPasswordField) confirmNewPasswordField.hidden = true;
    if (resendForgotOtpLink) resendForgotOtpLink.hidden = false;
    if (backFromForgotOtpLink) backFromForgotOtpLink.hidden = false;
    if (backToSigninLink) backToSigninLink.classList.add('hidden');

    // if (forgotConfirmButton) forgotConfirmButton.textContent = 'Confirm Password';
    if (forgotConfirmButton) forgotConfirmButton.textContent = 'Verify Code';

    if (noticeTitle) noticeTitle.textContent = 'Check your email.';
    // if (noticeText) noticeText.textContent = `Enter the 6-digit code sent to ${email} and choose a new password.`;
    if (noticeText) noticeText.innerHTML = `Enter the 6-digit code sent to <u>${email}</u> and choose a new password. Don't see it? Check your spam or junk folder.`;

    if (forgotOtpError) forgotOtpError.textContent = '';
    clearForgotOtpInput();
    if (forgotOtpCountdownInterval) clearInterval(forgotOtpCountdownInterval);
    forgotOtpCountdownInterval = runCountdown(forgotOtpCountdownEl, 5 * 60);
    if (forgotOtpInputs[0]) forgotOtpInputs[0].focus();
  }

  function enterForgotPasswordStage(){
    forgotStage = 'reset';

    if (backFromForgotOtpLink) backFromForgotOtpLink.hidden = true;
    if (backToSigninLink) backToSigninLink.classList.remove('hidden');

    if (emailField) emailField.hidden = true;

    if (forgotOtpCountdownInterval) { clearInterval(forgotOtpCountdownInterval); forgotOtpCountdownInterval = null; }

    if (forgotOtpField) forgotOtpField.hidden = true;
    if (resendForgotOtpLink) resendForgotOtpLink.hidden = true;

    if (newPasswordField) newPasswordField.hidden = false;
    if (confirmNewPasswordField) confirmNewPasswordField.hidden = false;

    if (forgotConfirmButton) forgotConfirmButton.textContent = 'Reset Password';

    if (noticeTitle) noticeTitle.textContent = 'Choose a new password';
    if (noticeText) noticeText.textContent = 'Enter a new password for your account.';

    if (newPasswordError) newPasswordError.textContent = '';
    if (confirmNewPasswordError) confirmNewPasswordError.textContent = '';
    if (newPasswordInput) newPasswordInput.focus();
  }

  function exitForgotMode() {
    forgotStage = 'request';
    forgotPendingEmail = '';
    forgotPendingResetToken = ''; 

    if (forgotOtpCountdownInterval) { clearInterval(forgotOtpCountdownInterval); forgotOtpCountdownInterval = null; }
    if (forgotOtpCountdownEl) forgotOtpCountdownEl.textContent = '';

    if (forgotPasswordFields) forgotPasswordFields.hidden = true;
    if (forgotOtpField) forgotOtpField.hidden = true;              
    if (newPasswordField) newPasswordField.hidden = true;          
    if (confirmNewPasswordField) confirmNewPasswordField.hidden = true;  
    if (resendForgotOtpLink) resendForgotOtpLink.hidden = true;   
    if (backFromForgotOtpLink) backFromForgotOtpLink.hidden = true; 

    if (forgotConfirmButton) forgotConfirmButton.classList.add('hidden');
    if (backToSigninLink) backToSigninLink.classList.add('hidden');
    if (emailField) emailField.hidden = false;
    if (primaryButton) primaryButton.classList.remove('hidden');
    if (tabsContainer) tabsContainer.classList.remove('hidden');
    if (orDivider) orDivider.classList.remove('hidden');
    if (guestBtn) guestBtn.classList.remove('hidden');

    clearForgotOtpInput();                                  

    updateMode('signin');
  }

  // Switches the screen into "enter your OTP code" view. 
  // (Called right after signup or login succeeds — email/mode are passed in)
  function enterOtpMode(email, mode) {
    otpPendingEmail = email;  // remember which account this code belongs to
    otpPendingMode = mode;    // remember whether this came from signup or signin

    // Hide everything from the normal signin/signup form...
    if (tabsContainer) tabsContainer.classList.add('hidden');
    if (usernameField) usernameField.hidden = true;
    if (emailField) emailField.hidden = true;
    if (signinPasswordField) signinPasswordField.hidden = true;
    if (signupPasswordFields) signupPasswordFields.hidden = true;
    if (forgotPasswordFields) forgotPasswordFields.hidden = true;
    if (primaryButton) primaryButton.classList.add('hidden');
    if (forgotConfirmButton) forgotConfirmButton.classList.add('hidden');
    if (backToSigninLink) backToSigninLink.classList.add('hidden');
    if (orDivider) orDivider.classList.add('hidden');
    if (guestBtn) guestBtn.classList.add('hidden');

    // ...and show the OTP entry screen instead
    if (otpField) otpField.hidden = false;
    if (otpVerifyButton) {
      otpVerifyButton.classList.remove('hidden');
      otpVerifyButton.textContent = mode === 'signup' ? 'Verify and Sign Up' : 'Verify and Sign In';
    }
    if (resendOtpLink) resendOtpLink.hidden = false;
    if (backFromOtpLink) {
      backFromOtpLink.hidden = false;
      backFromOtpLink.textContent = mode === 'signup' ? 'Back to Sign Up' : 'Back to Sign In';
    }

    if (noticeTitle) noticeTitle.textContent = 'Verify your email';
    // if (noticeText) noticeText.textContent = `Enter the 6-digit code sent to ${email}.`;
    if (noticeText) noticeText.innerHTML = `Enter the 6-digit code sent to <u>${email}</u>. Don't see it? Check your spam or junk folder.`;

    if (otpError) otpError.textContent = '';
    if (googleError) googleError.innerHTML = '';
    clearOtpInputs();

    if (otpCountdownInterval) clearInterval(otpCountdownInterval);
      otpCountdownInterval = runCountdown(otpCountdownEl, 5 * 60);

  }

  // Reverses enterOtpMode — goes back to showing the normal signin/signup form
  function exitOtpMode() {
    if (otpCountdownInterval) { clearInterval(otpCountdownInterval); otpCountdownInterval = null; }
    if (otpCountdownEl) otpCountdownEl.textContent = '';
    if (otpField) otpField.hidden = true;
    if (otpVerifyButton) otpVerifyButton.classList.add('hidden');
    if (resendOtpLink) resendOtpLink.hidden = true;
    if (backFromOtpLink) backFromOtpLink.hidden = true;
    if (otpUsernameFixField) otpUsernameFixField.hidden = true;  
    clearOtpInputs();  
    if (emailField) emailField.hidden = false;
    if (primaryButton) primaryButton.classList.remove('hidden');
    if (tabsContainer) tabsContainer.classList.remove('hidden');
    if (orDivider) orDivider.classList.remove('hidden');
    if (guestBtn) guestBtn.classList.remove('hidden');

    updateMode(otpPendingMode === 'signup' ? 'signup' : 'signin');
  }

  // // Reverses enterForgotMode — goes back to the normal signin form (old, there is new one above)
  // function exitForgotMode() {
  //   if (forgotPasswordFields) forgotPasswordFields.hidden = true;
  //   if (forgotConfirmButton) forgotConfirmButton.classList.add('hidden');
  //   if (backToSigninLink) backToSigninLink.classList.add('hidden');
  //   if (primaryButton) primaryButton.classList.remove('hidden');
  //   if (tabsContainer) tabsContainer.classList.remove('hidden');
  //   if (orDivider) orDivider.classList.remove('hidden');
  //   if (guestBtn) guestBtn.classList.remove('hidden');

  //   updateMode('signin');
  // }

  // rate limiting error validation
  function handleRateLimitError(error, button, errorNode) {
    if (!error || !error.retryAfter) return false;

    let seconds = error.retryAfter;
    if (button) button.disabled = true;

    const interval = setInterval(() => {
      setError(errorNode, `Too many attempts. Try again in ${seconds}s.`);
      seconds--;
      if (seconds < 0) {
        clearInterval(interval);
        if (button) button.disabled = false;
        if (errorNode) errorNode.textContent = '';
      }
    }, 1000);

    return true;
  }

  // Checks the signin/signup form fields before submitting.
  // Returns true only if everything required is filled in correctly.
  const validateForm = () => {
    clearErrors();

    const emailValue = emailInput ? emailInput.value.trim() : '';
    let isValid = true;

    const emailMsg = validateEmail(emailValue);
    if (emailMsg) {
      setError(emailError, emailMsg);
      if (emailInput) {
        emailInput.classList.add('is-invalid');
      }
      isValid = false;
    }

    // Extra checks that only apply when signing up (not signing in)
    if (currentMode === 'signup') {
      const usernameMsg = validateUsername(usernameInput ? usernameInput.value : '');
      if (usernameMsg) {
        setError(usernameError, usernameMsg);
        if (usernameInput) usernameInput.classList.add('is-invalid');
        isValid = false;
      }
      const createPasswordValue = createPasswordInput ? createPasswordInput.value : '';
      const confirmPasswordValue = confirmPasswordInput ? confirmPasswordInput.value : '';

      if (!createPasswordValue) {
        setError(createPasswordError, 'Create a password.');
        if (createPasswordInput) {
          createPasswordInput.classList.add('is-invalid');
        }
        isValid = false;
      } else if (!isStrongPassword(createPasswordValue)) {
        setError(createPasswordError, PASSWORD_RULE_MESSAGE);
        if (createPasswordInput) {
          createPasswordInput.classList.add('is-invalid');
        }
        isValid = false;
      }

      if (!confirmPasswordValue) {
        setError(confirmPasswordError, 'Confirm your password.');
        if (confirmPasswordInput) {
          confirmPasswordInput.classList.add('is-invalid');
        }
        isValid = false;
      } else if (createPasswordValue !== confirmPasswordValue) {
        setError(confirmPasswordError, 'Passwords do not match.');
        if (confirmPasswordInput) {
          confirmPasswordInput.classList.add('is-invalid');
        }
        isValid = false;
      }
    }

    // Signin-only check: just needs a password typed in
    else if (!passwordInput || !passwordInput.value) {
      setError(passwordError, 'Password is required.');
      if (passwordInput) {
        passwordInput.classList.add('is-invalid');
      }
      isValid = false;
    }

    return isValid;
  };

  // Show signup tab first if the URL is "#signup", otherwise default to signin
  const initialMode = window.location.hash === '#signup' ? 'signup' : 'signin';
  updateMode(initialMode);

  // Clicking "Sign In" / "Sign Up" tabs switches the form mode
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      updateMode(tab.dataset.authMode);
    });
  });

  // "Continue as guest" — skips login entirely
  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      logoutUser(() => {
        window.location.href = 'report-complaint.html';
      });
    });
  }

  // "Back to sign in" from the forgot-password screen
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      enterForgotMode();
    });
  }

  if (backToSigninLink) {
    backToSigninLink.addEventListener('click', (e) => {
      e.preventDefault();
      newPasswordInput.value = '';
      confirmNewPasswordInput.value = '';
      exitForgotMode();
    });
  }

  if (backFromForgotOtpLink) {
    backFromForgotOtpLink.addEventListener('click', (e) => {
      e.preventDefault();
      newPasswordInput.value = '';
      confirmNewPasswordInput.value = '';
      exitForgotMode();
    });
  }

  
  function reVerifyEmail (email, errorNode){
    const verifyLink = document.getElementById('verify-now-link');
    if (verifyLink) {
      verifyLink.addEventListener('click', (e) => {
        e.preventDefault();
        resendOtpSession(email, (success, error) => {
          if (success) {
            enterOtpMode(email, 'signup');
            if (googleLoginBtn) googleLoginBtn.style.display = 'none'; 
            return;
          } 
          
          if (handleRateLimitError(error, null, errorNode)) return;
          
          setError(errorNode, error?.message || 'Could not resend code. Please try again.');
          
        });
      });
    }  
  }

  // Submits a password reset request (email + new password)
  if (forgotConfirmButton) {
    forgotConfirmButton.addEventListener('click', () => {
      if (forgotStage === 'request') {
        clearErrors();
        const emailValue = emailInput ? emailInput.value.trim() : '';

        const emailMsg = validateEmail(emailValue);
        if (emailMsg) {
          setError(emailError, emailMsg);
          if (emailInput) emailInput.classList.add('is-invalid');
          return;
        }

        requestPasswordReset(emailValue, (success, error) => {
          if (success) {
            enterForgotOtpStage(emailValue);
            return;
          }

          if (handleRateLimitError(error, forgotConfirmButton, emailError)) return;

          if (error && error.message.toLowerCase().includes('verify')) {
            if (emailError){
              emailError.innerHTML ='Please verify your email before signing in. ' + 
                '<a href="#" id="verify-now-link" style="color:#1F2937; font-weight:700; text-decoration:underline; cursor:pointer;">Verify now</a>';
            }

            if (emailInput) emailInput.classList.add('is-invalid');
            reVerifyEmail(emailValue, emailError);            
            return;
          }

          setError(emailError, error?.message || 'Something went wrong. Please try again.');
          if (emailInput) emailInput.classList.add('is-invalid');
        });

      } else if (forgotStage === 'otp') {
        if (forgotOtpError) forgotOtpError.textContent = '';
        const otpValue = getForgotOtpValue();

        if (otpValue.length < 6) {
          setError(forgotOtpError, 'Please enter all 6 digits.');
          forgotOtpInputs.forEach(input => { if (!input.value) input.classList.add('is-invalid'); });
          return;
        }

        verifyResetOtp(forgotPendingEmail, otpValue, (success, resetToken, error) => {
          if (!success) {
            if (handleRateLimitError(error, forgotConfirmButton, forgotOtpError)) return;

            setError(forgotOtpError, error?.message  || 'Incorrect code. Please try again.');
            forgotOtpInputs.forEach(input => input.classList.add('is-invalid'));
            return;
          } 
          
          forgotPendingResetToken = resetToken;
          enterForgotPasswordStage();
        });

      } else {
        if (forgotOtpError) forgotOtpError.textContent = '';
        if (newPasswordError) newPasswordError.textContent = '';
        if (confirmNewPasswordError) confirmNewPasswordError.textContent = '';

        const otpValue = getForgotOtpValue();
        const newPassword = newPasswordInput ? newPasswordInput.value : '';
        const confirmPassword = confirmNewPasswordInput ? confirmNewPasswordInput.value : '';
        
        let isValid  = true;

        if (!newPassword) {
          setError(newPasswordError, 'Please enter a new password.');
          if (newPasswordInput) newPasswordInput.classList.add('is-invalid');
          isValid = false;
        } else if (!isStrongPassword(newPassword)) {
          setError(newPasswordError, PASSWORD_RULE_MESSAGE);
          if (newPasswordInput) newPasswordInput.classList.add('is-invalid');
          isValid = false;
        }

        if (!confirmPassword) {
          setError(confirmNewPasswordError, 'Please confirm your new password.');
          if (confirmNewPasswordInput) confirmNewPasswordInput.classList.add('is-invalid');
          isValid = false;
        } else if (newPassword && newPassword !== confirmPassword) {
          setError(confirmNewPasswordError, 'Passwords do not match.');
          if (confirmNewPasswordInput) confirmNewPasswordInput.classList.add('is-invalid');
          isValid = false;
        }

        if (!isValid) return;

        confirmPasswordReset(forgotPendingEmail, forgotPendingResetToken, newPassword, (success, error) => {
          if (!success) {
            if (handleRateLimitError(error, forgotConfirmButton, newPasswordError)) return;

            enterForgotMode();
            setError(newPasswordError, error?.message || 'Session expired. Please request a new code.');
            return;
          }

          newPasswordInput.value = '';
          confirmNewPasswordInput.value = '';
          sessionStorage.setItem('authFlashMessage', 'Password reset successfully. Please sign in to continue.');
          sessionStorage.setItem('authFlashType', 'success');
          sessionStorage.setItem('authFlashTitle', 'Password reset');
          window.location.href = 'auth.html';
        });
      }
    });
  }

  if (resendForgotOtpLink) {
    resendForgotOtpLink.addEventListener('click', (e) => {
      e.preventDefault();
        requestPasswordReset(forgotPendingEmail, (success, error) => {
          if (success) {
            clearForgotOtpInput();
            if (forgotOtpError) {  
              forgotOtpError.textContent = 'A new code has been sent.';
              forgotOtpError.classList.add('is-success');
            }
            if (forgotOtpCountdownInterval) clearInterval(forgotOtpCountdownInterval);
              forgotOtpCountdownInterval = runCountdown(forgotOtpCountdownEl, 5 * 60);
              return;
            }
          
            if (handleRateLimitError(error, resendForgotOtpLink, forgotOtpError)) return;

            setError(forgotOtpError, error?.message || 'Could not resend code.');
        });
    })
  }
  // flash message after redirect to clear previous message
  const flashMessage = sessionStorage.getItem('authFlashMessage');
  const flashType = sessionStorage.getItem('authFlashType');
  const flashTitle = sessionStorage.getItem('authFlashTitle');

  if (flashMessage) {
    const noticeBanner = document.querySelector('.notice-banner');

    noticeTitle.textContent = flashTitle || "You're verified!";
    noticeText.textContent = flashMessage;

    if (flashType === 'success') {
      noticeBanner.classList.add('notice-banner-success');
    }

    // Clear it so a page refresh doesn't show it again
    sessionStorage.removeItem('authFlashMessage');
    sessionStorage.removeItem('authFlashType');
    sessionStorage.removeItem('authFlashTitle');
  }

  // Clicking "Verify and Sign In/Up" — collects the 6 digits and checks them with the backend
  if (otpVerifyButton) {
    otpVerifyButton.addEventListener('click', () => {
      if (otpError) otpError.textContent = '';
      const enteredCode = getOtpValue();
      lastEnteredOtp = enteredCode;

      if (enteredCode.length < 6) {
        setError(otpError, 'Please enter all 6 digits.');
        otpDigitInputs.forEach(inp => { if (!inp.value) inp.classList.add('is-invalid'); });
        return;
      }

      // otpPendingEmail was filled in back when enterOtpMode() ran —
      // that's the account this code is being checked against
      verifyOtp(otpPendingEmail, enteredCode, (success, error) => {
        if (!success) {
          if (handleRateLimitError(error, otpVerifyButton, otpError)) return;

          if (error && error.message && error.message.toLowerCase().includes('username')) {
            setError(otpError, error.message);
            if (otpUsernameFixField) otpUsernameFixField.hidden = false;
            return;
          }

          setError(otpError, error?.message || 'Incorrect code. Please try again.');
          otpDigitInputs.forEach(inp => inp.classList.add('is-invalid'));
          return;
        } 

        // Flash-style message, after redirect (successful signup)
        sessionStorage.setItem('authFlashMessage', 'Account verified! Please login to continue.');
        sessionStorage.setItem('authFlashType', 'success');
        sessionStorage.setItem('authFlashTitle', 'Email verified');
        window.location.href = 'auth.html';
      });
    });
  }

  if (otpUsernameFixButton) {
    otpUsernameFixButton.addEventListener('click', () => {
      if (otpUsernameFixButton) otpUsernameFixError.textContent = '';
      const newUsername = otpNewUsernameInput.value.trim();

      const usernameMsg = validateUsername(newUsername);
      if (usernameMsg) {
        setError(otpUsernameFixError, usernameMsg);
        return;
      }

      otpUsernameFixButton.disabled = true;
      otpUsernameFixButton.textContent = 'Updating...';

      changePendingUsername(otpPendingEmail, newUsername, (success, error) => {
        if (!success) {
          otpUsernameFixButton.disabled = false;
          otpUsernameFixButton.textContent = 'Update Username';
          setError(otpUsernameFixError, error || 'Could not update username.');
          return;
        } 

        otpUsernameFixField.hidden = true;
        if (otpError) {
          otpError.textContent = 'Username updated - verifying...';
          otpError.classList.add('is-success');
        }

        setTimeout(() => {
          if (otpError) otpError.textContent = 'Verifying your account...';

          verifyOtp(otpPendingEmail, lastEnteredOtp, (success, error) => {
            if (!success) {
              if (handleRateLimitError(error, otpUsernameFixButton, otpError)) return;
              
              if (otpError) otpError.classList.remove('is-success');
              setError(otpError, error?.message || 'Your code expired - please request a new one.');
              clearOtpInputs();
              otpUsernameFixButton.disabled = false;
              otpUsernameFixButton.textContent = 'Update Username';
              return;
            } 

            if (otpError) otpError.textContent = 'Verified! Redirecting...';

            sessionStorage.setItem('authFlashMessage', 'Account verified! Please login to continue.');
            sessionStorage.setItem('authFlashType', 'success');
            sessionStorage.setItem('authFlashTitle', 'Email verified');

            setTimeout(() => {
              window.location.href = 'auth.html';
            }, 700);
          });
        }, 600);
        
      });
    });
  }

  // "Resend code" — asks the backend to generate and email a fresh code
  // if (resendOtpLink) {
  //   resendOtpLink.addEventListener('click', (e) => {
  //     e.preventDefault();
  //     resendOtpSession(otpPendingEmail, (success, errorMsg) => {
  //       if (otpError) otpError.textContent = success ? '' : (errorMsg || 'Could not resend code.');
  //       clearOtpInputs();
  //     });
  //   });
  // }

  if (resendOtpLink) {
    resendOtpLink.addEventListener('click', (e) => {
      e.preventDefault();
      resendOtpSession(otpPendingEmail, (success, error) => {
        clearOtpInputs();
        if (success) {
          setError(otpError, 'A new code has been sent.');
          otpError.classList.add('is-success');

          if (otpCountdownInterval) clearInterval(otpCountdownInterval);
          otpCountdownInterval = runCountdown(otpCountdownEl, 5 * 60);
          return;
        } 
          
        if (handleRateLimitError(error, resendOtpLink, otpError)) return;

        setError(otpError, error?.message || 'Could not resend code.');
      });
    });
  }

  // "Back to Sign In/Up" — leaves the OTP screen without verifying
  if (backFromOtpLink) {
    backFromOtpLink.addEventListener('click', (e) => {
      e.preventDefault();
      exitOtpMode();
    });
  }

  // The main Sign In / Sign Up button — validates the form, then calls
  // the backend to either register or log in
  if (primaryButton) {
    primaryButton.addEventListener('click', () => {
      const isValid = validateForm();
      if (!isValid) return;

      const emailValue = emailInput.value.trim();

      if (currentMode === 'signup') {
        const usernameValue = usernameInput.value.trim();
        const passwordValue = createPasswordInput.value;

        registerUser({ username: usernameValue, email: emailValue, password: passwordValue }, (success, errorMsg) => {
          if (success) {
            enterOtpMode(emailValue, 'signup');
            return;
          } 

          let error = errorMsg || 'Could not create account.';
          if (error.toLowerCase().includes('password')) {
            setError(createPasswordError, error);
            createPasswordInput.classList.add('is-invalid');
          } else if (error.toLowerCase().includes('username')) {
            setError(usernameError, error);
            usernameInput.classList.add('is-invalid');
          } else {
            setError(emailError, error);
            emailInput.classList.add('is-invalid');
          }

        });

      } else {
        const passwordValue = passwordInput.value;

        loginUser(emailValue, passwordValue, (success, error) => {
          if (success) {
              window.location.href = 'report-complaint.html';
              // enterOtpMode(emailValue, 'signin');
              return;
          } 

          if (handleRateLimitError(error, primaryButton, passwordError)) return;
          
          if (error && error.message.toLowerCase().includes('verify')) {
              if (passwordError){
                passwordError.innerHTML ='Please verify your email before signing in. ' + 
                  '<a href="#" id="verify-now-link" style="color:#1F2937; font-weight:700; text-decoration:underline; cursor:pointer;">Verify now</a>';
              }
              passwordInput.classList.add('is-invalid');
              reVerifyEmail(emailValue, passwordError);
              // enterOtpMode(emailValue, 'signup'); //redirect to OTP screen
          } else {
              setError(passwordError, 'Incorrect email or password.');
              passwordInput.classList.add('is-invalid');
          }
        });
      }
    });
  }

  // sign in with google (connected to the backend)
  if (googleLoginBtn && GOOGLE_LOGIN_ENABLED) {
    googleLoginBtn.addEventListener("click", () => {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError || !token) {
          setError(googleError, "Google sign-in failed. Please try again.");
          return;
        }

        googleLogin(token, (success, error, email, errObj) => {
          if (success) {
            window.location.href = 'report-complaint.html';
            return;
          } 
          
          if (handleRateLimitError(errObj, null, googleError)) return;

          if (error && error.toLowerCase().includes('verify')) {
            if (googleError){
              googleError.innerHTML ='Please verify your email before signing in. ' + 
                '<a href="#" id="verify-now-link" style="color:#1F2937; font-weight:700; text-decoration:underline; cursor:pointer;">Verify now</a>';
            }
            
            reVerifyEmail(email, googleError);
          } else {
            setError(googleError, error || "Google sign-in failed. Please try again.")
          }
        });
      });
    });
  }
  
});
