import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, AlertCircle, Users, ShieldCheck, Building2, CheckCircle2, AlertTriangle, Send } from 'lucide-react'
import FDALogo from '../images/FDA.png'
import PNPLogo from '../images/pnp-cidg.jpg'
import { API_BASE_URL } from '../utils/apiConfig'
import { validateEmail } from '../utils/emailValidation';


async function safeParseErrorResponse(response) {
  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    return null;
  }
  try {
    return JSON.parse(rawText);
  } catch {
    console.error('Non-JSON error response from server:', rawText);
    return null;
  }
}

function extractErrorMessage(errorData, fallback) {
  const detail = errorData?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(d => d?.msg || JSON.stringify(d)).join(' ');
  }
  if (detail && typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }
  return fallback;
}

function getRetryAfterSeconds(errorData) {
  const s = errorData?.detail?.retry_after_seconds;
  return Number.isFinite(s) && s > 0 ? Math.ceil(s) : 0;
}

function withCountdown(message, seconds) {
  if (!message || seconds <= 0) return message;
  return `${message} Please wait ${seconds}s before trying again.`;
}

function UniversalLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Which tab is active: 'personnel' | 'national-admin' | 'interagency-admin'
  // Supports deep-linking via ?tab=national-admin (or legacy ?tab=superadmin) or ?tab=interagency-admin
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam === 'national-admin'
    ? 'national-admin'
    : tabParam === 'interagency-admin'
    ? 'interagency-admin'
    : 'personnel';
  const [universalLoginActiveTab, setUniversalLoginActiveTab] = useState(initialTab);
  const reason = searchParams.get('reason');
  const [sessionMessage, setSessionMessage] = useState(
    reason === 'session_expired' ? 'Your session has expired. Please log in again.' : ''
  );
  // Tracks whether either child form is on its OTP screen
  const [isShowingOtp, setIsShowingOtp] = useState(false);

  function handleUniversalLoginTabSwitch(tab) {
    if (tab === universalLoginActiveTab) return;
    setIsShowingOtp(false);
    setUniversalLoginActiveTab(tab);
  }

  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <div className="universal-login-page">
        <div className="universal-login-glass-container">
          {/* LEFT PANEL — original large branding and logos preserved */}
          <div className="universal-login-left-panel">
            <div className="universal-login-agency universal-login-agency-top">
              <img src={FDALogo} alt="FDA AGENCY LOGO" className="universal-login-fda-logo" />
              <div>
                <p>REPUBLIC OF THE PHILIPPINES</p>
                <h3>FOOD AND DRUGS ADMINISTRATION</h3>
              </div>
            </div>

            <div className="universal-login-hero">
              <h1>WELCOME! <br /></h1>
              <h4>
                This is Interagency <span>Complaint Management</span>{' '}
                System Desktop Application (<span>ICMDA</span>)
              </h4>
            </div>

            <div className="universal-login-agency universal-login-agency-bottom">
              <img src={PNPLogo} alt="PNP-CIDG AGENCY LOGO" />
              <div>
                <p>REPUBLIC OF THE PHILIPPINES</p>
                <h3>CRIMINAL INVESTIGATION AND DETECTION GROUP</h3>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE — compact white card with role toggle at top */}
          <div className="universal-login-right-wrapper">
            <div className="universal-login-right-panel">
              {/* TOP GLASS SEGMENTED ROLE TOGGLE — hidden while on OTP screen */}
              {!isShowingOtp && (
                <div className="universal-login-tabs-container">
                  <button
                    type="button"
                    className={`universal-login-tab-btn ${universalLoginActiveTab === 'personnel' ? 'active' : ''}`}
                    onClick={() => handleUniversalLoginTabSwitch('personnel')}
                  >
                    <Users size={15} />
                    <span>Personnel</span>
                  </button>
                  <button
                    type="button"
                    className={`universal-login-tab-btn ${universalLoginActiveTab === 'national-admin' ? 'active' : ''}`}
                    onClick={() => handleUniversalLoginTabSwitch('national-admin')}
                  >
                    <ShieldCheck size={15} />
                    <span>National Admin</span>
                  </button>
                  <button
                    type="button"
                    className={`universal-login-tab-btn ${universalLoginActiveTab === 'interagency-admin' ? 'active' : ''}`}
                    onClick={() => handleUniversalLoginTabSwitch('interagency-admin')}
                  >
                    <Building2 size={15} />
                    <span>Interagency Admin</span>
                  </button>
                </div>
              )}

              {universalLoginActiveTab === 'personnel' && (
                <PersonnelLoginForm navigate={navigate} onOtpStateChange={setIsShowingOtp} sessionMessage={sessionMessage} />
              )}
              {universalLoginActiveTab === 'national-admin' && (
                <SuperAdminLoginForm navigate={navigate} onOtpStateChange={setIsShowingOtp} sessionMessage={sessionMessage} />
              )}
              {universalLoginActiveTab === 'interagency-admin' && (
                <InteragencyAdminLoginForm navigate={navigate} onOtpStateChange={setIsShowingOtp} sessionMessage={sessionMessage} />
              )}
            </div>
          </div>
        </div>
      </div>


      <style>{`
        * { padding: 0; margin: 0; box-sizing: border-box; }
        body { font-family: 'Poppins', sans-serif; }

        /* ===== LARGE OUTER GLASS CONTAINER (RESTORED TO PREVIOUS FULL SIZE) ===== */
        .universal-login-page {
          background-color: #1D3439;
          width: 100%;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: clamp(16px, 3vh, 40px) clamp(16px, 2.5vw, 24px);
          color: #fdfdfd;
          overflow-x: hidden;
          box-sizing: border-box;
        }

        .universal-login-glass-container {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: stretch;
          width: min(95vw, 1450px);
          height: min(92vh, 750px);
          min-height: 0;
          background: rgba(253, 253, 253, 0.07);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          padding: clamp(20px, 3vh, 48px) clamp(24px, 3.5vw, 56px);
          gap: clamp(16px, 2.5vw, 36px);
          box-sizing: border-box;
        }

        /* ===== LEFT BRANDING PANEL & LOGOS (RESTORED TO PREVIOUS SIZES) ===== */
        .universal-login-left-panel {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-start;
          padding: 8px 0;
          gap: 24px;
        }

        .universal-login-agency {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-direction: row;
        }
        .universal-login-agency img {
          width: 56px;
          height: 56px;
          object-fit: contain;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.95);
          padding: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          flex-shrink: 0;
        }
        .universal-login-agency-top img,
        .universal-login-fda-logo {
          width: 60px;
          height: 60px;
        }
        .universal-login-agency h3 {
          color: #ffffff;
          font-size: 0.95rem;
          font-weight: 600;
          letter-spacing: 0.3px;
          line-height: 1.3;
          margin: 0;
        }
        .universal-login-agency p {
          color: rgba(255, 255, 255, 0.75);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          margin-bottom: 3px;
        }

        .universal-login-hero {
          margin: 16px 0;
          text-align: left;
        }
        .universal-login-hero h1 {
          font-size: clamp(1.5rem, 2.5vw, 2.9rem);
          line-height: 1.15;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.5px;
        }
        .universal-login-hero span {
          color: #f7931a;
          font-weight: 600;
        }
        .universal-login-hero h4 {
          font-size: clamp(1rem, 1.4vw, 1.45rem);
          color: rgba(255, 255, 255, 0.82);
          font-weight: 600;
          margin-top: 12px;
        }

        /* ===== RIGHT WRAPPER & GLASS SEGMENTED ROLE TOGGLE ===== */
        .universal-login-right-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 1;
          min-width: 0;
          align-self: center;
        }

        .universal-login-tabs-container {
         display: flex;
        width: 100%;
        margin: 0 auto 28px auto;
        background: rgba(29, 52, 57, 0.07);
        border: 1px solid rgba(29, 52, 57, 0.12);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-radius: 10px;
        padding: 4px;
        gap: 4px;
        box-sizing: border-box;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
        height: 44px;
        flex-shrink: 0;
        }

        .universal-login-tab-btn {
          flex: 1;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 0 4px;
          height: 100%;
          border-radius: 7px;
          border: 1px solid transparent;
          background: transparent;
          color: #64748b;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          letter-spacing: 0.1px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
          box-sizing: border-box;
          white-space: nowrap;
        }

        .universal-login-tab-btn:hover:not(.active) {
          background: rgba(29, 52, 57, 0.04);
          color: #1e293b;
          border-color: rgba(29, 52, 57, 0.06);
        }

        .universal-login-tab-btn.active {
          background: #ffffff;
          color: #1D3439;
          font-weight: 700;
          border-color: rgba(0, 0, 0, 0.06);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .universal-login-tab-btn.active svg { color: #1D3439; }

        /* ===== SMALLER COMPACT WHITE LOGIN CARD ===== */
        .universal-login-right-panel {
          width: 510px;
          min-width: min(510px, 100%);
          max-width: 100%;
          min-height: 580px;
          height: auto;
          background: #ffffff;
          padding: 24px 28px;
          border-radius: 16px;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          flex-shrink: 1;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          position: relative;
          z-index: 1;
        }

        /* ===== COMMON CARD HEADER STYLES ===== */
        .universal-login-card-header {
          margin-bottom: 20px;
        }
        .universal-login-card-header h2 {
          font-size: 25px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 2px;
          letter-spacing: -0.3px;
        }
        .universal-login-card-header small {
          display: block;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          color: #64748b;
          margin-bottom: 2px;
        }
        .universal-login-card-header p {
          font-size: 13px;
          color: #64748b;
          margin-bottom: 16px;
        }

        .universal-login-otp-header {
          text-align: center;
          margin-top: 12px;
          margin-bottom: 8px;
        }
        .universal-login-otp-header h2, .universal-login-otp-header h3 {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: -0.2px;
          margin-bottom: 5px;
        }
        .universal-login-otp-header small {
          display: block;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          color: #64748b;
          margin-bottom: 5px;
        }
        .universal-login-otp-header p {
          font-size: 14.5px;
          color: #64748b;
          margin-bottom: 18px;
        }

        /* ===== FORM CONTROLS ===== */
        .universal-login-personnel-form,
        .universal-login-admin-form {
          display: flex;
          flex-direction: column;
          width: 100%;
        }

        .universal-login-personnel-form form,
        .universal-login-admin-form form {
          width: 90%;
          max-width: 410px;
          margin: 0 auto;
        }

        .universal-login-form-group {
          display: flex;
          flex-direction: column;
          margin-bottom: 12px;
        }

        .universal-login-form-group label,
        .universal-login-personnel-form label,
        .universal-login-admin-form label {
          display: block;
          font-size: 14.5px;
          font-weight: 600;
          color: #334155;
          margin-bottom: 6px;
          letter-spacing: 0.1px;
        }

        .universal-login-form-group span.required-star,
        .universal-login-personnel-form span.required-star,
        .universal-login-admin-form span.required-star {
          color: #ef4444;
        }

        .universal-login-agency-buttons {
          display: flex;
          gap: 8px;
          margin-top: 0;
          margin-bottom: 0;
          flex-direction: row;
          justify-content: center;
        }
        .universal-login-agency-buttons input[type="radio"] { display: none; }
        .universal-login-inter-buttons {
          flex: 1;
          padding: 9px 12px;
          min-height: 44px;
          border: 1.5px solid #e2e8f0;
          border-radius: 7px;
          cursor: pointer;
          font-size: 13.5px;
          font-weight: 600;
          transition: all 0.2s ease;
          text-align: center;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          color: #334155;
          margin: 0 !important;
        }
        .universal-login-agency-btn-fda:hover { border-color: #1b4322; background: #1b4322; color: #fdfdfd; }
        .universal-login-agency-btn-cidg:hover { background: #1f2937; border-color: #1f2937; color: #fdfdfd; }
        input[type="radio"]#universal-login-fda:checked + label,
        input[type="radio"]#universal-login-interagency-fda:checked + label {
          border-color: #2d6c39; background: #2d6c39; color: #fff;
          box-shadow: 0 3px 10px rgba(45, 108, 57, 0.25); transform: translateY(-1px);
        }
        input[type="radio"]#universal-login-cidg:checked + label,
        input[type="radio"]#universal-login-interagency-cidg:checked + label {
          border-color: #1f2937; background: #1f2937; color: #fff;
          box-shadow: 0 3px 10px rgba(31, 41, 55, 0.25); transform: translateY(-1px);
        }

        .universal-login-input-wrapper,
        .universal-login-admin-input-wrapper,
        .universal-login-password-wrapper,
        .universal-login-admin-password-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }

        .universal-login-input-wrapper input,
        .universal-login-admin-input-wrapper input {
          width: 100%;
          padding: 11.5px 14px 11.5px 38px !important;
          min-height: 44px;
          margin-bottom: 0 !important;
          border: 1.5px solid #cbd5e1;
          border-radius: 7px;
          font-size: 13.5px;
          background: #ffffff;
          color: #0f172a;
          outline: none;
          transition: all 0.2s ease;
        }
        .universal-login-input-wrapper input:focus,
        .universal-login-admin-input-wrapper input:focus {
          border-color: #f7931a;
          box-shadow: 0 0 0 3px rgba(247, 147, 26, 0.15);
        }

        .universal-login-select {
          width: 100%;
          padding: 11.5px 32px 11.5px 38px !important;
          min-height: 44px;
          margin-bottom: 0 !important;
          border: 1.5px solid #cbd5e1;
          border-radius: 7px;
          font-size: 13.5px;
          background: #ffffff;
          color: #0f172a;
          outline: none;
          transition: all 0.2s ease;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 10px center;
          background-size: 14px;
        }
        .universal-login-select:focus {
          border-color: #f7931a;
          box-shadow: 0 0 0 3px rgba(247, 147, 26, 0.15);
        }
        .universal-login-mockup-success {
          background-color: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          padding: 8px 12px;
          border-radius: 7px;
          margin-top: 10px;
          font-size: 12px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-align: center;
        }

        .universal-login-password-wrapper input,
        .universal-login-admin-password-wrapper input {
          width: 100%;
          padding: 11.5px 38px 11.5px 38px !important;
          min-height: 44px;
          margin-bottom: 0 !important;
          border: 1.5px solid #cbd5e1;
          border-radius: 7px;
          font-size: 13.5px;
          background: #ffffff;
          color: #0f172a;
          outline: none;
          transition: all 0.2s ease;
        }
        .universal-login-password-wrapper input:focus,
        .universal-login-admin-password-wrapper input:focus {
          border-color: #f7931a;
          box-shadow: 0 0 0 3px rgba(247, 147, 26, 0.15);
        }

        .universal-login-input-icon,
        .universal-login-admin-input-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .universal-login-toggle-password-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s ease;
        }
        .universal-login-toggle-password-btn:hover { color: #ef4444; }

        /* FIELD VALIDATION ERROR MESSAGES */
        .universal-login-field-error {
          font-size: 11.5px;
          color: #ef4444 !important;
          margin-top: 5px !important;
          margin-bottom: 1px !important;
          display: flex;
          align-items: center;
          gap: 4px;
          line-height: 1.2;
          font-weight: 500;
        }

        /* REMEMBER ME & FORGOT PASSWORD ROWS */
        .universal-login-remember-me,
        .universal-login-admin-remember-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
          margin-bottom: 14px;
        }
        .universal-login-remember-me label,
        .universal-login-admin-remember-row label {
          display: inline-flex !important;
          align-items: center !important;
          gap: 6px;
          margin: 0 !important;
          font-size: 12px;
          color: #475569;
          cursor: pointer;
        }
        .universal-login-remember-me input[type="checkbox"],
        .universal-login-admin-remember-row input[type="checkbox"] {
          width: 14px !important;
          height: 14px !important;
          margin: 0 !important;
          cursor: pointer;
          accent-color: #1D3439;
        }

        .universal-login-forget-pass,
        .universal-login-forgot-password-link {
          color: #dc2626;
          font-size: 12px;
          font-weight: 500;
          text-align: right;
          margin: 0 !important;
          cursor: pointer;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .universal-login-forget-pass a,
        .universal-login-forgot-password-link {
          color: #dc2626;
          text-decoration: none;
        }
        .universal-login-forget-pass:hover,
        .universal-login-forget-pass a:hover,
        .universal-login-forgot-password-link:hover {
          color: #b91c1c;
          text-decoration: underline;
        }

        /* BANNER ERROR CONTAINER */
        .universal-login-error-msg-container,
        .universal-login-admin-error-container {
          background-color: #fef2f2;
          border: 1px solid #fca5a5;
          padding: 7px 10px;
          border-radius: 7px;
          margin-top: 0;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .universal-login-error-msg,
        .universal-login-admin-error-msg {
          color: #dc2626 !important;
          font-size: 12px;
          font-weight: 500;
          text-align: center;
          margin: 0 !important;
        }

        /* UNIFIED SUBMIT BUTTON */
        .universal-login-submit-btn {
          width: 100%;
          margin-top: 25px;
          padding: 10px 14px;
          background: #1D3439;
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 7px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 3px 10px rgba(30, 41, 59, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
        }
        .universal-login-submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px rgba(15, 23, 42, 0.3);
          background: #244249;
        }
        .universal-login-submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .universal-login-submit-btn:disabled {
          background: #94a3b8;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
          opacity: 0.75;
        }

        /* OTP CONTAINER & CONTROLS */
        .universal-login-otp-container {
          display: flex;
          flex-direction: column;
          margin-top: 36px;
          animation: universalLoginFadeIn 0.35s ease-out forwards;
        }
      .universal-login-otp-instructions {
          font-size: 14.5px;
          color: #475569;
          margin-bottom: 16px;
          line-height: 1.5;
          text-align: center;
        }
        .universal-login-otp-instructions span { font-weight: 600; color: #0891b2; font-style: italic}
        .universal-login-otp-input-grid,
        .universal-login-admin-otp-grid {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-bottom: 16px;
        }
        .universal-login-otp-digit-input,
        .universal-login-admin-otp-digit-input {
          width: 55px;
          height: 59px;
          text-align: center;
          font-size: 22px;
          font-weight: 700;
          border-radius: 8px;
          border: 1.5px solid #cbd5e1 !important;
          background-color: #ffffff;
          color: #0f172a;
          transition: all 0.2s ease;
          margin-bottom: 0 !important;
          padding: 0 !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .universal-login-otp-digit-input:focus,
        .universal-login-admin-otp-digit-input:focus {
          border-color: #f7931a !important;
          box-shadow: 0 0 0 3px rgba(247, 147, 26, 0.2);
          outline: none;
        }

        /* ===== INTERAGENCY ADMIN OTP SIZING (SCALED FOR CONTAINER PROPORTIONS) ===== */
        .universal-login-interagency-otp-header p {
          font-size: 14.5px;
          color: #64748b;
          margin-bottom: 18px;
        }
        .universal-login-interagency-otp-instructions {
          font-size: 13.5px;
          color: #475569;
          margin-bottom: 20px;
          line-height: 1.45;
          text-align: center;
        }
        .universal-login-interagency-otp-instructions span {
          font-weight: 600;
          color: #0f172a;
        }
        .universal-login-interagency-otp-grid {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-bottom: 16px;
        }
        .universal-login-interagency-otp-digit-input {
          width: 55px;
          height: 59px;
          text-align: center;
          font-size: 22px;
          font-weight: 700;
          border-radius: 8px;
          border: 1.5px solid #cbd5e1 !important;
          background-color: #ffffff;
          color: #0f172a;
          transition: all 0.2s ease;
          margin-bottom: 0 !important;
          padding: 0 !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .universal-login-interagency-otp-digit-input:focus {
          border-color: #f7931a !important;
          box-shadow: 0 0 0 3px rgba(247, 147, 26, 0.2);
          outline: none;
        }
        .universal-login-interagency-otp-timer-container {
          font-size: 14px;
          margin-bottom: 16px;
        }
        .universal-login-otp-timer-container,
        .universal-login-admin-otp-timer-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          margin-bottom: 10px;
          font-size: 14px;
          color: #64748b;
          text-align: center;
        }
        .universal-login-otp-timer-container strong,
        .universal-login-admin-otp-timer-container strong {
          color: #1D3439;
          font-weight: 700;
        }
        .universal-login-resend-button,
        .universal-login-admin-resend-button {
          background: none;
          border: none;
          color: #f7931a;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }
        .universal-login-resend-button:disabled,
        .universal-login-admin-resend-button:disabled {
          color: #94a3b8;
          cursor: not-allowed;
          text-decoration: none;
        }
        .universal-login-back-btn,
        .universal-login-admin-back-btn {
          background: none;
          border: none;
          color: #64748b;
          font-size: 14.5px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          margin-top: 20px;
          text-decoration: underline;
        }
        .universal-login-back-btn:hover,
        .universal-login-admin-back-btn:hover {
          color: #0f172a;
          font-weight: 800;
        }

        @keyframes universalLoginFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        /* ===== PERSONNEL REQUEST RESET PASSWORD CONFIRMATION MODAL ===== */
        .universal-login-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: universalLoginModalFade 0.2s ease-out;
        }
        @keyframes universalLoginModalFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .universal-login-modal {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
          width: 100%;
          max-width: 480px;
          overflow: hidden;
          animation: universalLoginModalUp 0.22s ease-out;
          color: #0f172a;
          box-sizing: border-box;
        }
        @keyframes universalLoginModalUp {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .universal-login-modal-header {
          padding: 28px 28px 16px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .universal-login-modal-icon-wrap {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: rgba(245, 158, 11, 0.12);
          color: #d97706;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }
        .universal-login-modal-icon-wrap.success {
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
        }
        .universal-login-modal-title {
          font-family: 'Poppins', sans-serif;
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 8px;
          letter-spacing: -0.2px;
        }
        .universal-login-modal-subtitle {
          font-size: 13.5px;
          color: #64748b;
          margin: 0;
          line-height: 1.5;
        }
        .universal-login-modal-body {
          padding: 10px 28px 20px;
        }
        .universal-login-modal-text {
          font-size: 13.5px;
          color: #475569;
          line-height: 1.55;
          margin: 0;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 14px 16px;
        }
        .universal-login-modal-notice {
          font-size: 13px;
          color: #92400e;
          line-height: 1.55;
          margin: 0;
          background: #fffbeb;
          border: 1.5px solid #fde68a;
          border-radius: 10px;
          padding: 14px 16px;
        }
        .universal-login-modal-notice strong {
          color: #78350f;
        }
        .universal-login-modal-verify-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 12px;
        }
        .universal-login-modal-verify-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13.5px;
        }
        .universal-login-modal-verify-label {
          color: #64748b;
          font-weight: 500;
        }
        .universal-login-modal-verify-value {
          color: #0f172a;
          font-weight: 600;
        }
        .universal-login-modal-verify-warning {
          font-size: 12.5px;
          color: #64748b;
          line-height: 1.5;
          margin: 0;
          text-align: center;
        }
        .universal-login-modal-footer {
          padding: 16px 28px 24px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
        }
        .universal-login-modal-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1.5px solid transparent;
        }
        .universal-login-modal-btn-secondary {
          background: #ffffff;
          color: #475569;
          border-color: #cbd5e1;
        }
        .universal-login-modal-btn-secondary:hover:not(:disabled) {
          background: #f8fafc;
          color: #0f172a;
          border-color: #94a3b8;
        }
        .universal-login-modal-btn-primary {
          background: #1D3439;
          color: #ffffff;
          box-shadow: 0 3px 10px rgba(29, 52, 57, 0.25);
        }
        .universal-login-modal-btn-primary:hover:not(:disabled) {
          background: #27484F;
          transform: translateY(-1px);
          box-shadow: 0 5px 14px rgba(29, 52, 57, 0.35);
        }
        .universal-login-modal-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: none !important;
        }
        .universal-login-modal-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: universalLoginModalSpin 0.7s linear infinite;
        }
        @keyframes universalLoginModalSpin {
          to { transform: rotate(360deg); }
        }

        /* ===== RESPONSIVENESS ===== */
        @media (max-width: 820px) {
          .universal-login-glass-container {
            flex-direction: column;
            width: min(92vw, 640px);
            height: auto;
            min-height: auto;
            padding: 36px 28px;
            gap: 32px;
            align-items: center;
          }
          .universal-login-left-panel {
            width: 100%;
            align-items: center;
            text-align: center;
            gap: 24px;
            padding: 0;
          }
          .universal-login-hero { margin: 12px 0; text-align: center; }
          .universal-login-agency { justify-content: center; text-align: left; }
          .universal-login-hero h1 { font-size: 2.1rem; }
          .universal-login-right-wrapper {
            width: 100%;
            max-width: 440px;
            margin-left: 0;
            align-items: center;
            justify-content: center;
          }
          .universal-login-right-panel {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            min-height: 570px;
            height: auto;
            max-height: none;
            padding: 22px 20px;
            border-radius: 16px;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
          }
        }

        @media (max-height: 720px) {
          .universal-login-page {
            padding: 16px 20px;
          }
          .universal-login-glass-container {
            padding: 20px 28px;
            gap: 20px;
          }
          .universal-login-left-panel {
            gap: 12px;
            padding: 4px 0;
          }
          .universal-login-agency img {
            width: 44px;
            height: 44px;
          }
          .universal-login-agency-top img,
          .universal-login-fda-logo {
            width: 48px;
            height: 48px;
          }
          .universal-login-agency h3 {
            font-size: 0.85rem;
          }
          .universal-login-hero {
            margin: 8px 0;
          }
          .universal-login-hero h1 {
            font-size: clamp(1.4rem, 2.2vw, 2.2rem);
          }
          .universal-login-hero h4 {
            font-size: clamp(0.9rem, 1.2vw, 1.15rem);
            margin-top: 6px;
          }
          .universal-login-right-panel {
            padding: 16px 22px;
            min-height: 445px;
            height: auto;
          }
          .universal-login-tabs-container {
            height: 38px;
            margin-bottom: 14px;
          }
          .universal-login-tab-btn {
            font-size: 12px;
            gap: 4px;
          }
          .universal-login-card-header {
            margin-bottom: 12px;
          }
          .universal-login-card-header h2 {
            font-size: 20px;
          }
          .universal-login-card-header small {
            font-size: 13px;
          }
          .universal-login-card-header p {
            font-size: 12px;
            margin-bottom: 8px;
          }
          .universal-login-form-group {
            margin-bottom: 8px;
          }
          .universal-login-form-group label,
          .universal-login-personnel-form label,
          .universal-login-admin-form label {
            font-size: 13px;
            margin-bottom: 4px;
          }
          .universal-login-input-wrapper input,
          .universal-login-admin-input-wrapper input,
          .universal-login-password-wrapper input,
          .universal-login-admin-password-wrapper input,
          .universal-login-select {
            min-height: 38px;
            padding-top: 8px !important;
            padding-bottom: 8px !important;
            font-size: 13px;
          }
          .universal-login-inter-buttons {
            min-height: 38px;
            padding: 6px 10px;
            font-size: 12.5px;
          }
          .universal-login-remember-me,
          .universal-login-admin-remember-row {
            margin-bottom: 8px;
          }
          .universal-login-submit-btn {
            margin-top: 14px;
            padding: 8px 12px;
            font-size: 13.5px;
          }
          .universal-login-otp-header h2,
          .universal-login-otp-header h3 {
            font-size: 20px;
            margin-bottom: 2px;
          }
          .universal-login-otp-header p {
            font-size: 13px;
            margin-bottom: 10px;
          }
          .universal-login-otp-instructions {
            font-size: 13px;
            margin-bottom: 10px;
          }
          .universal-login-otp-digit-input,
          .universal-login-admin-otp-digit-input,
          .universal-login-interagency-otp-digit-input {
            width: 44px;
            height: 48px;
            font-size: 18px;
          }
          .universal-login-back-btn,
          .universal-login-admin-back-btn {
            margin-top: 12px;
            font-size: 13px;
          }
        }

        @media (max-width: 767px) {
          .universal-login-page { padding: 20px 12px; justify-content: flex-start; }
          .universal-login-glass-container { width: 95vw; padding: 24px 18px; border-radius: 14px; gap: 24px; }
          .universal-login-hero h1 { font-size: 1.55rem; }
          .universal-login-hero h4 { font-size: 0.95rem; }
          .universal-login-agency img,
          .universal-login-agency-top img,
          .universal-login-fda-logo { width: 46px; height: 46px; }
          .universal-login-agency h3 { font-size: 0.85rem; }
          .universal-login-right-panel {
            padding: 18px 14px;
            border-radius: 14px;
            min-height: 535px;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
          }
          .universal-login-tabs-container {
            width: 100%;
            margin-bottom: 14px;
            padding: 3px;
            border-radius: 8px;
            height: 40px;
            flex-shrink: 0;
          }
          .universal-login-tab-btn {
            padding: 0 4px;
            height: 100%;
            font-size: 11px;
            gap: 4px;
            border-radius: 6px;
          }
          .universal-login-personnel-form form,
          .universal-login-admin-form form {
            width: 100%;
          }
          .universal-login-card-header h2 { font-size: 18px; }
          .universal-login-agency-buttons { gap: 6px; }
          .universal-login-inter-buttons { padding: 6px 5px; font-size: 11.5px; }
          .universal-login-otp-input-grid, .universal-login-admin-otp-grid { gap: 5px; }
          .universal-login-otp-digit-input, .universal-login-admin-otp-digit-input { width: 36px; height: 40px; font-size: 16px;  }
          .universal-login-interagency-otp-grid { gap: 6px; }
          .universal-login-interagency-otp-digit-input { width: 42px; height: 48px; font-size: 18px; }
        }
      `}</style>
    </div>
  );
}

