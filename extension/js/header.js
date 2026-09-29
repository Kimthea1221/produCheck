// header.js
import { whenSessionReady, isUserLoggedIn, getCurrentUser, logoutUser, updateUsername, deleteAccount } from "../scripts/session.js";
import { loadPartial } from "./partial-loader.js";
import { LIMITS, validateUsername, liveLengthCheck } from "../utils/validation.js";

document.addEventListener('DOMContentLoaded', async () => {
  whenSessionReady(async () => {
    const headerSlot = document.getElementById('header-slot');
    if (headerSlot) await loadPartial('partials/header.html', 'header-slot');

    const overlaySlot = document.getElementById('overlay-slot');
    if (overlaySlot) await loadPartial('partials/overlays.html', 'overlay-slot');

    initProfileOverlay();
    initExitButton();
    renderProfileContent();
    initProfileActions();
    initPasswordToggles();
    applyGuestHeaderVisibility();
  });
});

function showProfileView(viewId) {
  document.querySelectorAll('.profile-view').forEach(view => {
    view.classList.toggle('hidden', view.id !== viewId);
  });
}
function initProfileOverlay() {
  const dropdownBtn = document.getElementById('profile-dropdown-btn');
  const profileOverlay = document.getElementById('profile-overlay');
  const pageContent = document.getElementById('blur-target');
  const dropdownImg = dropdownBtn ? dropdownBtn.querySelector('img') : null;

  if (!dropdownBtn || !profileOverlay) return;

  dropdownBtn.addEventListener('click', () => {
    const isOpen = profileOverlay.classList.toggle('visible');
    if (pageContent) pageContent.classList.toggle('blurred', isOpen);
    if (dropdownImg) dropdownImg.classList.toggle('open', isOpen); // this flips the arrow image
  });
}

function initPasswordToggles() {
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
}

function initExitButton() {
  const exitBtn = document.getElementById('exit-btn');
  if (!exitBtn) return;

  exitBtn.addEventListener('click', () => {
    window.close();
  });
}

function renderProfileContent() {
  if (typeof getCurrentUser !== 'function') return;
  const user = getCurrentUser();

  const usernameDisplay = document.getElementById('profile-username-display');
  const usernameDisplay2 = document.getElementById('profile-username-display-2');
  const emailDisplay = document.getElementById('profile-email-display');

  if (usernameDisplay) usernameDisplay.textContent = user.username;
  if (usernameDisplay2) usernameDisplay2.textContent = user.username;
  if (emailDisplay) emailDisplay.textContent = user.email;
}

function initProfileActions() {
  const editBtn = document.getElementById('btn-edit-username');
  const confirmUsernameBtn = document.getElementById('btn-confirm-username');
  const cancelUsernameBtn = document.getElementById('btn-cancel-username');
  const newUsernameInput = document.getElementById('new-username-input');

  const signOutBtn = document.getElementById('btn-sign-out');
  const confirmSignoutBtn = document.getElementById('btn-confirm-signout');
  const cancelSignoutBtn = document.getElementById('btn-cancel-signout');

  const deleteBtn = document.getElementById('btn-delete-account');
  const confirmDeleteBtn = document.getElementById('btn-confirm-delete');
  const cancelDeleteBtn = document.getElementById('btn-cancel-delete');

  const newUsernameError = document.getElementById('new-username-error');
  liveLengthCheck(newUsernameInput, newUsernameError, 'Username', LIMITS.USERNAME_MAX);

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (newUsernameInput) {
        newUsernameInput.value = getCurrentUser().username;
        newUsernameInput.classList.remove('is-invalid');
      }
      if (newUsernameError) newUsernameError.textContent = '';
      showProfileView('profile-edit-view');
    });
  }

  // if (confirmUsernameBtn) {
  //   confirmUsernameBtn.addEventListener('click', () => {
  //     const newValue = newUsernameInput ? newUsernameInput.value.trim() : '';
  //     if (!newValue) return;

  //     updateUsername(newValue, (success) => {
  //       if (success) {
  //         renderProfileContent(); // this updates profile overlay text
  //         if (typeof applyAuthView === 'function') applyAuthView(); // this updates popup home welcome text, if on that page
  //         showProfileView('profile-main-view');
  //       }
  //     });
  //   });
  // }

  if (cancelUsernameBtn) {
    cancelUsernameBtn.addEventListener('click', () => {
      showProfileView('profile-main-view');
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      showProfileView('profile-signout-confirm-view');
    });
  }

  if (confirmSignoutBtn) {
    confirmSignoutBtn.addEventListener('click', () => {
      logoutUser(() => {
        window.location.href = 'auth.html';
      });
    });
  }

  if (cancelSignoutBtn) {
    cancelSignoutBtn.addEventListener('click', () => {
      showProfileView('profile-main-view');
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      showProfileView('profile-delete-confirm-view');
    });
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      const passwordInput = document.getElementById('delete-password-input');
      const password = passwordInput ? passwordInput.value : '';
      const passwordError = document.getElementById('delete-password-error');

      if (!password) {
        if (passwordError) passwordError.textContent = 'Password is required';
        return;
      }

      deleteAccount(password, (success, error) => {
        if (success) {
          sessionStorage.setItem('authFlashMessage', 'Your account and personal information have been permanently removed.');
          sessionStorage.setItem('authFlashType', 'success');
          sessionStorage.setItem('authFlashTitle', 'Account deleted');
          window.location.href = 'auth.html';
        } else {
          if (passwordError) passwordError.textContent = error || 'Incorrect password';
        }
      });
    });
  }

  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', () => {
      showProfileView('profile-main-view');
    });
  }
  
  if (confirmUsernameBtn) {
    confirmUsernameBtn.addEventListener('click', () => {
      const newValue = newUsernameInput ? newUsernameInput.value.trim() : '';

      const usernameMsg = validateUsername(newValue);
      if (usernameMsg) {
        if (newUsernameError) newUsernameError.textContent = usernameMsg;
        if (newUsernameInput) newUsernameInput.classList.add('is-invalid');
        return;
      }
      if (newUsernameError) newUsernameError.textContent = '';
      if (newUsernameInput) newUsernameInput.classList.remove('is-invalid');

      updateUsername(newValue, (success, error) => {
        if (success) {
          renderProfileContent();
          if (typeof applyAuthView === 'function') applyAuthView();
          showProfileView('profile-main-view');
          return;
        }
        // previously nothing happened on failure (e.g. "username taken")
        if (newUsernameError) {
          newUsernameError.textContent =
            (typeof error === 'string' ? error : error?.message) || 'Could not update username. Please try again.';
        }
      });
    });
  }
}

function applyGuestHeaderVisibility() {
  const loggedIn = typeof isUserLoggedIn === 'function' ? isUserLoggedIn() : false;

  const dropdownBtn = document.getElementById('profile-dropdown-btn');

  if (dropdownBtn) dropdownBtn.classList.toggle('hidden', !loggedIn);
}

