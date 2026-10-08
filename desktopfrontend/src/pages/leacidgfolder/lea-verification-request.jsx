import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import mammoth from 'mammoth';
import './lea-css.css'
import Sidebar from '../component/sidebar'
import TopBar from '../component/top-bar'
import {
  Clock3,
  BellRing,
  SquarePen,
  XCircle,
  Inbox,
  Siren,
  Archive,
  Search,
  Filter,
  Calendar,
  Paperclip,
  FileText,
  Eye,
  X,
  Download,
  Image as ImageIcon,
  Trash2,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

import { apiFetch } from '../../utils/apiFetch';
// ADDED — processing overlay
import { useProcessing } from '../../utils/useProcessing';
import ProcessingOverlay from '../component/processing-overlay';

// Helper: reads a FastAPI error response body and returns a single readable string.
// Handles both { "detail": "string" } and { "detail": [{ "msg": "...", ... }, ...] }
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

// Helper: format an ISO datetime string to a readable local date/time
function formatDateTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ADDED — converts raw backend source values into readable labels
function GetSourceLabel(source) {
  if (source === 'walk_in') return 'Walk-in Intake';
  if (source === 'extension') return 'Browser Extension';
  return source;
}







// ADDED (Part 1) — maps the human-readable dropdown option to the backend enum value
function mapReasonClosedToBackend(value) {
  if (value === 'Registered') return 'registered';
  if (value === 'Rejected by FDA') return 'rejected';
  if (value === 'Completed') return 'completed';
  return '';
}
// ADDED (Part 1) — renders the backend enum value as a human-readable label
function getReasonClosedLabel(reason) {
  if (reason === 'registered') return 'Registered';
  if (reason === 'rejected') return 'Rejected by FDA';
  if (reason === 'completed') return 'Completed';
  return reason;
}
// ADDED (Part 1) — returns the CSS className for the reason badge
function getReasonClosedClass(reason) {
  if (reason === 'registered') return 'ReasonRegistered';
  if (reason === 'completed') return 'ReasonCompleted';
  return 'ReasonRejected';
}

const USE_LEA_PROCESS_MOCK = true; // ⚠️ REMOVE THIS

const MOCK_INTAKE_FILES = [
  {
    file_id: 'mock-intake-doc-1',
    file_name: 'Packaging_Front_Back_Evidence.jpg',
    mime_type: 'image/jpeg',
    file_size_display: '1.2 MB',
    isMock: true,
  },
  {
    file_id: 'mock-intake-doc-2',
    file_name: 'Official_Receipt_Purchase_Proof.pdf',
    mime_type: 'application/pdf',
    file_size_display: '420 KB',
    isMock: true,
  },
];

const MOCK_RESPONSE_FILES = [
  {
    file_id: 'mock-fda-response-1',
    file_name: 'FDA_Laboratory_Verification_Report.pdf',
    mime_type: 'application/pdf',
    file_size_display: '312 KB',
    isMock: true,
  },
  {
    file_id: 'mock-fda-response-2',
    file_name: 'FDA_Post_Marketing_Surveillance_Notice.pdf',
    mime_type: 'application/pdf',
    file_size_display: '185 KB',
    isMock: true,
  },
];

function getMergedResponseData(realData) {
  if (!realData) return null;
  if (!USE_LEA_PROCESS_MOCK) return realData;

  return {
    ...realData,
    product_code: realData.product_code ?? 'NN-100000847291',
    priority: realData.priority ?? 'standard',
    notes_to_fda: realData.notes_to_fda ?? realData.complaint_statement ?? 'Cosmetic product reported for lack of mandatory FDA CPR / notification markings on retail packaging.',
    attached_files: realData.attached_files ?? MOCK_INTAKE_FILES,
    // 🔌 BACKEND: expected field - response_files (list of SharedFileResponse), FDA's own upload when responding, kept separate from attached_files (the intake evidence).
    response_files: realData.response_files ?? MOCK_RESPONSE_FILES,
  };
}

function getMergedInitiatedData(realData) {
  if (!realData) return null;
  if (!USE_LEA_PROCESS_MOCK) return realData;

  return {
    ...realData,
    // 🔌 BACKEND: GET /complaints/initiated/{id} does not return product_code, priority or notes_to_fda yet (it returns attached_files). Mock fills them while the flag is on.
    product_code: realData.product_code ?? 'BARCODE-480901238491',
    priority: realData.priority ?? 'urgent',
    notes_to_fda: realData.notes_to_fda ?? realData.complaint_statement ?? 'Product advertised as fast-acting whitening lotion without FDA notification. Suspected unregistered chemical formulation.',
    attached_files: realData.attached_files ?? MOCK_INTAKE_FILES,
    verified_by_name: realData.verified_by_name ?? realData.verifier_name ?? 'Officer Teresa Ramos, FDA-CCHH',
    responded_at: realData.responded_at ?? '2026-04-02T16:30:00Z',
    unregistered_reason: realData.unregistered_reason ?? 'Product has no valid Certificate of Product Registration (CPR) or Notification of Cosmetic Product on FDA database.',
    response_notes: realData.response_notes ?? realData.notes ?? 'FDA Advisory recommends immediate seizure of stocks and issuance of Cease and Desist order to unauthorized retailers.',
    // 🔌 BACKEND: expected field - response_files (list of SharedFileResponse)
    response_files: realData.response_files ?? MOCK_RESPONSE_FILES,
  };
}

// 🔌 BACKEND: needs a closed-case detail endpoint returning the verification request, FDA response, response_files, takedown_initiated_at/by, field_operation_notes, closed_at/by.
function getMergedClosedModalData(realData, detailData) {
  if (!realData) return null;
  const merged = { ...realData, ...(detailData || {}) };
  if (!USE_LEA_PROCESS_MOCK) return merged;

  const reason = realData.reason_closed;

  let mockSpecific = {};
  if (reason === 'registered') {
    mockSpecific = {
      product_code: merged.product_code ?? 'NN-100000928371',
      priority: merged.priority ?? 'standard',
      requested_by_name: merged.requested_by_name ?? merged.requested_by ?? 'Agent R. Santos, CIDG',
      requested_at: merged.requested_at ?? '2026-04-10T08:30:00Z',
      notes_to_fda: merged.notes_to_fda ?? merged.complaint_statement ?? 'Verification of product notification for Philippine market distribution.',
      attached_files: merged.attached_files ?? MOCK_INTAKE_FILES,
      verifier_name: merged.verifier_name ?? merged.verified_by_name ?? 'Analyst Maria Clara Cruz, FDA-CCHH',
      responded_at: merged.responded_at ?? '2026-04-12T14:15:00Z',
      cpr_number: merged.cpr_number ?? 'NN-100000928371',
      cpr_expiry: merged.cpr_expiry ?? '2028-11-20',
      response_notes: merged.response_notes ?? merged.notes ?? 'Product found validly registered and compliant under ASEAN Cosmetic Directive.',
      response_files: merged.response_files ?? MOCK_RESPONSE_FILES,
      lea_acknowledged_at: merged.lea_acknowledged_at ?? '2026-04-13T09:00:00Z',
      acknowledged_by_name: merged.acknowledged_by_name ?? merged.closed_by_name ?? 'Agent R. Santos, CIDG',
    };
  } else if (reason === 'rejected') {
    mockSpecific = {
      product_code: merged.product_code ?? 'NN-100000412850',
      priority: merged.priority ?? 'high',
      requested_by_name: merged.requested_by_name ?? merged.requested_by ?? 'Agent J. Bautista, CIDG',
      requested_at: merged.requested_at ?? '2026-04-05T10:00:00Z',
      notes_to_fda: merged.notes_to_fda ?? merged.complaint_statement ?? 'Urgent complaint filed regarding suspected adulteration with hydroquinone.',
      attached_files: merged.attached_files ?? MOCK_INTAKE_FILES,
      verifier_name: merged.verifier_name ?? merged.rejected_by_name ?? 'Evaluator Juan Mercado, FDA-CCHH',
      responded_at: merged.responded_at ?? '2026-04-06T11:45:00Z',
      rejection_reason: merged.rejection_reason ?? 'Insufficient sample information: Batch/lot number not provided in submission evidence. Please re-submit with clear photos of manufacturing stamp.',
      response_files: null,
      lea_acknowledged_at: merged.lea_acknowledged_at ?? '2026-04-07T13:20:00Z',
      acknowledged_by_name: merged.acknowledged_by_name ?? merged.closed_by_name ?? 'Agent J. Bautista, CIDG',
    };
  } else {
    mockSpecific = {
      product_code: merged.product_code ?? 'BARCODE-480901238491',
      priority: merged.priority ?? 'urgent',
      requested_by_name: merged.requested_by_name ?? merged.requested_by ?? 'Agent E. Dela Cruz, CIDG',
      requested_at: merged.requested_at ?? '2026-04-01T09:15:00Z',
      notes_to_fda: merged.notes_to_fda ?? merged.complaint_statement ?? 'Suspected counterfeit whitening serum marketed online without FDA authorization.',
      attached_files: merged.attached_files ?? MOCK_INTAKE_FILES,
      verifier_name: merged.verifier_name ?? merged.verified_by_name ?? 'Officer Teresa Ramos, FDA-CCHH',
      responded_at: merged.responded_at ?? '2026-04-02T16:30:00Z',
      unregistered_reason: merged.unregistered_reason ?? 'Product has no valid Certificate of Product Registration (CPR) or Notification of Cosmetic Product on FDA database.',
      response_notes: merged.response_notes ?? merged.notes ?? 'FDA Advisory No. 2026-048 recommends immediate seizure of stocks and issuance of Cease and Desist order to unauthorized retailers.',
      response_files: merged.response_files ?? MOCK_RESPONSE_FILES,
      lea_acknowledged_at: merged.lea_acknowledged_at ?? '2026-04-03T10:00:00Z',
      acknowledged_by_name: merged.acknowledged_by_name ?? 'Agent E. Dela Cruz, CIDG',
      takedown_initiated_at: merged.takedown_initiated_at ?? '2026-04-03T11:30:00Z',
      takedown_initiated_by_name: merged.takedown_initiated_by_name ?? 'Agent E. Dela Cruz, CIDG',
      field_operation_notes: merged.field_operation_notes ?? 'Joint operation executed with local CIDG field unit at warehouse facility in Tondo, Manila. Confiscated 250 units of unregistered cosmetics. Administrative summons served.',
    };
  }

  return {
    ...merged,
    ...mockSpecific,
  };
}

// Frontend queue pagination helper — matches the existing project .Pagination / .BtnPage design
function QueuePagination({ currentPage, totalPages, onPageChange }) {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const safeCurrentPage = Math.min(Math.max(1, currentPage || 1), safeTotalPages);
  // Build page number list (max 5 visible)
  const pageStart = Math.max(1, Math.min(safeCurrentPage - 2, safeTotalPages - 4));
  const pageEnd = Math.min(safeTotalPages, pageStart + 4);
  const pages = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i);
  return (
    <div className="LeaVerifQueuePagination">
      <span className="LeaVerifQueuePageInfo">
        Page {safeCurrentPage} of {safeTotalPages}
      </span>
      <div className="LeaVerifQueuePaginationControls">
        <button
          type="button"
          className="LeaVerifQueuePageBtn"
          disabled={safeCurrentPage <= 1}
          onClick={() => onPageChange(safeCurrentPage - 1)}
        >
          &lsaquo; Prev
        </button>
        {pages.map((pg) => (
          <button
            key={pg}
            type="button"
            className={`LeaVerifQueuePageNum${safeCurrentPage === pg ? ' active' : ''}`}
            onClick={() => onPageChange(pg)}
          >
            {pg}
          </button>
        ))}
        <button
          type="button"
          className="LeaVerifQueuePageBtn"
          disabled={safeCurrentPage >= safeTotalPages}
          onClick={() => onPageChange(safeCurrentPage + 1)}
        >
          Next &rsaquo;
        </button>
      </div>
    </div>
  );
}

// ADDED — pure display fallback helper: null, undefined, empty, or whitespace-only returns '—'
function formatComplainantDisplayValue(val) {
  if (val == null) return '—';
  const str = String(val).trim();
  return str.length > 0 ? str : '—';
}

