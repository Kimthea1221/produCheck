// desktopfrontend/src/pages/fdafolder/fda-view-reports.jsx
import { useState, useEffect } from "react";
import { useLocation } from 'react-router-dom';
import Sidebar from "../component/sidebar";
import TopBar from "../component/top-bar";
import './fda-css.css';
import { apiFetch } from '../../utils/apiFetch';

import { 
  Globe, 
  Footprints, 
  Search, 
  Download, 
  Eye, 
  ChevronLeft, 
  ChevronRight, 
  X,
  FileText,
  Image as ImageIcon,
  Paperclip,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  Info
} from 'lucide-react';
import mammoth from 'mammoth';

const ITEMS_PER_PAGE = 25;

// ADDED — same error-parsing helper used on the LEA side, for consistent
// FastAPI error message extraction across the app.
async function parseBackendError(res) {
  try {
    const data = await res.json();
    if (!data || !data.detail) return 'An unexpected error occurred.';
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((e) => e.msg || JSON.stringify(e)).join(' | ');
    }
    return JSON.stringify(data.detail);
  } catch {
    return 'An unexpected error occurred.';
  }
}

// ADDED — formats the backend's ISO created_at into the readable string
// the table used to get for free from the mock data's dateReceived field.
function formatDateTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ADDED — formats the backend's ISO timestamp into full date and time string
function formatFullDateTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ADDED — backend returns source as 'extension' / 'walk_in'; the UI tabs
// and badges use the human-readable labels. Two small helpers instead of
// changing every comparison in the file.
function getSourceLabel(source) {
  if (source === 'extension') return 'Browser Extension';
  if (source === 'walk_in') return 'Walk-in';
  return source;
}
function mapTabToSource(tabName) {
  if (tabName === 'Browser Extension') return 'extension';
  if (tabName === 'Walk-in') return 'walk_in';
  return null; 
}

const CATEGORY_LABELS = {
  Cosmetics: 'Cosmetics',
  Food: 'Food',
  Devices: 'Devices',
  Drugs: 'Drugs',
};

function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

// Maps backend Complaint.status values to the final user-facing
// complaint-workflow statuses, confirmed against VALID_COMPLAINT_TRANSITIONS.
const WALKIN_STATUS_MAP = {
  "under_review": "Under Review",
  "takedown_requested": "Forwarded to LEA",
  "takedown_initiated": "Operation in Progress",
  "completed": "Takedown Completed",
  "dismissed": "Case Closed",
};

const EXTENSION_STATUS_MAP = {
  "under_review": "Under Review",
  "takedown_requested": "Takedown Requested",
  "completed": "Completed",
  "dismissed": "Dismissed",
};

function getWorkflowStatus(status, source) {
  const map = source === 'extension' ? EXTENSION_STATUS_MAP : WALKIN_STATUS_MAP;
  return map[status] || status;
}

// ============================================================================
// 🔌 BACKEND: set to false once GET /complaints/{id}/fda-detail returns
// real verification and lea_followup objects.
// ============================================================================
const USE_VIEW_REPORT_VERIFICATION_MOCK = true;

