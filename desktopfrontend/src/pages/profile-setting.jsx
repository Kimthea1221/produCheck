// desktopfrontend/src/pages/profile-setting.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { 
  User, 
  Mail, 
  Building2, 
  MapPin, 
  Lock, 
  Phone, 
  Briefcase, 
  Save, 
  X, 
  Shield, 
  Key, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle,
  Fingerprint,
  Send,
  Clock,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

import Sidebar from './component/sidebar';
import TopBar from './component/top-bar';
import { apiFetch } from '../utils/apiFetch';

// Load layouts for the respective workspaces
import './nationaladminfolder/national-admin-css.css';
import './fdaadminfolder/fda-admin-css.css';
import './leaadminfolder/lea-admin-css.css';
import './fdafolder/fda-css.css';
import './leacidgfolder/lea-css.css';
import './superadminfolder/superadmin-css.css';

/**
 * Normalizes any string representation of a workspace/role into one of:
 * 'NATIONAL_ADMIN', 'INTERAGENCY_ADMIN', 'FDA_ADMIN', 'LEA_ADMIN', 'FDA', 'LEA'
 */
function normalizeWorkspace(str) {
  if (!str) return 'NATIONAL_ADMIN';
  const s = str.toString().trim().toUpperCase().replace(/[-\s]/g, '_');
  if (s === 'NATIONAL_ADMIN' || s.includes('NATIONAL') || s.includes('SUPER')) return 'NATIONAL_ADMIN';
  if (s === 'INTERAGENCY_ADMIN' || s.includes('INTERAGENCY') || s.includes('REGIONAL_ADMIN')) return 'INTERAGENCY_ADMIN';
  if (s === 'FDA_ADMIN' || (s.includes('FDA') && s.includes('ADMIN'))) return 'FDA_ADMIN';
  if (s === 'LEA_ADMIN' || ((s.includes('LEA') || s.includes('CIDG')) && s.includes('ADMIN'))) return 'LEA_ADMIN';
  if (s === 'LEA' || s.includes('LEA') || s.includes('CIDG')) return 'LEA';
  return 'FDA';
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

/**
 * Standard missing-value display helper:
 * Displays '-' for null, undefined, or empty/whitespace-only values.
 */
function displayValue(val) {
  if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) {
    return '-';
  }
  return val;
}

/**
 * Resolves the authenticated user's workspace context with fallback cascading:
 * 1. React Router navigation state (e.g. from TopBar profile click)
 * 2. URL query parameters (?workspace=... or ?role=...)
 * 3. LocalStorage 'current_workspace'
 * 4. LocalStorage 'agency' or 'role'
 * 5. Fallback: 'NATIONAL_ADMIN'
 */
const resolveCurrentWorkspace = (location, searchParams) => {
  if (location?.state?.workspace) {
    return normalizeWorkspace(location.state.workspace);
  }
  const param = searchParams?.get('workspace') || searchParams?.get('role') || searchParams?.get('agency');
  if (param) {
    return normalizeWorkspace(param);
  }
  const savedWs = localStorage.getItem('current_workspace');
  if (savedWs) {
    return normalizeWorkspace(savedWs);
  }
 const agencyPart = (localStorage.getItem('agency') || '').toString().trim();
  const rolePart = (localStorage.getItem('role') || '').toString().trim();
  const rawAgency = `${agencyPart} ${rolePart}`.trim().toUpperCase();
  if (rawAgency) {
    return normalizeWorkspace(rawAgency);
  }
  return 'NATIONAL_ADMIN';
};

// Default rich mock profiles based on the finalized Add Admin / Add Personnel sources of truth
const DEFAULT_MOCK_PROFILES = {
  NATIONAL_ADMIN: {
    firstName: 'Kristine',
    middleName: 'M.',
    lastName: 'Bernardo',
    employeeId: '',
    email: 'kristine.bernardo@everifymo.gov.ph',
    agency: 'National Administration',
    region: '',
    contactNumber: '',
    department: '',
    position: '',
  },
  INTERAGENCY_ADMIN: {
    firstName: 'Juan',
    middleName: 'P.',
    lastName: 'Dela Cruz',
    employeeId: 'IA-2026-001',
    email: 'juan.delacruz@everifymo.gov.ph',
    agency: 'FDA',
    region: 'National Capital Region (NCR)',
    contactNumber: '09171234567',
    department: 'Field Regulatory Operations',
    position: 'Regional Interagency Director',
  },
  FDA_ADMIN: {
    firstName: 'Gabriel',
    middleName: 'Jose',
    lastName: 'Alvarez',
    employeeId: 'FDA-ADM-0104',
    email: 'gabriel.alvarez@fda.gov.ph',
    agency: 'FDA Admin',
    region: 'National Capital Region (NCR)',
    contactNumber: '09171234567',
    department: 'Executive Field Regulatory Bureau',
    position: 'Regional Admin Supervisor',
  },
  LEA_ADMIN: {
    firstName: 'Dominic',
    middleName: 'Cruz',
    lastName: 'Valdez',
    employeeId: 'CIDG-ADM-0892',
    email: 'dominic.valdez@cidg.gov.ph',
    agency: 'LEA Admin',
    region: 'National Capital Region (NCR)',
    contactNumber: '09189876543',
    department: 'Regional Administration',
    position: 'Regional Administrator',
  },
  FDA: {
    firstName: 'Maria',
    middleName: 'Santos',
    lastName: 'Cruz',
    employeeId: 'FDA-2026-091',
    email: 'maria.cruz@fda.gov.ph',
    agency: 'FDA Personnel',
    region: 'National Capital Region (NCR)',
    contactNumber: '09171234567',
    department: 'Regulatory Compliance',
    position: 'Inspection Officer',
  },
  LEA: {
    firstName: 'Cardo',
    middleName: 'Santos',
    lastName: 'Dalisay',
    employeeId: 'CIDG-2026-001',
    email: 'cardo.dalisay@cidg.gov.ph',
    agency: 'LEA Personnel',
    region: 'National Capital Region (NCR)',
    contactNumber: '09181234567',
    department: 'Criminal Investigation Operations',
    position: 'Case Investigator',
  },
};


function mapProfileToForm(data) {
  return {
    firstName: data.first_name ?? '',
    middleName: data.middle_name ?? '',
    lastName: data.last_name ?? '',
    employeeId: data.employee_id ?? '',
    email: data.email ?? '',
    agency: data.agency ?? '',
    region: data.region ?? '',
    contactNumber: data.contact_number ?? '',
    department: data.department ?? '',
    position: data.position ?? '',
  };
}

const PASSWORD_RESET_COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 hours
const PASSWORD_RESET_COOLDOWN_KEY = 'password_reset_request_cooldown_until';

/**
 * UNIFIED PROFILE & SETTINGS COMPONENT FOR EVERIFYMO
 * Handles 3-tier workspace roles:
 *  1. National Admin: Editable profile, editable security credentials (Teal palette)
 *  2. Interagency Admin:
 *     - FDA Admin: Editable profile, READ-ONLY Agency ('FDA Admin'), editable security credentials (FDA Emerald palette)
 *     - LEA Admin: Editable profile, READ-ONLY Agency ('LEA Admin'), editable security credentials (LEA Navy palette)
 *     - Interagency Admin: Editable profile, READ-ONLY Agency ('FDA'/'LEA-CIDG'), editable security credentials
 *  3. Personnel:
 *     - FDA Personnel: READ-ONLY profile & agency, NO direct password change, Notify Admin action (FDA Emerald palette)
 *     - LEA Personnel: READ-ONLY profile & agency, NO direct password change, Notify Admin action (LEA Navy palette)
 */