const getDeviceCoordinates = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: null, longitude: null, source: 'ip' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          longitude: parseFloat(pos.coords.longitude.toFixed(6)),
          source: 'gps',
        });
      },
      (err) => {
        console.warn('Geolocation unavailable during login:', err);
        resolve({ latitude: null, longitude: null, source: 'ip' });
      },
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 5 * 60 * 1000 }
    );
  });
};

// ============================================================================
// PERSONNEL LOGIN FORM
// Supports both mock frontend testing and real API fallback
// ============================================================================
function PersonnelLoginForm({ navigate, onOtpStateChange, sessionMessage  }) {
  const [personnelAgency, setPersonnelAgency] = useState('');
  const [personnelEmail, setPersonnelEmail] = useState('');
  const [personnelPassword, setPersonnelPassword] = useState('');
  const [personnelShowPassword, setPersonnelShowPassword] = useState(false);
  const [personnelLoginError, setPersonnelLoginError] = useState('');
  const [personnelRememberMe, setPersonnelRememberMe] = useState(false);
  const [personnelErrors, setPersonnelErrors] = useState({});
  const [personnelLockoutSeconds, setPersonnelLockoutSeconds] = useState(0);

  useEffect(() => {
    if (personnelLockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setPersonnelLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [personnelLockoutSeconds]);

  const displayedPersonnelError = withCountdown(personnelLoginError, personnelLockoutSeconds);

  // Personnel Request Password Reset Modal State
  const [personnelIsResetModalOpen, setPersonnelIsResetModalOpen] = useState(false);
  const [personnelResetStep, setPersonnelResetStep] = useState('confirm'); // 'confirm' | 'verify' | 'success'
  const [personnelIsSubmittingReset, setPersonnelIsSubmittingReset] = useState(false);
  const [personnelResetError, setPersonnelResetError] = useState('');

  const agencyDisplay = personnelAgency === 'fda' ? 'FDA' : personnelAgency === 'lea' ? 'LEA-CIDG' : '';
  const isEmailValid = Boolean(personnelEmail.trim() && validateEmail(personnelEmail.trim()) === null);
  const isPersonnelFormComplete = Boolean(personnelAgency && isEmailValid);

  function handleOpenResetModal() {
    setPersonnelResetStep('confirm');
    setPersonnelIsSubmittingReset(false);
    setPersonnelResetError('');
    setPersonnelIsResetModalOpen(true);
  }

  function handleCloseResetModal() {
    if (personnelIsSubmittingReset) return;
    setPersonnelIsResetModalOpen(false);
  }

  function handleOverlayClick() {
    if (personnelIsSubmittingReset) return;
    if (personnelResetStep === 'verify') {
      setPersonnelResetStep('confirm');
    } else {
      handleCloseResetModal();
    }
  }

  function handleProceedToVerify() {
    if (!isPersonnelFormComplete) return;
    setPersonnelResetStep('verify');
  }

  function handleBackToConfirm() {
    if (personnelIsSubmittingReset) return;
    setPersonnelResetError('');
    setPersonnelResetStep('confirm');
  }

  async function handleConfirmPersonnelResetRequest() {
    if (personnelIsSubmittingReset || !isPersonnelFormComplete) return;
    setPersonnelIsSubmittingReset(true);
    setPersonnelResetError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: personnelEmail.trim(),
          agency: personnelAgency,
        }),
      });

      if (!response.ok) {
        const errorData = await safeParseErrorResponse(response);
        throw new Error(extractErrorMessage(errorData, 'Failed to send request.'));
      }

      setPersonnelResetStep('success');
    } catch (err) {
      setPersonnelResetError(err.message || 'Failed to send request. Please try again.');
    } finally {
      setPersonnelIsSubmittingReset(false);
    }
  }


  function rememberedEmailKey(forAgency) {
    return forAgency ? `remembered_email_user_${forAgency}` : null;
  }

  const personnelLastAutoFillRef = useRef('');

  useEffect(() => {
    const key = rememberedEmailKey(personnelAgency);
    const savedEmail = key ? localStorage.getItem(key) : null;

    // Only touch the field if it's empty, or if it still holds exactly
    // what we auto-filled last time (i.e. the user hasn't typed their
    // own value in the meantime) — otherwise leave their input alone.
    const emailIsUntouched =
      personnelEmail.trim() === '' || personnelEmail === personnelLastAutoFillRef.current;

    if (emailIsUntouched) {
      if (savedEmail) {
        setPersonnelEmail(savedEmail);
        setPersonnelRememberMe(true);
      } else {
        setPersonnelEmail('');
        setPersonnelRememberMe(false);
      }
      personnelLastAutoFillRef.current = savedEmail || '';
    }
  }, [personnelAgency]);

  const [personnelIsOtpSent, setPersonnelIsOtpSent] = useState(false);
  const [personnelOtp, setPersonnelOtp] = useState(new Array(6).fill(''));
  const [personnelTimer, setPersonnelTimer] = useState(300);
  const personnelOtpRefs = useRef([]);
  const personnelCoordsPromiseRef = useRef(null);

  // Notify parent when OTP screen visibility changes
  useEffect(() => {
    if (onOtpStateChange) onOtpStateChange(personnelIsOtpSent);
  }, [personnelIsOtpSent]);

  useEffect(() => {
    let interval;
    if (personnelIsOtpSent && personnelTimer > 0) {
      interval = setInterval(() => setPersonnelTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [personnelIsOtpSent, personnelTimer]);

  function handlePersonnelOtpChange(element, index) {
    let val = element.value;
    if (!/^\d*$/.test(val)) return;
    val = val.substring(val.length - 1);
    const newOtp = [...personnelOtp];
    newOtp[index] = val;
    setPersonnelOtp(newOtp);
    if (val && index < 5) personnelOtpRefs.current[index + 1].focus();
  }

  function handlePersonnelOtpKeyDown(e, index) {
    if (e.key === 'Backspace') {
      if (!personnelOtp[index] && index > 0) {
        const newOtp = [...personnelOtp];
        newOtp[index - 1] = '';
        setPersonnelOtp(newOtp);
        personnelOtpRefs.current[index - 1].focus();
      } else {
        const newOtp = [...personnelOtp];
        newOtp[index] = '';
        setPersonnelOtp(newOtp);
      }
    }
  }

  function handlePersonnelOtpPaste(e) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().substring(0, 6);
    if (/^\d+$/.test(pastedData)) {
      const digits = pastedData.split('');
      const newOtp = [...personnelOtp];
      for (let i = 0; i < 6; i++) newOtp[i] = digits[i] || '';
      setPersonnelOtp(newOtp);
      const targetFocusIndex = Math.min(digits.length, 5);
      personnelOtpRefs.current[targetFocusIndex]?.focus();
    }
  }

  async function handlePersonnelResendOtp() {
    setPersonnelLoginError('');


    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: personnelEmail.trim(), password: personnelPassword, agency: personnelAgency }),
      });

      if (!response.ok) {
        const errorData = await safeParseErrorResponse(response);
        throw new Error(extractErrorMessage(errorData, 'Failed to resend code.'));
      }

      setPersonnelTimer(300);
      setPersonnelOtp(new Array(6).fill(''));
      setTimeout(() => personnelOtpRefs.current[0]?.focus(), 0);
    } catch (err) {
      setPersonnelLoginError(err.message);
    }
  }

  function handlePersonnelBackToLogin() {
    setPersonnelIsOtpSent(false);
    setPersonnelOtp(new Array(6).fill(''));
    setPersonnelLoginError('');
    personnelCoordsPromiseRef.current = null;
  }

  const formatPersonnelTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function maskPersonnelEmail(rawEmail) {
    if (!rawEmail || !rawEmail.includes('@')) return rawEmail;
    const [localPart, domain] = rawEmail.split('@');
    const visibleChars = Math.min(2, localPart.length);
    const maskedLocal = localPart.slice(0, visibleChars) + '*'.repeat(Math.max(localPart.length - visibleChars, 3));
    return `${maskedLocal}@${domain}`;
  }

  function handlePersonnelEmailChange(e) {
    const val = e.target.value;
    setPersonnelEmail(val);
    if (!val.trim()) {
      setPersonnelErrors((prev) => ({ ...prev, email: '' }));
    } else {
      const err = validateEmail(val.trim());
      setPersonnelErrors((prev) => ({ ...prev, email: err || '' }));
    }
  }

  function handlePersonnelPasswordChange(e) {
    setPersonnelPassword(e.target.value);
    if (personnelErrors.password) setPersonnelErrors((prev) => ({ ...prev, password: '' }));
  }

 function handlePersonnelAgencyChange(newAgency) {
  if (personnelAgency && personnelAgency !== newAgency) {
    // Agency was already selected, and it's genuinely changing — clear password only
    setPersonnelPassword('');
  }
  // If personnelAgency was empty (first-time selection) or newAgency === personnelAgency, do nothing to password
  setPersonnelAgency(newAgency);

  if (personnelErrors.agency) {
    setPersonnelErrors((prev) => ({ ...prev, agency: '' }));
  }
}

  async function handlePersonnelLoginSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    if (!personnelIsOtpSent) {
      if (personnelLockoutSeconds > 0) return;
      const newErrors = {};

      if (!personnelAgency) {
        newErrors.agency = 'Please select an agency.';
      }

      if (!personnelEmail.trim()) {
        newErrors.email = 'Email is required.';
      } else {
        const err = validateEmail(personnelEmail.trim());
        if (err) newErrors.email = err;
      }

      if (!personnelPassword.trim()) {
        newErrors.password = 'Password is required.';
      }

      if (Object.keys(newErrors).length > 0) {
        setPersonnelErrors(newErrors);
        return;
      }
      setPersonnelErrors({});

      const cleanEmail = personnelEmail.trim().toLowerCase();


      // REAL BACKEND LOGIN API CALL
      try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: personnelEmail.trim(), password: personnelPassword, agency: personnelAgency }),
        });

        if (!response.ok) {
          const errorData = await safeParseErrorResponse(response);
          setPersonnelLockoutSeconds(getRetryAfterSeconds(errorData));
          throw new Error(extractErrorMessage(errorData, 'Invalid email or password.'));
        }

        const key = rememberedEmailKey(personnelAgency);
        if (key) {
          if (personnelRememberMe) localStorage.setItem(key, personnelEmail.trim());
          else localStorage.removeItem(key);
        }
        
        // Start acquiring location now so it's ready by the time the OTP is typed
        personnelCoordsPromiseRef.current = getDeviceCoordinates();


        setPersonnelIsOtpSent(true);
        setPersonnelTimer(300);
        setPersonnelLoginError('');
        setPersonnelLockoutSeconds(0);
      } catch (err) {
        setPersonnelLoginError(err.message || 'Something went wrong. Please try again.');
      }
    } else {
      // OTP VERIFICATION STEP
      const otpCode = personnelOtp.join('');
      if (otpCode.length < 6) {
        setPersonnelLoginError('Please enter the full 6-digit verification code.');
        return;
      }



      // REAL BACKEND OTP VERIFICATION
      try {
        const coords = await Promise.race([
          personnelCoordsPromiseRef.current ?? getDeviceCoordinates(),
          new Promise((resolve) =>
            setTimeout(() => resolve({ latitude: null, longitude: null, source: 'ip' }), 3500)
          ),
        ]);

        const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: personnelEmail.trim(),
            otp: otpCode,
            latitude: coords.latitude,
            longitude: coords.longitude,
            source: coords.source,
          }),
        });

        if (!response.ok) {
          const errorData = await safeParseErrorResponse(response);
          throw new Error(extractErrorMessage(errorData, 'Invalid verification code. Please try again.'));
        }

        const data = await response.json();
        localStorage.removeItem('user_name');
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('agency', personnelAgency);
        localStorage.setItem('role', 'personnel');

        if (data.force_password_change) {
          navigate('/change-password');
        } else if (personnelAgency === 'fda') {
          navigate('/fdafolder/fda-dashboard');
        } else {
          navigate('/leacidgfolder/lea-dashboard');
        }
      } catch (err) {
        setPersonnelLoginError(err.message || 'Invalid verification code. Please try again.');
        setPersonnelOtp(new Array(6).fill(''));
        setTimeout(() => personnelOtpRefs.current[0]?.focus(), 0);
        if (/request a new otp/i.test(err.message)) {
          setPersonnelTimer(0);
        }
      }
    }
  }

  return (
    <div className="universal-login-personnel-form">
      {!personnelIsOtpSent ? (
        <form noValidate onSubmit={handlePersonnelLoginSubmit}>
          <div className="universal-login-card-header">
            <small>AUTHORIZED LOGIN</small>
            <h2>Please log in to continue</h2>
            <p>Select your agency and enter your credentials.</p>
          </div>

          <div className="universal-login-form-group">
            <label htmlFor="universal-login-personnel-agency">
              Agency <span className="required-star">*</span>
            </label>
            <div className="universal-login-agency-buttons" id="universal-login-personnel-agency">
              <input
                type="radio"
                id="universal-login-fda"
                name="universal-login-personnel-agency-radio"
                value="fda"
                onChange={() => handlePersonnelAgencyChange('fda')}
                checked={personnelAgency === 'fda'}
              />
              <label htmlFor="universal-login-fda" className="universal-login-inter-buttons universal-login-agency-btn-fda">FDA</label>

              <input
                type="radio"
                id="universal-login-cidg"
                name="universal-login-personnel-agency-radio"
                value="lea"
                onChange={() => handlePersonnelAgencyChange('lea')}
                checked={personnelAgency === 'lea'}
              />
              <label htmlFor="universal-login-cidg" className="universal-login-inter-buttons universal-login-agency-btn-cidg">LEA-CIDG</label>
            </div>
            {personnelErrors.agency && (
              <span className="universal-login-field-error">
                <AlertCircle size={11} /> {personnelErrors.agency}
              </span>
            )}
          </div>

          <div className="universal-login-form-group">
            <label htmlFor="universal-login-personnel-email">
              Email <span className="required-star">*</span>
            </label>
            <div className="universal-login-input-wrapper">
              <Mail className="universal-login-input-icon" size={15} />
              <input
                type="email"
                id="universal-login-personnel-email"
                placeholder="you@example.com"
                value={personnelEmail}
                onChange={handlePersonnelEmailChange}
                required
              />
            </div>
            {personnelErrors.email && (
              <span className="universal-login-field-error">
                <AlertCircle size={11} /> {personnelErrors.email}
              </span>
            )}
          </div>

          <div className="universal-login-form-group">
            <label htmlFor="universal-login-personnel-password">
              Password <span className="required-star">*</span>
            </label>
            <div className="universal-login-password-wrapper">
              <Lock className="universal-login-input-icon" size={15} />
              <input
                type={personnelShowPassword ? 'text' : 'password'}
                id="universal-login-personnel-password"
                placeholder="Enter your password"
                value={personnelPassword}
                onChange={handlePersonnelPasswordChange}
                required
              />
              <button
                type="button"
                className="universal-login-toggle-password-btn"
                onClick={() => setPersonnelShowPassword(!personnelShowPassword)}
                aria-label={personnelShowPassword ? "Hide password" : "Show password"}
              >
                {personnelShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {personnelErrors.password && (
              <span className="universal-login-field-error">
                <AlertCircle size={11} /> {personnelErrors.password}
              </span>
            )}
          </div>

          <div className="universal-login-remember-me">
            <label htmlFor="universal-login-personnel-remember-me">
              <input
                type="checkbox"
                id="universal-login-personnel-remember-me"
                checked={personnelRememberMe}
                onChange={(e) => setPersonnelRememberMe(e.target.checked)}
              />
              Remember my email
            </label>
            <a
              onClick={handleOpenResetModal}
              className="universal-login-forget-pass"
            >
              Request password reset
            </a>
          </div>

          {displayedPersonnelError && (
            <div className="universal-login-error-msg-container">
              <p className="universal-login-error-msg">{displayedPersonnelError}</p>
            </div>
          )}

          <button type="submit" className="universal-login-submit-btn" disabled={personnelLockoutSeconds > 0}>
            Login
          </button>

          {sessionMessage && (
            <div className="universal-login-error-msg-container" style={{ marginTop: '12px' }}>
              <p className="universal-login-error-msg">{sessionMessage}</p>
            </div>
          )}
        </form>
      ) : (
        <form noValidate onSubmit={handlePersonnelLoginSubmit}>
          <div className="universal-login-otp-header">
            <small>SECURITY VERIFICATION</small>
            <h2>Enter Security Code</h2>
            <p>We've sent a 6-digit verification code to your email.</p>
          </div>

          <div className="universal-login-otp-container">
            <div className="universal-login-otp-instructions">
              Enter the code sent to <span>{maskPersonnelEmail(personnelEmail)}</span>
            </div>

            <div className="universal-login-otp-input-grid">
              {personnelOtp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`universal-login-personnel-otp-digit-${idx}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="universal-login-otp-digit-input"
                  value={digit}
                  ref={(el) => (personnelOtpRefs.current[idx] = el)}
                  onChange={(e) => handlePersonnelOtpChange(e.target, idx)}
                  onKeyDown={(e) => handlePersonnelOtpKeyDown(e, idx)}
                  onPaste={handlePersonnelOtpPaste}
                  required
                />
              ))}
            </div>

            <div className="universal-login-otp-timer-container">
              {personnelTimer > 0 ? (
                <p>Resend code in <strong>{formatPersonnelTimer(personnelTimer)}</strong></p>
              ) : (
                <p>
                  Didn't receive the code?{' '}
                  <button type="button" className="universal-login-resend-button" onClick={handlePersonnelResendOtp}>
                    Resend OTP
                  </button>
                </p>
              )}
            </div>

            {personnelLoginError && (
              <div className="universal-login-error-msg-container">
                <p className="universal-login-error-msg">{personnelLoginError}</p>
              </div>
            )}

            <button type="submit" className="universal-login-submit-btn">
              Verify &amp; Login
            </button>
            <button type="button" className="universal-login-back-btn" onClick={handlePersonnelBackToLogin}>
              ← Back to login credentials
            </button>
          </div>
        </form>
      )}

      {/* Personnel Request Reset Password Confirmation Modal */}
      {personnelIsResetModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="universal-login-modal-overlay" onClick={handleOverlayClick}>
          <div
            className="universal-login-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="universal-login-reset-title"
          >
            <div className="universal-login-modal-header">
              <div className={`universal-login-modal-icon-wrap ${personnelResetStep === 'success' ? 'success' : ''}`}>
                {personnelResetStep === 'success' ? (
                  <CheckCircle2 size={26} />
                ) : (
                  <AlertTriangle size={26} />
                )}
              </div>
              <h3 id="universal-login-reset-title" className="universal-login-modal-title">
                Request Password Reset
              </h3>
              <p className="universal-login-modal-subtitle">
                {personnelResetStep === 'success'
                  ? 'Your request has been sent to your administrator.'
                  : personnelResetStep === 'verify'
                  ? 'Please double-check your account details before sending.'
                  : 'Are you sure you want to send a request to your administrator to reset your password?'}
              </p>
            </div>

            {personnelResetStep === 'confirm' && (
              <div className="universal-login-modal-body">
                {isPersonnelFormComplete ? (
                  <p className="universal-login-modal-text">
                    A formal request will be submitted to the <strong>{agencyDisplay}</strong> administration team under your account (<strong>{personnelEmail.trim()}</strong>). An administrator will issue an official reset link upon verification.
                  </p>
                ) : (
                  <p className="universal-login-modal-notice">
                    To submit a password reset request, please select your <strong>Agency</strong> and enter a valid <strong>Email Address</strong> on the login form first so your administrator can identify your account.
                  </p>
                )}
              </div>
            )}

            {personnelResetStep === 'verify' && (
              <div className="universal-login-modal-body">
                <div className="universal-login-modal-verify-box">
                  <div className="universal-login-modal-verify-row">
                    <span className="universal-login-modal-verify-label">Agency:</span>
                    <span className="universal-login-modal-verify-value">{agencyDisplay}</span>
                  </div>
                  <div className="universal-login-modal-verify-row">
                    <span className="universal-login-modal-verify-label">Account Email:</span>
                    <span className="universal-login-modal-verify-value">{personnelEmail.trim()}</span>
                  </div>
                </div>
                <p className="universal-login-modal-verify-warning">
                  Make sure these details are correct before proceeding — an incorrect email means your administrator cannot identify your account or issue your reset instructions.
                </p>
                {personnelResetError && (
                  <div className="universal-login-error-msg-container" style={{ marginTop: '12px' }}>
                    <p className="universal-login-error-msg">{personnelResetError}</p>
                  </div>
                )}
              </div>
            )}

            <div className="universal-login-modal-footer">
              {personnelResetStep === 'success' ? (
                <button
                  type="button"
                  className="universal-login-modal-btn universal-login-modal-btn-primary"
                  onClick={handleCloseResetModal}
                >
                  Done
                </button>
              ) : personnelResetStep === 'verify' ? (
                <>
                  <button
                    type="button"
                    className="universal-login-modal-btn universal-login-modal-btn-secondary"
                    onClick={handleBackToConfirm}
                    disabled={personnelIsSubmittingReset}
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    className="universal-login-modal-btn universal-login-modal-btn-primary"
                    onClick={handleConfirmPersonnelResetRequest}
                    disabled={personnelIsSubmittingReset}
                  >
                    {personnelIsSubmittingReset ? (
                      <>
                        <span className="universal-login-modal-spinner"></span>
                        Sending Request...
                      </>
                    ) : (
                      <>
                        <Send size={15} />
                        Yes, Send Request
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="universal-login-modal-btn universal-login-modal-btn-secondary"
                    onClick={handleCloseResetModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="universal-login-modal-btn universal-login-modal-btn-primary"
                    onClick={handleProceedToVerify}
                    disabled={!isPersonnelFormComplete}
                  >
                    Confirm Request
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================================
// NATIONAL ADMIN LOGIN FORM (formerly "SuperAdminLoginForm")
// Maps to backend/app/desktop/routers/auth/national_admin_login.py
//   POST /auth/national-admin/login
//   POST /auth/national-admin/verify-otp
//
// CHANGES FROM THE OLD VERSION:
//   1. Endpoint paths fixed: /auth/superadmin/* -> /auth/national-admin/*
//      (2 spots: handleAdminResendOtp and handleAdminLoginSubmit)
//   2. Redirect after successful OTP verify fixed:
//      /superadminfolder/superadmin-user-management
//      -> /nationaladminfolder/national-admin-new-admin-management
//   Nothing else changed — same validation, same OTP UI, same lockout handling.
// ============================================================================
function SuperAdminLoginForm({ navigate, onOtpStateChange, sessionMessage }) {
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminShowPassword, setAdminShowPassword] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminRememberMe, setAdminRememberMe] = useState(false);
  const [adminErrors, setAdminErrors] = useState({});

  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  const REMEMBERED_EMAIL_KEY = 'remembered_email_superadmin';

  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (savedEmail) {
      setAdminEmail(savedEmail);
      setAdminRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const [adminIsOtpSent, setAdminIsOtpSent] = useState(false);
  const [adminOtp, setAdminOtp] = useState(new Array(6).fill(''));
  const [adminTimer, setAdminTimer] = useState(300);
  const adminOtpRefs = useRef([]);

  useEffect(() => {
    if (onOtpStateChange) onOtpStateChange(adminIsOtpSent);
  }, [adminIsOtpSent]);

  useEffect(() => {
    let interval;
    if (adminIsOtpSent && adminTimer > 0) {
      interval = setInterval(() => setAdminTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [adminIsOtpSent, adminTimer]);

  function handleAdminOtpChange(element, index) {
    let val = element.value;
    if (!/^\d*$/.test(val)) return;
    val = val.substring(val.length - 1);
    const newOtp = [...adminOtp];
    newOtp[index] = val;
    setAdminOtp(newOtp);
    if (val && index < 5) adminOtpRefs.current[index + 1].focus();
  }

  function handleAdminOtpKeyDown(e, index) {
    if (e.key === 'Backspace') {
      if (!adminOtp[index] && index > 0) {
        const newOtp = [...adminOtp];
        newOtp[index - 1] = '';
        setAdminOtp(newOtp);
        adminOtpRefs.current[index - 1].focus();
      } else {
        const newOtp = [...adminOtp];
        newOtp[index] = '';
        setAdminOtp(newOtp);
      }
    }
  }

  function handleAdminOtpPaste(e) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().substring(0, 6);
    if (/^\d+$/.test(pastedData)) {
      const digits = pastedData.split('');
      const newOtp = [...adminOtp];
      for (let i = 0; i < 6; i++) newOtp[i] = digits[i] || '';
      setAdminOtp(newOtp);
      const targetFocusIndex = Math.min(digits.length, 5);
      adminOtpRefs.current[targetFocusIndex]?.focus();
    }
  }

  async function handleAdminResendOtp() {
    setAdminLoginError('');

    try {
      // CHANGED: /auth/superadmin/login -> /auth/national-admin/login
      const response = await fetch(`${API_BASE_URL}/auth/national-admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail.trim(), password: adminPassword }),
      });

      if (!response.ok) {
        const errorData = await safeParseErrorResponse(response);
        if (errorData?.detail && typeof errorData.detail === 'object' && 'retry_after_seconds' in errorData.detail) {
          setLockoutSeconds(errorData.detail.retry_after_seconds || 0);
        }
        throw new Error(extractErrorMessage(errorData, 'Failed to resend code.'));
      }

      setAdminTimer(300);
      setAdminOtp(new Array(6).fill(''));
      setTimeout(() => adminOtpRefs.current[0]?.focus(), 0);
    } catch (err) {
      setAdminLoginError(err.message);
    }
  }

  function handleAdminBackToLogin() {
    setAdminIsOtpSent(false);
    setAdminOtp(new Array(6).fill(''));
    setAdminLoginError('');
    setLockoutSeconds(0);
  }

  function maskAdminEmail(rawEmail) {
    if (!rawEmail || !rawEmail.includes('@')) return rawEmail;
    const [localPart, domain] = rawEmail.split('@');
    const visibleChars = Math.min(2, localPart.length);
    const maskedLocal = localPart.slice(0, visibleChars) + '*'.repeat(Math.max(localPart.length - visibleChars, 3));
    return `${maskedLocal}@${domain}`;
  }

  function handleAdminEmailChange(e) {
    const val = e.target.value;
    setAdminEmail(val);
    if (!val.trim()) {
      setAdminErrors((prev) => ({ ...prev, email: '' }));
    } else {
      const err = validateEmail(val.trim());
      setAdminErrors((prev) => ({ ...prev, email: err || '' }));
    }
  }

  function handleAdminPasswordChange(e) {
    setAdminPassword(e.target.value);
    if (adminErrors.password) setAdminErrors((prev) => ({ ...prev, password: '' }));
  }

  async function handleAdminLoginSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    if (!adminIsOtpSent) {
      if (lockoutSeconds > 0) return;
      const newErrors = {};

      if (!adminEmail.trim()) {
        newErrors.email = 'Email is required.';
      } else {
        const err = validateEmail(adminEmail.trim());
        if (err) newErrors.email = err;
      }

      if (!adminPassword.trim()) {
        newErrors.password = 'Password is required.';
      }

      if (Object.keys(newErrors).length > 0) {
        setAdminErrors(newErrors);
        return;
      }
      setAdminErrors({});

      try {
        // CHANGED: /auth/superadmin/login -> /auth/national-admin/login
        const response = await fetch(`${API_BASE_URL}/auth/national-admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminEmail.trim(), password: adminPassword }),
        });

        if (!response.ok) {
          const errorData = await safeParseErrorResponse(response);
          if (errorData?.detail && typeof errorData.detail === 'object' && 'retry_after_seconds' in errorData.detail) {
            setLockoutSeconds(errorData.detail.retry_after_seconds || 0);
          } else {
            setLockoutSeconds(0);
          }
          throw new Error(extractErrorMessage(errorData, 'Invalid email or password.'));
        }

        if (adminRememberMe) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, adminEmail.trim());
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }

        setAdminIsOtpSent(true);
        setAdminTimer(300);
        setAdminLoginError('');
        setLockoutSeconds(0);
      } catch (err) {
        setAdminLoginError(err.message || 'Something went wrong. Please try again.');
      }
    } else {
      const otpCode = adminOtp.join('');
      if (otpCode.length < 6) {
        setAdminLoginError('Please enter the full 6-digit verification code.');
        return;
      }

      try {
        // CHANGED: /auth/superadmin/verify-otp -> /auth/national-admin/verify-otp
        const response = await fetch(`${API_BASE_URL}/auth/national-admin/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminEmail.trim(), otp: otpCode }),
        });

        if (!response.ok) {
          const errorData = await safeParseErrorResponse(response);
          if (errorData?.detail && typeof errorData.detail === 'object' && 'retry_after_seconds' in errorData.detail) {
            setLockoutSeconds(errorData.detail.retry_after_seconds || 0);
          }
          throw new Error(extractErrorMessage(errorData, 'Invalid verification code. Please try again.'));
        }

        const data = await response.json();
        localStorage.removeItem('user_name');
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('agency', 'national_admin');   // CHANGED from 'superadmin'
        localStorage.setItem('role', 'national_admin'); 

        navigate('/nationaladminfolder/national-admin-interagency-admin-management');
      } catch (err) {
        setAdminLoginError(err.message || 'Invalid verification code. Please try again.');
        setAdminOtp(new Array(6).fill(''));
        setTimeout(() => adminOtpRefs.current[0]?.focus(), 0);
        if (/request a new otp/i.test(err.message)) {
          setAdminTimer(0);
        }
      }
    }
  }

  const formatAdminTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const displayedError = withCountdown(adminLoginError, lockoutSeconds);

  return (
    <div className="universal-login-admin-form">
      {!adminIsOtpSent ? (
        <form noValidate onSubmit={handleAdminLoginSubmit}>
          <div className="universal-login-card-header">
            <small>AUTHORIZED LOGIN</small>
            <h2>National Admin Login</h2>
            <p>Enter your administrator credentials to continue.</p>
          </div>

          <div className="universal-login-form-group">
            <label htmlFor="universal-login-admin-email">
              Email <span className="required-star">*</span>
            </label>
            <div className="universal-login-admin-input-wrapper">
              <Mail className="universal-login-admin-input-icon" size={15} />
              <input
                id="universal-login-admin-email"
                type="email"
                placeholder="you@example.com"
                value={adminEmail}
                onChange={handleAdminEmailChange}
                required
              />
            </div>
            {adminErrors.email && (
              <span className="universal-login-field-error">
                <AlertCircle size={11} /> {adminErrors.email}
              </span>
            )}
          </div>

          <div className="universal-login-form-group">
            <label htmlFor="universal-login-admin-password">
              Password <span className="required-star">*</span>
            </label>
            <div className="universal-login-admin-password-wrapper">
              <Lock className="universal-login-input-icon" size={15} />
              <input
                id="universal-login-admin-password"
                type={adminShowPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={adminPassword}
                onChange={handleAdminPasswordChange}
                required
              />
              <button
                type="button"
                className="universal-login-toggle-password-btn"
                onClick={() => setAdminShowPassword(v => !v)}
                aria-label={adminShowPassword ? 'Hide password' : 'Show password'}
              >
                {adminShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {adminErrors.password && (
              <span className="universal-login-field-error">
                <AlertCircle size={11} /> {adminErrors.password}
              </span>
            )}
          </div>

          <div className="universal-login-admin-remember-row">
            <label htmlFor="universal-login-admin-remember-me">
              <input
                type="checkbox"
                id="universal-login-admin-remember-me"
                checked={adminRememberMe}
                onChange={(e) => setAdminRememberMe(e.target.checked)}
              />
              Remember my email
            </label>
            <a
              onClick={() => navigate('/forgot-password?from=national-admin')}
              className="universal-login-forgot-password-link"
            >
              Forgot password?
            </a>
          </div>

          {displayedError && (
            <div className="universal-login-admin-error-container">
              <p className="universal-login-admin-error-msg">{displayedError}</p>
            </div>
          )}

          <button
            type="submit"
            className="universal-login-submit-btn"
            disabled={lockoutSeconds > 0}
          >
            Login
          </button>

          {sessionMessage && (
            <div className="universal-login-admin-error-container" style={{ marginTop: '12px' }}>
              <p className="universal-login-admin-error-msg">{sessionMessage}</p>
            </div>
          )}
        </form>
      ) : (
        <form noValidate onSubmit={handleAdminLoginSubmit}>
          <div className="universal-login-otp-header">
            <small>SECURITY VERIFICATION</small>
            <h2>Enter Security Code</h2>
            <p>We've sent a 6-digit verification code to your email.</p>
          </div>

          <div className="universal-login-otp-container">
            <div className="universal-login-otp-instructions">
              Enter the code sent to <span>{maskAdminEmail(adminEmail)}</span>
            </div>

            <div className="universal-login-admin-otp-grid">
              {adminOtp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`universal-login-admin-otp-digit-${idx}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="universal-login-admin-otp-digit-input"
                  value={digit}
                  ref={(el) => (adminOtpRefs.current[idx] = el)}
                  onChange={(e) => handleAdminOtpChange(e.target, idx)}
                  onKeyDown={(e) => handleAdminOtpKeyDown(e, idx)}
                  onPaste={handleAdminOtpPaste}
                  required
                />
              ))}
            </div>

            <div className="universal-login-admin-otp-timer-container">
              {adminTimer > 0 ? (
                <p>Resend code in <strong>{formatAdminTimer(adminTimer)}</strong></p>
              ) : (
                <p>
                  Didn't receive the code?{' '}
                  <button type="button" className="universal-login-admin-resend-button" onClick={handleAdminResendOtp}>
                    Resend OTP
                  </button>
                </p>
              )}
            </div>

            {displayedError && (
              <div className="universal-login-admin-error-container">
                <p className="universal-login-admin-error-msg">{displayedError}</p>
              </div>
            )}

            <button
              type="submit"
              className="universal-login-submit-btn"
              disabled={lockoutSeconds > 0}
            >
              Verify &amp; Login
            </button>
            <button type="button" className="universal-login-admin-back-btn" onClick={handleAdminBackToLogin}>
              ← Back to login credentials
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ============================================================================
// INTERAGENCY ADMIN LOGIN FORM (NOW WIRED TO REAL BACKEND)
// Maps to backend/app/desktop/routers/auth/admin_login.py
//   POST /auth/admin/login
//   POST /auth/admin/verify-otp
// ============================================================================
function InteragencyAdminLoginForm({ navigate, onOtpStateChange, sessionMessage }) {
  const [agency, setAgency] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loginError, setLoginError] = useState('');       // NEW: banner error for the credentials step
  const [lockoutSeconds, setLockoutSeconds] = useState(0); // NEW: for the 429 throttled-login case

 
  const [rememberMe, setRememberMe] = useState(false);

  function rememberedEmailKey(forAgency) {
    return forAgency ? `remembered_email_admin_${forAgency}` : null;
  }

  const adminLastAutoFillRef = useRef('');

  useEffect(() => {
    const key = rememberedEmailKey(agency);
    const savedEmail = key ? localStorage.getItem(key) : null;

    const emailIsUntouched =
      email.trim() === '' || email === adminLastAutoFillRef.current;

    if (emailIsUntouched) {
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      } else {
        setEmail('');
        setRememberMe(false);
      }
      adminLastAutoFillRef.current = savedEmail || '';
    }
  }, [agency]);

  // OTP state
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otp, setOtp] = useState(new Array(6).fill(''));
  const [timer, setTimer] = useState(300);
  const [otpError, setOtpError] = useState('');
  // NOTE: otpSuccess is removed — it was only ever used to show the fake
  // "Mockup demonstration only" message. Real success now just navigates away.
  const otpRefs = useRef([]);

  useEffect(() => {
    if (onOtpStateChange) onOtpStateChange(isOtpSent);
  }, [isOtpSent, onOtpStateChange]);

  useEffect(() => {
    let interval;
    if (isOtpSent && timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isOtpSent, timer]);

  // Countdown for the lockout banner (mirrors SuperAdminLoginForm's pattern)
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

function handleAgencyChange(newAgency) {
  if (agency && agency !== newAgency) {
    // Agency was already selected, and it's genuinely changing — clear password only
    setPassword('');
  }
  // If agency was empty (first-time selection) or newAgency === agency, do nothing to password
  setAgency(newAgency);
  if (errors.agency) {
    setErrors((prev) => ({ ...prev, agency: '' }));
  }
}

  function handleEmailChange(e) {
    const val = e.target.value;
    setEmail(val);
    if (!val.trim()) {
      setErrors((prev) => ({ ...prev, email: '' }));
    } else {
      const err = validateEmail(val.trim());
      setErrors((prev) => ({ ...prev, email: err || '' }));
    }
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value);
    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
  }

  // ---- STEP 1: credentials -> request OTP -------------------------------
  async function handleCredentialsSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (lockoutSeconds > 0) return;

    const newErrors = {};
    if (!agency) newErrors.agency = 'Please select an agency.';
        if (!email.trim()) newErrors.email = 'Email is required.';
    else {
      const err = validateEmail(email.trim());
      if (err) newErrors.email = err;
    }
    if (!password.trim()) newErrors.password = 'Please enter your password.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setLoginError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, agency }),
      });

      if (!response.ok) {
        const errorData = await safeParseErrorResponse(response);
        if (errorData?.detail && typeof errorData.detail === 'object' && 'retry_after_seconds' in errorData.detail) {
          setLockoutSeconds(errorData.detail.retry_after_seconds || 0);
        } else {
          setLockoutSeconds(0);
        }
        throw new Error(extractErrorMessage(errorData, 'Invalid email or password.'));
      }

      // Save or clear the remembered email for this agency
      const key = rememberedEmailKey(agency);
      if (key) {
        if (rememberMe) localStorage.setItem(key, email.trim());
        else localStorage.removeItem(key);
      }

      // Success: backend sent the OTP email, move to the OTP screen
      setIsOtpSent(true);
      setTimer(300);
      setOtp(new Array(6).fill(''));
      setOtpError('');
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } catch (err) {
      setLoginError(err.message || 'Something went wrong. Please try again.');
    }
  }

  function handleOtpChange(element, index) {
    let val = element.value;
    if (!/^\d*$/.test(val)) return;
    val = val.substring(val.length - 1);
    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);
    if (val && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(e, index) {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        otpRefs.current[index - 1]?.focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().substring(0, 6);
    if (/^\d+$/.test(pastedData)) {
      const digits = pastedData.split('');
      const newOtp = [...otp];
      for (let i = 0; i < 6; i++) newOtp[i] = digits[i] || '';
      setOtp(newOtp);
      const targetFocusIndex = Math.min(digits.length, 5);
      otpRefs.current[targetFocusIndex]?.focus();
    }
  }

  // ---- Resend OTP: re-call login endpoint (same pattern as the other two forms)
  async function handleResendOtp() {
    setOtpError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, agency }),
      });

      if (!response.ok) {
        const errorData = await safeParseErrorResponse(response);
        if (errorData?.detail && typeof errorData.detail === 'object' && 'retry_after_seconds' in errorData.detail) {
          setLockoutSeconds(errorData.detail.retry_after_seconds || 0);
        }
        throw new Error(extractErrorMessage(errorData, 'Failed to resend code.'));
      }

      setTimer(300);
      setOtp(new Array(6).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } catch (err) {
      setOtpError(err.message);
    }
  }

  function handleBackToLogin() {
    setIsOtpSent(false);
    setOtp(new Array(6).fill(''));
    setOtpError('');
    setLoginError('');
    setLockoutSeconds(0);
  }

  // ---- STEP 2: OTP -> verify -> store tokens -> redirect ----------------
  async function handleOtpSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length < 6) {
      setOtpError('Please enter the full 6-digit verification code.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/admin/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: otpCode }),
      });

      if (!response.ok) {
        const errorData = await safeParseErrorResponse(response);
        throw new Error(extractErrorMessage(errorData, 'Invalid verification code. Please try again.'));
      }

      const data = await response.json();
      localStorage.removeItem('user_name');
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('agency', agency);
      localStorage.setItem('role', `${agency}_admin`); 

      if (data.force_password_change) {
        navigate('/change-password');
      } else if (agency === 'fda') {
        navigate('/fdaadminfolder/fda-admin-user-management');
      } else {
        navigate('/leaadminfolder/lea-admin-user-management');
      }
    } catch (err) {
      setOtpError(err.message || 'Invalid verification code. Please try again.');
      setOtp(new Array(6).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
      if (/request a new otp/i.test(err.message)) {
      setTimer(0);
      }
    }
  }

  const formatTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function maskEmail(rawEmail) {
    if (!rawEmail || !rawEmail.includes('@')) return rawEmail;
    const [localPart, domain] = rawEmail.split('@');
    const visibleChars = Math.min(2, localPart.length);
    const maskedLocal = localPart.slice(0, visibleChars) + '*'.repeat(Math.max(localPart.length - visibleChars, 3));
    return `${maskedLocal}@${domain}`;
  }

  const displayedLoginError = withCountdown(loginError, lockoutSeconds);

  return (
    <div className="universal-login-admin-form">
      {!isOtpSent ? (
        <form noValidate onSubmit={handleCredentialsSubmit}>
          <div className="universal-login-card-header">
            <small>AUTHORIZED LOGIN</small>
            <h2>Interagency Admin Login</h2>
            <p>Select your agency and enter your credentials.</p>
          </div>

          <div className="universal-login-form-group">
            <label htmlFor="universal-login-interagency-agency">
              Agency <span className="required-star">*</span>
            </label>
            <div className="universal-login-agency-buttons" id="universal-login-interagency-agency">
              <input
                type="radio"
                id="universal-login-interagency-fda"
                name="universal-login-interagency-agency-radio"
                value="fda"
                onChange={() => handleAgencyChange('fda')}
                checked={agency === 'fda'}
              />
              <label htmlFor="universal-login-interagency-fda" className="universal-login-inter-buttons universal-login-agency-btn-fda">FDA</label>

              <input
                type="radio"
                id="universal-login-interagency-cidg"
                name="universal-login-interagency-agency-radio"
                value="lea"
                onChange={() => handleAgencyChange('lea')}
                checked={agency === 'lea'}
              />
              <label htmlFor="universal-login-interagency-cidg" className="universal-login-inter-buttons universal-login-agency-btn-cidg">LEA-CIDG</label>
            </div>
            {errors.agency && (
              <span className="universal-login-field-error">
                <AlertCircle size={11} /> {errors.agency}
              </span>
            )}
          </div>

          <div className="universal-login-form-group">
            <label htmlFor="universal-login-interagency-email">
              Email Address <span className="required-star">*</span>
            </label>
            <div className="universal-login-input-wrapper">
              <Mail className="universal-login-input-icon" size={15} />
              <input
                id="universal-login-interagency-email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={handleEmailChange}
              />
            </div>
            {errors.email && (
              <span className="universal-login-field-error">
                <AlertCircle size={11} /> {errors.email}
              </span>
            )}
          </div>

          <div className="universal-login-form-group">
            <label htmlFor="universal-login-interagency-password">
              Password <span className="required-star">*</span>
            </label>
            <div className="universal-login-password-wrapper">
              <Lock className="universal-login-input-icon" size={15} />
              <input
                id="universal-login-interagency-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={handlePasswordChange}
              />
              <button
                type="button"
                className="universal-login-toggle-password-btn"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && (
              <span className="universal-login-field-error">
                <AlertCircle size={11} /> {errors.password}
              </span>
            )}
          </div>

        {/* Remember my email + Forgot-password link */}
        <div className="universal-login-admin-remember-row">
          <label htmlFor="universal-login-interagency-remember-me">
            <input
              type="checkbox"
              id="universal-login-interagency-remember-me"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Remember my email
          </label>
          <a
            onClick={() => navigate('/forgot-password?from=interagency-admin')}
            className="universal-login-forgot-password-link"
          >
            Forgot password?
          </a>
        </div>

        {displayedLoginError && (
          <div className="universal-login-admin-error-container">
            <p className="universal-login-admin-error-msg">{displayedLoginError}</p>
          </div>
        )}

        <button type="submit" className="universal-login-submit-btn" disabled={lockoutSeconds > 0}>
          Login
        </button>

        {sessionMessage && (
          <div className="universal-login-admin-error-container" style={{ marginTop: '12px' }}>
            <p className="universal-login-admin-error-msg">{sessionMessage}</p>
          </div>
        )}

        </form>
      ) : (
        <form noValidate onSubmit={handleOtpSubmit}>
          <div className="universal-login-otp-header universal-login-interagency-otp-header">
            <small>SECURITY VERIFICATION</small>
            <h2>Enter Security Code</h2>
            <p>We've sent a 6-digit verification code to your email.</p>
          </div>

          <div className="universal-login-otp-container">
            <div className="universal-login-otp-instructions universal-login-interagency-otp-instructions">
              Enter the code sent to <span>{maskEmail(email)}</span>
            </div>

            <div className="universal-login-interagency-otp-grid">
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`universal-login-interagency-otp-digit-${idx}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="universal-login-interagency-otp-digit-input"
                  value={digit}
                  ref={(el) => (otpRefs.current[idx] = el)}
                  onChange={(e) => handleOtpChange(e.target, idx)}
                  onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                  onPaste={handleOtpPaste}
                  required
                />
              ))}
            </div>

            <div className="universal-login-admin-otp-timer-container universal-login-interagency-otp-timer-container">
              {timer > 0 ? (
                <p>Resend code in <strong>{formatTimer(timer)}</strong></p>
              ) : (
                <p>
                  Didn't receive the code?{' '}
                  <button type="button" className="universal-login-admin-resend-button" onClick={handleResendOtp}>
                    Resend OTP
                  </button>
                </p>
              )}
            </div>

            {otpError && (
              <div className="universal-login-admin-error-container">
                <p className="universal-login-admin-error-msg">{otpError}</p>
              </div>
            )}

            <button type="submit" className="universal-login-submit-btn">
              Verify &amp; Login
            </button>
            <button type="button" className="universal-login-admin-back-btn" onClick={handleBackToLogin}>
              ← Back to login credentials
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default UniversalLogin;