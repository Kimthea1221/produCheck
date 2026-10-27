//extension/scripts/session.js
import {
  apiVerificationHistory,
  apiSubmitComplaint,
  apiUpdateUsername,
  apiDeleteAccount,
  apiSignUp,
  apiLogin,
  apiGoogleLogin,
  apiChangeUsername,
  apiVerifyOtp,
  apiResendOtp,
  apiVerifyResetOtp,
  apiPasswordReset,
  apiConfirmPassReset,
  UnauthorizedError,
  apiRefreshToken,
  apiGetComplaints,
  apiGetStatus,
  getVerificationHistory 
} from "../utils/api.js";


let _session = null; // null = guest, otherwise { username, email }

// Every page must call this once before rendering anything that depends on login state
export function whenSessionReady(callback) {
  chrome.storage.local.get(['access_token', 'refresh_token', 'username', 'email'], (data) => {
    _session = data.access_token
      ? { username: data.username, email: data.email, access_token: data.access_token, refresh_token: data.refresh_token }
      : null;
    callback();
  });
}

async function refreshSession() {
  if (!_session || !_session.refresh_token) {
    throw new Error("No refresh token available");
  }

  const data = await apiRefreshToken(_session.refresh_token);

  _session.access_token = data.access_token;
  _session.refresh_token = data.refresh_token;

  return new Promise((resolve) => {
    chrome.storage.local.set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      username: _session.username,
      email: _session.email
    }, resolve);
  });
}

async function callWithAuth(apiFn, ...args) {
  try {
    return await apiFn(...args, _session.access_token);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      await refreshSession();
      return await apiFn(...args, _session.access_token); // retry once
    }
    throw e;
  }
}

export function isUserLoggedIn() {
  return _session !== null;
}

export function getCurrentUser() {
  return _session || { username: '', email: '' };
}

export function getToken(){
  return _session ? _session.access_token : null;
}

export async function getComplaintHistory() {
  if (!isUserLoggedIn()) throw new Error("You must be signed in.");
  try {
    return await callWithAuth(apiGetComplaints);
  } catch (e) {
    if (e instanceof UnauthorizedError) logoutUser(() => window.location.reload());
    throw e;
  }
}

export async function getComplaintStatus() {
  if (!isUserLoggedIn()) throw new Error("You must be signed in.");
  try {
    return await callWithAuth(apiGetStatus);
  } catch (e) {
    if (e instanceof UnauthorizedError) logoutUser(() => window.location.reload());
    throw e;
  }
}

export async function getProductVerificationHistory() {
  if (!isUserLoggedIn()) throw new Error("You must be signed in.");
  try {
    return await callWithAuth(getVerificationHistory);
  } catch (e) {
    if (e instanceof UnauthorizedError) logoutUser(() => window.location.reload());
    throw e;
  }
}

export async function updateUsername(newUsername, callback) {
  if (!_session) throw new Error("No active user");

  try {
    await callWithAuth(apiUpdateUsername, newUsername);
    _session.username = newUsername;
    chrome.storage.local.set({
      access_token: _session.access_token,
      refresh_token: _session.refresh_token,
      username: newUsername,
      email: _session.email
    }, () => callback(true));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      logoutUser(() => window.location.reload());
      callback(false, "Session expired. Please log in again.");
      return;
    }
    callback(false, e.message);
  }
}

export async function deleteAccount(password, callback) {
  if (!_session) {
    callback(false);
    return;
  }
  try {
    await callWithAuth(apiDeleteAccount, password);
    logoutUser(() => callback(true));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      logoutUser(() => window.location.reload());
      callback(false, "Session expired. Please log in again.");
      return;
    }
    callback(false, e.message);
  }
}

//   getRegisteredUsers((users) => {
//     const remainingUsers = users.filter(u => u.email !== _session.email);
//     chrome.storage.local.set({ registeredUsers: remainingUsers }, () => {
//       chrome.storage.local.remove('session', () => {
//         _session = null;
//         callback(true);
//       });
//     });
//   });
// }

