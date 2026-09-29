function showView(viewId) {
    const views = ['loginContainer', 'signUpContainer', 'complaintContainer', 'complaintHistory'];
    views.forEach(id => {
        document.getElementById(id).style.display = (id === viewId) ? 'block' : 'none';
    });
}

// --- On popup open, check if already logged in ---
document.addEventListener('DOMContentLoaded', async () => {
    const { access_token } = await chrome.storage.local.get(['access_token']);
    showView(access_token ? 'complaintContainer' : 'loginContainer');
});

// --- Sign up / login toggle link ---
document.getElementById('showSignUp').addEventListener('click', (e) => {
    e.preventDefault();
    showView('signUpContainer');
});

// --- History nav ---
document.getElementById('showHistoryBtn').addEventListener('click', async () => {
    showView('complaintHistory');
   
    const complaintHistory = document.getElementById('historyList');
    complaintHistory.textContent = 'Loading...'

    const { access_token } = await chrome.storage.local.get(['access_token']);
    if (!access_token) {
        complaintHistory.textContent = 'Please log in first';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/ComplaintsHistory`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`Server responded ${res.status}: ${error}`);
        }

        const complaints = await res.json();

        if (complaints.length === 0) {
            complaintHistory.textContent = 'No complaints submitted yet';
            return
        }

        complaintHistory.innerHTML = complaints.map(c => `
            <div style="border-bottom: 1px solid #ccc; padding: 6px 0; text-align: left;">
                <strong>${c.case_reference}</strong><br>
                Product: ${c.product_title}<br>
                Seller: ${c.seller_name ?? 'N/A'}<br>
                Status: ${c.status}<br>
                Verification: ${c.verification_result}<br>
                <small>${new Date(c.created_at).toLocaleString()}</small>
            </div>
        `).join('');

    } catch (e) {
        console.error('Failed to load complaint history:', e);
        complaintHistory.textContent = 'Failed to load complaint history.'
    }
});

document.getElementById('backToComplaintBtn').addEventListener('click', () => {
    showView('complaintContainer');
});

//-------------------------------------

//login/signup to backend
const API_BASE = 'https://everify.store'; // will be changed to real url during development (same with in the manifest)

//sign up
document.getElementById('signUpForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const signUpStatus = document.getElementById('signUpStatus');

    const email = document.getElementById('signUpEmail').value.trim();
    const username = document.getElementById('signUpUsername').value.trim();
    const password = document.getElementById('signUpPassword').value;
    const passwordConfirmation = document.getElementById('passwordConfirmation').value;

    if (password !== passwordConfirmation) {
        signUpStatus.textContent = 'Passwords do not match.';
        return;
    }

    signUpStatus.textContent = 'Creating account...'

    try {
        const res = await fetch(`${API_BASE}/accounts/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            const message = Array.isArray(data.detail) 
                ? data.detail.map(d => d.msg).join(', ') : data.detail;
            throw new Error(message);
        }

        signUpStatus.textContent = 'Account created! You can now log in';
        document.getElementById('signUpForm').reset();

    } catch (err) {
        console.log('Signup failed:', err);
        signUpStatus.textContent = err.message || 'Failed to create account.';
    }
});

// login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const loginStatus = document.getElementById('loginStatus');

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    loginStatus.textContent = 'Logging in...';

    const formBody = new URLSearchParams();
    formBody.append('username', username);
    formBody.append('password', password);

    try {
        const res = await fetch(`${API_BASE}/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody.toString()
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || 'Login failed');
        }

        await chrome.storage.local.set({
            access_token: data.access_token,
            token_type: data.token_type
        });

        showView('complaintContainer');
        // loginStatus.textContent = 'Logged in successfully!';
    
    } catch (err) {
        console.error('Login failed:', err);
        loginStatus.textContent = err.message || 'Failed to log in';
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const { access_token } = await chrome.storage.local.get(['access_token']);
    showView(access_token ? 'complaintContainer' : 'loginContainer');

    // auto-fill shop URL field
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab && tab.url && tab.url.startsWith('http')) {
            document.getElementById('shopUrl').value = tab.url;
        }
    } catch (e) {
        console.error('Could not read current tab URL:', e);
    }
});

function sanitizeUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const suspiciousPatterns = /token|session|auth|sp_atk|spm/i;
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

// complaints data to backend
document.getElementById('submitComplaint').addEventListener('submit', async (e) => {
    e.preventDefault();

    const complaintData = {
        product_title: document.getElementById('productName').value.trim(),
        seller_name: document.getElementById('shop').value.trim(),
        product_url: sanitizeUrl(document.getElementById('shopUrl').value.trim()),
    };

    let info = document.getElementById('info');

    if(!complaintData.product_title || !complaintData.seller_name){
        info.textContent = 'Please fill in the required fields.';
        return;
    }

    const { access_token } = await chrome.storage.local.get(['access_token']);
    if (!access_token) {
        info.textContent = 'Please log in first.';
        return
    }

    try {
        const res = await fetch(`${API_BASE}/submitComplaint`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${access_token}`
            },
            body: JSON.stringify(complaintData)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Server responded ${res.status}: ${errText}`);
        }

        const data = await res.json();
        console.log('Complaint submitted:', data);
        info.textContent = 'Complaint submitted succesfully';
        document.getElementById('submitComplaint').reset();

    } catch (err) {
        console.error('Failed to submit complaint:', err);
        info.textContent = 'Failed to submit complaint. Please try again.';
    }

});