function ProfileSetting() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const currentWorkspace = resolveCurrentWorkspace(location, searchParams);
  const isPersonnel = currentWorkspace === 'FDA' || currentWorkspace === 'LEA';
  const isNationalAdmin = currentWorkspace === 'NATIONAL_ADMIN';

  const EMPTY_PROFILE = {
    firstName: '',
    middleName: '',
    lastName: '',
    employeeId: '',
    email: '',
    agency: '',
    region: '',
    contactNumber: '',
    department: '',
    position: '',
  };
  const [savedProfile, setSavedProfile] = useState(EMPTY_PROFILE);
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Security Credentials state (for Admin workspaces)
  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [errors, setErrors] = useState({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [justSavedProfile, setJustSavedProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [profileStatus, setProfileStatus] = useState(null);
  const [passwordStatus, setPasswordStatus] = useState(null);

  // Personnel Password Reset Request Modal & Notification States
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(null);
  const requestSentSuccess = cooldownUntil !== null;
  const requestTimestamp = cooldownUntil
    ? new Date(cooldownUntil - PASSWORD_RESET_COOLDOWN_MS).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // Per-user key so a shared machine doesn't leak one person's cooldown to another
  const cooldownKey = savedProfile.email
    ? `${PASSWORD_RESET_COOLDOWN_KEY}:${savedProfile.email}`
    : null;

  function startCooldown(untilMs) {
    if (cooldownKey) localStorage.setItem(cooldownKey, String(untilMs));
    setCooldownUntil(untilMs);
  }
  

  // Workspace configuration: maps layout classes, sidebar/topbar types, and theme palette
  const layoutConfig = {
    NATIONAL_ADMIN: {
      sidebarType: 'NATIONAL_ADMIN',
      topbarType: 'NATIONAL_ADMIN',
      mainContainerClass: 'NAMMainContainer',
      contentContainerClass: 'NAMContentContainer',
      mainFeedClass: 'NAMMainfeed',
      headerThemeClass: 'agency-national-admin',
      themeClass: 'theme-national-admin',
      roleBadge: 'National Administrator',
      agencyDisplay: 'National Administration',
    },
    INTERAGENCY_ADMIN: {
      sidebarType: 'NATIONAL_ADMIN',
      topbarType: 'NATIONAL_ADMIN',
      mainContainerClass: 'NAMMainContainer',
      contentContainerClass: 'NAMContentContainer',
      mainFeedClass: 'NAMMainfeed',
      headerThemeClass: 'agency-national-admin',
      themeClass: 'theme-national-admin',
      roleBadge: 'Interagency Administrator',
      agencyDisplay: 'Inter-Agency',
    },
    FDA_ADMIN: {
      sidebarType: 'FDA_ADMIN',
      topbarType: 'FDA_ADMIN',
      mainContainerClass: 'FDAAdminMainContainer',
      contentContainerClass: 'FDAAdminContentContainer',
      mainFeedClass: 'FDAAdminMainfeed',
      headerThemeClass: 'agency-fda-admin',
      themeClass: 'theme-fda',
      roleBadge: 'FDA Administrator',
      agencyDisplay: 'FDA Admin',
    },
    LEA_ADMIN: {
      sidebarType: 'LEA_ADMIN',
      topbarType: 'LEA_ADMIN',
      mainContainerClass: 'LEAAdminMainContainer',
      contentContainerClass: 'LEAAdminContentContainer',
      mainFeedClass: 'LEAAdminMainfeed',
      headerThemeClass: 'agency-lea-admin',
      themeClass: 'theme-lea',
      roleBadge: 'LEA Administrator',
      agencyDisplay: 'LEA Admin',
    },
    FDA: {
      sidebarType: 'FDA',
      topbarType: 'FDA',
      mainContainerClass: 'FdaDashboardMain',
      contentContainerClass: 'FdaContentContainer',
      mainFeedClass: 'FdaMainFeed',
      headerThemeClass: 'agency-fda',
      themeClass: 'theme-fda',
      roleBadge: 'FDA Personnel',
      agencyDisplay: 'FDA Personnel',
    },
    LEA: {
      sidebarType: 'LEA',
      topbarType: 'LEA',
      mainContainerClass: 'LeaDashboardMain',
      contentContainerClass: 'LeaContentContainer',
      mainFeedClass: 'LeaMainfeed',
      headerThemeClass: 'agency-lea',
      themeClass: 'theme-lea',
      roleBadge: 'LEA Personnel',
      agencyDisplay: 'LEA Personnel',
    },
  }[currentWorkspace] || {
    sidebarType: 'NATIONAL_ADMIN',
    topbarType: 'NATIONAL_ADMIN',
    mainContainerClass: 'NAMMainContainer',
    contentContainerClass: 'NAMContentContainer',
    mainFeedClass: 'NAMMainfeed',
    headerThemeClass: 'agency-national-admin',
    themeClass: 'theme-national-admin',
    roleBadge: 'National Administrator',
    agencyDisplay: 'National Administration',
  };

  useEffect(() => {
    fetchProfile();
  }, [currentWorkspace]);

  // Restore an in-progress "request already sent" cooldown across reloads/navigation
  // Load this user's stored cooldown once the profile (and email) is known
  useEffect(() => {
    if (!cooldownKey) return;
    const stored = parseInt(localStorage.getItem(cooldownKey) || '', 10);
    if (stored && stored > Date.now()) {
      setCooldownUntil(stored);
    } else {
      localStorage.removeItem(cooldownKey);
      setCooldownUntil(null);
    }
  }, [cooldownKey]);

  // Expire it (timer is cleaned up on unmount / change)
  useEffect(() => {
    if (!cooldownUntil) return;
    const t = setTimeout(() => {
      setCooldownUntil(null);
      if (cooldownKey) localStorage.removeItem(cooldownKey);
    }, Math.max(0, cooldownUntil - Date.now()));
    return () => clearTimeout(t);
  }, [cooldownUntil, cooldownKey]);

  
  
  async function fetchProfile() {
    try {
      setLoading(true);
      setLoadError(false);
      const response = await apiFetch('/profile', { cache: 'no-store' });
      if (response && response.ok) {
        const data = await response.json();
        const mapped = mapProfileToForm(data);
        setSavedProfile(mapped);
        setForm(mapped);
      } else {
        setLoadError(true);
      }
    } catch (err) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  const handleProfileChange = (e) => {
    if (isPersonnel) return; // Personnel cannot edit profile
    setJustSavedProfile(false);
    const { name, value } = e.target;
    // Agency is strictly read-only for FDA Admin & LEA Admin
    if (name === 'agency' && (currentWorkspace === 'FDA_ADMIN' || currentWorkspace === 'LEA_ADMIN')) return;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // Digits-only, max 11 chars for contact number
  const handleContactNumberChange = (e) => {
    if (isPersonnel) return;
    setJustSavedProfile(false);
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 11);
    setForm((prev) => ({ ...prev, contactNumber: digitsOnly }));
    if (errors.contactNumber) {
      setErrors((prev) => ({ ...prev, contactNumber: '' }));
    }
  };

  const handleSecurityChange = (e) => {
    const { name, value } = e.target;
    setSecurity((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // Validates editable profile fields
  const validateProfileFields = () => {
    const newErrors = {};

    if (!form.firstName || !form.firstName.trim()) {
      newErrors.firstName = 'First Name is required.';
    }
    if (!form.lastName || !form.lastName.trim()) {
      newErrors.lastName = 'Last Name is required.';
    }

    if (isNationalAdmin) {
      return newErrors; // National Admin only has first/middle/last name to begin with
    }

    if (!form.employeeId || !form.employeeId.trim()) {
      newErrors.employeeId = 'Employee ID is required.';
    }

    if (!form.contactNumber || !form.contactNumber.trim()) {
      newErrors.contactNumber = 'Contact Number is required.';
    } else {
      const digits = form.contactNumber.replace(/\D/g, '');
      if (digits.length !== 11 || !digits.startsWith('09')) {
        newErrors.contactNumber = 'Contact number must be exactly 11 digits starting with 09.';
      }
    }

    if (!form.department || !form.department.trim()) {
      newErrors.department = 'Department is required.';
    }

    if (!form.position || !form.position.trim()) {
      newErrors.position = 'Position is required.';
    }

    return newErrors;
  };

  // Validates password fields
  const validatePasswordFields = () => {
    const newErrors = {};
    const { currentPassword, newPassword, confirmPassword } = security;

    if (!currentPassword) {
      newErrors.currentPassword = 'Current password is required to update security credentials.';
    }
    if (!newPassword) {
      newErrors.newPassword = 'New password is required.';
    } else {
      if (newPassword.length < 8) {
        newErrors.newPassword = 'New password must be at least 8 characters long.';
      } else if (newPassword.length > 64) {
        newErrors.newPassword = 'New password must be 64 characters or fewer.';
      } else if (!/[A-Z]/.test(newPassword)) {
        newErrors.newPassword = 'Password must include at least one uppercase letter.';
      } else if (!/[0-9]/.test(newPassword)) {
        newErrors.newPassword = 'Password must include at least one number.';
      } else if (!/[^A-Za-z0-9]/.test(newPassword)) {
        newErrors.newPassword = 'Password must include at least one special character.';
      }
    }
    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }
    return newErrors;
  };

  // Profile submission handler (Admin only)
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (isPersonnel) return;

    const validationErrors = validateProfileFields();
    if (Object.keys(validationErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...validationErrors }));
      setProfileStatus({
        type: 'error',
        message: 'Kindly address the validation errors before saving your changes.',
      });
      return;
    }

    setIsSavingProfile(true);
    setProfileStatus(null);

    const payload = isNationalAdmin
      ? {
          first_name: form.firstName.trim(),
          middle_name: form.middleName ? form.middleName.trim() : null,
          last_name: form.lastName.trim(),
        }
      : {
          first_name: form.firstName.trim(),
          middle_name: form.middleName ? form.middleName.trim() : null,
          last_name: form.lastName.trim(),
          employee_id: form.employeeId ? form.employeeId.trim() : null,
          contact_number: form.contactNumber ? form.contactNumber.trim() : null,
          department: form.department ? form.department.trim() : null,
          position: form.position ? form.position.trim() : null,
        };

    try {
      const response = await apiFetch('/profile/update', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setProfileStatus({
          type: 'error',
          message: extractErrorMessage(errData, 'Failed to save profile changes.'),
        });
        return;
      }

      const updatedData = await response.json().catch(() => null);
      const updatedProfile = updatedData
        ? mapProfileToForm(updatedData)
        : {
            ...savedProfile,
            ...form,
            firstName: form.firstName.trim(),
            middleName: form.middleName ? form.middleName.trim() : '',
            lastName: form.lastName.trim(),
          };

      setSavedProfile(updatedProfile);
      setForm(updatedProfile);

      setProfileStatus({
        type: 'success',
        message: 'Your profile details have been successfully updated.',
      });
      setJustSavedProfile(true);
      const newFullName = [updatedProfile.firstName, updatedProfile.lastName].filter(Boolean).join(' ');
      if (newFullName) {
        localStorage.setItem('user_name', newFullName);
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: { userName: newFullName } }));
      }
    } catch (err) {
      setProfileStatus({
        type: 'error',
        message: 'Could not reach the server. Please check your connection and try again.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Password submission handler (Admin only)
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (isPersonnel) return;

    const passwordErrors = validatePasswordFields();
    if (Object.keys(passwordErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...passwordErrors }));
      setPasswordStatus({
        type: 'error',
        message: 'Kindly address the validation errors before saving your changes.',
      });
      return;
    }


    setIsSavingPassword(true);
    setPasswordStatus(null);

    try {
      const response = await apiFetch('/profile/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: security.currentPassword,
          new_password: security.newPassword,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setPasswordStatus({
          type: 'error',
          message: extractErrorMessage(errData, 'Failed to update password.'),
        });
        return;
      }

      setPasswordStatus({
        type: 'success',
        message: 'Password updated successfully. Redirecting to login...',
      });
      setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' });

      setTimeout(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('agency');
        const loginTab = currentWorkspace === 'NATIONAL_ADMIN'
        ? 'national-admin'
        : 'interagency-admin'; // INTERAGENCY_ADMIN, FDA_ADMIN, LEA_ADMIN all use this tab
        window.location.href = `/universal-login?tab=${loginTab}`;
      }, 1200);
    } catch (err) {
      setPasswordStatus({
        type: 'error',
        message: err.message || 'Could not reach the server. Please check your connection and try again.',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleProfileCancel = () => {
    setErrors((prev) => {
      const next = { ...prev };
      ['firstName', 'lastName', 'middleName', 'employeeId', 'contactNumber', 'department', 'position'].forEach((f) => delete next[f]);
      return next;
    });
    setProfileStatus(null);
    setJustSavedProfile(false);
    setForm(savedProfile);
  };

  const handlePasswordCancel = () => {
    setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setErrors((prev) => {
      const next = { ...prev };
      ['currentPassword', 'newPassword', 'confirmPassword'].forEach((f) => delete next[f]);
      return next;
    });
    setPasswordStatus(null);
  };

  // Personnel: Confirm Password Reset Request Handler
  // Personnel: Confirm Password Reset Request Handler
const handleConfirmPersonnelResetRequest = async () => {
  setIsSubmittingRequest(true);
  try {
    const res = await apiFetch('/profile/request-password-reset', { method: 'POST' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const retryAfter = errData?.detail?.retry_after_seconds;
      if (res.status === 429 && retryAfter) {
        // Server says we're still in cooldown (e.g. storage was cleared): sync up
        startCooldown(Date.now() + retryAfter * 1000);
        setIsRequestModalOpen(false);
        return;
      }
      throw new Error(extractErrorMessage(errData, 'Failed to send request.'));
    }
    setIsRequestModalOpen(false);
    startCooldown(Date.now() + PASSWORD_RESET_COOLDOWN_MS);
  } catch (err) {
    console.error('Password reset request failed:', err);
  } finally {
    setIsSubmittingRequest(false);
  }
};

  return (
    <>
      <style>{styles}</style>
      
      <div className={`${layoutConfig.mainContainerClass} ${layoutConfig.themeClass}`}>
        <Sidebar sidebarType={layoutConfig.sidebarType} />
        
        <div className={layoutConfig.contentContainerClass}>
          <TopBar topbarType={layoutConfig.topbarType} />
          
          <div className={layoutConfig.mainFeedClass}>
            <div className={`ProfileContainer ${layoutConfig.themeClass}`}>
              {loading ? (
                <div className="ProfileSkeletonContainer">
                  {/* Skeleton Header Banner */}
                  <div className={`ProfileHeaderCard ${layoutConfig.headerThemeClass}`}>
                    <div className="ProfileAvatarCircle">
                      <User size={46} style={{ opacity: 0.35 }} />
                    </div>
                    <div className="ProfileHeaderInfo">
                      <div className="ProfileHeaderTopLine">
                        <div className="ProfileSkeletonBar ProfileSkeletonTitle" />
                      </div>
                      <div className="ProfileHeaderMeta">
                        <div className="ProfileSkeletonBar ProfileSkeletonMeta" />
                      </div>
                    </div>
                  </div>

                  {/* Skeleton Full-width Responsive Grid */}
                  <div className="ProfileGrid">
                    {/* Left Column Skeleton */}
                    <div className="ProfileCard ProfileCardMain">
                      <div className="ProfileCardHeader">
                        <div className="ProfileSkeletonBarDark ProfileSkeletonHeading" />
                        <div className="ProfileSkeletonBarDark ProfileSkeletonSubheading" />
                      </div>
                      <div className="ProfileSkeletonFormGroup">
                        <div className="ProfileSkeletonBarDark ProfileSkeletonLabel" />
                        <div className="ProfileSkeletonInput" />
                      </div>
                      <div className="ProfileSkeletonFormGroup">
                        <div className="ProfileSkeletonBarDark ProfileSkeletonLabel" />
                        <div className="ProfileSkeletonInput" />
                      </div>
                      <div className="ProfileSkeletonFormGroup">
                        <div className="ProfileSkeletonBarDark ProfileSkeletonLabel" />
                        <div className="ProfileSkeletonInput" />
                      </div>
                    </div>

                    {/* Right Column Skeleton */}
                    <div className="ProfileCard ProfileCardSecurity">
                      <div className="ProfileCardHeader">
                        <div className="ProfileSkeletonBarDark ProfileSkeletonHeading" />
                        <div className="ProfileSkeletonBarDark ProfileSkeletonSubheading" />
                      </div>
                      <div className="ProfileSkeletonFormGroup">
                        <div className="ProfileSkeletonBarDark ProfileSkeletonLabel" />
                        <div className="ProfileSkeletonInput" />
                      </div>
                      <div className="ProfileSkeletonFormGroup">
                        <div className="ProfileSkeletonBarDark ProfileSkeletonLabel" />
                        <div className="ProfileSkeletonInput" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : loadError ? (
                <div className="ProfileErrorStateCard">
                  <AlertCircle size={44} className="ProfileErrorStateIcon" />
                  <h3 className="ProfileErrorStateTitle">Unable to Load Profile</h3>
                  <p className="ProfileErrorStateDesc">
                    We couldn't retrieve your profile data. Please check your connection and try again.
                  </p>
                  <button
                    type="button"
                    className="ProfileBtn ProfileBtnPrimary"
                    onClick={() => fetchProfile()}
                    style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {/* Profile Header Banner */}
                  <div className={`ProfileHeaderCard ${layoutConfig.headerThemeClass}`}>
                <div className="ProfileAvatarCircle">
                  <User size={46} />
                </div>

                <div className="ProfileHeaderInfo">
                  <div className="ProfileHeaderTopLine">
                    <h1 className="ProfileHeaderTitle">
                      {[savedProfile.firstName, savedProfile.middleName, savedProfile.lastName].filter(Boolean).join(' ') || '-'}
                    </h1>
                    <span className="ProfileRoleBadge">{layoutConfig.roleBadge}</span>
                  </div>

                  <div className="ProfileHeaderMeta">
                    <div className="ProfileMetaItem">
                      <Mail size={14} />
                      <span>{displayValue(savedProfile.email)}</span>
                    </div>
                    {!isNationalAdmin && (
                      <>
                        <div className="ProfileMetaItem">
                          <Building2 size={14} />
                          <span>{displayValue(savedProfile.department)}</span>
                        </div>
                        <div className="ProfileMetaItem">
                          <MapPin size={14} />
                          <span>{displayValue(savedProfile.region)}</span>
                        </div>
                        <div className="ProfileMetaItem">
                          <Fingerprint size={14} />
                          <span>ID: {displayValue(savedProfile.employeeId)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Full-width Responsive Grid */}
              <div className="ProfileGrid">

                {/* Left Column: Account & Profile Details Card */}
                <div className="ProfileCard ProfileCardMain">
                  <div className="ProfileCardHeader">
                    <div className="ProfileCardTitleGroup">
                      <h2 className="ProfileCardTitle">
                        <User size={20} />
                        {isPersonnel ? 'Personnel Record' : 'Account & Profile Information'}
                      </h2>
                      <span className="ProfileStatusPill">
                        {isPersonnel ? 'Official Record (Read-Only)' : 'Configurable Details'}
                      </span>
                    </div>
                    <p className="ProfileCardDesc">
                      {isPersonnel
                        ? 'Your official account profile is managed by your agency administrator. Information displayed below is verified and locked.'
                        : isNationalAdmin
                        ? 'Review and update your official administrator credentials and identification details.'
                        : 'Review and update your official agency identification details, contact information, and role placement.'}
                    </p>
                  </div>

                  {isPersonnel ? (
                    /* PERSONNEL READ-ONLY PROFILE VIEW - STRICTLY VIEW ONLY, NO EDIT INPUTS OR BUTTONS */
                    <div className="ProfileReadonlyDisplayGrid">
                      {/* Official Classification Banner */}
                      <div className="ProfileReadonlySection">
                        <div className="ProfileReadonlyTitle">
                          <Shield size={14} />
                          Official Account Classification (Read-Only)
                        </div>
                        <div className="ProfileFormRow ProfileFormRow3">
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">Email Address</label>
                            <div className="ProfileDisplayBox">
                              <Mail className="ProfileDisplayIcon" size={16} />
                              <span className="ProfileDisplayText">{displayValue(savedProfile.email)}</span>
                            </div>
                          </div>
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">Affiliated Agency</label>
                            <div className="ProfileDisplayBox">
                              <Building2 className="ProfileDisplayIcon" size={16} />
                              <span className="ProfileDisplayText">{displayValue(layoutConfig.agencyDisplay)}</span>
                            </div>
                          </div>
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">Assigned Region</label>
                            <div className="ProfileDisplayBox">
                              <MapPin className="ProfileDisplayIcon" size={16} />
                              <span className="ProfileDisplayText">{displayValue(savedProfile.region)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Official Record Fields */}
                      <div className="ProfileFieldsSection">
                        {/* Name Row */}
                        <div className="ProfileFormRow ProfileFormRow3">
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">First Name</label>
                            <div className="ProfileDisplayBox">
                              <User className="ProfileDisplayIcon" size={16} />
                              <span className="ProfileDisplayText">{displayValue(savedProfile.firstName)}</span>
                            </div>
                          </div>
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">Middle Name</label>
                            <div className="ProfileDisplayBox">
                              <User className="ProfileDisplayIcon" size={16} />
                              <span className={savedProfile.middleName ? 'ProfileDisplayText' : 'ProfileDisplayEmpty'}>
                                {displayValue(savedProfile.middleName)}
                              </span>
                            </div>
                          </div>
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">Last Name</label>
                            <div className="ProfileDisplayBox">
                              <User className="ProfileDisplayIcon" size={16} />
                              <span className="ProfileDisplayText">{displayValue(savedProfile.lastName)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Employee ID & Contact */}
                        <div className="ProfileFormRow ProfileFormRow2">
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">Employee ID</label>
                            <div className="ProfileDisplayBox">
                              <Fingerprint className="ProfileDisplayIcon" size={16} />
                              <span className={savedProfile.employeeId ? 'ProfileDisplayText' : 'ProfileDisplayEmpty'}>
                                {displayValue(savedProfile.employeeId)}
                              </span>
                            </div>
                          </div>
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">Contact Number</label>
                            <div className="ProfileDisplayBox">
                              <Phone className="ProfileDisplayIcon" size={16} />
                              <span className="ProfileDisplayText">{displayValue(savedProfile.contactNumber)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Department & Position */}
                        <div className="ProfileFormRow ProfileFormRow2">
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">Department</label>
                            <div className="ProfileDisplayBox">
                              <Building2 className="ProfileDisplayIcon" size={16} />
                              <span className={savedProfile.department ? 'ProfileDisplayText' : 'ProfileDisplayEmpty'}>
                                {displayValue(savedProfile.department)}
                              </span>
                            </div>
                          </div>
                          <div className="ProfileDisplayGroup">
                            <label className="ProfileDisplayLabel">Position / Title</label>
                            <div className="ProfileDisplayBox">
                              <Briefcase className="ProfileDisplayIcon" size={16} />
                              <span className={savedProfile.position ? 'ProfileDisplayText' : 'ProfileDisplayEmpty'}>
                                {displayValue(savedProfile.position)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ADMIN EDITABLE PROFILE FORM */
                    <form onSubmit={handleProfileSubmit} noValidate>
                      <div className="ProfileReadonlySection">
                        <div className="ProfileReadonlyTitle">
                          <Shield size={14} />
                          Official Account Classification (Read-Only)
                        </div>
                        <div className={`ProfileFormRow ${isNationalAdmin ? 'ProfileFormRow2' : 'ProfileFormRow3'}`}>
                          <div className="ProfileFormGroup">
                            <label className="ProfileLabel">
                              Email Address
                              <span className="ProfileReadonlyBadge">Read-Only</span>
                            </label>
                            <div className="ProfileInputWrapper">
                              <Mail className="ProfileInputIcon" size={16} />
                              <input
                                className="ProfileInput ProfileInputReadonly"
                                type="email"
                                value={displayValue(savedProfile.email)}
                                readOnly
                                tabIndex={-1}
                              />
                            </div>
                          </div>

                          <div className="ProfileFormGroup">
                            <label className="ProfileLabel">
                              Affiliated Agency
                              <span className="ProfileReadonlyBadge">Read-Only</span>
                            </label>
                            <div className="ProfileInputWrapper">
                              <Building2 className="ProfileInputIcon" size={16} />
                              <input
                                className="ProfileInput ProfileInputReadonly"
                                type="text"
                                value={displayValue(layoutConfig.agencyDisplay)}
                                readOnly
                                tabIndex={-1}
                              />
                            </div>
                          </div>

                          {!isNationalAdmin && (
                            <div className="ProfileFormGroup">
                              <label className="ProfileLabel">
                                Assigned Region
                                <span className="ProfileReadonlyBadge">Read-Only</span>
                              </label>
                              <div className="ProfileInputWrapper">
                                <MapPin className="ProfileInputIcon" size={16} />
                                <input
                                  className="ProfileInput ProfileInputReadonly"
                                  type="text"
                                  value={displayValue(savedProfile.region)}
                                  readOnly
                                  tabIndex={-1}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="ProfileFieldsSection">
                        {/* Name Row */}
                        <div className="ProfileFormRow ProfileFormRow3">
                          <div className="ProfileFormGroup">
                            <label className="ProfileLabel">
                              First Name <span className="ProfileRequired">*</span>
                            </label>
                            <div className="ProfileInputWrapper">
                              <User className="ProfileInputIcon" size={16} />
                              <input
                                className={`ProfileInput ${errors.firstName ? 'ProfileInputError' : ''}`}
                                type="text"
                                name="firstName"
                                value={form.firstName}
                                onChange={handleProfileChange}
                                placeholder="Enter first name"
                              />
                            </div>
                            {errors.firstName && (
                              <span className="ProfileFieldError"><AlertCircle size={12} /> {errors.firstName}</span>
                            )}
                          </div>

                          <div className="ProfileFormGroup">
                            <label className="ProfileLabel">
                              Middle Name
                            </label>
                            <div className="ProfileInputWrapper">
                              <User className="ProfileInputIcon" size={16} />
                              <input
                                className="ProfileInput"
                                type="text"
                                name="middleName"
                                value={form.middleName}
                                onChange={handleProfileChange}
                                placeholder="Optional"
                              />
                            </div>
                          </div>

                          <div className="ProfileFormGroup">
                            <label className="ProfileLabel">
                              Last Name <span className="ProfileRequired">*</span>
                            </label>
                            <div className="ProfileInputWrapper">
                              <User className="ProfileInputIcon" size={16} />
                              <input
                                className={`ProfileInput ${errors.lastName ? 'ProfileInputError' : ''}`}
                                type="text"
                                name="lastName"
                                value={form.lastName}
                                onChange={handleProfileChange}
                                placeholder="Enter last name"
                              />
                            </div>
                            {errors.lastName && (
                              <span className="ProfileFieldError"><AlertCircle size={12} /> {errors.lastName}</span>
                            )}
                          </div>
                        </div>

                        {!isNationalAdmin && (
                          <>
                            {/* Employee ID & Contact Row */}
                            <div className="ProfileFormRow ProfileFormRow2">
                              <div className="ProfileFormGroup">
                                <label className="ProfileLabel">
                                  Employee ID <span className="ProfileRequired">*</span>
                                </label>
                                <div className="ProfileInputWrapper">
                                  <Fingerprint className="ProfileInputIcon" size={16} />
                                  <input
                                    className="ProfileInput"
                                    type="text"
                                    name="employeeId"
                                    value={form.employeeId}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. CIDG-ADM-0892"
                                  />
                                </div>
                              </div>

                              <div className="ProfileFormGroup">
                                <label className="ProfileLabel">
                                  Contact Number <span className="ProfileRequired">*</span>
                                </label>
                                <div className="ProfileInputWrapper">
                                  <Phone className="ProfileInputIcon" size={16} />
                                  <input
                                    className={`ProfileInput ${errors.contactNumber ? 'ProfileInputError' : ''}`}
                                    type="text"
                                    inputMode="numeric"
                                    name="contactNumber"
                                    value={form.contactNumber}
                                    onChange={handleContactNumberChange}
                                    maxLength={11}
                                    placeholder="e.g. 09171234567"
                                  />
                                </div>
                                {errors.contactNumber && (
                                  <span className="ProfileFieldError"><AlertCircle size={12} /> {errors.contactNumber}</span>
                                )}
                              </div>
                            </div>

                            {/* Department & Position Row */}
                            <div className="ProfileFormRow ProfileFormRow2">
                              <div className="ProfileFormGroup">
                                <label className="ProfileLabel">
                                  Department <span className="ProfileRequired">*</span>
                                </label>
                                <div className="ProfileInputWrapper">
                                  <Building2 className="ProfileInputIcon" size={16} />
                                  <input
                                    className="ProfileInput"
                                    type="text"
                                    name="department"
                                    value={form.department}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. Regional Administration"
                                  />
                                </div>
                              </div>

                              <div className="ProfileFormGroup">
                                <label className="ProfileLabel">
                                  Position / Title <span className="ProfileRequired">*</span>
                                </label>
                                <div className="ProfileInputWrapper">
                                  <Briefcase className="ProfileInputIcon" size={16} />
                                  <input
                                    className="ProfileInput"
                                    type="text"
                                    name="position"
                                    value={form.position}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. Regional Administrator"
                                  />
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {profileStatus && (
                        <div className={`ProfileStatusBanner ${
                          profileStatus.type === 'success' ? 'ProfileStatusSuccess' : 'ProfileStatusError'
                        }`} style={{ marginTop: 18 }}>
                          {profileStatus.type === 'success' ? (
                            <CheckCircle2 size={18} />
                          ) : (
                            <AlertCircle size={18} />
                          )}
                          <span>{profileStatus.message}</span>
                        </div>
                      )}

                      <div className="ProfileActionsContainer">
                        <button
                          type="button"
                          className="ProfileBtn ProfileBtnSecondary"
                          onClick={handleProfileCancel}
                          disabled={isSavingProfile || justSavedProfile}
                        >
                          <X size={16} />
                          Cancel Changes
                        </button>

                        <button
                          type="submit"
                          className="ProfileBtn ProfileBtnPrimary"
                          disabled={isSavingProfile}
                          aria-busy={isSavingProfile}
                        >
                          <Save size={16} />
                          Save Changes
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Right Column: Security Credentials Card */}
                <div className="ProfileCard ProfileCardSecurity">
                  <div className="ProfileCardHeader">
                    <h2 className="ProfileCardTitle">
                      <Lock size={20} />
                      Security Credentials
                    </h2>
                    <p className="ProfileCardDesc">
                      {isPersonnel
                        ? 'Administrative password control and reset request management.'
                        : 'Manage your authentication credentials and account access password.'}
                    </p>
                  </div>

                  {isPersonnel ? (
                    /* PERSONNEL SECURITY VIEW: Request / Notify Administrator */
                    <div className="PersonnelSecurityContainer">
                      <div className="PersonnelSecurityNoticeBox">
                        <div className="PersonnelNoticeHeader">
                          <ShieldCheck size={18} />
                          <span>Managed by System Administrator</span>
                        </div>
                        <p className="PersonnelNoticeDesc">
                          For security and compliance reasons, personnel accounts cannot directly modify account passwords. If you need to reset or update your access credentials, notify your agency administrator.
                        </p>
                      </div>

                      {requestSentSuccess && (
                        <div className="ProfileStatusBanner ProfileStatusSuccess" style={{ marginBottom: 16 }}>
                          <CheckCircle2 size={18} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span>Your password reset request has been sent to the administrator. Please wait for further instructions.</span>
                            {requestTimestamp && (
                              <small style={{ opacity: 0.85, fontSize: '11.5px' }}>Submitted today at {requestTimestamp}</small>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="PersonnelActionWrapper">
                        <button
                          type="button"
                          className="ProfileBtn ProfileBtnPrimary PersonnelResetRequestBtn"
                          onClick={() => setIsRequestModalOpen(true)}
                          disabled={requestSentSuccess}
                        >
                          <Send size={16} />
                          {requestSentSuccess ? 'Request Already Sent' : 'Notify Administrator to Reset Password'}
                        </button>
                        <p className="PersonnelActionHelperText">
                          {requestSentSuccess
                            ? 'You can send another request after the cooldown period (about 8 hours).'
                            : `An administrative notification will be dispatched to the ${layoutConfig.agencyDisplay} management team.`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* ADMIN SECURITY VIEW: Direct Password Management */
                    <form onSubmit={handlePasswordSubmit} noValidate>
                      <div className="ProfileFormGroup">
                        <label className="ProfileLabel">
                          Current Password <span className="ProfileRequired">*</span>
                        </label>
                        <div className="ProfileInputWrapper">
                          <Key className="ProfileInputIcon" size={16} />
                          <input
                            className={`ProfileInput ${errors.currentPassword ? 'ProfileInputError' : ''}`}
                            type={showCurrent ? 'text' : 'password'}
                            name="currentPassword"
                            value={security.currentPassword}
                            onChange={handleSecurityChange}
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            className="ProfilePasswordToggle"
                            onClick={() => setShowCurrent(!showCurrent)}
                            aria-label="Toggle Current Password Visibility"
                          >
                            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {errors.currentPassword && (
                          <span className="ProfileFieldError"><AlertCircle size={12} /> {errors.currentPassword}</span>
                        )}
                      </div>

                      <div className="ProfileFormGroup" style={{ marginTop: 14 }}>
                        <label className="ProfileLabel">
                          New Password <span className="ProfileRequired">*</span>
                        </label>
                        <div className="ProfileInputWrapper">
                          <Lock className="ProfileInputIcon" size={16} />
                          <input
                            className={`ProfileInput ${errors.newPassword ? 'ProfileInputError' : ''}`}
                            type={showNew ? 'text' : 'password'}
                            name="newPassword"
                            value={security.newPassword}
                            onChange={handleSecurityChange}
                            placeholder="••••••••"
                            maxLength={64}
                          />
                          <button
                            type="button"
                            className="ProfilePasswordToggle"
                            onClick={() => setShowNew(!showNew)}
                            aria-label="Toggle New Password Visibility"
                          >
                            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {errors.newPassword && (
                          <span className="ProfileFieldError"><AlertCircle size={12} /> {errors.newPassword}</span>
                        )}
                      </div>

                      <div className="ProfileFormGroup" style={{ marginTop: 14 }}>
                        <label className="ProfileLabel">
                          Confirm New Password <span className="ProfileRequired">*</span>
                        </label>
                        <div className="ProfileInputWrapper">
                          <Lock className="ProfileInputIcon" size={16} />
                          <input
                            className={`ProfileInput ${errors.confirmPassword ? 'ProfileInputError' : ''}`}
                            type={showConfirm ? 'text' : 'password'}
                            name="confirmPassword"
                            value={security.confirmPassword}
                            onChange={handleSecurityChange}
                            placeholder="••••••••"
                            maxLength={64}
                          />
                          <button
                            type="button"
                            className="ProfilePasswordToggle"
                            onClick={() => setShowConfirm(!showConfirm)}
                            aria-label="Toggle Confirm Password Visibility"
                          >
                            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {errors.confirmPassword && (
                          <span className="ProfileFieldError"><AlertCircle size={12} /> {errors.confirmPassword}</span>
                        )}
                      </div>

                      <div className="ProfileSecurityTips" style={{ marginTop: 18 }}>
                        <div className="ProfileSecurityTipsTitle">
                          <Shield size={14} />
                          Password Requirements
                        </div>
                        <ul className="ProfileSecurityTipsList">
                          <li>Minimum length of 8 characters (max 64)</li>
                          <li>Include upper &amp; lowercase letters</li>
                          <li>Include numbers &amp; special characters</li>
                        </ul>
                      </div>

                      {passwordStatus && (
                        <div className={`ProfileStatusBanner ${
                          passwordStatus.type === 'success' ? 'ProfileStatusSuccess' : 'ProfileStatusError'
                        }`} style={{ marginTop: 16 }}>
                          {passwordStatus.type === 'success' ? (
                            <CheckCircle2 size={18} />
                          ) : (
                            <AlertCircle size={18} />
                          )}
                          <span>{passwordStatus.message}</span>
                        </div>
                      )}

                      <div className="ProfileActionsContainer">
                        <button
                          type="button"
                          className="ProfileBtn ProfileBtnSecondary"
                          onClick={handlePasswordCancel}
                          disabled={isSavingPassword}
                        >
                          <X size={16} />
                          Cancel
                        </button>

                        <button
                          type="submit"
                          className="ProfileBtn ProfileBtnPrimary"
                          disabled={isSavingPassword}
                          aria-busy={isSavingPassword}
                        >
                          <Save size={16} />
                          Update Password
                        </button>
                      </div>
                    </form>
                  )}
                </div>

              </div>

            </>
          )}
              </div>
            </div>
          </div>
        </div>

      {/* Personnel Request Reset Password Confirmation Modal */}
      {isRequestModalOpen && (
        <div className="ProfileModalOverlay">
          <div className={`ProfileModal ${layoutConfig.themeClass}`}>
            <div className="ProfileModalHeader">
              <div className="ProfileModalIconWrap">
                <AlertTriangle size={24} />
              </div>
              <h3 className="ProfileModalTitle">Request Password Reset</h3>
              <p className="ProfileModalSubtitle">
                Are you sure you want to notify your administrator to reset your password?
              </p>
            </div>

            <div className="ProfileModalBody">
              <p className="ProfileModalText">
                A formal request will be submitted to the <strong>{layoutConfig.agencyDisplay}</strong> administration team under your account (<strong>{savedProfile.email}</strong>). An administrator will issue an official reset link upon verification.
              </p>
            </div>

            <div className="ProfileModalFooter">
              <button
                type="button"
                className="ProfileBtn ProfileBtnSecondary"
                onClick={() => setIsRequestModalOpen(false)}
                disabled={isSubmittingRequest}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ProfileBtn ModalConfirmBtn"
                onClick={handleConfirmPersonnelResetRequest}
                disabled={isSubmittingRequest}
              >
                {isSubmittingRequest ? (
                  <>
                    <span className="ProfileSpinner"></span>
                    Sending Request...
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    Confirm Request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Scoped and clean CSS configurations for the component
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@400;500;600;700;800&display=swap');

  /* Base Variables */
  .ProfileContainer {
    --p-dark: #0f172a;
    --p-slate: #1e293b;
    --p-light-gray: #e2e8f0;
    --p-white: #ffffff;
    --p-error: #b91c1c;
    --p-bg-soft: #f8fafc;
    width: 100%;
    max-width: 100%;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--p-slate);
    box-sizing: border-box;
    animation: ProfileFadeIn 0.3s ease-out;
  }

  .ProfileContainer * {
    box-sizing: border-box;
  }

  @keyframes ProfileFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Skeleton & Loading States */
  @keyframes ProfilePulse {
    0%, 100% { opacity: 0.45; }
    50% { opacity: 0.85; }
  }

  .ProfileSkeletonContainer {
    width: 100%;
  }

  .ProfileSkeletonBar {
    background: rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    animation: ProfilePulse 1.5s ease-in-out infinite;
  }

  .ProfileSkeletonBarDark {
    background: #e2e8f0;
    border-radius: 6px;
    animation: ProfilePulse 1.5s ease-in-out infinite;
  }

  .ProfileSkeletonTitle {
    width: 220px;
    height: 28px;
    margin-bottom: 6px;
  }

  .ProfileSkeletonMeta {
    width: 160px;
    height: 16px;
  }

  .ProfileSkeletonHeading {
    width: 180px;
    height: 20px;
    margin-bottom: 8px;
  }

  .ProfileSkeletonSubheading {
    width: 280px;
    height: 14px;
    margin-bottom: 24px;
  }

  .ProfileSkeletonFormGroup {
    margin-bottom: 20px;
  }

  .ProfileSkeletonLabel {
    width: 100px;
    height: 14px;
    margin-bottom: 8px;
  }

  .ProfileSkeletonInput {
    width: 100%;
    height: 42px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    animation: ProfilePulse 1.5s ease-in-out infinite;
  }

  /* Inline Error State */
  .ProfileErrorStateCard {
    background: #ffffff;
    border: 1px solid #fed7aa;
    border-radius: 16px;
    padding: 48px 24px;
    text-align: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 20px 0;
  }

  .ProfileErrorStateIcon {
    color: #ea580c;
    margin-bottom: 12px;
  }

  .ProfileErrorStateTitle {
    font-size: 19px;
    font-weight: 600;
    color: #1e293b;
    margin: 0 0 8px;
    font-family: 'Poppins', sans-serif;
  }

  .ProfileErrorStateDesc {
    font-size: 14px;
    color: #64748b;
    margin: 0;
    max-width: 440px;
  }

  /* ─────────────────────────────────────────────────────────────
     1. WORKSPACE PALETTE THEMES
     ───────────────────────────────────────────────────────────── */
  /* National Admin Theme (Navy/Slate #1E293B) */
  .theme-national-admin {
    --primary-accent: #1E293B;
    --primary-gradient: linear-gradient(135deg, #1E293B 0%, #1E293B 100%);
    --primary-hover: #1E293B;
    --primary-shadow: rgba(15, 23, 42, 0.35);
    --primary-border: #1E293B;
    --primary-badge-bg: rgba(15, 23, 42, 0.12);
    --primary-badge-color: #1E293B;
    --header-border-accent: #1E293B;
    --focus-ring: rgba(15, 23, 42, 0.18);
  }

  /* FDA Theme (Emerald Green #1B4332 / #047857) */
  .theme-fda {
    --primary-accent: #1B4332;
    --primary-gradient: #1B4332;
    --primary-hover: #047857;
    --primary-shadow: rgba(6, 95, 70, 0.35);
    --primary-border: #065f46;
    --primary-badge-bg: rgba(6, 95, 70, 0.12);
    --primary-badge-color: #047857;
    --header-border-accent: #10b981;
    --focus-ring: rgba(6, 95, 70, 0.18);
  }

  /* LEA Theme (Navy / Slate #0f172a with Gold Accents #FCA311) */
  .theme-lea {
    --primary-accent: #0f172a;
    --primary-gradient: linear-gradient(135deg, #0f172a 0%, #0f172a 100%);
    --primary-hover: #0f172a;
    --primary-shadow: rgba(30, 41, 59, 0.35);
    --primary-border: #0f172a;
    --primary-badge-bg: rgba(252, 163, 17, 0.15);
    --primary-badge-color: #b45309;
    --header-border-accent: #FCA311;
    --focus-ring: rgba(30, 41, 59, 0.18);
  }

  /* ─────────────────────────────────────────────────────────────
     2. HEADER CARD (Full Width Banner)
     ───────────────────────────────────────────────────────────── */
  .ProfileHeaderCard {
    width: 100%;
    border-radius: 16px;
    padding: 28px 34px;
    color: #ffffff;
    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.15);
    margin-bottom: 24px;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .ProfileHeaderCard.agency-national-admin {
    background-color: #1E293B;
  }

  .ProfileHeaderCard.agency-fda-admin,
  .ProfileHeaderCard.agency-fda {
    background-color: #1B4332;
  }

  .ProfileHeaderCard.agency-lea-admin,
  .ProfileHeaderCard.agency-lea {
    background-color: #0f172a;
  }

  .ProfileAvatarCircle {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    flex-shrink: 0;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  .ProfileHeaderInfo {
    flex-grow: 1;
  }

  .ProfileHeaderTopLine {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 8px;
  }

  .ProfileHeaderTitle {
    font-family: 'Poppins', sans-serif;
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.3px;
    color: #ffffff;
  }

  .ProfileRoleBadge {
    font-size: 11.5px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
    padding: 3px 12px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .ProfileAgencyBadge {
    font-size: 11.5px;
    font-weight: 700;
    background: var(--header-border-accent);
    color: #ffff;
    padding: 3px 12px;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .ProfileHeaderMeta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 13.5px;
    color: rgba(255, 255, 255, 0.9);
  }

  .ProfileMetaItem {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.1);
    padding: 5px 12px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  /* ─────────────────────────────────────────────────────────────
     3. MAXIMIZED FULL-WIDTH GRID LAYOUT
     ───────────────────────────────────────────────────────────── */
  .ProfileGrid {
    display: grid;
    grid-template-columns: minmax(0, 1.85fr) minmax(0, 1.15fr);
    gap: 24px;
    width: 100%;
    align-items: start;
  }

  @media (max-width: 1080px) {
    .ProfileGrid {
      grid-template-columns: 1fr;
    }
  }

  .ProfileCard {
    background: #ffffff;
    border-radius: 14px;
    border: 1px solid var(--p-light-gray);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
    transition: all 0.2s ease;
  }

  .ProfileCard:hover {
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.07);
  }

  .ProfileCardHeader {
    border-bottom: 1px solid var(--p-light-gray);
    padding-bottom: 16px;
    margin-bottom: 4px;
  }

  .ProfileCardTitleGroup {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }

  .ProfileCardTitle {
    font-family: 'Poppins', sans-serif;
    font-size: 19px;
    font-weight: 700;
    color: var(--p-slate);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ProfileCardDesc {
    font-size: 13.5px;
    color: #64748b;
    margin: 6px 0 0 0;
    line-height: 1.45;
  }

  .ProfileStatusPill {
    font-size: 11px;
    font-weight: 700;
    background: var(--primary-badge-bg);
    color: var(--primary-badge-color);
    padding: 3px 10px;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  /* ─────────────────────────────────────────────────────────────
     4. FORM LAYOUT & FIELD MAXIMIZATION
     ───────────────────────────────────────────────────────────── */
  .ProfileReadonlySection {
    background: #f8fafc;
    border-radius: 12px;
    border: 1.5px dashed #cbd5e1;
    padding: 20px 22px;
    margin-bottom: 18px;
    width: 100%;
  }

  .ProfileReadonlyTitle {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: #475569;
    letter-spacing: 0.6px;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ProfileFieldsSection {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  .ProfileFormRow {
    display: grid;
    gap: 16px;
    width: 100%;
  }

  .ProfileFormRow3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ProfileFormRow2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 768px) {
    .ProfileFormRow3,
    .ProfileFormRow2 {
      grid-template-columns: 1fr;
    }
  }

  /* Read-Only Display Boxes for Personnel */
  .ProfileDisplayGroup {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .ProfileDisplayLabel {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ProfileDisplayBox {
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 9px;
    padding: 11px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    color: var(--p-slate);
    font-size: 14px;
    width: 100%;
    box-sizing: border-box;
  }

  .ProfileDisplayIcon {
    color: #94a3b8;
    flex-shrink: 0;
  }

  .ProfileDisplayText {
    color: #0f172a;
    font-weight: 500;
    word-break: break-word;
  }

  .ProfileDisplayEmpty {
    color: #94a3b8;
    font-weight: 600;
  }

  .ProfileFormGroup {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .ProfileLabel {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ProfileRequired {
    color: var(--p-error);
    margin-left: 2px;
  }

  .ProfileReadonlyBadge {
    font-size: 9.5px;
    background: #e2e8f0;
    color: #475569;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.4px;
  }

  .ProfileInputWrapper {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .ProfileInputIcon {
    position: absolute;
    left: 12px;
    color: #94a3b8;
    pointer-events: none;
  }

  .ProfileInput {
    width: 100%;
    padding: 11px 12px 11px 38px;
    border: 1.5px solid #cbd5e1;
    border-radius: 9px;
    font-size: 14px;
    color: var(--p-slate);
    background: #ffffff;
    outline: none;
    transition: all 0.18s ease;
    font-family: inherit;
  }

  .ProfileInput:focus {
    border-color: var(--primary-border);
    box-shadow: 0 0 0 3.5px var(--focus-ring);
  }

  .ProfileInputReadonly {
    background: #f1f5f9 !important;
    color: #475569 !important;
    border-color: #e2e8f0 !important;
    cursor: default;
  }

  .ProfileInputReadonly:focus {
    box-shadow: none !important;
    border-color: #cbd5e1 !important;
  }

  .ProfileInputError {
    border-color: var(--p-error) !important;
  }

  .ProfileInputError:focus {
    box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.15) !important;
  }

  .ProfileFieldError {
    font-size: 11.5px;
    color: var(--p-error);
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ProfilePasswordToggle {
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    cursor: pointer;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
  }

  .ProfilePasswordToggle:hover {
    color: var(--p-slate);
  }

  /* ─────────────────────────────────────────────────────────────
     5. BUTTONS & ACTIONS (STRICT PALETTE CONFORMANCE)
     ───────────────────────────────────────────────────────────── */
  .ProfileActionsContainer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 10px;
    padding-top: 20px;
    border-top: 1px solid var(--p-light-gray);
  }

  .ProfileBtn {
    padding: 10px 22px;
    font-size: 13.5px;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: 'Poppins', sans-serif;
  }

  .ProfileBtnPrimary {
    background: var(--primary-gradient);
    color: #ffffff;
    border: 1.5px solid var(--primary-border);
    box-shadow: 0 4px 12px var(--primary-shadow);
    /* Prevent the button width from changing with its loading label. */
    min-width: 158px;
  }

  .ProfileBtnPrimary:hover:not(:disabled) {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px var(--primary-shadow);
  }

  .ProfileBtnPrimary:disabled {
    /* Keep the visual state stable when a hovered button starts saving. */
    opacity: 1;
    cursor: wait;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px var(--primary-shadow);
  }

  .ProfileBtnSecondary {
    background: #ffffff;
    color: #475569;
    border: 1.5px solid #cbd5e1;
  }

  .ProfileBtnSecondary:hover:not(:disabled) {
    background: #f8fafc;
    color: #0f172a;
    border-color: #94a3b8;
  }

  .ProfileSpinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: ProfileSpin 0.7s linear infinite;
  }

  @keyframes ProfileSpin {
    to { transform: rotate(360deg); }
  }

  /* ─────────────────────────────────────────────────────────────
     6. SECURITY CREDENTIALS & REQUIREMENTS
     ───────────────────────────────────────────────────────────── */
  .ProfileSecurityTips {
    background: #f8fafc;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    padding: 14px 16px;
  }

  .ProfileSecurityTipsTitle {
    font-size: 12.5px;
    font-weight: 700;
    color: #334155;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ProfileSecurityTipsList {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    color: #64748b;
    line-height: 1.6;
  }

  /* Personnel Security Card Styles */
  .PersonnelSecurityContainer {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .PersonnelSecurityNoticeBox {
    background: #eff6ff;
    border: 1.5px solid #bfdbfe;
    border-radius: 10px;
    padding: 16px 18px;
  }

  .PersonnelNoticeHeader {
    font-size: 13.5px;
    font-weight: 700;
    color: #1e40af;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .PersonnelNoticeDesc {
    font-size: 13px;
    color: #1e3a8a;
    line-height: 1.5;
    margin: 0;
  }

  .PersonnelActionWrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .PersonnelResetRequestBtn {
    width: 100%;
    padding: 13px 20px;
    font-size: 14px;
  }

  .PersonnelActionHelperText {
    font-size: 12px;
    color: #64748b;
    margin: 0;
    text-align: center;
    line-height: 1.4;
  }

  /* Status Banners */
  .ProfileStatusBanner {
    padding: 14px 18px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13.5px;
    font-weight: 550;
    line-height: 1.45;
  }

  .ProfileStatusSuccess {
    background: rgba(16, 185, 129, 0.08);
    border: 1.5px solid #10b981;
    color: #065f46;
  }

  .ProfileStatusError {
    background: rgba(185, 28, 28, 0.08);
    border: 1.5px solid var(--p-error);
    color: var(--p-error);
  }

  /* ─────────────────────────────────────────────────────────────
     7. MODAL STYLING (Personnel Reset Request)
     ───────────────────────────────────────────────────────────── */
  .ProfileModalOverlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(4px);
    z-index: 1050;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .ProfileModal {
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    width: 100%;
    max-width: 520px;
    overflow: hidden;
    animation: ProfileModalUp 0.22s ease-out;
  }

  @keyframes ProfileModalUp {
    from { opacity: 0; transform: translateY(14px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .ProfileModalHeader {
    padding: 26px 28px 16px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .ProfileModalIconWrap {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: var(--primary-badge-bg);
    color: var(--primary-badge-color);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }

  .ProfileModalTitle {
    font-family: 'Poppins', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 6px;
  }

  .ProfileModalSubtitle {
    font-size: 13.5px;
    color: #64748b;
    margin: 0;
    line-height: 1.45;
  }

  .ProfileModalBody {
    padding: 16px 28px 24px;
  }

  .ProfileModalText {
    font-size: 13.5px;
    color: #475569;
    line-height: 1.55;
    margin: 0;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
  }

  .ProfileModalFooter {
    padding: 16px 28px 24px;
    border-top: 1px solid #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .ModalConfirmBtn {
    background: var(--primary-gradient);
    color: #ffffff;
    border: 1.5px solid var(--primary-border);
    box-shadow: 0 4px 12px var(--primary-shadow);
  }

  .ModalConfirmBtn:hover:not(:disabled) {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px var(--primary-shadow);
  }

  /* ─────────────────────────────────────────────────────────────
     8. RESPONSIVE REFINEMENTS
     ───────────────────────────────────────────────────────────── */
  @media (max-width: 640px) {
    .ProfileHeaderCard {
      flex-direction: column;
      text-align: center;
      padding: 24px 18px;
    }
    .ProfileHeaderTopLine {
      justify-content: center;
    }
    .ProfileHeaderMeta {
      justify-content: center;
    }
    .ProfileCard {
      padding: 20px 18px;
    }
  }
`;

export default ProfileSetting;
