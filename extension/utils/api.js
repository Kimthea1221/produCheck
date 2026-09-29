const API_BASE = 'https://everify.store'; // https://everify.store http://localhost:8001 will be changed to real url during development (same with in the manifest) 

export class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

async function handleResponse(response, options = {}) {
    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const seconds = retryAfter ? parseInt(retryAfter, 10) : 60; // fallback if header missing
        const err = new Error(`Too many attempts. Try again in ${seconds} seconds.`);
        err.retryAfter = seconds;
        throw err;
    }

    if (response.status === 401) {
        if (options.isLogin) {
            throw new Error('Incorrect password.');
        }
        throw new UnauthorizedError('Session expired. Please login once again');
    }

    if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.detail 
            ? (Array.isArray(data.detail) ? data.detail.map(d => d.msg).join(', ') : data.detail)
            : `Server responded ${response.status}`;
        throw new Error(message);
    }

    return response.json();
}

export async function apiSignUp({ email, username, password }){
    const res = await fetch(`${API_BASE}/accounts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password })
    });

    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
        const err = new Error(`Too many attempts. Try again in ${seconds} seconds.`);
        err.retryAfter = seconds;
        throw err;
    }

    const data = await res.json();

    if (!res.ok) {
        const message = Array.isArray(data.detail) 
            ? data.detail.map(d => d.msg).join(', ') : data.detail;
        throw new Error(message);
    }

    return data;
}

export async function apiLogin(email, password) {
    const formBody = new URLSearchParams();
    formBody.append('username', email);
    formBody.append('password', password);

    const res = await fetch(`${API_BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString()
    });

    return handleResponse(res, { isLogin: true });
}

export async function apiGoogleLogin(token) {
    const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
    });

    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
        const err = new Error(`Too many attempts. Try again in ${seconds} seconds.`);
        err.retryAfter = seconds;
        throw err;
    }

    const data = await res.json();

    if (!res.ok){
        if (data.detail && typeof data.detail === 'object') {
            const error = new Error(data.detail.message);
            error.email = data.detail.email;
            throw error;
        }
        throw new Error(data.detail || 'Login failed');
    }

    return data;
}

export async function apiChangeUsername(email, newUsername) {

    const res = await fetch(`${API_BASE}/accounts/change-pending-username`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, username: newUsername })
        })

    return handleResponse(res);
}

export async function apiVerifyOtp(email, inputCode, callback) {
  const res = await fetch(`${API_BASE}/accounts/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, otp_code: inputCode }),
  });

  return handleResponse(res);
}

export async function apiResendOtp(email, callback) {
    const res = await fetch(`${API_BASE}/accounts/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    });

    return handleResponse(res);
}

export async function apiPasswordReset(email, callback) {
    const res = await fetch(`${API_BASE}/accounts/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
    });

    return handleResponse(res);
}

export async function apiVerifyResetOtp(email, otpCode){
    const res = await fetch(`${API_BASE}/accounts/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp_code: otpCode }),
    });

    return handleResponse(res);
}

export async function apiConfirmPassReset(email, resetToken, newPassword) {
    const res = await fetch(`${API_BASE}/accounts/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, reset_token: resetToken, new_password: newPassword }),
    });

    return handleResponse(res);
}

export async function apiSubmitComplaint(complaintData, token){
    let headers = { 'Content-Type': 'application/json'};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/submitComplaint`, {
        method: 'POST',
        headers,
        body: JSON.stringify(complaintData)
    });

    return handleResponse(res);
}

export async function apiGetComplaints(token){
    const res = await fetch(`${API_BASE}/ComplaintsHistory`, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`
        }
    });

    return handleResponse(res);
}

export async function apiGetStatus(token){  
    const res = await fetch(`${API_BASE}/ComplaintStatus`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return handleResponse(res);
}

export async function apiUpdateUsername(newUsername, token) {
    
    const res = await fetch(`${API_BASE}/accounts/username`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username: newUsername })
    })

    return handleResponse(res);
}

export async function apiDeleteAccount(password, token, permanent = false) {

    const res = await fetch(`${API_BASE}/accounts/delete-account`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password })
    });

    if (res.status === 204) return true;
    return handleResponse(res);
}

export async function apiVerificationHistory(product, token) {
    let headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/submitVerification`, {
        method: 'POST',
        headers,
        body: JSON.stringify(product)
    });

    return handleResponse(res);
}

export async function getVerificationHistory(token) {
    const res = await fetch(`${API_BASE}/VerificationHistory`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return handleResponse(res);
}

export async function apiRefreshToken(refreshToken) {
    const res = await fetch(`${API_BASE}/auth/refresh?refresh_token=${encodeURIComponent(refreshToken)}`, {
        method: 'POST'
    });

    if (!res.ok) {
        throw new UnauthorizedError('Refresh token invalid or expired');
    }

    return res.json();
}