// ⚠️ REMOVE THIS — Mock verification & LEA follow-up states for Walk-in cases
// until backend includes verification and lea_followup on GET /complaints/{id}/fda-detail.
const MOCK_VIEW_REPORT_EXCHANGES = {
  // ⚠️ REMOVE THIS
  unregistered_takedown_initiated: {
    verification: {
      // 🔌 BACKEND: detail.verification.request_source
      request_source: "walk_in",
      // 🔌 BACKEND: detail.verification.requested_by_name
      requested_by_name: "Lt. Col. Arthur Pendelton, CIDG",
      // 🔌 BACKEND: detail.verification.requested_at
      requested_at: "2026-09-28T09:30:00Z",
      // 🔌 BACKEND: detail.verification.product_code
      product_code: "LOT-2025-BR-991",
      // 🔌 BACKEND: detail.verification.priority
      priority: "High",
      // 🔌 BACKEND: detail.verification.verification_result
      verification_result: "unregistered",
      // 🔌 BACKEND: detail.verification.cpr_number
      cpr_number: null,
      // 🔌 BACKEND: detail.verification.cpr_expiry
      cpr_expiry: null,
      // 🔌 BACKEND: detail.verification.verified_by_name
      verified_by_name: "Maria Santos, RPh",
      // 🔌 BACKEND: detail.verification.unregistered_reason
      unregistered_reason: "No valid Certificate of Product Registration (CPR) exists in the FDA verification database for this lot number.",
      // 🔌 BACKEND: detail.verification.response_notes
      response_notes: "Public health advisory to be issued. Immediate market surveillance and enforcement coordination recommended.",
      // 🔌 BACKEND: detail.verification.responded_at
      responded_at: "2026-09-29T11:00:00Z",
      // 🔌 BACKEND: detail.verification.rejected_by_name
      rejected_by_name: null,
      // 🔌 BACKEND: detail.verification.rejection_reason
      rejection_reason: null,
    },
    lea_followup: {
      // 🔌 BACKEND: detail.lea_followup.lea_stage
      lea_stage: "takedown_initiated",
      // 🔌 BACKEND: detail.lea_followup.reminder_sent_at
      reminder_sent_at: "2026-09-28T16:00:00Z",
      // 🔌 BACKEND: detail.lea_followup.acknowledged_at
      acknowledged_at: null,
      // 🔌 BACKEND: detail.lea_followup.acknowledged_by_name
      acknowledged_by_name: null,
      // 🔌 BACKEND: detail.lea_followup.takedown_initiated_at
      takedown_initiated_at: "2026-09-30T13:45:00Z",
      // 🔌 BACKEND: detail.lea_followup.takedown_initiated_by_name
      takedown_initiated_by_name: "Maj. Eduardo Ramos, CIDG Anti-Fraud",
      // 🔌 BACKEND: detail.lea_followup.field_operation_notes
      field_operation_notes: "Enforcement unit mobilized. Coordinating raid with regional intelligence unit on distribution warehouse in Binondo, Manila.",
      // 🔌 BACKEND: detail.lea_followup.closed_at
      closed_at: null,
      // 🔌 BACKEND: detail.lea_followup.closed_by_name
      closed_by_name: null,
      // 🔌 BACKEND: detail.lea_followup.closing_notes
      closing_notes: null,
      // 🔌 BACKEND: detail.lea_followup.close_reason
      close_reason: null,
    },
  },
  // ⚠️ REMOVE THIS
  registered_acknowledged: {
    verification: {
      // 🔌 BACKEND: detail.verification.request_source
      request_source: "walk_in",
      // 🔌 BACKEND: detail.verification.requested_by_name
      requested_by_name: "Capt. Ronald De Leon, CIDG",
      // 🔌 BACKEND: detail.verification.requested_at
      requested_at: "2026-09-25T08:30:00Z",
      // 🔌 BACKEND: detail.verification.product_code
      product_code: "LOT-2025-BR-991",
      // 🔌 BACKEND: detail.verification.priority
      priority: "Standard",
      // 🔌 BACKEND: detail.verification.verification_result
      verification_result: "registered",
      // 🔌 BACKEND: detail.verification.cpr_number
      cpr_number: "NN-100000847291",
      // 🔌 BACKEND: detail.verification.cpr_expiry
      cpr_expiry: "2028-11-30",
      // 🔌 BACKEND: detail.verification.verified_by_name
      verified_by_name: "Maria Santos, RPh",
      // 🔌 BACKEND: detail.verification.unregistered_reason
      unregistered_reason: null,
      // 🔌 BACKEND: detail.verification.response_notes
      response_notes: "Product has active valid CPR under Brilliant Skin Essentials Inc. Authorized for commercial distribution.",
      // 🔌 BACKEND: detail.verification.responded_at
      responded_at: "2026-09-26T10:15:00Z",
      // 🔌 BACKEND: detail.verification.rejected_by_name
      rejected_by_name: null,
      // 🔌 BACKEND: detail.verification.rejection_reason
      rejection_reason: null,
    },
    lea_followup: {
      // 🔌 BACKEND: detail.lea_followup.lea_stage
      lea_stage: "acknowledged",
      // 🔌 BACKEND: detail.lea_followup.reminder_sent_at
      reminder_sent_at: null,
      // 🔌 BACKEND: detail.lea_followup.acknowledged_at
      acknowledged_at: "2026-09-27T14:20:00Z",
      // 🔌 BACKEND: detail.lea_followup.acknowledged_by_name
      acknowledged_by_name: "Capt. Ronald De Leon, CIDG",
      // 🔌 BACKEND: detail.lea_followup.takedown_initiated_at
      takedown_initiated_at: null,
      // 🔌 BACKEND: detail.lea_followup.takedown_initiated_by_name
      takedown_initiated_by_name: null,
      // 🔌 BACKEND: detail.lea_followup.field_operation_notes
      field_operation_notes: null,
      // 🔌 BACKEND: detail.lea_followup.closed_at
      closed_at: null,
      // 🔌 BACKEND: detail.lea_followup.closed_by_name
      closed_by_name: null,
      // 🔌 BACKEND: detail.lea_followup.closing_notes
      closing_notes: null,
      // 🔌 BACKEND: detail.lea_followup.close_reason
      close_reason: null,
    },
  },
  // ⚠️ REMOVE THIS
  unregistered_closed: {
    verification: {
      // 🔌 BACKEND: detail.verification.request_source
      request_source: "walk_in",
      // 🔌 BACKEND: detail.verification.requested_by_name
      requested_by_name: "Maj. Eduardo Ramos, CIDG Anti-Fraud",
      // 🔌 BACKEND: detail.verification.requested_at
      requested_at: "2026-09-15T10:00:00Z",
      // 🔌 BACKEND: detail.verification.product_code
      product_code: "LOT-2025-BR-991",
      // 🔌 BACKEND: detail.verification.priority
      priority: "Standard",
      // 🔌 BACKEND: detail.verification.verification_result
      verification_result: "unregistered",
      // 🔌 BACKEND: detail.verification.cpr_number
      cpr_number: null,
      // 🔌 BACKEND: detail.verification.cpr_expiry
      cpr_expiry: null,
      // 🔌 BACKEND: detail.verification.verified_by_name
      verified_by_name: "Maria Santos, RPh",
      // 🔌 BACKEND: detail.verification.unregistered_reason
      unregistered_reason: "Product formulation contains prohibited ingredients not registered with FDA.",
      // 🔌 BACKEND: detail.verification.response_notes
      response_notes: "Advisory notice published. Case endorsed to LEA for field confiscation.",
      // 🔌 BACKEND: detail.verification.responded_at
      responded_at: "2026-09-16T14:30:00Z",
      // 🔌 BACKEND: detail.verification.rejected_by_name
      rejected_by_name: null,
      // 🔌 BACKEND: detail.verification.rejection_reason
      rejection_reason: null,
    },
    lea_followup: {
      // 🔌 BACKEND: detail.lea_followup.lea_stage
      lea_stage: "closed",
      // 🔌 BACKEND: detail.lea_followup.reminder_sent_at
      reminder_sent_at: null,
      // 🔌 BACKEND: detail.lea_followup.acknowledged_at
      acknowledged_at: null,
      // 🔌 BACKEND: detail.lea_followup.acknowledged_by_name
      acknowledged_by_name: null,
      // 🔌 BACKEND: detail.lea_followup.takedown_initiated_at
      takedown_initiated_at: "2026-09-18T09:15:00Z",
      // 🔌 BACKEND: detail.lea_followup.takedown_initiated_by_name
      takedown_initiated_by_name: "Maj. Eduardo Ramos, CIDG Anti-Fraud",
      // 🔌 BACKEND: detail.lea_followup.field_operation_notes
      field_operation_notes: "Coordinated search warrant executed at commercial facility. 2,400 counterfeit units seized.",
      // 🔌 BACKEND: detail.lea_followup.closed_at
      closed_at: "2026-09-22T16:00:00Z",
      // 🔌 BACKEND: detail.lea_followup.closed_by_name
      closed_by_name: "Col. Victoriano Cruz, Regional Director CIDG",
      // 🔌 BACKEND: detail.lea_followup.closing_notes
      closing_notes: "All illicit inventory impounded into evidence custody. Formal criminal charges filed under RA 9711.",
      // 🔌 BACKEND: detail.lea_followup.close_reason
      close_reason: "Operation Completed - Target Seized and Charges Filed",
    },
  },
  // ⚠️ REMOVE THIS
  rejected: {
    verification: {
      // 🔌 BACKEND: detail.verification.request_source
      request_source: "walk_in",
      // 🔌 BACKEND: detail.verification.requested_by_name
      requested_by_name: "Desk Officer SPO2 Danica Reyes",
      // 🔌 BACKEND: detail.verification.requested_at
      requested_at: "2026-10-02T11:20:00Z",
      // 🔌 BACKEND: detail.verification.product_code
      product_code: "N/A",
      // 🔌 BACKEND: detail.verification.priority
      priority: "Standard",
      // 🔌 BACKEND: detail.verification.verification_result
      verification_result: "rejected",
      // 🔌 BACKEND: detail.verification.cpr_number
      cpr_number: null,
      // 🔌 BACKEND: detail.verification.cpr_expiry
      cpr_expiry: null,
      // 🔌 BACKEND: detail.verification.verified_by_name
      verified_by_name: null,
      // 🔌 BACKEND: detail.verification.unregistered_reason
      unregistered_reason: null,
      // 🔌 BACKEND: detail.verification.response_notes
      response_notes: null,
      // 🔌 BACKEND: detail.verification.responded_at
      responded_at: "2026-10-03T15:10:00Z",
      // 🔌 BACKEND: detail.verification.rejected_by_name
      rejected_by_name: "Dr. Ferdinand Gomez, Head of Center for Cosmetics",
      // 🔌 BACKEND: detail.verification.rejection_reason
      rejection_reason: "Physical evidence packaging photos are illegible and do not show lot number or manufacturer markings. Please resubmit with clear high-resolution photos of product labeling.",
    },
    lea_followup: {
      // 🔌 BACKEND: detail.lea_followup.lea_stage
      lea_stage: "acknowledged",
      // 🔌 BACKEND: detail.lea_followup.reminder_sent_at
      reminder_sent_at: null,
      // 🔌 BACKEND: detail.lea_followup.acknowledged_at
      acknowledged_at: "2026-10-04T09:00:00Z",
      // 🔌 BACKEND: detail.lea_followup.acknowledged_by_name
      acknowledged_by_name: "Desk Officer SPO2 Danica Reyes",
      // 🔌 BACKEND: detail.lea_followup.takedown_initiated_at
      takedown_initiated_at: null,
      // 🔌 BACKEND: detail.lea_followup.takedown_initiated_by_name
      takedown_initiated_by_name: null,
      // 🔌 BACKEND: detail.lea_followup.field_operation_notes
      field_operation_notes: null,
      // 🔌 BACKEND: detail.lea_followup.closed_at
      closed_at: null,
      // 🔌 BACKEND: detail.lea_followup.closed_by_name
      closed_by_name: null,
      // 🔌 BACKEND: detail.lea_followup.closing_notes
      closing_notes: null,
      // 🔌 BACKEND: detail.lea_followup.close_reason
      close_reason: null,
    },
  },
};