// function getRegisteredUsers(callback) {
//   chrome.storage.local.get(['registeredUsers'], (data) => {
//     callback(data.registeredUsers || []);
//   });
// }

// loginUser, updateUsername, deleteAccount all stay exactly as they are —
// they were already correctly calling getRegisteredUsers, it just didn't exist yet

export function registerUser(user, callback) {
  apiSignUp({ email: user.email, username: user.username, password: user.password })
      .then(() => callback(true))
      .catch(e => callback(false, e.message));
}

export function loginUser(email, password, callback) {
  apiLogin(email, password)
      .then(data => {
          _session = { username: data.username, email, access_token: data.access_token, refresh_token: data.refresh_token };
          chrome.storage.local.set(
              { access_token: data.access_token, refresh_token: data.refresh_token, token_type: data.token_type, username: data.username, email },
              () => callback(true)
          );
      }).catch(e => callback(false, e));
}

export function googleLogin(token, callback) {
  apiGoogleLogin(token).then(data => {
      _session = { username: data.username, email: data.email, access_token: data.access_token, refresh_token: data.refresh_token };
      chrome.storage.local.set(
        { access_token: data.access_token, refresh_token: data.refresh_token, token_type: data.token_type, username: data.username, email: data.email },
        () => callback(true)
      );
  }).catch(e => callback(false, e.message, e.email, e));
}

export function changePendingUsername(email, newUsername, callback) {
  apiChangeUsername(email, newUsername).then(() => callback(true))
      .catch(e => callback(false, e.message));
}

export function verifyOtp(email, inputCode, callback) {
  apiVerifyOtp(email, inputCode).then(() => callback(true))
      .catch(e => callback(false, e))
}

export function resendOtpSession(email, callback) {
  apiResendOtp(email).then(() => callback(true))
      .catch(e => callback(false, e));
}

export function verifyResetOtp(email, otpCode, callback) {
  apiVerifyResetOtp(email, otpCode).then(data => callback(true, data.reset_token))
      .catch(e => callback(false, null, e));
}

export function requestPasswordReset(email, callback) {
  apiPasswordReset(email).then(() => callback(true))
      .catch(e => callback(false, e));
}

export function confirmPasswordReset(email, resetToken, newPassword, callback) {
  apiConfirmPassReset(email, resetToken, newPassword).then(() => callback(true))
      .catch(e => callback(false, e))
}

export function logoutUser(callback) {
  _session = null;
  chrome.storage.local.remove(['access_token', 'refresh_token', 'token_type', 'username', 'email'], callback);
}

export function submitComplaint(complaints, callback) {
  if (!isUserLoggedIn()) {
    callback(false, "You must be signed in to submit a report.");
    return;
  }

  const payload = { 
    product_title: complaints.productName, 
    product_url: complaints.productUrl, 
    store_name: complaints.storeName, 
    consumer_description: complaints.description, 
    platform: complaints.platform,
    verification_result: complaints.verificationResult,
    attachment_data: complaints.attachmentData,    
    attachment_name: complaints.attachmentName  
  };

  callWithAuth(apiSubmitComplaint, payload)
    .then(() => callback(true))
    .catch(e => {
      if (e instanceof UnauthorizedError) {
        logoutUser(() => window.location.reload());
        callback(false, "Session expired. Please log in again.");
        return;
      }
      callback(false, e.message);
    });
}

export function submitVerification(product, callback) {
  const payload = {
    product_title: product.productTitle,
    platform: product.productPlatform,
    verification_result: product.productStatus,
  };

  callWithAuth(apiVerificationHistory, payload)
    .then(() => callback(true))
    .catch(e => {
      if (e instanceof UnauthorizedError) {
        logoutUser(() => window.location.reload());
        callback(false, "Session expired. Please log in again.");
        return;
      }
      callback(false, e.message);
    });
}