// ADDED — child component for display-only complainant intake details with local fetch and stale-response guard
function LeaComplainantDetails({ complaintId, complainantName }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!complaintId) {
      setLoading(false);
      setError(false);
      setData(null);
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setError(false);
    setData(null);

    // 🔌 BACKEND: walkin-detail currently has no LEA role check. Backend must restrict it to LEA roles.
    apiFetch(`/complaints/${complaintId}/walkin-detail`)
      .then(async (res) => {
        if (isCancelled) return;
        if (res.status === 404) {
          // 404 or empty record: show '—' for all fields without an error message
          setData(null);
          setError(false);
          return;
        }
        if (!res.ok) {
          setError(true);
          setData(null);
          return;
        }
        const json = await res.json();
        if (isCancelled) return;
        setData(json);
        setError(false);
      })
      .catch(() => {
        if (!isCancelled) {
          setError(true);
          setData(null);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [complaintId]);

  return (
    <div className="LeaComplainantDetailsSection">
      <h6 className="LeaComplainantDetailsTitle">Complainant Details (LEA only, not sent to FDA)</h6>
      {error && !loading && (
        <p className="LeaComplainantError">Could not load</p>
      )}
      <div className="LeaComplainantGrid">
        {/* ADDED — Full Name row spanning both columns */}
        <div className="LeaComplainantField LeaComplainantFieldFullWidth">
          <label className="LeaComplainantLabel">FULL NAME</label>
          <div className="LeaComplainantValueBox">
            {formatComplainantDisplayValue(complainantName)}
          </div>
        </div>
        <div className="LeaComplainantField">
          <label className="LeaComplainantLabel">CONTACT NUMBER</label>
          <div className="LeaComplainantValueBox">
            {loading ? 'Loading…' : formatComplainantDisplayValue(data?.contact_number)}
          </div>
        </div>
        <div className="LeaComplainantField">
          <label className="LeaComplainantLabel">EMAIL</label>
          <div className="LeaComplainantValueBox">
            {loading ? 'Loading…' : formatComplainantDisplayValue(data?.email)}
          </div>
        </div>
        <div className="LeaComplainantField">
          <label className="LeaComplainantLabel">ADDRESS</label>
          <div className="LeaComplainantValueBox">
            {loading ? 'Loading…' : formatComplainantDisplayValue(data?.address)}
          </div>
        </div>
        <div className="LeaComplainantField">
          <label className="LeaComplainantLabel">ID PRESENTED</label>
          <div className="LeaComplainantValueBox">
            {loading ? 'Loading…' : formatComplainantDisplayValue(data?.id_type)}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaVerificationRequest() {
  const proc = useProcessing(); // ADDED — processing overlay state

  const navigate = useNavigate();
  const location = useLocation();

  // NOTE: Active tab state (defaults to 'Ready to Send')
  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || 'Ready to Send'
  );
  const [selectedResponse, setSelectedResponse] = useState(null);

  // FDA Response States
  const [fdaResponseList, setFdaResponseList] = useState([]);
  const [fdaResponseLoading, setFdaResponseLoading] = useState(false);
  const [selectedResponseId, setSelectedResponseId] = useState(null);
  const [responseDetailLoading, setResponseDetailLoading] = useState(false);
  const [hasLoadedFdaResponseOnce, setHasLoadedFdaResponseOnce] = useState(false);

  // Initiated Cases States
  const [initiatedList, setInitiatedList] = useState([]);
  const [initiatedLoading, setInitiatedLoading] = useState(false);
  const [selectedInitiatedId, setSelectedInitiatedId] = useState(null);
  const [selectedInitiatedCase, setSelectedInitiatedCase] = useState(null);
  const [initiatedDetailLoading, setInitiatedDetailLoading] = useState(false);
  const [hasLoadedInitiatedOnce, setHasLoadedInitiatedOnce] = useState(false);
  const tabs = ['Ready to Send', 'Awaiting FDA', 'FDA Response', 'Initiated Cases', 'Closed Cases'];
  const handleTabClick = (tabName) => {
    if (activeTab === tabName) return;

    if (!document.startViewTransition) {
      setActiveTab(tabName);
      return;
    }
    document.startViewTransition(() => {
      setActiveTab(tabName);
    })
  }

  // NOTE: States for new form inputs
  // BACKEND: priority maps to priority column in verification_requests table
  const [priority, setPriority] = useState('standard');
  // CHANGED (Part 0) — split shared fieldOperationNotes into two independent variables
  //   to prevent notes typed in one tab from bleeding into the other.
  const [fdaTakedownNotes, setFdaTakedownNotes] = useState('');       // FDA Response — Initiate Takedown textarea; always blank per new selection
  const [initiatedFieldNotes, setInitiatedFieldNotes] = useState(''); // Initiated Cases — progress note textarea; pre-filled from field_operation_notes
  // BACKEND: maps to notes_to_fda / complaint_statement in verification_requests
  // CHANGED: removed hardcoded default — now starts empty
  const [complaintStatement, setComplaintStatement] = useState('');
  // BACKEND: maps to product_code in verification_requests
  const [productCode, setProductCode] = useState('');

  // MERGED-ADD — search & category filter state for Ready to Send / Awaiting FDA / FDA Response / Initiated Cases queues
  const [readySearch, setReadySearch] = useState('');
  const [readyCategory, setReadyCategory] = useState('');
  const [awaitingSearch, setAwaitingSearch] = useState('');
  const [awaitingCategory, setAwaitingCategory] = useState('');
  const [responseSearch, setResponseSearch] = useState('');
  const [responseCategory, setResponseCategory] = useState('');
  const [initiatedSearch, setInitiatedSearch] = useState('');
  const [initiatedCategory, setInitiatedCategory] = useState('');

  // Frontend-only queue pagination states (10 items per page)
  const QUEUE_PAGE_SIZE = 10;
  const [readyPage, setReadyPage] = useState(1);
  const [awaitingPage, setAwaitingPage] = useState(1);
  const [responsePage, setResponsePage] = useState(1);
  const [initiatedPage, setInitiatedPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);
  // ADDED (Part 1) — Closed Cases server-side state (replaces removed dummy dismissedCases array)
  const [closedList, setClosedList] = useState([]);
  const [closedTotal, setClosedTotal] = useState(0);
  const [closedLoading, setClosedLoading] = useState(false);
  const [hasLoadedClosedOnce, setHasLoadedClosedOnce] = useState(false);
  const CLOSED_PAGE_SIZE = 25;

  // Reset to page 1 whenever search, category, or active tab changes
  useEffect(() => { setReadyPage(1); }, [readySearch, readyCategory, activeTab]);
  useEffect(() => { setAwaitingPage(1); }, [awaitingSearch, awaitingCategory, activeTab]);
  useEffect(() => { setResponsePage(1); }, [responseSearch, responseCategory, activeTab]);
  useEffect(() => { setInitiatedPage(1); }, [initiatedSearch, initiatedCategory, activeTab]);

  // NOTE: States for Dismissed Cases tab filters
  const [dismissedSearch, setDismissedSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterReasonClosed, setFilterReasonClosed] = useState('');
  useEffect(() => { setClosedPage(1); }, [dismissedSearch, filterCategory, filterReasonClosed, filterDateFrom, filterDateTo, activeTab]);

  // NOTE: Modal overlay, success alert, and read-only details modal states
  const [modalConfig, setModalConfig] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [viewCaseModalData, setViewCaseModalData] = useState(null);
  const [closedModalDetail, setClosedModalDetail] = useState(null);
  const [closedModalLoading, setClosedModalLoading] = useState(false);
  const [closedModalError, setClosedModalError] = useState(false);


  // TAB 1: Ready to Send
  const [readyList, setReadyList] = useState([]);
  const [readyLoading, setReadyLoading] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(null);


  //  TAB 2: Awaiting FDA
  const [awaitingList, setAwaitingList] = useState([]);
  const [awaitingLoading, setAwaitingLoading] = useState(false);
  const [selectedAwaitingFda, setSelectedAwaitingFda] = useState(null);

  // ADDED — doc preview modal state, mirrors the FDA-side implementation.
  // docPreviewModal holds the clicked attachment object (file_id, file_name, mime_type, file_size_display).
  // docPreviewUrl holds a blob object URL (revoked on close); Loading/Error track the in-flight fetch.
  const [docPreviewModal, setDocPreviewModal] = useState(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState(false);
  const [docxHtml, setDocxHtml] = useState('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState(false);

  // ADDED — real counts for the 3 top stat cards, replaces the dummy-array .length
  const [leaCounts, setLeaCounts] = useState({ fda_response_count: 0, initiated_count: 0, dismissed_count: 0 });

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };
  const showError = (msg) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 4000);
  };

  // ADDED — GET /complaints/awaiting-verification-request
  //Fetch: Ready to Send list 
  // ADDED — ref tracks first successful load so re-visits skip the skeleton (BUG 1 fix)
  const [hasLoadedReadyOnce, setHasLoadedReadyOnce] = useState(false);

  // CHANGED — only shows skeleton loading on first load, not every tab revisit (BUG 1 fix)
  const fetchReadyList = async () => {
    if (!hasLoadedReadyOnce) {
      setReadyLoading(true);
    }
    try {
      const res = await apiFetch('/complaints/awaiting-verification-request');
      if (!res.ok) {
        const msg = await parseBackendError(res);
        showError(msg);
        return;
      }
      const data = await res.json();
      setReadyList(data);
      setHasLoadedReadyOnce(true);
    } catch {
      showError('Could not load the ready-to-send list.');
    } finally {
      setReadyLoading(false);
    }
  };

  // ADDED — GET /complaints/{id}/verification-detail
  //Fetch: complaint verification detail (right panel) 
  // CHANGED — no longer blanks right panel on every card click (BUG 2 fix)
  const fetchComplaintDetail = async (complaintId) => {
    setProductCode('');
    setPriority('standard');
    setComplaintStatement('');
    // Only show the loading message if nothing is currently displayed —
    // otherwise keep the previous case visible while this one loads.
    if (!selectedComplaint) {
      setDetailLoading(true);
    }
    try {
      const res = await apiFetch(`/complaints/${complaintId}/verification-detail`);
      if (!res.ok) {
        const msg = await parseBackendError(res);
        showError(msg);
        return;
      }
      const data = await res.json();
      setSelectedComplaint(data);
    } catch {
      showError('Could not load complaint details.');
    } finally {
      setDetailLoading(false);
    }
  };

  // ADDED — GET /verification-requests/awaiting-fda
  // Fetch: Awaiting FDA list
  const fetchAwaitingList = async () => {
    setAwaitingLoading(true);
    try {
      const res = await apiFetch('/verification-requests/awaiting-fda');
      if (!res.ok) {
        const msg = await parseBackendError(res);
        showError(msg);
        return;
      }
      const data = await res.json();
      setAwaitingList(data);
      if (data.length > 0 && !selectedAwaitingFda) {
        setSelectedAwaitingFda(data[0]);
      }
    } catch {
      showError('Could not load awaiting FDA list.');
    } finally {
      setAwaitingLoading(false);
    }
  };

  // ADDED — GET /verification-requests/fda-response
  // Fetch: FDA Response list — replaces the old dummy responseCases array
  const fetchFdaResponseList = async () => {
    if (!hasLoadedFdaResponseOnce) {
      setFdaResponseLoading(true);
    }
    try {
      const res = await apiFetch('/verification-requests/fda-response');
      if (!res.ok) {
        const msg = await parseBackendError(res);
        showError(msg);
        return;
      }
      const data = await res.json();
      setFdaResponseList(data);
      setHasLoadedFdaResponseOnce(true);
      // Auto-select the first item if nothing is currently selected, or if
      // the currently selected item no longer exists in the refreshed list.
      if (data.length > 0 && !data.some((item) => item.request_id === selectedResponseId)) {
        setSelectedResponseId(data[0].request_id);
      } else if (data.length === 0) {
        setSelectedResponseId(null);
        setSelectedResponse(null);
      }
    } catch {
      showError('Could not load the FDA Response list.');
    } finally {
      setFdaResponseLoading(false);
    }
  };

  // ADDED — fetches the real counts for the FDA Response / Initiated / Dismissed stat cards
  const fetchLeaCounts = async () => {
    try {
      const res = await apiFetch('/verification-requests/lea-counts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLeaCounts(data);
    } catch (err) {
      console.error('Failed to fetch LEA verification counts:', err);
    }
  };

  useEffect(() => {
    fetchLeaCounts();
  }, []);

  // ADDED — loads existing draft when arriving via Edit Draft navigation
  // ─── On mount: handle "Edit Draft" navigation state ──────────────────────
  useEffect(() => {
    const draftId = location.state?.draftId;
    if (draftId) {
      setCurrentDraftId(draftId);
      setActiveTab('Ready to Send');
      apiFetch(`/drafts/verification/${draftId}`)
        .then(async (res) => {
          if (!res.ok) {
            const msg = await parseBackendError(res);
            showError(msg);
            return;
          }
          const data = await res.json();
          if (data.product_code != null) setProductCode(data.product_code);
          if (data.priority) setPriority(data.priority);
          if (data.notes_to_fda != null) setComplaintStatement(data.notes_to_fda);
          if (data.complaint) setSelectedComplaint(data.complaint);
        })
        .catch(() => showError('Could not load draft details.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ADDED — GET /complaints/initiated
  // Fetch: Initiated Cases list — replaces the old dummy initiatedCases array
  const fetchInitiatedList = async () => {
    if (!hasLoadedInitiatedOnce) {
      setInitiatedLoading(true);
    }
    try {
      const res = await apiFetch('/complaints/initiated');
      if (!res.ok) {
        const msg = await parseBackendError(res);
        showError(msg);
        return;
      }
      const data = await res.json();
      setInitiatedList(data);
      setHasLoadedInitiatedOnce(true);
      if (data.length > 0 && !data.some((item) => item.complaint_id === selectedInitiatedId)) {
        setSelectedInitiatedId(data[0].complaint_id);
      } else if (data.length === 0) {
        setSelectedInitiatedId(null);
        setSelectedInitiatedCase(null);
      }
    } catch {
      showError('Could not load the Initiated Cases list.');
    } finally {
      setInitiatedLoading(false);
    }
  };

  // ─── Fetch lists when tabs become active ─────────────────────────────────
  // CHANGED — added FDA Response + Initiated Cases branches to the tab-switch effect
  useEffect(() => {
    if (activeTab === 'Ready to Send') {
      fetchReadyList();
    } else if (activeTab === 'Awaiting FDA') {
      fetchAwaitingList();
    } else if (activeTab === 'FDA Response') {
      fetchFdaResponseList();
    } else if (activeTab === 'Initiated Cases') {
      fetchInitiatedList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ADDED — fetches right-panel detail whenever selectedResponseId changes; keeps previous
  //          detail visible during the new fetch (no flicker, same pattern as BUG 2 fix)
  useEffect(() => {
    if (!selectedResponseId) return;
    // CHANGED (Part 0) — always reset the Initiate Takedown textarea on each new selection;
    // this note is for a brand-new action, not existing saved data.
    setFdaTakedownNotes('');

    // Only show the loading state if nothing is currently displayed —
    // keep the previous detail visible while the new one loads.
    if (!selectedResponse) {
      setResponseDetailLoading(true);
    }
    apiFetch(`/verification-requests/fda-response/${selectedResponseId}`)
      .then(async (res) => {
        if (!res.ok) {
          const msg = await parseBackendError(res);
          showError(msg);
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setSelectedResponse(data);
        // NOTE: fieldOperationNotes is intentionally NOT pre-filled here —
        // the Initiate Takedown textarea always starts blank for a new note.
      })
      .catch(() => showError('Could not load FDA response details.'))
      .finally(() => setResponseDetailLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResponseId]);

  // ADDED — fetches Initiated Cases right-panel detail whenever selectedInitiatedId changes.
  //          Pre-fills fieldOperationNotes with the existing note so the officer can review/append.
  useEffect(() => {
    if (!selectedInitiatedId) return;
    if (!selectedInitiatedCase) {
      setInitiatedDetailLoading(true);
    }
    apiFetch(`/complaints/initiated/${selectedInitiatedId}`)
      .then(async (res) => {
        if (!res.ok) {
          const msg = await parseBackendError(res);
          showError(msg);
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setSelectedInitiatedCase(data);
          // CHANGED (Part 0) — pre-fill initiatedFieldNotes (not the old shared fieldOperationNotes)
          setInitiatedFieldNotes(data.field_operation_notes || '');
        }
      })
      .catch(() => showError('Could not load case details.'))
      .finally(() => setInitiatedDetailLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInitiatedId]);

  // Fetch extra detail fields (product_code, complaint_statement) for the selected
  // Awaiting FDA request — the lean list response from GET /verification-requests/awaiting-fda
  // does not include these fields. Merges them into selectedAwaitingFda so the right panel
  // can display them. Silently falls back to '—' if the fetch fails.
  useEffect(() => {
    if (!selectedAwaitingFda?.request_id) return;
    apiFetch(`/verification-requests/${selectedAwaitingFda.request_id}`)
      .then(async (res) => {
        if (!res.ok) return;
        return res.json();
      })
      .then((data) => {
        if (data) {
          setSelectedAwaitingFda((prev) => ({
            ...prev,
            product_code: data.product_code,
            complaint_statement: data.complaint_statement,
          }));
        }
      })
      .catch(() => { }); // fields will display '—' as fallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAwaitingFda?.request_id]);

  // ADDED (Part 1) — server-side fetch for Closed Cases tab.
  // Search input is debounced (300ms); all other filter/page changes fire immediately.
  // ADDED — GET /verification-requests/closed-cases
  // Fetch: Closed Cases list
  const fetchClosedList = async () => {
    if (!hasLoadedClosedOnce) {
      setClosedLoading(true);
    }

    const params = new URLSearchParams();
    if (dismissedSearch.trim()) params.set('search', dismissedSearch.trim());
    if (filterCategory) params.set('category', filterCategory);
    const reasonClosedParam = mapReasonClosedToBackend(filterReasonClosed);
    if (reasonClosedParam) params.set('reason_closed', reasonClosedParam);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    params.set('page', String(closedPage));
    params.set('page_size', String(CLOSED_PAGE_SIZE));

    try {
      const res = await apiFetch(`/verification-requests/closed-cases?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClosedList(data.items);
      setClosedTotal(data.total);
      setHasLoadedClosedOnce(true);
    } catch {
      showError('Could not load closed cases.');
    } finally {
      setClosedLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'Closed Cases') return;

    const timer = setTimeout(() => {
      fetchClosedList();
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dismissedSearch, filterCategory, filterReasonClosed, filterDateFrom, filterDateTo, closedPage]);

  // ADDED — fetches a preview blob from GET /shared-files/{file_id}/preview whenever
  // docPreviewModal changes. Supports images, PDFs, and Word (.docx via mammoth); other types are left to
  // the download-only fallback. Object URL is revoked on cleanup to avoid memory leaks.
  useEffect(() => {
    if (!docPreviewModal) {
      setDocPreviewUrl(null);
      setDocPreviewError(false);
      setDocxHtml('');
      setDocxLoading(false);
      setDocxError(false);
      return;
    }

    if (docPreviewModal.isMock) {
      setDocPreviewUrl(null);
      setDocPreviewError(false);
      setDocxHtml('');
      setDocxLoading(false);
      setDocxError(false);
      return;
    }

    const mime = docPreviewModal.mime_type || '';
    const name = docPreviewModal.file_name || '';
    const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);
    const isDocx = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(name);

    if (!isImage && !isPdf && !isDocx) return; // unsupported types keep the placeholder

    const fileId = docPreviewModal.file_id || docPreviewModal.id;
    if (!fileId) return;

    let objectUrl = null;
    if (isDocx) {
      setDocxLoading(true);
      setDocxError(false);
      apiFetch(`/shared-files/${fileId}/preview`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((arrayBuffer) => mammoth.convertToHtml({ arrayBuffer }))
        .then((result) => {
          setDocxHtml(result.value);
        })
        .catch((err) => {
          console.error('Docx conversion error:', err);
          setDocxError(true);
        })
        .finally(() => {
          setDocxLoading(false);
        });
      return;
    }

    setDocPreviewLoading(true);
    setDocPreviewError(false);

    apiFetch(`/shared-files/${fileId}/preview`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setDocPreviewUrl(objectUrl);
      })
      .catch(() => setDocPreviewError(true))
      .finally(() => setDocPreviewLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docPreviewModal]);

  // Fetch closed case detail when modal opens for registered/rejected cases if request_id is present
  useEffect(() => {
    if (!viewCaseModalData) {
      setClosedModalDetail(null);
      setClosedModalLoading(false);
      setClosedModalError(false);
      return;
    }

    if (viewCaseModalData.request_id && (viewCaseModalData.reason_closed === 'registered' || viewCaseModalData.reason_closed === 'rejected')) {
      let isCurrent = true;
      setClosedModalLoading(true);
      setClosedModalError(false);
      apiFetch(`/verification-requests/fda-response/${viewCaseModalData.request_id}`)
        .then(async (res) => {
          if (!isCurrent) return;
          if (!res.ok) {
            setClosedModalError(true);
            return;
          }
          const json = await res.json();
          if (isCurrent) setClosedModalDetail(json);
        })
        .catch(() => {
          if (isCurrent) setClosedModalError(true);
        })
        .finally(() => {
          if (isCurrent) setClosedModalLoading(false);
        });
      return () => {
        isCurrent = false;
      };
    } else {
      setClosedModalDetail(null);
      setClosedModalLoading(false);
      setClosedModalError(false);
    }
  }, [viewCaseModalData]);

  // ADDED — POST/PUT /drafts/verification/
  // ─── Save Draft handler 
  // CHANGED — wrapped with useProcessing run()
  const handleSaveDraft = async () => {
    if (!selectedComplaint) {
      showError('Please select a complaint first.');
      return;
    }
    const body = JSON.stringify({
      complaint_id: selectedComplaint.complaint_id,
      product_code: productCode || null,
      priority,
      notes_to_fda: complaintStatement,
    });

    let savedDraftId = null;

    const ok = await proc.run(
      {
        title: 'SAVING DRAFT...',
        message: 'Saving verification request draft...',
        successTitle: 'DRAFT SAVED',
        successMessage: 'Draft saved. Redirecting to Saved Drafts...',
        withSuccess: true,
      },
      async () => {
        try {
          let res;
          if (!currentDraftId) {
            res = await apiFetch('/drafts/verification/', {
              method: 'POST',
              body,
            });
          } else {
            res = await apiFetch(`/drafts/verification/${currentDraftId}`, {
              method: 'PUT',
              body,
            });
          }

          if (!res.ok) {
            const msg = await parseBackendError(res);
            showError(msg);
            return false;
          }

          const data = await res.json();
          if (data.draft_id) savedDraftId = data.draft_id;
          showSuccess('Draft saved successfully.');
          return true;
        } catch {
          showError('Failed to save draft. Please try again.');
          return false;
        }
      }
    );

    if (ok) {
      if (savedDraftId) setCurrentDraftId(savedDraftId);
      navigate('/leacidgfolder/lea-saved-draft');
    }
  };

  // ADDED — POST /verification-requests/ or /drafts/verification/{id}/submit
  // ─── Send Request to FDA handler ─────────────────────────────────────────
  // CHANGED — wrapped with useProcessing run()
  const handleSendRequest = async () => {
    if (!selectedComplaint) {
      showError('Please select a complaint first.');
      return;
    }

    if (!complaintStatement.trim()) {
      showError('Please enter notes to FDA verifier.');
      return;
    }

    if (complaintStatement.trim().length < 10) {
      showError('Notes to FDA verifier must be at least 10 characters.');
      return;
    }

    const ok = await proc.run(
      {
        title: 'SENDING REQUEST...',
        message: 'Submitting verification request to FDA...',
        successTitle: 'REQUEST SENT',
        successMessage: 'Verification request sent to FDA.',
        withSuccess: true,
      },
      async () => {
        try {
          let res;
          if (currentDraftId) {
            const updateRes = await apiFetch(`/drafts/verification/${currentDraftId}`, {
              method: 'PUT',
              body: JSON.stringify({
                complaint_id: selectedComplaint.complaint_id,
                product_code: productCode || null,
                priority,
                notes_to_fda: complaintStatement,
              }),
            });

            if (!updateRes.ok) {
              const msg = await parseBackendError(updateRes);
              showError(msg);
              return false;
            }

            res = await apiFetch(`/drafts/verification/${currentDraftId}/submit`, {
              method: 'POST',
            });
          } else {
            res = await apiFetch('/verification-requests/', {
              method: 'POST',
              body: JSON.stringify({
                complaint_id: selectedComplaint.complaint_id,
                product_code: productCode || null,
                priority,
                notes_to_fda: complaintStatement,
              }),
            });
          }

          if (!res.ok) {
            const msg = await parseBackendError(res);
            showError(msg);
            return false;
          }

          await Promise.all([fetchReadyList(), fetchLeaCounts()]);
          return true;
        } catch {
          showError('Failed to send request. Please try again.');
          return false;
        }
      }
    );

    if (ok) {
      showSuccess('Verification request sent to FDA.');
      // Reset compose form state
      setCurrentDraftId(null);
      setSelectedComplaint(null);
      setProductCode('');
      setComplaintStatement('');
      setPriority('standard');
      // Navigate to Awaiting FDA tab (re-render same page with tab state)
      if (document.startViewTransition) {
        document.startViewTransition(() => setActiveTab('Awaiting FDA'));
      } else {
        setActiveTab('Awaiting FDA');
      }
    }
  };

  // ADDED — Delete Draft / Verification Request handler for Ready to Send tab
  // CHANGED — wrapped with useProcessing run()
  const handleDeleteRequest = () => {
    if (!selectedComplaint) {
      showError('Please select a complaint first.');
      return;
    }

    setModalConfig({
      title: 'Delete Complaint?',
      message: 'Are you sure you want to delete this complaint? This action cannot be undone.',
      confirmText: 'Delete',
      confirmBg: '#ef4444',
      onConfirm: async () => {
        // CHANGED — close modal before proc.run()
        setModalConfig(null);

        const ok = await proc.run(
          {
            title: 'DELETING COMPLAINT...',
            message: 'Deleting complaint and associated draft...',
            withSuccess: false,
          },
          async () => {
            if (currentDraftId) {
              try {
                const draftRes = await apiFetch(`/drafts/verification/${currentDraftId}`, {
                  method: 'DELETE',
                });
                if (!draftRes.ok) {
                  const msg = await parseBackendError(draftRes);
                  showError(msg);
                  return false;
                }
              } catch {
                showError('Failed to delete draft. Please try again.');
                return false;
              }
            }

            try {
              const res = await apiFetch(`/complaints/walkin/${selectedComplaint.complaint_id}`, {
                method: 'DELETE',
              });
              if (!res.ok) {
                const msg = await parseBackendError(res);
                showError(msg);
                return false;
              }
              showSuccess('Complaint deleted successfully.');
              await Promise.all([fetchReadyList(), fetchLeaCounts()]);
              return true;
            } catch {
              showError('Failed to delete complaint. Please try again.');
              return false;
            }
          }
        );

        if (ok) {
          setCurrentDraftId(null);
          setSelectedComplaint(null);
          setProductCode('');
          setComplaintStatement('');
          setPriority('standard');
        }
      },
      onCancel: () => {
        setModalConfig(null);
      },
    });
  };

  // MERGED-ADD — client-side search + category filtering for the four queue tabs
  const filteredReadyList = readyList.filter((item) => {
    const q = readySearch.toLowerCase().trim();
    const matchesSearch = !q ||
      (item.case_reference || '').toLowerCase().includes(q) ||
      (item.product_title || '').toLowerCase().includes(q) ||
      (item.manufacturer || '').toLowerCase().includes(q);
    const matchesCategory = !readyCategory || item.product_category === readyCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredAwaitingList = awaitingList.filter((item) => {
    const q = awaitingSearch.toLowerCase().trim();
    const matchesSearch = !q ||
      (item.case_reference || '').toLowerCase().includes(q) ||
      (item.product_name || '').toLowerCase().includes(q) ||
      (item.manufacturer || '').toLowerCase().includes(q);
    const matchesCategory = !awaitingCategory || item.product_category === awaitingCategory;
    return matchesSearch && matchesCategory;
  });

  // CHANGED — now filters against real backend field names from fdaResponseList
  //            (was filtering dummy responseCases with .caseNumber / .product / .category)
  const filteredResponseCases = fdaResponseList.filter((item) => {
    const q = responseSearch.toLowerCase().trim();
    const matchesSearch = !q ||
      (item.case_reference || '').toLowerCase().includes(q) ||
      (item.product_name || '').toLowerCase().includes(q) ||
      (item.manufacturer || '').toLowerCase().includes(q);
    const matchesCategory = !responseCategory || item.product_category === responseCategory;
    return matchesSearch && matchesCategory;
  });

  // CHANGED — now filters against real backend field names from initiatedList
  //            (was filtering dummy initiatedCases with .caseNumber / .product / .category)
  const filteredInitiatedCases = initiatedList.filter((item) => {
    const q = initiatedSearch.toLowerCase().trim();
    const matchesSearch = !q ||
      (item.case_reference || '').toLowerCase().includes(q) ||
      (item.product_title || '').toLowerCase().includes(q) ||
      (item.manufacturer || '').toLowerCase().includes(q);
    const matchesCategory = !initiatedCategory || item.product_category === initiatedCategory;
    return matchesSearch && matchesCategory;
  });

  // Frontend pagination slices — 15 items per page, operating on the already-filtered lists
  const readyTotalPages = Math.ceil(filteredReadyList.length / QUEUE_PAGE_SIZE) || 1;
  const paginatedReadyList = filteredReadyList.slice((readyPage - 1) * QUEUE_PAGE_SIZE, readyPage * QUEUE_PAGE_SIZE);

  const awaitingTotalPages = Math.ceil(filteredAwaitingList.length / QUEUE_PAGE_SIZE) || 1;
  const paginatedAwaitingList = filteredAwaitingList.slice((awaitingPage - 1) * QUEUE_PAGE_SIZE, awaitingPage * QUEUE_PAGE_SIZE);

  const responseTotalPages = Math.ceil(filteredResponseCases.length / QUEUE_PAGE_SIZE) || 1;
  const paginatedResponseCases = filteredResponseCases.slice((responsePage - 1) * QUEUE_PAGE_SIZE, responsePage * QUEUE_PAGE_SIZE);

  const initiatedTotalPages = Math.ceil(filteredInitiatedCases.length / QUEUE_PAGE_SIZE) || 1;
  const paginatedInitiatedCases = filteredInitiatedCases.slice((initiatedPage - 1) * QUEUE_PAGE_SIZE, initiatedPage * QUEUE_PAGE_SIZE);

  // CHANGED (Part 1) — removed filteredDismissed client-side filter (filtering now happens on the backend).
  //                       The fetch useEffect below handles search/filter/pagination server-side.

  // NOTE: Trigger confirmation modals and success alerts for actions
  const handleActionButtonClick = (actionType, caseNumber, id) => {
    let title = "";
    let message = "";
    let confirmText = "";
    let successText = "";
    let confirmBg = "#13213C";

    if (actionType === 'Send Reminder') {
      title = "Send Reminder to FDA?";
      message = `A reminder notification will be sent to the assigned FDA verifier for CASE ID: ${caseNumber}. Do you want to proceed?`;
      confirmText = "Send Reminder";
      successText = "Reminder sent successfully.";
    } else if (actionType === 'Recall Request') {
      title = "Recall Verification Request?";
      message = `This will cancel the pending verification request for CASE ID: ${caseNumber}. The case will be moved back to Ready to Send. Do you want to proceed?`;
      confirmText = "Recall Request";
      confirmBg = "#cc0000";
      successText = "Request recalled successfully.";
    } else if (actionType === 'Initiate Takedown') {
      title = "Initiate Takedown Operation?";
      message = `This will mark CASE ID: ${caseNumber} for takedown enforcement. The case will be moved to Initiated Cases tab. Do you want to proceed?`;
      confirmText = "Initiate Takedown";
      successText = "Takedown operation initiated.";
    } else if (actionType === 'Dismiss Case') {
      title = "Dismiss Case?";
      message = `This will close CASE ID: ${caseNumber}. Product has been confirmed registered with FDA. The case will be moved to the Closed Cases tab. Do you want to proceed?`;
      confirmText = "Acknowledge";
      successText = "Case dismissed. Moved to Closed Cases.";
    } else if (actionType === 'Close Case') {
      title = "Close Takedown Case?";
      message = `This will mark the takedown operation for CASE ID: ${caseNumber} as complete and close the case. Make sure field operation notes are updated before closing. This action cannot be undone. Do you want to proceed?`;
      confirmText = "Close Case";
      successText = "Case closed successfully.";
    } else if (actionType === 'Acknowledge') {
      title = "Acknowledge Rejection?";
      message = `This will acknowledge the rejection of CASE ID: ${caseNumber} by FDA. The case will be moved to the Closed Cases tab. Do you want to proceed?`;
      confirmText = "Acknowledge";
      successText = "Rejection acknowledged. Case moved to Closed Cases.";
    }

    setModalConfig({
      title,
      message,
      confirmText,
      confirmBg,
      onConfirm: async () => {
        // CHANGED — close modal before proc.run()
        setModalConfig(null);

        if (actionType === 'Send Reminder' || actionType === 'Recall Request') {
          const endpoint = actionType === 'Send Reminder' ? 'resend-reminder' : 'recall';
          const isRecall = actionType === 'Recall Request';

          const ok = await proc.run(
            {
              title: isRecall ? 'RECALLING REQUEST...' : 'SENDING REMINDER...',
              message: isRecall
                ? 'Canceling verification request and returning case...'
                : 'Sending reminder notification to FDA verifier...',
              withSuccess: false,
            },
            async () => {
              try {
                const res = await apiFetch(`/verification-requests/${id}/${endpoint}`, {
                  method: 'POST',
                });

                if (!res.ok) {
                  const msg = await parseBackendError(res);
                  showError(msg);
                  return false;
                }

                await res.json();

                if (isRecall) {
                  await Promise.all([fetchReadyList(), fetchLeaCounts()]);
                }
                return true;
              } catch {
                showError('Something went wrong. Please try again.');
                return false;
              }
            }
          );

          if (ok) {
            if (isRecall) {
              setAwaitingList((prev) => prev.filter((r) => r.request_id !== id));
              setSelectedAwaitingFda(null);
            }
            setSuccessMessage(successText);
            setTimeout(() => setSuccessMessage(''), 3000);
          }
          return;
        }

        if (actionType === 'Acknowledge' || actionType === 'Dismiss Case') {
          const isDismiss = actionType === 'Dismiss Case';
          const ok = await proc.run(
            {
              title: isDismiss ? 'DISMISSING CASE...' : 'ACKNOWLEDGING REJECTION...',
              message: isDismiss
                ? 'Closing case and moving to Closed Cases...'
                : 'Acknowledging FDA rejection...',
              withSuccess: false,
            },
            async () => {
              try {
                const res = await apiFetch(`/verification-requests/${id}/acknowledge`, {
                  method: 'POST',
                });
                if (!res.ok) {
                  const msg = await parseBackendError(res);
                  showError(msg);
                  return false;
                }
                await Promise.all([fetchFdaResponseList(), fetchClosedList(), fetchLeaCounts()]);
                return true;
              } catch {
                showError('Something went wrong. Please try again.');
                return false;
              }
            }
          );

          if (ok) {
            setSuccessMessage(successText);
            setTimeout(() => setSuccessMessage(''), 3000);
          }
          return;
        }

        if (actionType === 'Initiate Takedown') {
          const ok = await proc.run(
            {
              title: 'INITIATING TAKEDOWN...',
              message: 'Marking case for takedown enforcement...',
              withSuccess: false,
            },
            async () => {
              try {
                const res = await apiFetch(`/verification-requests/${id}/initiate-takedown`, {
                  method: 'POST',
                  body: JSON.stringify({
                    field_operation_notes: fdaTakedownNotes.trim() ? fdaTakedownNotes.trim() : null,
                  }),
                });
                if (!res.ok) {
                  const msg = await parseBackendError(res);
                  showError(msg);
                  return false;
                }
                await Promise.all([fetchFdaResponseList(), fetchInitiatedList(), fetchLeaCounts()]);
                return true;
              } catch {
                showError('Something went wrong. Please try again.');
                return false;
              }
            }
          );

          if (ok) {
            setFdaTakedownNotes('');
            setSuccessMessage(successText);
            setTimeout(() => setSuccessMessage(''), 3000);
          }
          return;
        }

        if (actionType === 'Close Case') {
          const ok = await proc.run(
            {
              title: 'CLOSING CASE...',
              message: 'Marking takedown operation complete and closing case...',
              withSuccess: false,
            },
            async () => {
              try {
                const res = await apiFetch(`/complaints/${id}/close-case`, {
                  method: 'POST',
                  body: JSON.stringify({
                    field_operation_notes: initiatedFieldNotes.trim() ? initiatedFieldNotes.trim() : null,
                  }),
                });
                if (!res.ok) {
                  const msg = await parseBackendError(res);
                  showError(msg);
                  return false;
                }
                await Promise.all([fetchInitiatedList(), fetchClosedList(), fetchLeaCounts()]);
                return true;
              } catch {
                showError('Something went wrong. Please try again.');
                return false;
              }
            }
          );

          if (ok) {
            // CHANGED (Part 0) — reset initiatedFieldNotes, not the old shared fieldOperationNotes
            setInitiatedFieldNotes('');
            setSuccessMessage(successText);
            setTimeout(() => setSuccessMessage(''), 3000);
          }
          return;
        }

        // Fallback for any future action types not yet wired.
        setSuccessMessage(successText);
        setTimeout(() => {
          setSuccessMessage('');
        }, 3000);



        /*
         BACKEND NOTIFICATION:
        After this action succeeds, trigger a notification for:
        - Target: 
          ${actionType === 'Send Reminder' ? 'FDA verifier assigned to this request' : 
            actionType === 'Recall Request' ? 'FDA verifier assigned to this request' : 
            actionType === 'Initiate Takedown' ? 'LEA supervisors / team leaders' : 
            actionType === 'Dismiss Case' ? 'LEA supervisors / team leaders' : 
            actionType === 'Close Case' ? 'LEA supervisors / team leaders' : 
            actionType === 'Acknowledge' ? 'LEA supervisors / team leaders' : 'System'}
        - Message: 
          ${actionType === 'Send Reminder' ? `LEA sent a reminder for CASE ID: ${caseNumber}` : 
            actionType === 'Recall Request' ? `LEA has recalled the verification request for CASE ID: ${caseNumber}` : 
            actionType === 'Initiate Takedown' ? `Takedown operation initiated for CASE ID: ${caseNumber}` : 
            actionType === 'Dismiss Case' ? `Case dismissed — CASE ID: ${caseNumber} confirmed registered` : 
            actionType === 'Close Case' ? `Takedown case completed — CASE ID: ${caseNumber}` : 
            actionType === 'Acknowledge' ? `LEA acknowledged FDA rejection for CASE ID: ${caseNumber} — case moved to Dismissed Cases` : 'Notification'}
        - Type: ${actionType === 'Send Reminder' ? 'info' : 
                  actionType === 'Recall Request' ? 'warning' : 
                  actionType === 'Initiate Takedown' ? 'warning' : 
                  actionType === 'Dismiss Case' ? 'success' : 
                  actionType === 'Close Case' ? 'success' : 
                  actionType === 'Acknowledge' ? 'info' : 'info'}
        - Channel: notification panel in TopBar component
        */
      },
      onCancel: () => {
        setModalConfig(null);
      }
    });
  };

  return (
    <div className='LeaDashboardMain'>
      <Sidebar sidebarType="LEA" />
      <div className='LeaContentContainer'>
        <TopBar topbarType="LEA" />
        <div className='LeaMainfeed'>
          <div className='LeaHeader'>
            <div>
              <p>LEA-CIDG: VERIFICATION REQUEST</p>
              <p>SEND & TRACK FDA VERIFICATION REQUEST</p>
            </div>
          </div>

          {/* STATS METRIC SUMMARY BAR (NON-CLICKABLE) */}
          <div className="LeaVerifStatsBar">
            <div className="LeaVerifStatCard">
              <div className="LeaVerifStatCardTop">
                <div className="LeaVerifStatBadge LeaVerifStatBadgeResponse">
                  <Inbox size={14} />
                </div>
              </div>
              {/* CHANGED — was {responseCases.length}, now uses real backend count */}
              <p className="LeaVerifStatValue">{leaCounts.fda_response_count}</p>
              <p className="LeaVerifStatLabel">FDA Response</p>
            </div>

            <div className="LeaVerifStatCard">
              <div className="LeaVerifStatCardTop">
                <div className="LeaVerifStatBadge LeaVerifStatBadgeInitiated">
                  <Siren size={14} />
                </div>
              </div>
              {/* CHANGED — was {initiatedCases.length}, now uses real backend count */}
              <p className="LeaVerifStatValue">{leaCounts.initiated_count}</p>
              <p className="LeaVerifStatLabel">Initiated Cases</p>
            </div>

            <div className="LeaVerifStatCard">
              <div className="LeaVerifStatCardTop">
                <div className="LeaVerifStatBadge LeaVerifStatBadgeDismissed">
                  <Archive size={14} />
                </div>
              </div>
              {/* CHANGED — was {dismissedCases.length}, now uses real backend count */}
              <p className="LeaVerifStatValue">{leaCounts.dismissed_count}</p>
              <p className="LeaVerifStatLabel">Closed Cases</p>
            </div>
          </div>

          <div className="VerificationContainer">

            <div className="VerificationTabs">
              <div className='VerificationTabsButton'>
                {tabs.slice(0, 3).map((tabName) => (
                  <button key={tabName} className={`ButtonTab ${activeTab === tabName ? 'active' : ''}`} onClick={() => handleTabClick(tabName)}>{tabName}</button>
                ))}
                {/* styles the tab separator between process tabs and tracking tabs */}
                <div className="TabSeparator"></div>
                {tabs.slice(3).map((tabName) => (
                  <button key={tabName} className={`ButtonTab ${activeTab === tabName ? 'active' : ''}`} onClick={() => handleTabClick(tabName)}>{tabName}</button>
                ))}
              </div>
            </div>
            {/*CONTENT FOR EACH TAB */}

            {/*READY TO SEND TAB CONTENT*/}
            <div className='VerificationTabContent ReadySendButtonContent'>
              {activeTab === 'Ready to Send' &&
                <div className="VerificationContent">
                  {/* CHANGED — real data from readyList, was hardcoded card */}
                  {/* LEFT PANEL */}
                  <div className="ReadytoSendQueue">
                    {/* MERGED-ADD — search bar + category filter dropdown */}
                    <div className="ReadytoSendHeader">
                      <p>Walk-in cases awaiting your request</p>
                      {/* MERGED-CHANGED — count now reflects filtered results */}
                      <span>{filteredReadyList.length}</span>
                    </div>
                    <div className="LeaVerifQueueFilterHeader">
                      <div className="LeaSearchWrapper">
                        <Search size={16} className="LeaSearchIcon" />
                        <input
                          type="text"
                          placeholder="Search Case ID, Product, or Manufacturer..."
                          className="LeaCategoriesSearchInput"
                          value={readySearch}
                          onChange={(e) => setReadySearch(e.target.value)}
                          maxLength={150}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EDEDED', padding: '5px 10px', borderRadius: '6px' }}>
                        <Filter size={14} className="LeaVerifFilterIcon" />
                        <select
                          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '12px', fontWeight: '600', color: '#030303', outline: 'none', cursor: 'pointer' }}
                          value={readyCategory}
                          onChange={(e) => setReadyCategory(e.target.value)}
                        >
                          <option value="">All Categories</option>
                          <option value="Cosmetics">Cosmetics</option>
                          <option value="Food">Food</option>
                          <option value="Devices">Devices</option>
                          <option value="Drugs">Drugs</option>
                        </select>
                      </div>
                    </div>


                    {readyLoading && (
                      <p style={{ padding: '12px', color: '#7a8796', fontSize: '13px' }}>Loading...</p>
                    )}

                    {!readyLoading && readyList.length === 0 && (
                      <p style={{ padding: '12px', color: '#7a8796', fontSize: '13px' }}>No cases awaiting verification request.</p>
                    )}

                    {/* MERGED-ADD — empty state for when filters exclude everything */}
                    {!readyLoading && readyList.length > 0 && filteredReadyList.length === 0 && (
                      <div className="LeaVerifEmptyList">
                        <Search size={32} />
                        <p className="LeaVerifEmptyText">No cases match your current filters.</p>
                      </div>
                    )}

                    {!readyLoading && paginatedReadyList.map((item) => (
                      <div
                        key={item.complaint_id}
                        className={`QueueCard ${selectedComplaint?.complaint_id === item.complaint_id ? 'ActiveQueueCard' : ''}`}
                        onClick={() => fetchComplaintDetail(item.complaint_id)}
                      >
                        <div className="QueueCardTopRow">
                          <small style={{ margin: 0 }}>CASE ID: {item.case_reference}</small>
                          <span className="QueueTagInline">{GetSourceLabel(item.source)}</span>
                        </div>
                        <h4>{item.product_title}</h4>
                        <p>{item.manufacturer || '—'}</p>

                        <div className="QueueCardFooterRow">
                          <span className="QueueCategoryTag">{item.product_category || '—'}</span>
                          <span className="QueueDateTag">
                            <Calendar size={12} />
                            {item.created_at ? formatDateTime(item.created_at) : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                    <QueuePagination
                      currentPage={readyPage}
                      totalPages={readyTotalPages}
                      onPageChange={setReadyPage}
                    />
                  </div>

                  {/* CHANGED — real data from selectedComplaint, was hardcoded */}
                  {/* RIGHT PANEL */}
                  <div className="VerificationDetails">
                    <div className="VerificationCard">
                      <div>
                        {/* CHANGED — was `detailLoading ? …` — now keeps previous case visible while new one loads (BUG 2 fix) */}
                        {detailLoading && !selectedComplaint ? (
                          <p style={{ color: '#7a8796', fontSize: '13px' }}>Loading details...</p>
                        ) : selectedComplaint ? (
                          <>
                            {/* CHANGED — removed Manufacturer line from title block; Case ID retained */}
                            <small><span className='LeaHeaderFieldLabel'>CASE ID:</span> {selectedComplaint.case_reference}</small>
                            <h2>{selectedComplaint.product_title}</h2>

                            {/* CHANGED — Complainant moved to Complainant Details; Manufacturer placed last in grid */}
                            <div className="CaseInfoGrid">
                              <div>
                                <label>CATEGORY</label>
                                <p>{selectedComplaint.product_category || '—'}</p>
                              </div>

                              <div>
                                <label>LOGGED</label>
                                <p>{formatDateTime(selectedComplaint.created_at)}</p>
                              </div>

                              <div>
                                <label>SOURCE</label>
                                <p>{GetSourceLabel(selectedComplaint.source)}</p>
                              </div>

                              <div>
                                <label>MANUFACTURER</label>
                                <p>{selectedComplaint.manufacturer || '—'}</p>
                              </div>
                            </div>

                            {/* CHANGED — passing complainantName prop to LeaComplainantDetails */}
                            <LeaComplainantDetails
                              complaintId={selectedComplaint.complaint_id}
                              complainantName={selectedComplaint.complainant_name}
                            />
                          </>
                        ) : (
                          <p style={{ color: '#7a8796', fontSize: '13px' }}>Select a case from the list to view details.</p>
                        )}
                      </div>

                      <div className="VerificationRequestCard">
                        <div className="CaseInfoTitle">
                          <SquarePen /><h2>Compose verification request to FDA</h2>
                        </div>
                        <p>
                          Ask FDA to confirm whether the product or manufacturer is
                          registered. Your intake evidence is attached automatically.
                        </p>

                        <div className="VerificationRow">
                          <div>
                            <label>PRODUCT CODE (if known)</label>
                            {/* BACKEND: maps to product_code in verification_requests */}
                            <input
                              type="text"
                              placeholder="Barcode / lot number"
                              value={productCode}
                              onChange={(e) => setProductCode(e.target.value)}
                              maxLength={100}
                            />
                          </div>

                          <div>
                            <label>PRIORITY</label>
                            {/* BACKEND: priority maps to priority column in verification_requests table */}
                            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                              <option value="standard">Standard</option>
                              <option value="high">High (48 hours)</option>
                              <option value="urgent">Urgent (24 hours)</option>
                              <option value="critical">Critical (1 hour)</option>
                            </select>
                          </div>
                        </div>

                        <div className="VerificationNotes">
                          <label>NOTES TO FDA VERIFIER</label>
                          {/*     BACKEND: maps to notes_to_fda in verification_requests */}
                          <textarea
                            rows="5"
                            placeholder="Enter notes for FDA verification..."
                            value={complaintStatement}
                            onChange={(e) => setComplaintStatement(e.target.value)}
                            maxLength={2000}
                            minLength={10}
                          ></textarea>
                        </div>

                        {/* CHANGED — now driven by the real SharedFileResponse shape (file_id, file_name,
                            file_size_bytes, mime_type, file_size_display). Icon picks image vs generic
                            document based on mime_type; meta line shows file size only, per your call —
                            file_name is the card's title, file_size_display is the only thing under it. */}
                        <div className="LeaVerifSectionCard">
                          <div className="LeaVerifSectionHeader">
                            <Paperclip size={16} className="LeaVerifBlueIcon" />
                            <h3>Auto-Attached Evidence & Request Documents</h3>
                          </div>
                          <div className="LeaVerifDocsGrid">
                            {selectedComplaint?.attached_files?.length > 0 ? (
                              selectedComplaint.attached_files.map((f, idx) => (
                                <div key={f.file_id || idx} className="LeaVerifDocCard">
                                  <div className="LeaVerifDocIcon">
                                    {f.mime_type?.startsWith('image/') ? (
                                      <ImageIcon size={18} />
                                    ) : (
                                      <FileText size={18} />
                                    )}
                                  </div>
                                  <div className="LeaVerifDocInfo">
                                    <p className="LeaVerifDocName">{f.file_name}</p>
                                    <span className="LeaVerifDocMeta">{f.file_size_display}</span>
                                  </div>
                                  {/* CHANGED — eye button now opens the doc preview modal instead of doing nothing */}
                                  <div className="LeaVerifDocActions">
                                    <button
                                      className="LeaVerifDocActionBtn"
                                      title="Inspect Attachment"
                                      onClick={() => setDocPreviewModal(f)}
                                    >
                                      <Eye size={13} />
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="LeaVerifNoDocsText">No evidence documents attached to this request.</p>
                            )}
                          </div>
                        </div>

                        <div className="VerificationActions">
                          <button type="button" className="DeleteBtn" onClick={handleDeleteRequest}>
                            <Trash2 size={16} />
                            <span>Delete</span>
                          </button>
                          <div className="VerificationRightActions">
                            {/* BACKEND: POST/PUT to /drafts/verification/ */}
                            <button type="button" className="DraftButton" onClick={handleSaveDraft}>
                              Save Draft
                            </button>
                            {/* BACKEND: POST to /verification-requests/ or /drafts/verification/:id/submit */}
                            <button type="button" className="SendReqBtn" onClick={handleSendRequest}>
                              Send Request to FDA
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>

                </div>}

              {/*AWAITING FDA TAB CONTENT*/}
              {activeTab === 'Awaiting FDA' &&
                <div className='VerificationContent AwaitingButtonContent'>

                  {/* CHANGED — real data from awaitingList/selectedAwaitingFda, was hardcoded */}
                  {/* LEFT PANEL */}
                  <div className="AwaitingLEAQueue">
                    <div className="AwaitingHeader">
                      <p>Request Pending FDA Review</p>
                      {/* MERGED-CHANGED — count now reflects filtered results */}
                      <span>{filteredAwaitingList.length}</span>
                    </div>
                    {/* MERGED-ADD — search bar + category filter dropdown */}
                    <div className="LeaVerifQueueFilterHeader">
                      <div className="LeaSearchWrapper">
                        <Search size={16} className="LeaSearchIcon" />
                        <input
                          type="text"
                          placeholder="Search Case ID, Product, or Manufacturer..."
                          className="LeaCategoriesSearchInput"
                          value={awaitingSearch}
                          onChange={(e) => setAwaitingSearch(e.target.value)}
                          maxLength={150}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EDEDED', padding: '5px 10px', borderRadius: '6px' }}>
                        <Filter size={14} className="LeaVerifFilterIcon" />
                        <select
                          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '12px', fontWeight: '600', color: '#030303', outline: 'none', cursor: 'pointer' }}
                          value={awaitingCategory}
                          onChange={(e) => setAwaitingCategory(e.target.value)}
                        >
                          <option value="">All Categories</option>
                          <option value="Cosmetics">Cosmetics</option>
                          <option value="Food">Food</option>
                          <option value="Devices">Devices</option>
                          <option value="Drugs">Drugs</option>
                        </select>
                      </div>
                    </div>


                    {awaitingLoading && (
                      <p style={{ padding: '12px', color: '#7a8796', fontSize: '13px' }}>Loading...</p>
                    )}

                    {!awaitingLoading && awaitingList.length === 0 && (
                      <p style={{ padding: '12px', color: '#7a8796', fontSize: '13px' }}>No pending verification requests.</p>
                    )}

                    {/* MERGED-ADD — empty state for when filters exclude everything */}
                    {!awaitingLoading && awaitingList.length > 0 && filteredAwaitingList.length === 0 && (
                      <div className="LeaVerifEmptyList">
                        <Search size={32} />
                        <p className="LeaVerifEmptyText">No cases match your current filters.</p>
                      </div>
                    )}

                    {!awaitingLoading && paginatedAwaitingList.map((item) => (
                      <div
                        key={item.request_id}
                        className={`QueueCard ${selectedAwaitingFda?.request_id === item.request_id ? 'ActiveQueueCard' : ''}`}
                        onClick={() => setSelectedAwaitingFda(item)}
                      >
                        {/* MERGED-CHANGED — restructured to match the reference UI: CASE ID + source tag + priority on top row */}
                        <div className="QueueCardTopRow">
                          <small style={{ margin: 0 }}>CASE ID: {item.case_reference}</small>

                          <span className="QueueTagInline">
                            {GetSourceLabel(item.source)}
                          </span>

                          {item.priority && (
                            <span className={`QueueStatusBadge ${(item.priority || '').toLowerCase() === 'standard'
                              ? 'registered'
                              : (item.priority || '').toLowerCase() === 'high'
                                ? 'rejected'
                                : 'unregistered'
                              }`}>
                              {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                            </span>
                          )}
                        </div>
                        <h4>{item.product_name}</h4>
                        <p>{item.manufacturer || '—'}</p>

                        {/* MERGED-ADD — category + date, matching old version's QueueCardFooterRow.
                            FLAGGED: same field-name caveat as the Ready to Send list — using
                            item.requested_at (confirmed elsewhere in this tab's detail panel) as the date. */}
                        <div className="QueueCardFooterRow">
                          <span className="QueueCategoryTag">{item.product_category || '—'}</span>
                          <span className="QueueDateTag">
                            <Calendar size={12} />
                            {item.requested_at ? formatDateTime(item.requested_at) : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                    <QueuePagination
                      currentPage={awaitingPage}
                      totalPages={awaitingTotalPages}
                      onPageChange={setAwaitingPage}
                    />

                  </div>

                  {/* CHANGED — real data from awaitingList/selectedAwaitingFda, was hardcoded */}
                  {/* RIGHT PANEL */}
                  <div className="VerificationDetails">
                    <div className="VerificationCard">
                      <div>
                        {selectedAwaitingFda ? (
                          <>
                            {/* CHANGED — removed Manufacturer line from title block; Case ID retained */}
                            <small><span className='LeaHeaderFieldLabel'>CASE ID:</span> {selectedAwaitingFda.case_reference}</small>
                            <h2>{selectedAwaitingFda.product_name}</h2>

                            {/* BACKEND: complainant, category, source, and region are NOT stored
                                                        directly in verification_requests. They are fetched via complaint_id
                                                        joining to the complaints and walkin_complainants tables through the
                                                        verification_requests_full view */}
                            {/* CHANGED — Complainant moved to Complainant Details; Manufacturer placed last in grid */}
                            <div className="CaseInfoGrid">
                              <div>
                                <label>CATEGORY</label>
                                <p>{selectedAwaitingFda.product_category || '—'}</p>
                              </div>

                              <div>
                                <label>LOGGED</label>
                                <p>{formatDateTime(selectedAwaitingFda.requested_at)}</p>
                              </div>

                              <div>
                                <label>SOURCE</label>
                                <p>{GetSourceLabel(selectedAwaitingFda.source)}</p>
                              </div>

                              <div>
                                <label>MANUFACTURER</label>
                                <p>{selectedAwaitingFda.manufacturer || '—'}</p>
                              </div>
                            </div>

                            {/* CHANGED — passing complainantName prop to LeaComplainantDetails */}
                            <LeaComplainantDetails
                              complaintId={selectedAwaitingFda.complaint_id}
                              complainantName={selectedAwaitingFda.complainant_name}
                            />
                          </>
                        ) : (
                          <p style={{ color: '#7a8796', fontSize: '13px' }}>Select a case from the list to view details.</p>
                        )}
                      </div>

                      {selectedAwaitingFda && (
                        <div className="VerificationRequestInfo">
                          <h3>Verification Request</h3>
                          <div className="VerificationRequestGrid">
                            <div>
                              <label>PRODUCT CODE</label>
                              <p>{(selectedAwaitingFda.product_code && String(selectedAwaitingFda.product_code).trim()) || '—'}</p>
                            </div>

                            <div>
                              <label>PRIORITY</label>
                              <p>{selectedAwaitingFda.priority ? selectedAwaitingFda.priority.charAt(0).toUpperCase() + selectedAwaitingFda.priority.slice(1) : '—'}</p>
                            </div>

                            <div className="VerificationNotes">
                              <label>NOTES TO FDA VERIFIER</label>
                              <p style={{ fontWeight: 500, fontSize: '13px', lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                                {((selectedAwaitingFda.complaint_statement || selectedAwaitingFda.notes_to_fda) &&
                                  String(selectedAwaitingFda.complaint_statement || selectedAwaitingFda.notes_to_fda).trim()) || '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className='UpdateForResponse'>
                        <div className='StatusTitle'>
                          <div className='TitleHolder'>
                            <div className='WaitingIconBox'><Clock3 /></div>
                            <div><h3>Awaiting FDA Response</h3></div>
                          </div>
                          {/* requested_at used as the send date for this tab */}
                          <p>
                            {selectedAwaitingFda
                              ? `Request sent ${formatDateTime(selectedAwaitingFda.requested_at)}. FDA verifier will respond with a digital confirmation of registration status.`
                              : 'FDA verifier will respond with a digital confirmation of registration status.'}
                          </p>
                        </div>
                        <div className='ButtonsForResponse'>
                          {/* BACKEND: POST to /api/verification-requests/:id/reminder */}
                          {/* CHANGED — now passes real case_reference/request_id instead of hardcoded values; handleActionButtonClick itself still has no backend */}
                          <button
                            className='SendReminderBtn'
                            onClick={() => handleActionButtonClick(
                              'Send Reminder',
                              selectedAwaitingFda?.case_reference || '',
                              selectedAwaitingFda?.request_id || null
                            )}
                          >
                            <BellRing />
                            <p>Send Reminder</p>
                          </button>
                          {/* BACKEND: PATCH to /api/verification-requests/:id (status: recalled) */}
                          <button
                            className='RecallRequestBtn'
                            onClick={() => handleActionButtonClick(
                              'Recall Request',
                              selectedAwaitingFda?.case_reference || '',
                              selectedAwaitingFda?.request_id || null
                            )}
                          >
                            Recall Request
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>}

              {/*FDA RESPONSE TAB CONTENT*/}
              {activeTab === 'FDA Response' &&
                <div className='VerificationContent FDAResponseButtonContent'>
                  {/* LEFT PANEL */}
                  <div className="LEAResponseQueue">
                    {/* MERGED-ADD — search bar + category filter dropdown */}
                    <div className="LEAResponseHeader">
                      <p>FDA confirmations received</p>
                      {/* REMOVE THIS */}
                      {/* BACKEND: count of responseCases */}
                      {/* MERGED-CHANGED — count now reflects filtered results */}
                      <span>{filteredResponseCases.length}</span>
                    </div>
                    <div className="LeaVerifQueueFilterHeader">

                      <div className="LeaSearchWrapper">
                        <Search size={16} className="LeaSearchIcon" />
                        <input
                          type="text"
                          placeholder="Search Case ID, Product, or Manufacturer..."
                          className="LeaCategoriesSearchInput"
                          value={responseSearch}
                          onChange={(e) => setResponseSearch(e.target.value)}
                          maxLength={150}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EDEDED', padding: '5px 10px', borderRadius: '6px' }}>
                        <Filter size={14} className="LeaVerifFilterIcon" />
                        <select
                          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '12px', fontWeight: '600', color: '#030303', outline: 'none', cursor: 'pointer' }}
                          value={responseCategory}
                          onChange={(e) => setResponseCategory(e.target.value)}
                        >
                          <option value="">All Categories</option>
                          <option value="Cosmetics">Cosmetics</option>
                          <option value="Food">Food</option>
                          <option value="Devices">Devices</option>
                          <option value="Drugs">Drugs</option>
                        </select>
                      </div>
                    </div>


                    {/* ADDED — first-load skeleton; skipped on subsequent refreshes (no flickering) */}
                    {fdaResponseLoading && !hasLoadedFdaResponseOnce && (
                      <p style={{ padding: '12px', color: '#7a8796', fontSize: '13px' }}>Loading...</p>
                    )}
                    {/* ADDED — empty list state when the backend returns 0 items */}
                    {!fdaResponseLoading && fdaResponseList.length === 0 && (
                      <p style={{ padding: '12px', color: '#7a8796', fontSize: '13px' }}>No FDA responses at this time.</p>
                    )}

                    {/* MERGED-ADD — empty state for when filters exclude everything */}
                    {!fdaResponseLoading && fdaResponseList.length > 0 && filteredResponseCases.length === 0 && (
                      <div className="LeaVerifEmptyList">
                        <Search size={32} />
                        <p className="LeaVerifEmptyText">No cases match your current filters.</p>
                      </div>
                    )}

                    {/* CHANGED — cards now use real backend fields:
                         key=request_id, highlight on selectedResponseId, onClick=setSelectedResponseId,
                         badge from verification_result, date from responded_at via formatDateTime */}
                    {paginatedResponseCases.map((item) => (
                      <div
                        key={item.request_id}
                        className={`QueueCard ${selectedResponseId === item.request_id ? 'ActiveQueueCard' : ''}`}
                        onClick={() => setSelectedResponseId(item.request_id)}
                      >
                        <div className="QueueCardTopRow">
                          <small style={{ margin: 0 }}>CASE ID: {item.case_reference}</small>
                          <span className={`QueueStatusBadge ${item.verification_result === 'registered' ? 'registered' :
                            item.verification_result === 'rejected' ? 'rejected' : 'unregistered'
                            }`}>
                            {item.verification_result === 'registered' ? 'Registered' :
                              item.verification_result === 'rejected' ? 'Rejected' : 'Unregistered'}
                          </span>
                        </div>
                        <h4>{item.product_name}</h4>
                        <p>{item.manufacturer || '—'}</p>
                        <div className="QueueCardFooterRow">
                          <span className="QueueCategoryTag">{item.product_category || '—'}</span>
                          <span className="QueueDateTag">
                            <Calendar size={12} />
                            {formatDateTime(item.responded_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <QueuePagination
                      currentPage={responsePage}
                      totalPages={responseTotalPages}
                      onPageChange={setResponsePage}
                    />

                  </div>

                  {/* CHANGED — right panel rebuilt: was reading dummy selectedResponse fields directly (no null guard);
                               now guards with selectedResponse && check, uses real detail fields,
                               shows "Select a case" when nothing chosen and "Loading..." only on very first load */}
                  {/* RIGHT PANEL */}
                  <div className='VerificationDetails'>
                    {selectedResponse ? (
                      <div className='VerificationCard'>
                        <div>
                          {responseDetailLoading && !selectedResponse ? (
                            <p style={{ color: '#7a8796', fontSize: '13px' }}>Loading details...</p>
                          ) : selectedResponse ? (
                            <>
                              {/* CHANGED — removed Manufacturer line from title block; Case ID retained */}
                              <small><span className='LeaHeaderFieldLabel'>CASE ID:</span> {selectedResponse.case_reference}</small>
                              <h2>{selectedResponse.product_title}</h2>

                              {/* CHANGED — Complainant moved to Complainant Details; Manufacturer placed last in grid */}
                              <div className="CaseInfoGrid">
                                <div>
                                  <label>CATEGORY</label>
                                  <p>{selectedResponse.product_category || '—'}</p>
                                </div>

                                <div>
                                  <label>LOGGED</label>
                                  <p>{formatDateTime(selectedResponse.logged_at)}</p>
                                </div>

                                <div>
                                  <label>SOURCE</label>
                                  <p>{GetSourceLabel(selectedResponse.source)}</p>
                                </div>

                                <div>
                                  <label>MANUFACTURER</label>
                                  <p>{selectedResponse.manufacturer || '—'}</p>
                                </div>
                              </div>

                              {/* CHANGED — passing complainantName prop to LeaComplainantDetails */}
                              <LeaComplainantDetails
                                complaintId={selectedResponse.complaint_id}
                                complainantName={selectedResponse.complainant_name}
                              />
                            </>
                          ) : (
                            <p style={{ color: '#7a8796', fontSize: '13px' }}>Select a case to view details.</p>
                          )}
                        </div>

                        {selectedResponse && (() => {
                          const displayResponse = getMergedResponseData(selectedResponse);
                          const hasVerifReq = Boolean(
                            displayResponse?.product_code ||
                            displayResponse?.priority ||
                            displayResponse?.complaint_statement ||
                            displayResponse?.notes_to_fda
                          );

                          return (
                            <>
                              {/* 1a: Verification Request block */}
                              {hasVerifReq && (
                                <div className="VerificationRequestInfo" style={{ marginTop: '16px' }}>
                                  <h3>Verification Request</h3>
                                  <div className="VerificationRequestGrid">
                                    {displayResponse.product_code && (
                                      <div>
                                        <label>PRODUCT CODE</label>
                                        <p>{String(displayResponse.product_code).trim()}</p>
                                      </div>
                                    )}
                                    {displayResponse.priority && (
                                      <div>
                                        <label>PRIORITY</label>
                                        <p>{displayResponse.priority.charAt(0).toUpperCase() + displayResponse.priority.slice(1)}</p>
                                      </div>
                                    )}
                                    {(displayResponse.complaint_statement || displayResponse.notes_to_fda) && (
                                      <div className="VerificationNotes">
                                        <label>NOTES TO FDA VERIFIER</label>
                                        <p style={{ fontWeight: 500, fontSize: '13px', lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                                          {String(displayResponse.complaint_statement || displayResponse.notes_to_fda).trim()}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 1b: Evidence Attached at Intake file grid */}
                              <div className="LeaVerifSectionCard" style={{ marginTop: '16px' }}>
                                <div className="LeaVerifSectionHeader">
                                  <Paperclip size={16} className="LeaVerifBlueIcon" />
                                  <h3>Evidence Attached at Intake</h3>
                                </div>
                                <div className="LeaVerifDocsGrid">
                                  {displayResponse.attached_files && displayResponse.attached_files.length > 0 ? (
                                    displayResponse.attached_files.map((f, idx) => (
                                      <div key={f.file_id || idx} className="LeaVerifDocCard">
                                        <div className="LeaVerifDocIcon">
                                          {f.mime_type?.startsWith('image/') ? (
                                            <ImageIcon size={18} />
                                          ) : (
                                            <FileText size={18} />
                                          )}
                                        </div>
                                        <div className="LeaVerifDocInfo">
                                          <p className="LeaVerifDocName">{f.file_name}</p>
                                          <span className="LeaVerifDocMeta">{f.file_size_display}</span>
                                        </div>
                                        <div className="LeaVerifDocActions">
                                          <button
                                            type="button"
                                            className="LeaVerifDocActionBtn"
                                            title="Inspect Attachment"
                                            onClick={() => setDocPreviewModal(f)}
                                          >
                                            <Eye size={13} />
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="LeaVerifNoDocsText">No files attached at intake.</p>
                                  )}
                                </div>
                              </div>

                              <div className='ConfirmationReturned'>
                                {selectedResponse.verification_result === 'rejected' ? (
                                  <>
                                    <div className="ResponseBox ResponseRejected">
                                      <div className='LeaVerifResponseStatusHeader LeaVerifRejectedHeader'>
                                        <XCircle style={{ color: '#EF4444' }} />
                                        <div className='StatementReturn'>
                                          {/* CHANGED — rejection is of the request, not a product verdict (Fix 4) */}
                                          <h3>VERIFICATION REQUEST REJECTED</h3>
                                        </div>
                                      </div>

                                      <div className="LeaVerifRejectionFieldsGrid">
                                        <div className="LeaVerifResultField">
                                          <label className="LeaVerifFieldLabel">Rejected By</label>
                                          <p className="LeaVerifFieldValue">{selectedResponse.verifier_name || '—'}</p>
                                        </div>

                                        <div className="LeaVerifResultField">
                                          <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                                          <p className="LeaVerifFieldValue">{formatDateTime(selectedResponse.responded_at)}</p>
                                        </div>

                                        <div className="LeaVerifResultField LeaVerifFullWidthField">
                                          <label className="LeaVerifFieldLabel">Reason for Rejection</label>
                                          <p className="LeaVerifFieldValue">{selectedResponse.rejection_reason || '—'}</p>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="LeaVerifAckNotice">
                                      <p>
                                        Please review the rejection reason above and click Acknowledge to move this case to closed/dismissed records.
                                      </p>
                                    </div>

                                    <div className='ResponseBtn' style={{ marginTop: '20px' }}>
                                      <button
                                        style={{ width: '300', height: '40px' }}
                                        onClick={() => handleActionButtonClick('Acknowledge', selectedResponse.case_reference, selectedResponse.request_id)}
                                      >
                                        Acknowledge
                                      </button>
                                    </div>
                                  </>
                                ) : selectedResponse.verification_result === 'registered' ? (
                                  <>
                                    <div className="ResponseBox ResponseRegistered">
                                      <div className='LeaVerifResponseStatusHeader LeaVerifRegisteredHeader'>
                                        <CheckCircle style={{ color: '#10B981', backgroundColor: '#D1FAE5' }} />
                                        <div className='StatementReturn'>
                                          <h3>CONFIRMED REGISTERED PRODUCT</h3>
                                        </div>
                                      </div>

                                      <div className="LeaVerifResultFieldsGrid">
                                        <div className="LeaVerifResultField">
                                          <label className="LeaVerifFieldLabel">Verified By</label>
                                          <p className="LeaVerifFieldValue">{selectedResponse.verifier_name || '—'}</p>
                                        </div>

                                        <div className="LeaVerifResultField">
                                          <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                                          <p className="LeaVerifFieldValue">{formatDateTime(selectedResponse.responded_at)}</p>
                                        </div>

                                        <div className="LeaVerifResultField">
                                          <label className="LeaVerifFieldLabel">FDA CPR Registration Number</label>
                                          <p className="LeaVerifFieldValue">{selectedResponse.cpr_number || '—'}</p>
                                        </div>

                                        <div className="LeaVerifResultField">
                                          <label className="LeaVerifFieldLabel">CPR Validity / Expiry Date</label>
                                          <p className="LeaVerifFieldValue">{selectedResponse.cpr_expiry || '—'}</p>
                                        </div>

                                        <div className="LeaVerifResultField LeaVerifFullWidthField">
                                          <label className="LeaVerifFieldLabel">Official FDA Verification Remarks</label>
                                          <p className="LeaVerifFieldValue">{selectedResponse.response_notes || '—'}</p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* 1c: FDA Response Documents under Registered banner */}
                                    {/* 🔌 BACKEND: expected field - response_files (list of SharedFileResponse), FDA's own upload when responding, kept separate from attached_files (the intake evidence). */}
                                    <div className="LeaVerifSectionCard" style={{ marginTop: '16px' }}>
                                      <div className="LeaVerifSectionHeader">
                                        <Paperclip size={16} className="LeaVerifBlueIcon" />
                                        <h3>FDA Response Documents</h3>
                                      </div>
                                      <div className="LeaVerifDocsGrid">
                                        {displayResponse.response_files && displayResponse.response_files.length > 0 ? (
                                          displayResponse.response_files.map((f, idx) => (
                                            <div key={f.file_id || idx} className="LeaVerifDocCard">
                                              <div className="LeaVerifDocIcon">
                                                {f.mime_type?.startsWith('image/') ? (
                                                  <ImageIcon size={18} />
                                                ) : (
                                                  <FileText size={18} />
                                                )}
                                              </div>
                                              <div className="LeaVerifDocInfo">
                                                <p className="LeaVerifDocName">{f.file_name}</p>
                                                <span className="LeaVerifDocMeta">{f.file_size_display}</span>
                                              </div>
                                              <div className="LeaVerifDocActions">
                                                <button
                                                  type="button"
                                                  className="LeaVerifDocActionBtn"
                                                  title="Inspect Attachment"
                                                  onClick={() => setDocPreviewModal(f)}
                                                >
                                                  <Eye size={13} />
                                                </button>
                                              </div>
                                            </div>
                                          ))
                                        ) : (
                                          <p className="LeaVerifNoDocsText">No FDA response documents uploaded.</p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="LeaVerifAckNotice">
                                      <p>
                                        This case has been confirmed to be Registered. Status is now dismissed. Please click Acknowledge to move this case to closed/dismissed records.
                                      </p>
                                    </div>

                                    <div className='ResponseBtn'>
                                      <button onClick={() => handleActionButtonClick(
                                        'Dismiss Case',
                                        selectedResponse.case_reference,
                                        selectedResponse.request_id
                                      )}>
                                        Acknowledge
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="ResponseBox ResponseUnregistered">
                                      <div className='LeaVerifResponseStatusHeader LeaVerifUnregisteredHeader'>
                                        <AlertTriangle style={{ color: '#EF4444', backgroundColor: '#FEE2E2' }} />
                                        <div className='StatementReturn'>
                                          <h3>CONFIRMED UNREGISTERED PRODUCT</h3>
                                        </div>
                                      </div>

                                      <div className="LeaVerifResultFieldsGrid">
                                        <div className="LeaVerifResultField">
                                          <label className="LeaVerifFieldLabel">Verified By</label>
                                          <p className="LeaVerifFieldValue">{selectedResponse.verifier_name || '—'}</p>
                                        </div>

                                        <div className="LeaVerifResultField">
                                          <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                                          <p className="LeaVerifFieldValue">{formatDateTime(selectedResponse.responded_at)}</p>
                                        </div>

                                        <div className="LeaVerifResultField LeaVerifFullWidthField">
                                          <label className="LeaVerifFieldLabel">Reason Product is Not Registered</label>
                                          <p className="LeaVerifFieldValue">{selectedResponse.unregistered_reason || '—'}</p>
                                        </div>

                                        <div className="LeaVerifResultField LeaVerifFullWidthField">
                                          <label className="LeaVerifFieldLabel">Advisory &amp; Enforcement Recommendations for LEA</label>
                                          <p className="LeaVerifFieldValue">{selectedResponse.response_notes || '—'}</p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* 1c: FDA Response Documents under Unregistered banner */}
                                    {/* 🔌 BACKEND: expected field - response_files (list of SharedFileResponse), FDA's own upload when responding, kept separate from attached_files (the intake evidence). */}
                                    <div className="LeaVerifSectionCard" style={{ marginTop: '16px' }}>
                                      <div className="LeaVerifSectionHeader">
                                        <Paperclip size={16} className="LeaVerifBlueIcon" />
                                        <h3>FDA Response Documents</h3>
                                      </div>
                                      <div className="LeaVerifDocsGrid">
                                        {displayResponse.response_files && displayResponse.response_files.length > 0 ? (
                                          displayResponse.response_files.map((f, idx) => (
                                            <div key={f.file_id || idx} className="LeaVerifDocCard">
                                              <div className="LeaVerifDocIcon">
                                                {f.mime_type?.startsWith('image/') ? (
                                                  <ImageIcon size={18} />
                                                ) : (
                                                  <FileText size={18} />
                                                )}
                                              </div>
                                              <div className="LeaVerifDocInfo">
                                                <p className="LeaVerifDocName">{f.file_name}</p>
                                                <span className="LeaVerifDocMeta">{f.file_size_display}</span>
                                              </div>
                                              <div className="LeaVerifDocActions">
                                                <button
                                                  type="button"
                                                  className="LeaVerifDocActionBtn"
                                                  title="Inspect Attachment"
                                                  onClick={() => setDocPreviewModal(f)}
                                                >
                                                  <Eye size={13} />
                                                </button>
                                              </div>
                                            </div>
                                          ))
                                        ) : (
                                          <p className="LeaVerifNoDocsText">No FDA response documents uploaded.</p>
                                        )}
                                      </div>
                                    </div>

                                    <div className='ResponseUpdateBox'>
                                      <h6>Field operation status update</h6>
                                      {/* CHANGED (Part 0) — bound to fdaTakedownNotes, not the old shared fieldOperationNotes */}
                                      <textarea
                                        name=""
                                        id=""
                                        placeholder="Operation conducted at seller's address on 2026-05-18. Product siezed, takedown notice served."
                                        value={fdaTakedownNotes}
                                        onChange={(e) => setFdaTakedownNotes(e.target.value)}
                                        maxLength={2000}
                                      ></textarea>
                                    </div>

                                    <div className='ResponseBtn'>
                                      <button onClick={() => handleActionButtonClick(
                                        'Initiate Takedown',
                                        selectedResponse.case_reference,
                                        selectedResponse.request_id
                                      )}>
                                        Initiate Takedown
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="LeaVerifNoDetail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#7a8796', fontSize: '14px', fontWeight: '500', padding: '40px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
                        <Inbox size={32} style={{ marginBottom: '8px', color: '#94a3b8' }} />
                        Select a case from the queue to view details.
                      </div>
                    )}
                  </div>
                </div>}

              {/* INITIATED CASES TAB CONTENT */}
              {activeTab === 'Initiated Cases' &&
                <div className='VerificationContent FDAResponseButtonContent'>
                  {/* LEFT PANEL */}
                  <div className="LEAResponseQueue">
                    {/* MERGED-ADD — search bar + category filter dropdown */}
                    <div className="LEAResponseHeader">
                      <p>Cases with active takedown operations</p>
                      {/* REMOVE THIS */}
                      {/* BACKEND: count of cases where complaint_status = 'takedown_initiated' */}
                      {/* MERGED-CHANGED — count now reflects filtered results */}
                      <span>{filteredInitiatedCases.length}</span>
                    </div>
                    <div className="LeaVerifQueueFilterHeader">
                      <div className="LeaSearchWrapper">
                        <Search size={16} className="LeaSearchIcon" />
                        <input
                          type="text"
                          placeholder="Search Case ID, Product, or Manufacturer..."
                          className="LeaCategoriesSearchInput"
                          value={initiatedSearch}
                          onChange={(e) => setInitiatedSearch(e.target.value)}
                          maxLength={150}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EDEDED', padding: '5px 10px', borderRadius: '6px' }}>
                        <Filter size={14} className="LeaVerifFilterIcon" />
                        <select
                          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '12px', fontWeight: '600', color: '#030303', outline: 'none', cursor: 'pointer' }}
                          value={initiatedCategory}
                          onChange={(e) => setInitiatedCategory(e.target.value)}
                        >
                          <option value="">All Categories</option>
                          <option value="Cosmetics">Cosmetics</option>
                          <option value="Food">Food</option>
                          <option value="Devices">Devices</option>
                          <option value="Drugs">Drugs</option>
                        </select>
                      </div>
                    </div>


                    {/* ADDED — first-load skeleton; skipped on subsequent refreshes (no flickering) */}
                    {initiatedLoading && !hasLoadedInitiatedOnce && (
                      <p style={{ padding: '12px', color: '#7a8796', fontSize: '13px' }}>Loading...</p>
                    )}
                    {/* ADDED — empty list state when the backend returns 0 items */}
                    {!initiatedLoading && initiatedList.length === 0 && (
                      <p style={{ padding: '12px', color: '#7a8796', fontSize: '13px' }}>No cases with active takedown operations.</p>
                    )}

                    {/* MERGED-ADD — empty state for when filters exclude everything */}
                    {!initiatedLoading && initiatedList.length > 0 && filteredInitiatedCases.length === 0 && (
                      <div className="LeaVerifEmptyList">
                        <Search size={32} />
                        <p className="LeaVerifEmptyText">No cases match your current filters.</p>
                      </div>
                    )}

                    {/* CHANGED — cards now use real backend fields:
                         key=complaint_id, highlight on selectedInitiatedId, onClick=setSelectedInitiatedId,
                         badge is static 'Operation in Progress', date from field_operation_logged_at */}
                    {paginatedInitiatedCases.map((item) => (
                      <div
                        key={item.complaint_id}
                        className={`QueueCard ${selectedInitiatedId === item.complaint_id ? 'ActiveQueueCard' : ''}`}
                        onClick={() => setSelectedInitiatedId(item.complaint_id)}
                      >
                        <div className="QueueCardTopRow">
                          <small style={{ margin: 0 }}>CASE ID: {item.case_reference}</small>
                          <span className="OperationInProgressBadge">Operation in Progress</span>
                        </div>
                        <h4>{item.product_title}</h4>
                        <p>{item.manufacturer || '—'}</p>
                        <div className="QueueCardFooterRow">
                          <span className="QueueCategoryTag">{item.product_category || '—'}</span>
                          <span className="QueueDateTag">
                            <Calendar size={12} />
                            {formatDateTime(item.field_operation_logged_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <QueuePagination
                      currentPage={initiatedPage}
                      totalPages={initiatedTotalPages}
                      onPageChange={setInitiatedPage}
                    />
                  </div>

                  {/* CHANGED — right panel rebuilt: was reading dummy selectedInitiatedCase fields directly (no null guard);
                               now guards with null check, uses real detail fields, pre-fills fieldOperationNotes */}
                  {/* RIGHT PANEL */}
                  <div className='VerificationDetails'>
                    {selectedInitiatedCase ? (
                      <div className='VerificationCard'>
                        <div>
                          {initiatedDetailLoading && !selectedInitiatedCase ? (
                            <p style={{ color: '#7a8796', fontSize: '13px' }}>Loading details...</p>
                          ) : selectedInitiatedCase ? (
                            <>
                              {/* CHANGED — removed Manufacturer line from title block; Case ID retained */}
                              <small><span className='LeaHeaderFieldLabel'>CASE ID:</span> {selectedInitiatedCase.case_reference}</small>
                              <h2>{selectedInitiatedCase.product_title}</h2>

                              {/* CHANGED — Complainant moved to Complainant Details; Manufacturer placed last in grid */}
                              <div className="CaseInfoGrid">
                                <div>
                                  <label>CATEGORY</label>
                                  <p>{selectedInitiatedCase.product_category || '—'}</p>
                                </div>

                                <div>
                                  <label>LOGGED</label>
                                  <p>{formatDateTime(selectedInitiatedCase.logged_at)}</p>
                                </div>

                                <div>
                                  <label>SOURCE</label>
                                  <p>{GetSourceLabel(selectedInitiatedCase.source)}</p>
                                </div>

                                <div>
                                  <label>MANUFACTURER</label>
                                  <p>{selectedInitiatedCase.manufacturer || '—'}</p>
                                </div>
                              </div>

                              {/* CHANGED — passing complainantName prop to LeaComplainantDetails */}
                              <LeaComplainantDetails
                                complaintId={selectedInitiatedCase.complaint_id}
                                complainantName={selectedInitiatedCase.complainant_name}
                              />
                            </>
                          ) : (
                            <p style={{ color: '#7a8796', fontSize: '13px' }}>Select a case to view details.</p>
                          )}
                        </div>

                        {selectedInitiatedCase && (() => {
                          const displayInitiated = getMergedInitiatedData(selectedInitiatedCase);
                          const hasVerifReq = Boolean(
                            displayInitiated?.product_code ||
                            displayInitiated?.priority ||
                            displayInitiated?.complaint_statement ||
                            displayInitiated?.notes_to_fda
                          );

                          return (
                            <>
                              {/* 2a: Verification Request block */}
                              {/* 🔌 BACKEND: GET /complaints/initiated/{id} does not return product_code, priority or notes_to_fda yet (it returns attached_files). Mock fills them while the flag is on. */}
                              {hasVerifReq && (
                                <div className="VerificationRequestInfo" style={{ marginTop: '16px' }}>
                                  <h3>Verification Request</h3>
                                  <div className="VerificationRequestGrid">
                                    {displayInitiated.product_code && (
                                      <div>
                                        <label>PRODUCT CODE</label>
                                        <p>{String(displayInitiated.product_code).trim()}</p>
                                      </div>
                                    )}
                                    {displayInitiated.priority && (
                                      <div>
                                        <label>PRIORITY</label>
                                        <p>{displayInitiated.priority.charAt(0).toUpperCase() + displayInitiated.priority.slice(1)}</p>
                                      </div>
                                    )}
                                    {(displayInitiated.complaint_statement || displayInitiated.notes_to_fda) && (
                                      <div className="VerificationNotes">
                                        <label>NOTES TO FDA VERIFIER</label>
                                        <p style={{ fontWeight: 500, fontSize: '13px', lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                                          {String(displayInitiated.complaint_statement || displayInitiated.notes_to_fda).trim()}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 2a: Evidence Attached at Intake file grid */}
                              <div className="LeaVerifSectionCard" style={{ marginTop: '16px' }}>
                                <div className="LeaVerifSectionHeader">
                                  <Paperclip size={16} className="LeaVerifBlueIcon" />
                                  <h3>Evidence Attached at Intake</h3>
                                </div>
                                <div className="LeaVerifDocsGrid">
                                  {displayInitiated.attached_files && displayInitiated.attached_files.length > 0 ? (
                                    displayInitiated.attached_files.map((f, idx) => (
                                      <div key={f.file_id || idx} className="LeaVerifDocCard">
                                        <div className="LeaVerifDocIcon">
                                          {f.mime_type?.startsWith('image/') ? (
                                            <ImageIcon size={18} />
                                          ) : (
                                            <FileText size={18} />
                                          )}
                                        </div>
                                        <div className="LeaVerifDocInfo">
                                          <p className="LeaVerifDocName">{f.file_name}</p>
                                          <span className="LeaVerifDocMeta">{f.file_size_display}</span>
                                        </div>
                                        <div className="LeaVerifDocActions">
                                          <button
                                            type="button"
                                            className="LeaVerifDocActionBtn"
                                            title="Inspect Attachment"
                                            onClick={() => setDocPreviewModal(f)}
                                          >
                                            <Eye size={13} />
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="LeaVerifNoDocsText">No files attached at intake.</p>
                                  )}
                                </div>
                              </div>

                              <div className='ConfirmationReturned'>
                                {/* 2b: CONFIRMED UNREGISTERED PRODUCT block */}
                                <div className="ResponseBox ResponseUnregistered">
                                  <div className='LeaVerifResponseStatusHeader LeaVerifUnregisteredHeader'>
                                    <AlertTriangle style={{ color: '#EF4444', backgroundColor: '#FEE2E2' }} />
                                    <div className='StatementReturn'>
                                      <h3>CONFIRMED UNREGISTERED PRODUCT</h3>
                                    </div>
                                  </div>

                                  <div className="LeaVerifResultFieldsGrid">
                                    {(displayInitiated.verified_by_name || displayInitiated.verifier_name) && (
                                      <div className="LeaVerifResultField">
                                        <label className="LeaVerifFieldLabel">Verified By</label>
                                        <p className="LeaVerifFieldValue">{displayInitiated.verified_by_name || displayInitiated.verifier_name || '—'}</p>
                                      </div>
                                    )}

                                    {displayInitiated.responded_at && (
                                      <div className="LeaVerifResultField">
                                        <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                                        <p className="LeaVerifFieldValue">{formatDateTime(displayInitiated.responded_at)}</p>
                                      </div>
                                    )}

                                    {displayInitiated.unregistered_reason && (
                                      <div className="LeaVerifResultField LeaVerifFullWidthField">
                                        <label className="LeaVerifFieldLabel">Reason Product is Not Registered</label>
                                        <p className="LeaVerifFieldValue">{displayInitiated.unregistered_reason || '—'}</p>
                                      </div>
                                    )}

                                    {(displayInitiated.response_notes || displayInitiated.notes) && (
                                      <div className="LeaVerifResultField LeaVerifFullWidthField">
                                        <label className="LeaVerifFieldLabel">Advisory &amp; Enforcement Recommendations for LEA</label>
                                        <p className="LeaVerifFieldValue">{displayInitiated.response_notes || displayInitiated.notes || '—'}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* 2b: FDA Response Documents mock block */}
                                {/* 🔌 BACKEND: expected field - response_files (list of SharedFileResponse) */}
                                <div className="LeaVerifSectionCard" style={{ marginTop: '16px' }}>
                                  <div className="LeaVerifSectionHeader">
                                    <Paperclip size={16} className="LeaVerifBlueIcon" />
                                    <h3>FDA Response Documents</h3>
                                  </div>
                                  <div className="LeaVerifDocsGrid">
                                    {displayInitiated.response_files && displayInitiated.response_files.length > 0 ? (
                                      displayInitiated.response_files.map((f, idx) => (
                                        <div key={f.file_id || idx} className="LeaVerifDocCard">
                                          <div className="LeaVerifDocIcon">
                                            {f.mime_type?.startsWith('image/') ? (
                                              <ImageIcon size={18} />
                                            ) : (
                                              <FileText size={18} />
                                            )}
                                          </div>
                                          <div className="LeaVerifDocInfo">
                                            <p className="LeaVerifDocName">{f.file_name}</p>
                                            <span className="LeaVerifDocMeta">{f.file_size_display}</span>
                                          </div>
                                          <div className="LeaVerifDocActions">
                                            <button
                                              type="button"
                                              className="LeaVerifDocActionBtn"
                                              title="Inspect Attachment"
                                              onClick={() => setDocPreviewModal(f)}
                                            >
                                              <Eye size={13} />
                                            </button>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="LeaVerifNoDocsText">No FDA response documents uploaded.</p>
                                    )}
                                  </div>
                                </div>

                                {/* 2c: Existing Field operation status update and Close Case button */}
                                <div className='ResponseUpdateBox' style={{ marginTop: '16px' }}>
                                  <h6>Field operation status update</h6>
                                  {/* CHANGED (Part 0) — bound to initiatedFieldNotes, not the old shared fieldOperationNotes */}
                                  {selectedInitiatedCase?.field_operation_notes && (
                                    <p style={{ fontSize: '12px', color: '#7a8796', marginTop: '-4px', marginBottom: '10px' }}>
                                      This is the note logged when the takedown was initiated. You may update it with the latest progress before closing this case.
                                    </p>
                                  )}
                                  <textarea
                                    placeholder="Enter notes on field operation progress..."
                                    value={initiatedFieldNotes}
                                    onChange={(e) => setInitiatedFieldNotes(e.target.value)}
                                    maxLength={2000}
                                  ></textarea>
                                </div>
                                <div className='ResponseBtn' style={{ marginTop: '20px' }}>
                                  {/* CHANGED — now passes real case_reference + complaint_id instead of dummy .caseNumber / .id */}
                                  <button onClick={() => handleActionButtonClick('Close Case', selectedInitiatedCase.case_reference, selectedInitiatedCase.complaint_id)}>
                                    Close Case
                                  </button>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="LeaVerifNoDetail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#7a8796', fontSize: '14px', fontWeight: '500', padding: '40px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
                        <Inbox size={32} style={{ marginBottom: '8px', color: '#94a3b8' }} />
                        Select a case from the queue to view details.
                      </div>
                    )}
                  </div>
                </div>}

              {/* CLOSED CASES TAB CONTENT */}
              {activeTab === 'Closed Cases' &&
                <div className="DismissedTableContainer">

                  {/* MERGED-CHANGED — Filters Bar rebuilt: search leftmost, FROM/TO + category filters rightmost, matching old version's LeaFilterPanel pattern */}
                  <div className="LeaFilterPanel LeaVerifFilterPanel">
                    <div className="LeaVerifFilterControlsLeft">
                      <div className="LeaSearchWrapper">
                        <Search size={16} className="LeaSearchIcon" />
                        <input
                          type="text"
                          placeholder="Search Case ID, Product or Manufacturer..."
                          className="LeaSearchInput"
                          value={dismissedSearch}
                          onChange={(e) => setDismissedSearch(e.target.value)}
                          maxLength={150}
                        />
                      </div>
                    </div>
                    <div className="LeaVerifFilterControlsRight">
                      <div className="LeaFilterGroup">
                        {/* BACKEND: pass filterDateFrom as from_date query param */}
                        <label>From</label>
                        <input
                          type="date"
                          className="LeaVerifDateInput"
                          value={filterDateFrom}
                          onChange={(e) => setFilterDateFrom(e.target.value)}
                          title="Closed From"
                        />
                      </div>
                      <div className="LeaFilterGroup">
                        {/* BACKEND: pass filterDateTo as to_date query param */}
                        <label>To</label>
                        <input
                          type="date"
                          className="LeaVerifDateInput"
                          value={filterDateTo}
                          onChange={(e) => setFilterDateTo(e.target.value)}
                          title="Closed To"
                        />
                      </div>
                      <div className="LeaFilterGroup">
                        {/* BACKEND: pass filterCategory as category query param */}
                        <label>Category</label>
                        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                          <option value="">All Categories</option>
                          <option value="Cosmetics">Cosmetics</option>
                          <option value="Food">Food</option>
                          <option value="Drugs">Drugs</option>
                          <option value="Devices">Devices</option>
                        </select>
                      </div>
                      <div className="LeaFilterGroup">
                        {/* BACKEND: pass filterReasonClosed as reason_closed query param */}
                        <label>Reason Closed</label>
                        <select value={filterReasonClosed} onChange={(e) => setFilterReasonClosed(e.target.value)}>
                          <option value="">All Reasons</option>
                          <option value="Registered">Registered</option>
                          <option value="Rejected by FDA">Rejected by FDA</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </div>
                      {/* CHANGED (Part 1) — hasDismissedFilters now includes filterReasonClosed;
                           Clear Filters onClick now also resets filterReasonClosed */}
                      {(() => {
                        const hasDismissedFilters = Boolean(dismissedSearch || filterCategory || filterReasonClosed || filterDateFrom || filterDateTo);
                        return (
                          <button
                            className="BtnClearFiltersIcon"
                            aria-label="Clear Filters"
                            title="Clear Filters"
                            disabled={!hasDismissedFilters}
                            style={{ display: hasDismissedFilters ? 'inline-flex' : 'none' }}
                            onClick={() => {
                              setDismissedSearch('');
                              setFilterCategory('');
                              setFilterReasonClosed('');
                              setFilterDateFrom('');
                              setFilterDateTo('');
                            }}
                          >
                            <X size={16} />
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  {/* MERGED-CHANGED — Total Cases moved out of the filter-row flexbox onto its own line below,
                      matching the already-working Saved Drafts pattern. It was previously a third child inside
                      .LeaFilterPanel's flex row, so it got squeezed onto the same line as the Category dropdown
                      instead of wrapping cleanly underneath. */}
                  {/* CHANGED (Part 1) — Total Cases now comes from closedTotal (backend total count) */}
                  <div className="DraftsTotalCount" style={{ margin: '4px 2px 16px 20px' }}>
                    Total Cases: {closedTotal}
                  </div>

                  {/* Full-width table */}
                  <div className="TableCard" style={{ maxWidth: '100%' }}>
                    <table className="DismissedTable">
                      <thead>
                        <tr>
                          <th>Case ID</th>
                          <th>Product Name</th>
                          <th>Manufacturer</th>
                          <th>Category</th>
                          <th>Date Filed</th>
                          <th>Date Closed</th>
                          <th>Closed By</th>
                          <th>Reason Closed</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* CHANGED (Part 1) — replaced local-paginated dummy data with server-returned closedList */}
                        {closedLoading && !hasLoadedClosedOnce ? (
                          <tr>
                            <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: '#7a8796' }}>
                              Loading closed cases...
                            </td>
                          </tr>
                        ) : closedList.length === 0 ? (
                          <tr>
                            <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: '#7a8796' }}>
                              No closed cases match current filters.
                            </td>
                          </tr>
                        ) : (
                          closedList.map((c) => (
                            <tr key={c.complaint_id}>
                              <td style={{ fontWeight: '700', color: '#13213C' }}>{c.case_reference}</td>
                              <td style={{ fontWeight: '600' }}>{c.product_title}</td>
                              <td>{c.manufacturer || '—'}</td>
                              <td>{c.product_category || '—'}</td>
                              <td>{formatDateTime(c.date_filed)}</td>
                              <td>{formatDateTime(c.date_closed)}</td>
                              <td>{c.closed_by_name || '—'}</td>
                              <td>
                                <span className={getReasonClosedClass(c.reason_closed)}>
                                  {getReasonClosedLabel(c.reason_closed)}
                                </span>
                              </td>
                              <td>
                                <button className="BtnView" onClick={() => setViewCaseModalData(c)}>
                                  <Eye size={16} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    {/* CHANGED (Part 1) — pagination now driven by closedTotal/closedPage from backend response */}
                    {(() => {
                      const totalClosedPages = Math.ceil(closedTotal / CLOSED_PAGE_SIZE) || 1;
                      const startIdx = closedTotal === 0 ? 0 : (closedPage - 1) * CLOSED_PAGE_SIZE + 1;
                      const endIdx = Math.min(closedPage * CLOSED_PAGE_SIZE, closedTotal);

                      return (
                        <div className="Pagination">
                          <p>Showing {startIdx}–{endIdx} of {closedTotal}</p>
                          <div className="PaginationBtn">
                            <button
                              className="BtnPage"
                              disabled={closedPage === 1}
                              onClick={() => setClosedPage(closedPage - 1)}
                            >
                              Previous
                            </button>
                            {Array.from({ length: totalClosedPages }, (_, i) => i + 1).map((p) => (
                              <button
                                key={p}
                                className={`BtnPage ${closedPage === p ? 'active' : ''}`}
                                onClick={() => setClosedPage(p)}
                              >
                                {p}
                              </button>
                            ))}
                            <button
                              className="BtnPage"
                              disabled={closedPage === totalClosedPages}
                              onClick={() => setClosedPage(closedPage + 1)}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>}

            </div>
          </div>
        </div>
      </div>

      {/* NOTE: Reusable Confirmation Modal UI */}
      {modalConfig && (
        <div className="ModalOverlay">
          <div className="ModalBox">
            <h3>{modalConfig.title}</h3>
            <p>{modalConfig.message}</p>
            <div className="ModalActions">
              <button className="BtnCancelModal" onClick={modalConfig.onCancel}>Cancel</button>
              <button
                className="BtnConfirmDelete"
                style={{ backgroundColor: modalConfig.confirmBg || '#13213C' }}
                onClick={modalConfig.onConfirm}
              >
                {modalConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTE: Read-only modal displaying full case details for dismissed cases */}
      {/* CHANGED (Part 2) — all fields updated to use real backend field names;
                             reason_detail replaces the hardcoded ternary strings */}
      {/* NOTE: Read-only modal displaying full case details for closed cases */}
      {viewCaseModalData && (() => {
        // 🔌 BACKEND: needs a closed-case detail endpoint returning the verification request, FDA
        // response, response_files, takedown_initiated_at/by, field_operation_notes, closed_at/by.
        const modalData = getMergedClosedModalData(viewCaseModalData, closedModalDetail);
        const outcome = modalData?.verification_result || (
          modalData?.reason_closed === 'completed' ? 'unregistered' : modalData?.reason_closed
        );
        const hasVerifReq = Boolean(
          modalData?.product_code ||
          modalData?.priority ||
          modalData?.requested_by_name ||
          modalData?.requested_by ||
          modalData?.requested_at ||
          modalData?.notes_to_fda ||
          modalData?.complaint_statement
        );
        const hasIntakeFiles = Boolean(modalData?.attached_files && modalData.attached_files.length > 0);
        const hasFdaBanner = Boolean(outcome);
        const hasResponseFiles = Boolean(
          (outcome === 'registered' || outcome === 'unregistered') &&
          modalData?.response_files &&
          modalData.response_files.length > 0
        );
        const hasLeaActions = Boolean(
          modalData?.acknowledged_by_name ||
          modalData?.lea_acknowledged_at ||
          modalData?.takedown_initiated_by_name ||
          modalData?.takedown_initiated_at ||
          modalData?.closed_by_name ||
          modalData?.date_closed ||
          modalData?.field_operation_notes
        );

        return (
          <div className="ModalOverlay">
            <div className="LeaVerifClosedModalContainer">
              <div className="LeaVerifClosedModalHeader">
                <h4>Case Details — {modalData.case_reference}</h4>
                <button
                  type="button"
                  className="LeaVerifIconButton"
                  onClick={() => setViewCaseModalData(null)}
                  title="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="LeaVerifClosedModalBody">
                {closedModalLoading && (
                  <p style={{ padding: '8px 0', color: '#7a8796', fontSize: '13px' }}>Loading case details...</p>
                )}
                {closedModalError && !closedModalLoading && (
                  <p style={{ padding: '8px 0', color: '#ef4444', fontSize: '13px' }}>Could not load additional case details from server.</p>
                )}

                {/* Case Info Grid (existing) */}
                <div className="CaseInfoGrid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', borderTop: 'none', borderBottom: '1px solid #EDEDED', padding: '0 0 16px 0', margin: 0 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#7a8796', marginBottom: '4px' }}>Product Name</label>
                    <p style={{ fontWeight: '600', margin: 0 }}>{modalData.product_title}</p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#7a8796', marginBottom: '4px' }}>Manufacturer</label>
                    <p style={{ fontWeight: '600', margin: 0 }}>{modalData.manufacturer || '—'}</p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#7a8796', marginBottom: '4px' }}>Category</label>
                    <p style={{ fontWeight: '600', margin: 0 }}>{modalData.product_category || '—'}</p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#7a8796', marginBottom: '4px' }}>Closed By</label>
                    <p style={{ fontWeight: '600', margin: 0 }}>{modalData.closed_by_name || '—'}</p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#7a8796', marginBottom: '4px' }}>Date Filed</label>
                    <p style={{ fontWeight: '600', margin: 0 }}>{formatDateTime(modalData.date_filed)}</p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#7a8796', marginBottom: '4px' }}>Date Closed</label>
                    <p style={{ fontWeight: '600', margin: 0 }}>{formatDateTime(modalData.date_closed)}</p>
                  </div>
                </div>

                {/* 1. Verification Request: Product Code, Priority, Requested By, Date Requested, Notes to FDA Verifier */}
                {hasVerifReq && (
                  <div className="VerificationRequestInfo" style={{ margin: 0 }}>
                    <h3>Verification Request</h3>
                    <div className="VerificationRequestGrid">
                      {modalData.product_code && (
                        <div>
                          <label>PRODUCT CODE</label>
                          <p>{String(modalData.product_code).trim()}</p>
                        </div>
                      )}
                      {modalData.priority && (
                        <div>
                          <label>PRIORITY</label>
                          <p>{modalData.priority.charAt(0).toUpperCase() + modalData.priority.slice(1)}</p>
                        </div>
                      )}
                      {(modalData.requested_by_name || modalData.requested_by) && (
                        <div>
                          <label>REQUESTED BY</label>
                          <p>{modalData.requested_by_name || modalData.requested_by}</p>
                        </div>
                      )}
                      {modalData.requested_at && (
                        <div>
                          <label>DATE REQUESTED</label>
                          <p>{formatDateTime(modalData.requested_at)}</p>
                        </div>
                      )}
                      {(modalData.complaint_statement || modalData.notes_to_fda) && (
                        <div className="VerificationNotes">
                          <label>NOTES TO FDA VERIFIER</label>
                          <p style={{ fontWeight: 500, fontSize: '13px', lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                            {String(modalData.complaint_statement || modalData.notes_to_fda).trim()}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Evidence Attached at Intake (file grid, separate heading) */}
                {hasIntakeFiles && (
                  <div className="LeaVerifSectionCard" style={{ margin: 0 }}>
                    <div className="LeaVerifSectionHeader">
                      <Paperclip size={16} className="LeaVerifBlueIcon" />
                      <h3>Evidence Attached at Intake</h3>
                    </div>
                    <div className="LeaVerifDocsGrid">
                      {modalData.attached_files.map((f, idx) => (
                        <div key={f.file_id || idx} className="LeaVerifDocCard">
                          <div className="LeaVerifDocIcon">
                            {f.mime_type?.startsWith('image/') ? (
                              <ImageIcon size={18} />
                            ) : (
                              <FileText size={18} />
                            )}
                          </div>
                          <div className="LeaVerifDocInfo">
                            <p className="LeaVerifDocName">{f.file_name}</p>
                            <span className="LeaVerifDocMeta">{f.file_size_display}</span>
                          </div>
                          <div className="LeaVerifDocActions">
                            <button
                              type="button"
                              className="LeaVerifDocActionBtn"
                              title="Inspect Attachment"
                              onClick={() => setDocPreviewModal(f)}
                            >
                              <Eye size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. FDA Response banner and fields */}
                {hasFdaBanner && (
                  outcome === 'registered' ? (
                    <div className="ResponseBox ResponseRegistered" style={{ margin: 0 }}>
                      <div className='LeaVerifResponseStatusHeader LeaVerifRegisteredHeader'>
                        <CheckCircle style={{ color: '#10B981', backgroundColor: '#D1FAE5' }} />
                        <div className='StatementReturn'>
                          <h3>CONFIRMED REGISTERED PRODUCT</h3>
                        </div>
                      </div>
                      <div className="LeaVerifResultFieldsGrid">
                        {(modalData.verifier_name || modalData.verified_by_name) && (
                          <div className="LeaVerifResultField">
                            <label className="LeaVerifFieldLabel">Verified By</label>
                            <p className="LeaVerifFieldValue">{modalData.verifier_name || modalData.verified_by_name}</p>
                          </div>
                        )}
                        {modalData.responded_at && (
                          <div className="LeaVerifResultField">
                            <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                            <p className="LeaVerifFieldValue">{formatDateTime(modalData.responded_at)}</p>
                          </div>
                        )}
                        {modalData.cpr_number && (
                          <div className="LeaVerifResultField">
                            <label className="LeaVerifFieldLabel">FDA CPR Registration Number</label>
                            <p className="LeaVerifFieldValue">{modalData.cpr_number}</p>
                          </div>
                        )}
                        {modalData.cpr_expiry && (
                          <div className="LeaVerifResultField">
                            <label className="LeaVerifFieldLabel">CPR Validity / Expiry Date</label>
                            <p className="LeaVerifFieldValue">{String(modalData.cpr_expiry)}</p>
                          </div>
                        )}
                        {(modalData.response_notes || modalData.notes) && (
                          <div className="LeaVerifResultField LeaVerifFullWidthField">
                            <label className="LeaVerifFieldLabel">Official FDA Verification Remarks</label>
                            <p className="LeaVerifFieldValue">{modalData.response_notes || modalData.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : outcome === 'rejected' ? (
                    <div className="ResponseBox ResponseRejected" style={{ margin: 0 }}>
                      <div className='LeaVerifResponseStatusHeader LeaVerifRejectedHeader'>
                        <XCircle style={{ color: '#EF4444' }} />
                        <div className='StatementReturn'>
                          <h3>VERIFICATION REQUEST REJECTED</h3>
                        </div>
                      </div>
                      <div className="LeaVerifRejectionFieldsGrid">
                        {(modalData.verifier_name || modalData.rejected_by_name) && (
                          <div className="LeaVerifResultField">
                            <label className="LeaVerifFieldLabel">Rejected By</label>
                            <p className="LeaVerifFieldValue">{modalData.verifier_name || modalData.rejected_by_name}</p>
                          </div>
                        )}
                        {modalData.responded_at && (
                          <div className="LeaVerifResultField">
                            <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                            <p className="LeaVerifFieldValue">{formatDateTime(modalData.responded_at)}</p>
                          </div>
                        )}
                        {modalData.rejection_reason && (
                          <div className="LeaVerifResultField LeaVerifFullWidthField">
                            <label className="LeaVerifFieldLabel">Reason for Rejection</label>
                            <p className="LeaVerifFieldValue">{modalData.rejection_reason}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="ResponseBox ResponseUnregistered" style={{ margin: 0 }}>
                      <div className='LeaVerifResponseStatusHeader LeaVerifUnregisteredHeader'>
                        <AlertTriangle style={{ color: '#EF4444', backgroundColor: '#FEE2E2' }} />
                        <div className='StatementReturn'>
                          <h3>CONFIRMED UNREGISTERED PRODUCT</h3>
                        </div>
                      </div>
                      <div className="LeaVerifResultFieldsGrid">
                        {(modalData.verifier_name || modalData.verified_by_name) && (
                          <div className="LeaVerifResultField">
                            <label className="LeaVerifFieldLabel">Verified By</label>
                            <p className="LeaVerifFieldValue">{modalData.verifier_name || modalData.verified_by_name}</p>
                          </div>
                        )}
                        {modalData.responded_at && (
                          <div className="LeaVerifResultField">
                            <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                            <p className="LeaVerifFieldValue">{formatDateTime(modalData.responded_at)}</p>
                          </div>
                        )}
                        {modalData.unregistered_reason && (
                          <div className="LeaVerifResultField LeaVerifFullWidthField">
                            <label className="LeaVerifFieldLabel">Reason Product is Not Registered</label>
                            <p className="LeaVerifFieldValue">{modalData.unregistered_reason}</p>
                          </div>
                        )}
                        {(modalData.response_notes || modalData.notes) && (
                          <div className="LeaVerifResultField LeaVerifFullWidthField">
                            <label className="LeaVerifFieldLabel">Advisory &amp; Enforcement Recommendations for LEA</label>
                            <p className="LeaVerifFieldValue">{modalData.response_notes || modalData.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}

                {/* 4. FDA Response Documents (registered and unregistered only, mock, separate heading) */}
                {/* 🔌 BACKEND: expected field - response_files */}
                {hasResponseFiles && (
                  <div className="LeaVerifSectionCard" style={{ margin: 0 }}>
                    <div className="LeaVerifSectionHeader">
                      <Paperclip size={16} className="LeaVerifBlueIcon" />
                      <h3>FDA Response Documents</h3>
                    </div>
                    <div className="LeaVerifDocsGrid">
                      {modalData.response_files.map((f, idx) => (
                        <div key={f.file_id || idx} className="LeaVerifDocCard">
                          <div className="LeaVerifDocIcon">
                            {f.mime_type?.startsWith('image/') ? (
                              <ImageIcon size={18} />
                            ) : (
                              <FileText size={18} />
                            )}
                          </div>
                          <div className="LeaVerifDocInfo">
                            <p className="LeaVerifDocName">{f.file_name}</p>
                            <span className="LeaVerifDocMeta">{f.file_size_display}</span>
                          </div>
                          <div className="LeaVerifDocActions">
                            <button
                              type="button"
                              className="LeaVerifDocActionBtn"
                              title="Inspect Attachment"
                              onClick={() => setDocPreviewModal(f)}
                            >
                              <Eye size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. LEA Actions: Acknowledged At/By; for unregistered cases also Takedown Initiated At/By with Field operation status update box, and Closed At/By */}
                {hasLeaActions && (
                  <div className="LeaVerifSectionCard" style={{ margin: 0 }}>
                    <div className="LeaVerifSectionHeader">
                      <CheckCircle size={16} className="LeaVerifBlueIcon" />
                      <h3>LEA Actions</h3>
                    </div>
                    <div className="LeaVerifResultFieldsGrid">
                      {modalData.acknowledged_by_name && (
                        <div className="LeaVerifResultField">
                          <label className="LeaVerifFieldLabel">Acknowledged By</label>
                          <p className="LeaVerifFieldValue">{modalData.acknowledged_by_name}</p>
                        </div>
                      )}
                      {modalData.lea_acknowledged_at && (
                        <div className="LeaVerifResultField">
                          <label className="LeaVerifFieldLabel">Date Acknowledged</label>
                          <p className="LeaVerifFieldValue">{formatDateTime(modalData.lea_acknowledged_at)}</p>
                        </div>
                      )}
                      {(outcome === 'unregistered' || outcome === 'completed') && modalData.takedown_initiated_by_name && (
                        <div className="LeaVerifResultField">
                          <label className="LeaVerifFieldLabel">Takedown Initiated By</label>
                          <p className="LeaVerifFieldValue">{modalData.takedown_initiated_by_name}</p>
                        </div>
                      )}
                      {(outcome === 'unregistered' || outcome === 'completed') && modalData.takedown_initiated_at && (
                        <div className="LeaVerifResultField">
                          <label className="LeaVerifFieldLabel">Date Takedown Initiated</label>
                          <p className="LeaVerifFieldValue">{formatDateTime(modalData.takedown_initiated_at)}</p>
                        </div>
                      )}
                      {modalData.closed_by_name && (
                        <div className="LeaVerifResultField">
                          <label className="LeaVerifFieldLabel">Closed By</label>
                          <p className="LeaVerifFieldValue">{modalData.closed_by_name}</p>
                        </div>
                      )}
                      {modalData.date_closed && (
                        <div className="LeaVerifResultField">
                          <label className="LeaVerifFieldLabel">Date Closed</label>
                          <p className="LeaVerifFieldValue">{formatDateTime(modalData.date_closed)}</p>
                        </div>
                      )}
                      {(outcome === 'unregistered' || outcome === 'completed') && modalData.field_operation_notes && (
                        <div className="LeaVerifResultField LeaVerifFullWidthField">
                          <label className="LeaVerifFieldLabel">Field Operation Status Update</label>
                          <p className="LeaVerifFieldValue" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                            {modalData.field_operation_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 6. Reason Closed box (existing, now last) */}
                <div className="RejectionReasonBox" style={{
                  backgroundColor:
                    modalData.reason_closed === 'registered' ? 'rgba(16, 185, 129, 0.1)' :
                      modalData.reason_closed === 'completed' ? 'rgba(37, 99, 235, 0.1)' :
                        'rgba(249, 115, 22, 0.1)',
                  borderColor:
                    modalData.reason_closed === 'registered' ? '#10b981' :
                      modalData.reason_closed === 'completed' ? '#2563eb' :
                        '#f97316',
                  margin: '0 0 4px 0'
                }}>
                  <label style={{
                    display: 'block',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    color:
                      modalData.reason_closed === 'registered' ? '#059669' :
                        modalData.reason_closed === 'completed' ? '#1d4ed8' :
                          '#ea580c',
                    fontWeight: '600',
                    marginBottom: '6px'
                  }}>Reason Closed</label>
                  <p className="ReasonDetail" style={{ color: '#030303', fontWeight: '500', margin: 0 }}>
                    {modalData.reason_detail || '—'}
                  </p>
                </div>
              </div>

              <div className="LeaVerifClosedModalFooter">
                <button className="BtnCancelModal" onClick={() => setViewCaseModalData(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ADDED — attachment preview modal, mirrors the FDA-side implementation.
    Fetches inline preview from GET /shared-files/{file_id}/preview (images + PDF only);
    other mime types fall back to a download-only placeholder. */}
      {docPreviewModal && (
        <div className="ModalOverlay">
          <div className="LeaVerifDocModalContainer">
            <div className="LeaVerifDocModalHeader">
              <div className="LeaVerifDocModalTitleGroup">
                <Paperclip size={16} className="LeaVerifBlueIcon" />
                <div>
                  <h3>{docPreviewModal.file_name}</h3>
                  <p className="LeaVerifDocModalMeta">
                    {docPreviewModal.mime_type} &bull; {docPreviewModal.file_size_display}
                  </p>
                </div>
              </div>
              <button className="LeaVerifIconButton" onClick={() => setDocPreviewModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="LeaVerifDocModalBody">
              {docPreviewModal.isMock ? (
                <div className="LeaVerifDocPlaceholderPreview">
                  <FileText size={48} className="LeaVerifDocPreviewIcon" />
                  <p className="LeaVerifPreviewTitle">Preview not supported</p>
                  <p className="LeaVerifPreviewText">
                    Preview not available yet. FDA response documents are not connected to the backend.
                  </p>
                </div>
              ) : (docPreviewModal.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(docPreviewModal.file_name)) ? (
                <img
                  src={docPreviewUrl}
                  alt={docPreviewModal.file_name}
                  className="LeaVerifDocImagePreview"
                />
              ) : (docPreviewModal.mime_type === 'application/pdf' || /\.pdf$/i.test(docPreviewModal.file_name)) ? (
                docPreviewLoading ? (
                  <div className="LeaVerifDocPlaceholderPreview">
                    <p className="LeaVerifPreviewText">Loading preview&hellip;</p>
                  </div>
                ) : docPreviewError ? (
                  <div className="LeaVerifDocPlaceholderPreview">
                    <FileText size={48} className="LeaVerifDocPreviewIcon" />
                    <p className="LeaVerifPreviewTitle">Preview unavailable</p>
                    <p className="LeaVerifPreviewText">Try downloading the file instead.</p>
                  </div>
                ) : (
                  <iframe
                    src={docPreviewUrl}
                    title={docPreviewModal.file_name}
                    className="LeaVerifDocPdfPreview"
                  />
                )
              ) : (docPreviewModal.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(docPreviewModal.file_name)) ? (
                docxLoading ? (
                  <div className="LeaVerifDocPlaceholderPreview">
                    <p className="LeaVerifPreviewText">Converting Word document for preview&hellip;</p>
                  </div>
                ) : docxError ? (
                  <div className="LeaVerifDocPlaceholderPreview">
                    <FileText size={48} className="LeaVerifDocPreviewIcon" />
                    <p className="LeaVerifPreviewTitle">Could not render Word preview</p>
                    <p className="LeaVerifPreviewText">Try downloading the document to view its full contents.</p>
                  </div>
                ) : (
                  <div className="LeaVerifDocDocxPreview">
                    <div
                      className="LeaVerifDocxContent"
                      dangerouslySetInnerHTML={{ __html: docxHtml }}
                    />
                  </div>
                )
              ) : (
                <div className="LeaVerifDocPlaceholderPreview">
                  <FileText size={48} className="LeaVerifDocPreviewIcon" />
                  <p className="LeaVerifPreviewTitle">Preview not supported</p>
                  <p className="LeaVerifPreviewText">
                    <strong>{docPreviewModal.file_name}</strong> can't be previewed inline &mdash; use download instead.
                  </p>
                </div>
              )}
            </div>

            <div className="LeaVerifModalFooter">
              <button className="LeaVerifBtnOutline" onClick={() => setDocPreviewModal(null)}>
                Close Preview
              </button>
              <button
                className="LeaVerifBtnPrimary"
                disabled={docPreviewModal.isMock}
                onClick={() => {
                  if (docPreviewModal.isMock) return;
                  apiFetch(`/shared-files/${docPreviewModal.file_id}/download`)
                    .then((res) => {
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      return res.blob();
                    })
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = docPreviewModal.file_name;
                      a.click();
                      URL.revokeObjectURL(url);
                    })
                    .catch(() => setErrorMessage('Could not download the file. Please try again.'));
                }}
              >
                <Download size={14} />
                <span>Download Attachment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FDA-STYLE FLOATING SUCCESS TOAST ALERT */}
      {successMessage && (
        <div className="LeaToastAlert LeaToast_success" role="alert">
          <div className="LeaToastIconWrap">
            <CheckCircle size={18} />
          </div>
          <div className="LeaToastBody">
            <p className="LeaToastMessage">{successMessage}</p>
          </div>
          <button
            className="LeaToastCloseBtn"
            onClick={() => setSuccessMessage('')}
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* FDA-STYLE FLOATING ERROR TOAST ALERT */}
      {errorMessage && (
        <div className="LeaToastAlert LeaToast_danger" role="alert">
          <div className="LeaToastIconWrap">
            <XCircle size={18} />
          </div>
          <div className="LeaToastBody">
            <p className="LeaToastMessage">{errorMessage}</p>
          </div>
          <button
            className="LeaToastCloseBtn"
            onClick={() => setErrorMessage('')}
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ADDED — Centered processing overlay */}
      <ProcessingOverlay
        isVisible={proc.isVisible}
        title={proc.title}
        message={proc.message}
        status={proc.status}
      />
    </div>
  );
}
export default LeaVerificationRequest