// ADDED — Full FDA-LEA Verification Exchange child component for Walk-in cases
function FdaWalkInVerificationExchange({ selectedReport, selectedReportDetail }) {
  // Local state for interactive mock state switching
  const [mockState, setMockState] = useState('unregistered_takedown_initiated');

  const isUsingMock = USE_VIEW_REPORT_VERIFICATION_MOCK;

  // Resolve active exchange dataset
  let activeVerification = null;
  let activeLeaFollowup = null;

  if (isUsingMock) {
    if (mockState !== 'no_verification') {
      const mockRecord = MOCK_VIEW_REPORT_EXCHANGES[mockState];
      activeVerification = mockRecord?.verification || null;
      activeLeaFollowup = mockRecord?.lea_followup || null;
    }
  } else {
    // 🔌 BACKEND: detail.verification and detail.lea_followup
    activeVerification = selectedReportDetail?.verification || null;
    activeLeaFollowup = selectedReportDetail?.lea_followup || null;
  }

  // Common Mock Selector header control
  const renderMockControls = () => {
    if (!isUsingMock) return null;
    return (
      <div className="FdaViewReportMockControls">
        <span className="FdaVerifMockBadge">Mock preview</span>
        <label className="FdaViewReportMockLabel" htmlFor="fda-view-report-mock-select">Mock state:</label>
        <select
          id="fda-view-report-mock-select"
          className="FdaViewReportMockSelect"
          value={mockState}
          onChange={(e) => setMockState(e.target.value)}
        >
          <option value="unregistered_takedown_initiated">Unregistered + takedown initiated</option>
          <option value="registered_acknowledged">Registered + acknowledged</option>
          <option value="unregistered_closed">Unregistered + closed</option>
          <option value="rejected">Rejected</option>
          <option value="no_verification">No verification request</option>
        </select>
      </div>
    );
  };

  // State: No verification request sent
  if (!activeVerification) {
    return (
      <div className="FdaViewReportExchangeWrap">
        <div className="FdaViewReportSectionTop">
          <span className="FdaViewReportSectionTopTitle">Verification &amp; LEA Enforcement</span>
          {renderMockControls()}
        </div>
        <div className="FdaViewReportNoVerifBox">
          <Info size={15} className="FdaViewReportNoVerifIcon" />
          <span>No verification request sent to FDA yet</span>
        </div>
      </div>
    );
  }

  const normResult = (activeVerification.verification_result || '').toLowerCase();
  const isRegisteredOrRejected = normResult === 'registered' || normResult === 'rejected';

  const stageOrder = isRegisteredOrRejected
    ? ['awaiting_lea', 'acknowledged']
    // CHANGED — LEA has no acknowledge step for unregistered cases; goes straight to takedown
    : ['awaiting_lea', 'takedown_initiated', 'closed'];

  const currentStageIndex = activeLeaFollowup ? stageOrder.indexOf(activeLeaFollowup.lea_stage) : 0;
  const effectiveCurrentIndex = currentStageIndex >= 0 ? currentStageIndex : 0;

  const stepsConfig = isRegisteredOrRejected
    ? [
        {
          key: 'awaiting_lea',
          title: 'Awaiting LEA Action',
          date: activeVerification.responded_at,
          dateLabel: 'Date FDA Responded:',
          actor: null,
        },
        {
          key: 'acknowledged',
          title: 'Acknowledged - Case Closed',
          date: activeLeaFollowup?.acknowledged_at,
          dateLabel: 'Acknowledged At:',
          actor: activeLeaFollowup?.acknowledged_by_name,
          actorLabel: 'Acknowledged By:',
        },
      ]
    : [
        {
          key: 'awaiting_lea',
          title: 'Awaiting LEA Action',
          date: activeVerification.responded_at,
          dateLabel: 'Date FDA Responded:',
          actor: null,
        },
        {
          key: 'takedown_initiated',
          title: 'Takedown Initiated',
          date: activeLeaFollowup?.takedown_initiated_at,
          dateLabel: 'Initiated At:',
          actor: activeLeaFollowup?.takedown_initiated_by_name,
          actorLabel: 'Initiated By:',
          fieldOperationNotes: activeLeaFollowup?.field_operation_notes,
        },
        {
          key: 'closed',
          title: 'Case Closed',
          date: activeLeaFollowup?.closed_at,
          dateLabel: 'Closed At:',
          actor: activeLeaFollowup?.closed_by_name,
          actorLabel: 'Closed By:',
          closingNotes: activeLeaFollowup?.closing_notes,
          closeReason: activeLeaFollowup?.close_reason,
        },
      ];

  return (
    <div className="FdaViewReportExchangeWrap">
      {/* 1. SECTION TOP WITH MOCK CONTROLS */}
      <div className="FdaViewReportSectionTop">
        <span className="FdaViewReportSectionTopTitle">Verification &amp; LEA Enforcement</span>
        {renderMockControls()}
      </div>

      {/* 2. VERIFICATION REQUEST INFORMATION */}
      <div className="FdaRecordInfoGrid FdaViewReportInfoGridWhite">
        <div className="FdaRecordInfoItem">
          <span className="FdaVerifInfoLabel">Verification Request Source</span>
          {/* 🔌 BACKEND: detail.verification.request_source */}
          <span className="FdaVerifInfoValue">{getSourceLabel(activeVerification.request_source || selectedReport.source)}</span>
        </div>
        <div className="FdaRecordInfoItem">
          <span className="FdaVerifInfoLabel">Requesting LEA Officer</span>
          {/* 🔌 BACKEND: detail.verification.requested_by_name */}
          <span className="FdaVerifInfoValue">{activeVerification.requested_by_name || 'N/A'}</span>
        </div>
        <div className="FdaRecordInfoItem">
          <span className="FdaVerifInfoLabel">Date Received</span>
          {/* 🔌 BACKEND: detail.verification.requested_at */}
          <span className="FdaVerifInfoValue">{formatFullDateTime(activeVerification.requested_at)}</span>
        </div>
        <div className="FdaRecordInfoItem">
          <span className="FdaVerifInfoLabel">Product Code / Barcode</span>
          {/* 🔌 BACKEND: detail.verification.product_code */}
          <span className="FdaVerifInfoValue">{activeVerification.product_code || '—'}</span>
        </div>
        <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
          <span className="FdaVerifInfoLabel">Priority Level</span>
          {/* 🔌 BACKEND: detail.verification.priority */}
          <span className="FdaVerifInfoValue">{activeVerification.priority || 'Standard'}</span>
        </div>
      </div>

      {/* 3. OFFICIAL FDA VERIFICATION RESULT (Registered or Unregistered) */}
      {activeVerification.verification_result && activeVerification.verification_result !== 'rejected' && (
        <div className={`FdaRecordResultSection${activeVerification.verification_result === 'unregistered' ? ' FdaRecordUnregisteredResultSection' : ''} FdaViewReportResultSectionSpacing`}>
          <div className="FdaRecordSectionTitle">
            <ShieldCheck size={15} className="FdaVerifGreenIcon" />
            <span>Official FDA Verification Result</span>
          </div>

          <div className="FdaRecordResultRow">
            <span className="FdaVerifInfoLabel">Verification Determination:</span>
            {/* 🔌 BACKEND: detail.verification.verification_result */}
            <span className={`FdaVerifResultTag ${activeVerification.verification_result === 'registered' ? 'FdaVerifTagReg' : 'FdaVerifTagUnreg'}`}>
              {activeVerification.verification_result.charAt(0).toUpperCase() + activeVerification.verification_result.slice(1)}
            </span>
          </div>

          {activeVerification.verification_result === 'registered' ? (
            <div className="FdaRecordInfoGrid FdaViewReportInfoGridWhite">
              <div className="FdaRecordInfoItem">
                <span className="FdaVerifInfoLabel">FDA CPR Number</span>
                {/* 🔌 BACKEND: detail.verification.cpr_number */}
                <span className="FdaVerifInfoValueHighlight">{activeVerification.cpr_number || '—'}</span>
              </div>
              <div className="FdaRecordInfoItem">
                <span className="FdaVerifInfoLabel">CPR Expiry Date</span>
                {/* 🔌 BACKEND: detail.verification.cpr_expiry */}
                <span className="FdaVerifInfoValue">{activeVerification.cpr_expiry || '—'}</span>
              </div>
              <div className="FdaRecordInfoItem">
                <span className="FdaVerifInfoLabel">Verified By</span>
                {/* 🔌 BACKEND: detail.verification.verified_by_name */}
                <span className="FdaVerifInfoValue">{activeVerification.verified_by_name || 'N/A'}</span>
              </div>
              <div className="FdaRecordInfoItem">
                <span className="FdaVerifInfoLabel">Date Responded</span>
                {/* 🔌 BACKEND: detail.verification.responded_at */}
                <span className="FdaVerifInfoValue">{formatFullDateTime(activeVerification.responded_at)}</span>
              </div>
              <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
                <span className="FdaVerifInfoLabel">Official FDA Remarks</span>
                {/* 🔌 BACKEND: detail.verification.response_notes */}
                <p className="FdaRecordRemarksText">{activeVerification.response_notes || '—'}</p>
              </div>
            </div>
          ) : (
            <div className="FdaRecordInfoGrid FdaViewReportInfoGridWhite">
              <div className="FdaRecordInfoItem">
                <span className="FdaVerifInfoLabel">Verified By</span>
                {/* 🔌 BACKEND: detail.verification.verified_by_name */}
                <span className="FdaVerifInfoValue">{activeVerification.verified_by_name || 'N/A'}</span>
              </div>
              <div className="FdaRecordInfoItem">
                <span className="FdaVerifInfoLabel">Date Responded</span>
                {/* 🔌 BACKEND: detail.verification.responded_at */}
                <span className="FdaVerifInfoValue">{formatFullDateTime(activeVerification.responded_at)}</span>
              </div>
              <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
                <span className="FdaVerifInfoLabel">Reason Product is Unregistered</span>
                {/* 🔌 BACKEND: detail.verification.unregistered_reason */}
                <p className="FdaRecordRemarksText">{activeVerification.unregistered_reason || '—'}</p>
              </div>
              <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
                <span className="FdaVerifInfoLabel">FDA Advisory Remarks</span>
                {/* 🔌 BACKEND: detail.verification.response_notes */}
                <p className="FdaRecordRemarksText">{activeVerification.response_notes || '—'}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. REJECTION DETAILS (Only when result is rejected) */}
      {activeVerification.verification_result === 'rejected' && (
        <div className="FdaRecordResultSection FdaRecordRejectedSection FdaViewReportResultSectionSpacing">
          <div className="FdaRecordSectionTitle">
            <XCircle size={15} className="FdaVerifRedIcon" />
            <span>Rejection Details</span>
          </div>

          <div className="FdaRecordInfoGrid FdaViewReportInfoGridWhite">
            <div className="FdaRecordInfoItem">
              <span className="FdaVerifInfoLabel">Rejected By</span>
              {/* 🔌 BACKEND: detail.verification.rejected_by_name */}
              <span className="FdaVerifInfoValue">{activeVerification.rejected_by_name || 'N/A'}</span>
            </div>
            <div className="FdaRecordInfoItem">
              <span className="FdaVerifInfoLabel">Date Rejected</span>
              {/* 🔌 BACKEND: detail.verification.responded_at */}
              <span className="FdaVerifInfoValue">{formatFullDateTime(activeVerification.responded_at)}</span>
            </div>
            <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
              <span className="FdaVerifInfoLabel">Rejection Rationale (Sent to LEA)</span>
              {/* 🔌 BACKEND: detail.verification.rejection_reason */}
              <div className="FdaRecordRejectionReasonBox">
                <p>{activeVerification.rejection_reason || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. LEA FOLLOW-UP PROGRESSION (Stepper & Reminders) */}
      {activeLeaFollowup && (
        <>
          {activeLeaFollowup.reminder_sent_at && (
            <div className="FdaVerif-lea-reminder-card">
              <AlertTriangle size={16} />
              <div>
                {/* 🔌 BACKEND: detail.lea_followup.reminder_sent_at */}
                <strong>LEA Reminder Sent:</strong> LEA officers transmitted an expedited follow-up reminder on{' '}
                {formatFullDateTime(activeLeaFollowup.reminder_sent_at)}.
              </div>
            </div>
          )}

          <div className="FdaVerif-lea-stepper-wrap">
            <span className="FdaVerifInfoLabel FdaViewReportStepperLabel">
              LEA FOLLOW-UP PROGRESSION
            </span>

            <div className="FdaVerif-lea-stepper">
              {stepsConfig.map((step, idx) => {
                const isCompleted = idx < effectiveCurrentIndex;
                const isCurrent = idx === effectiveCurrentIndex;
                const isFuture = idx > effectiveCurrentIndex;

                let stepClass = 'FdaVerif-lea-step';
                if (isCompleted) stepClass += ' is-completed';
                if (isCurrent) stepClass += ' is-current';
                if (isFuture) stepClass += ' is-future';

                return (
                  <div key={step.key} className={stepClass}>
                    <div className="FdaVerif-lea-step-icon">
                      {isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                    </div>
                    <div className="FdaVerif-lea-step-content">
                      <div className="FdaVerif-lea-step-header">
                        <span className="FdaVerif-lea-step-title">
                          {step.title}
                          {isCurrent && <span className="FdaVerif-lea-step-current-tag">Current Stage</span>}
                        </span>
                      </div>

                      {(step.date || step.actor) && (
                        <div className="FdaVerif-lea-step-meta">
                          {step.date && (
                            <span>
                              <Calendar size={12} />
                              <strong>{step.dateLabel}</strong>{' '}
                              {formatFullDateTime(step.date)}
                            </span>
                          )}
                          {step.actor && (
                            <span>
                              <FileText size={12} />
                              <strong>{step.actorLabel}</strong> {step.actor}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Takedown Initiated notes block */}
                      {step.fieldOperationNotes && (
                        <div className="FdaVerif-lea-step-notes">
                          <strong>Field operation status update</strong>
                          {/* 🔌 BACKEND: detail.lea_followup.field_operation_notes */}
                          <p className="FdaVerif-lea-notes-text">{step.fieldOperationNotes}</p>
                        </div>
                      )}

                      {/* Closing notes block */}
                      {step.closingNotes && (
                        <div className="FdaVerif-lea-step-notes FdaVerif-lea-step-notes-closing">
                          <strong>Field operation status update (at closing)</strong>
                          {/* 🔌 BACKEND: detail.lea_followup.closing_notes */}
                          <p className="FdaVerif-lea-notes-text">{step.closingNotes}</p>
                        </div>
                      )}

                      {/* Reason Closed block */}
                      {step.closeReason && (
                        <div className="FdaVerif-lea-step-notes FdaVerif-lea-step-notes-reason">
                          <strong>Reason Closed</strong>
                          {/* 🔌 BACKEND: detail.lea_followup.close_reason */}
                          <p className="FdaVerif-lea-notes-text">{step.closeReason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FDAViewReports() {
  // REPORTS DATABASE STATE
  // CHANGED — was useState(allConsumerReports) from mock data; now fetched
  // from GET /complaints/fda-reports
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState('');

  // SEARCH AND TABS STATE
  const [activeTab, setActiveTab] = useState('Walk-in');
  const [searchQuery, setSearchQuery] = useState('');
  const tabs = ['Walk-in', 'Browser Extension'];
  const location = useLocation();

  useEffect(() => {
    const selectedTab = location.state?.selectedTab;
    if (selectedTab && tabs.includes(selectedTab)) {
      setActiveTab(selectedTab);
      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.selectedTab]);

  // ADDED — GET /complaints/fda-reports on mount
  useEffect(() => {
  setReportsLoading(true);
  apiFetch('/complaints/fda-reports')
    .then(async (res) => {
      if (!res.ok) {
        const msg = await parseBackendError(res);
        setReportsError(msg);
        return;
      }
      return res.json();
    })
    .then((data) => {
      if (data) setReports(data);
    })
    .catch(() => setReportsError('Could not load consumer reports.'))
    .finally(() => setReportsLoading(false));
}, []);

  // EXPANDABLE FILTERS STATE
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');



  // PAGINATION STATE
  const [currentPage, setCurrentPage] = useState(1);

  // SELECTED DETAIL CARD REPORT ID
  const [selectedReportId, setSelectedReportId] = useState(null);

  // ADDED — the list endpoint (FdaComplaintListItem) never had
  // `description` or `attached_files`; those only exist on the DETAIL
  // response (FdaComplaintDetailResponse from GET /complaints/{id}/fda-detail).
  // This is the piece that was missing before — the modal was reading
  // `selectedReport.description` / `selectedReport.documents` off the
  // LIST item, which is why it always showed the "not available yet"
  // fallback text no matter what.
  const [selectedReportDetail, setSelectedReportDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');


 // ADDED — fetch real case detail whenever a row is opened.
useEffect(() => {
  if (!selectedReportId) {
    setSelectedReportDetail(null);
    setDetailError('');
    return;
  }
  let cancelled = false;

  setDetailLoading(true);
  setDetailError('');
  apiFetch(`/complaints/${selectedReportId}/fda-detail`)
    .then(async (res) => {
      if (!res.ok) {
        const msg = await parseBackendError(res);
        if (!cancelled) setDetailError(msg);
        return;
      }
      return res.json();
    })
    .then((data) => {
      if (data && !cancelled) setSelectedReportDetail(data);
    })
    .catch(() => {
      if (!cancelled) setDetailError('Could not load case details.');
    })
    .finally(() => {
      if (!cancelled) setDetailLoading(false);
    });

  return () => { cancelled = true; };
}, [selectedReportId]);

  // DOCUMENT PREVIEW MODAL STATE
  const [previewDoc, setPreviewDoc] = useState(null);
  const [docxHtml, setDocxHtml] = useState('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState(false);

  // ADDED — opens the attachment preview modal for a real backend file.
  // /shared-files/{id}/preview requires a JWT, so a plain <img src=...>
  // or <iframe src=...> pointing straight at that URL would 401 — there's
  // no way to attach an Authorization header to a bare element src.
  // Instead: fetch the bytes ourselves (with the header), turn them into
  // a blob, and hand the existing preview modal a blob: URL — which
  // <img>/<iframe>/mammoth's fetch can all load with no auth needed,
  // since the browser already has the bytes locally at that point.
  const handleViewAttachment = async (doc) => {
  try {
    const res = await apiFetch(`/shared-files/${doc.file_id}/preview`);
    if (!res.ok) {
      const msg = await parseBackendError(res);
      alert(msg || 'Could not open this file.');
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    setPreviewDoc({
      name: doc.file_name,
      type: doc.mime_type,
      size: doc.file_size_display,
      url: blobUrl,
    });
  } catch {
    alert('Could not open this file.');
  }
};

  // ADDED — release the blob URL when the preview modal closes, so we
  // don't leak memory every time someone views a few attachments in a row.
  const closePreview = () => {
    if (previewDoc?.url) {
      URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
  };

  // MAMMOTH DOCX CONVERSION
  useEffect(() => {
    if (!previewDoc) {
      setDocxHtml('');
      setDocxError(false);
      setDocxLoading(false);
      return;
    }

    const isDocx = previewDoc.name?.toLowerCase().endsWith('.docx') || 
                   previewDoc.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (isDocx && previewDoc.url && previewDoc.url !== '#') {
      setDocxLoading(true);
      setDocxError(false);
      fetch(previewDoc.url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then(arrayBuffer => mammoth.convertToHtml({ arrayBuffer }))
        .then(result => {
          setDocxHtml(result.value);
        })
        .catch((err) => {
          console.error('Docx preview error:', err);
          setDocxError(true);
        })
        .finally(() => {
          setDocxLoading(false);
        });
    } else {
      setDocxHtml('');
    }
  }, [previewDoc]);

  // FIND REPORT FOR DETAIL VIEW
  // CHANGED — id field is now complaint_id, not id. Still sourced from the
  // list (`reports`) so the modal header (product name, status badge, etc.)
  // renders instantly without waiting on the detail fetch — only
  // description/attachments wait on selectedReportDetail below.
  const selectedReport = reports.find(r => r.complaint_id === selectedReportId) || null;

  // TAB CLICK WITH VIEW TRANSITION COMPATIBILITY
  const handleTabClick = (tabName) => {
    if (activeTab === tabName) return;
    setCurrentPage(1); // Reset page on tab switch
    setFilterStatus('All'); // status labels differ per tab — don't carry a selection that may not exist on the other tab

    if (!document.startViewTransition) {
      setActiveTab(tabName);
      return;
    }
    document.startViewTransition(() => {
      setActiveTab(tabName);
    });
  };

  // FILTERED DATASET COMPUTATION
  // CHANGED — field names now match FdaComplaintListItem (product_title,
  // manufacturer, case_reference, product_category), and source comparison
  // goes through mapTabToSource since backend uses 'extension'/'walk_in'.
  const filteredReports = reports.filter(report => {
    const tabSource = mapTabToSource(activeTab);
    const matchesTab = report.source === tabSource;

    const query = searchQuery.toLowerCase();
    const matchesSearch = report.product_title.toLowerCase().includes(query) ||
                          (report.manufacturer || '').toLowerCase().includes(query) ||
                          report.case_reference.toLowerCase().includes(query);

    const matchesCategory = filterCategory === 'All' || report.product_category === filterCategory;
    const matchesStatus = filterStatus === 'All' || getWorkflowStatus(report.status, report.source) === filterStatus;

    return matchesTab && matchesSearch && matchesCategory && matchesStatus;
  });

  // COUNT COMPUTATION PER TAB DYNAMICALLY BASED ON CURRENT FILTERS
  const getTabCount = (tabName) => {
    return reports.filter(report => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = report.product_title.toLowerCase().includes(query) ||
                            (report.manufacturer || '').toLowerCase().includes(query) ||
                            report.case_reference.toLowerCase().includes(query);

      const matchesCategory = filterCategory === 'All' || report.product_category === filterCategory;
      const matchesStatus = filterStatus === 'All' || getWorkflowStatus(report.status, report.source) === filterStatus;

      if (!matchesSearch || !matchesCategory || !matchesStatus) return false;

      
      return report.source === mapTabToSource(tabName);
    }).length;
  };

  // PAGINATION COMPUTATION
  const totalItems = filteredReports.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
  const sanitizedPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (sanitizedPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
  const paginatedReports = filteredReports.slice(startIndex, endIndex);



  // EXPORT CSV HANDLER
  // CHANGED — field names updated to match backend; REGION column removed
  // from both headers and row values.
  const handleExportCSV = () => {
    const rowsToExport = filteredReports;

    if (rowsToExport.length === 0) {
      alert("No data available to export.");
      return;
    }

    const headers = ["Case ID", "Product", "Manufacturer", "Category", "Source", "Status", "Date Received"];
    const csvRows = [headers.join(",")];

    for (const report of rowsToExport) {
      const values = [
        report.case_reference,
        `"${report.product_title.replace(/"/g, '""')}"`,
        `"${(report.manufacturer || '').replace(/"/g, '""')}"`,
        `"${(report.product_category || '').replace(/"/g, '""')}"`,
        getSourceLabel(report.source),
        getWorkflowStatus(report.status, report.source),
        // CHANGED — wrapped in ="..." so Excel treats it as literal text,
        // not a date it should reformat (this was the ##### bug)
        `"=""${formatDateTime(report.created_at).replace(/"/g, '""')}"""`
      ];
      csvRows.push(values.join(","));
    }

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const tabSlug = activeTab === 'Browser Extension' ? 'extension' : 'walkin';
    link.setAttribute("download", `fda_${tabSlug}_reports_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // STATUS COLORS STYLING HELPER
    const getStatusStyle = (status) => {
    switch (status) {
      case "under_review":
        return { backgroundColor: "rgba(217, 119, 6, 0.1)", color: "#D97706" };
      case "takedown_requested":
        return { backgroundColor: "rgba(37, 99, 235, 0.1)", color: "#2563EB" };
      case "takedown_initiated":
        return { backgroundColor: "rgba(234, 88, 12, 0.1)", color: "#EA580C" };
      case "completed":
        return { backgroundColor: "rgba(27, 67, 50, 0.1)", color: "#1B4332" };
      case "dismissed":
        return { backgroundColor: "rgba(31, 41, 55, 0.08)", color: "rgba(31, 41, 55, 0.6)" };
      default:
        return { backgroundColor: "#EDEDED", color: "#1F2937" };
    }
  };

    // UNIQUE FILTER OPTIONS COMPUTATION
  const categoriesList = ["All", "Cosmetics", "Food", "Devices", "Drugs"];

  // CHANGED — now depends on activeTab. Walk-in and Extension use the
  // SAME raw status values but different display labels for some of
  // them (completed -> "Takedown Completed" vs "Completed", dismissed
  // -> "Case Closed" vs "Dismissed"), so a single shared list would let
  // someone pick a label that can never match anything on the other tab.
  const statusesList = activeTab === 'Browser Extension'
    ? ["All", "Under Review", "Takedown Requested", "Completed", "Dismissed"]
    : ["All", "Under Review", "Forwarded to LEA", "Operation in Progress", "Takedown Completed", "Case Closed"];

  return (
    <div className="FdaDashboardMain">
      <Sidebar sidebarType="FDA" />
      <div className="FdaContentContainer">
        <TopBar topbarType="FDA" />
        <div className="FdaMainFeed">
          
          {/* HEADER BLOCK */}
          <div className="FdaHeader">
            <div className="FdaHeaderLeft">
              <p className="FdaEyebrow">FDA · Reports</p>
              <h1 className="FdaHeaderTitle">All consumer complaints</h1>
              <p className="FdaSubtitle">
                Centralized record of every submission. Browser-extension and walk-in complaints are classified separately.
              </p>
            </div>
          </div>

          {/* FILTER / SEGMENT ROW */}
          <div className="FdaFilterRow">
            <div className="FdaPillContainer">
              {tabs.map(tab => (
                <button
                  key={tab}
                  className={`FdaPill ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => handleTabClick(tab)}
                >
                  {tab}
                  <span className="FdaPillCount">{getTabCount(tab)}</span>
                </button>
              ))}
            </div>

            <button className="BtnExportCSV" onClick={handleExportCSV}>
              <Download size={16} />
              Export CSV
            </button>
          </div>

          {/* FILTER PANEL */}
          <div className="FdaReportsFilterPanel">
            <div className="FdaSearchWrapper FdaSearchFixed">
              <Search size={16} className="FdaSearchIcon" />
              <input
                type="text"
                placeholder="Search product, manufacturer, ID..."
                className="FdaSearchInput"
                maxLength={150}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className="FdaFilterGroupsRight">
              <div className="FdaFilterGroup">
                <label>Category</label>
                <select
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  {categoriesList.map(cat => (
                    <option key={cat} value={cat}>
                      {cat === 'All' ? 'All Categories' : getCategoryLabel(cat)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="FdaFilterGroup">
                <label>Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  {statusesList.map(stat => (
                    <option key={stat} value={stat}>{stat === 'All' ? 'All Statuses' : stat}</option>
                  ))}
                </select>
              </div>

              {(filterCategory !== 'All' || filterStatus !== 'All' || searchQuery !== '') && (
                <button
                  className="BtnClearFilters"
                  onClick={() => {
                    setFilterCategory('All');
                    setFilterStatus('All');
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>



          {/* MAIN PAGE INTERACTIVE GRID */}
          <div className="FdaLayoutGrid">
            <div className="FdaTableCard">
              <div className="FdaTableWrapper">
                <table className="FdaTable">
                  <thead>
                    <tr>
                      <th>CASE ID</th>
                      <th>PRODUCT</th>
                      <th>MANUFACTURER</th>
                      <th>CATEGORY</th>
                      <th>SOURCE</th>
                      <th>STATUS</th>
                      {/* REMOVED — REGION column */}
                      <th>DATE RECEIVED</th>
                      <th style={{ width: '60px', textAlign: 'center' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* ADDED — loading and error states for the real fetch */}
                    {reportsLoading ? (
                      <tr>
                        <td colSpan="8" className="FdaEmptyState">
                          <p>Loading consumer reports...</p>
                        </td>
                      </tr>
                    ) : reportsError ? (
                      <tr>
                        <td colSpan="8" className="FdaEmptyState">
                          <p>{reportsError}</p>
                        </td>
                      </tr>
                    ) : paginatedReports.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="FdaEmptyState">
                          <Search size={32} />
                          <p>No complaints match your search query or active filter settings.</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedReports.map(report => (
                        <tr 
                          key={report.complaint_id}
                        >
                          <td className="CaseIdCell">{report.case_reference}</td>
                          <td className="ProductNameCell">{report.product_title}</td>
                          <td className="ManufacturerCell">{report.manufacturer || '—'}</td>
                          <td>{getCategoryLabel(report.product_category) || '—'}</td>
                          <td>
                            <span className="FdaSourceBadge">
                              {report.source === "extension" ? (
                                <Globe size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                              ) : (
                                <Footprints size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                              )}
                              {getSourceLabel(report.source)}
                            </span>
                          </td>
                          <td>
                            <span className="FdaBadge" style={getStatusStyle(report.status)}>
                              {getWorkflowStatus(report.status, report.source)}
                            </span>
                          </td>
                          {/* REMOVED — <td>{report.region}</td> */}
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(report.created_at)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="BtnActionView"
                              onClick={() => setSelectedReportId(report.complaint_id)}
                              title="View details"
                            >
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="FdaTableFooter">
                <span className="FdaFooterInfo">
                  Showing {totalItems === 0 ? 0 : startIndex + 1}-{endIndex} of {totalItems} entries
                </span>
                
                <div className="FdaPagination">
                  <button
                    className="BtnPageNav"
                    disabled={sanitizedPage === 1}
                    onClick={() => setCurrentPage(sanitizedPage - 1)}
                  >
                    <ChevronLeft size={14} />
                    Prev
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      className={`FdaPageNumber ${sanitizedPage === page ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    className="BtnPageNav"
                    disabled={sanitizedPage === totalPages}
                    onClick={() => setCurrentPage(sanitizedPage + 1)}
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* DETAIL MODAL OVERLAY */}
          {selectedReport && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent FdaReportsDetailModal" onClick={(e) => e.stopPropagation()}>
                {/* 1. FIXED HEADER */}
                <div className="FdaDetailHeader">
                  <div>
                    <small>Case Details · {selectedReport.case_reference}</small>
                    <h2>{selectedReport.product_title}</h2>
                    <p>{selectedReport.manufacturer || '—'}</p>
                  </div>
                </div>

                {/* 2. SCROLLABLE BODY */}
                <div className="FdaDetailBody">
                  <div className="FdaDetailGrid">
                    {/* CHANGED — Wrapped fetched values in FdaFieldValueBox for bordered read-only box styling */}
                    <div className="FdaDetailItem">
                      <label>Category</label>
                      <span className="FdaFieldValueBox">{getCategoryLabel(selectedReport.product_category) || '—'}</span>
                    </div>
                    {/* REMOVED — Region detail item */}
                    <div className="FdaDetailItem">
                      <label>Source Type</label>
                      <div className="FdaFieldValueBox">
                        <span className="FdaSourceBadge" style={{ width: 'fit-content' }}>
                          {selectedReport.source === "extension" ? (
                            <Globe size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          ) : (
                            <Footprints size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          )}
                          {getSourceLabel(selectedReport.source)}
                        </span>
                      </div>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Current Status</label>
                      <div className="FdaFieldValueBox">
                        <span className="FdaBadge" style={{ ...getStatusStyle(selectedReport.status), width: 'fit-content' }}>
                          {getWorkflowStatus(selectedReport.status, selectedReport.source)}
                        </span>
                      </div>
                    </div>
                    <div className="FdaDetailItem" style={{ gridColumn: 'span 2' }}>
                      <label>Submitted At</label>
                      <span className="FdaFieldValueBox">{formatDateTime(selectedReport.created_at)}</span>
                    </div>
                  </div>

                  {/* CHANGED — description now comes from the real DETAIL
                      fetch (selectedReportDetail), not the list item. Shows
                      a loading/error state while that request is in flight,
                      since it's a separate round trip from the list. */}
                  {detailLoading ? (
                    <div className="FdaDetailDesc">
                      <p>Loading case details…</p>
                    </div>
                  ) : detailError ? (
                    <div className="FdaDetailDesc">
                      <p>{detailError}</p>
                    </div>
                  ) : (
                    <>
                      <div className="FdaDetailDesc">
                        <label>Complaint Description</label>
                        <p>{selectedReportDetail?.description || 'No description provided.'}</p>
                      </div>

                      <div className="FdaDetailAttachments">
                        <label>Attached Files / Evidence</label>
                        {selectedReportDetail?.attached_files && selectedReportDetail.attached_files.length > 0 ? (
                          <div className="FdaVerifDocsGrid">
                            {selectedReportDetail.attached_files.map(doc => {
                              // CHANGED — real field names from SharedFileResponse:
                              // file_id / file_name / mime_type / file_size_display
                              // (not id / name / type / size / url like the mock data).
                              const isImage = doc.mime_type?.startsWith('image/') ||
                                /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name || '');
                              return (
                                <div className="FdaVerifDocCard" key={doc.file_id}>
                                  <div className="FdaVerifDocIcon">
                                    {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                                  </div>
                                  <div className="FdaVerifDocInfo">
                                    <p className="FdaVerifDocName" title={doc.file_name}>{doc.file_name}</p>
                                    <span className="FdaVerifDocMeta">{doc.file_size_display}</span>
                                  </div>
                                  <div className="FdaVerifDocActions">
                                    <button
                                      className="FdaVerifDocActionBtn"
                                      title="Inspect Attachment"
                                      onClick={() => handleViewAttachment(doc)}
                                    >
                                      <Eye size={13} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="FdaVerifNoDocsText">No files or evidence were attached to this complaint.</p>
                        )}
                      </div>

                      {/* ADDED — Full FDA-LEA Verification Exchange for Walk-in cases */}
                      {selectedReport.source === 'walk_in' && (
                        <FdaWalkInVerificationExchange
                          selectedReport={selectedReport}
                          selectedReportDetail={selectedReportDetail}
                        />
                      )}
                    </>
                  )}
                </div>

                {/* 3. FIXED FOOTER */}
                <div className="FdaDetailFooter">
                  <button
                    className="FdaVerifBtnModalCancel"
                    onClick={() => setSelectedReportId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ATTACHMENT PREVIEW MODAL — unchanged UI, now fed a real blob: URL
          from handleViewAttachment above instead of mock doc.url values. */}
      {previewDoc && (
        <div className="FdaVerifModalOverlay" role="dialog" aria-modal="true" style={{ zIndex: 1000 }}>
          <div className="FdaVerifDocModalContainer">
            <div className="FdaVerifDocModalHeader">
              <div className="FdaVerifDocModalTitleGroup">
                <Paperclip size={18} className="FdaVerifGreenIcon" />
                <div>
                  <h3>{previewDoc.name}</h3>
                  <p className="FdaVerifDocModalMeta">
                    {previewDoc.type || 'Document'}{previewDoc.size ? ` \u2022 ${previewDoc.size}` : ''}
                  </p>
                </div>
              </div>
              <button
                className="FdaVerifIconButton"
                onClick={closePreview}
              >
                <X size={18} />
              </button>
            </div>

            <div className="FdaVerifDocModalBody">
              {(previewDoc.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(previewDoc.name || '')) ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.name}
                  className="FdaVerifDocImagePreview"
                />
              ) : (previewDoc.type === 'application/pdf' || /\.pdf$/i.test(previewDoc.name || '')) ? (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.name}
                  className="FdaVerifDocPdfPreview"
                />
              ) : (previewDoc.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(previewDoc.name || '')) ? (
                docxLoading ? (
                  <div className="FdaVerifDocPlaceholderPreview">
                    <p className="FdaVerifPreviewText">Converting Word document for preview&hellip;</p>
                  </div>
                ) : docxError ? (
                  <div className="FdaVerifDocPlaceholderPreview">
                    <FileText size={48} className="FdaVerifDocPreviewIcon" />
                    <p className="FdaVerifPreviewTitle">Could not render Word preview</p>
                    <p className="FdaVerifPreviewText">Try downloading the document to view its full contents.</p>
                  </div>
                ) : (
                  <div className="FdaVerifDocDocxPreview">
                    <div
                      className="FdaVerifDocxContent"
                      dangerouslySetInnerHTML={{ __html: docxHtml }}
                    />
                  </div>
                )
              ) : (
                <div className="FdaVerifDocPlaceholderPreview">
                  <FileText size={48} className="FdaVerifDocPreviewIcon" />
                  <p className="FdaVerifPreviewTitle">Preview not supported</p>
                  <p className="FdaVerifPreviewText">
                    <strong>{previewDoc.name}</strong> can't be previewed inline &mdash; use download instead.
                  </p>
                </div>
              )}
            </div>

            <div className="FdaVerifModalFooter">
              <button
                className="FdaVerifBtnOutline"
                onClick={closePreview}
              >
                Close Preview
              </button>
              <button
                className="FdaVerifBtnDownloadAttachment"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = previewDoc.url;
                  a.download = previewDoc.name;
                  a.click();
                }}
              >
                <Download size={14} />
                <span>Download Attachment</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default FDAViewReports;