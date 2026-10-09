// desktopfrontend/src/pages/fdafolder/fda-verification.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from "../component/sidebar";
import TopBar from "../component/top-bar";
import './fda-css.css';
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  FileText,
  Search,
  Filter,
  Download,
  Eye,
  Send,
  Save,
  Paperclip,
  Calendar,
  Info,
  X,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Image as ImageIcon,
  AlertCircle // ADDED — for upload error message
} from 'lucide-react';
import { apiFetch } from '../../utils/apiFetch';
// ADDED — processing overlay
import { useProcessing } from '../../utils/useProcessing';
import ProcessingOverlay from '../component/processing-overlay';
import mammoth from 'mammoth'; // CHANGED — added for .docx preview in Queue attachment modal


// ============================================================================
// BACKEND NOTIFICATION ARCHITECTURE SPECIFICATION
// ============================================================================
// NOTE: Global notifications occur through the TopBar component (top-bar.jsx).
// Inter-Agency Notification triggers between LEA-CIDG and FDA are handled via:
// 1. LEA Submits Request -> // BACKEND: Trigger notification to FDA TopBar notification panel ("New verification request received from LEA. CASE ID: XXXXX")
// 2. LEA Recalls Request -> // BACKEND: Trigger notification to FDA TopBar notification panel ("Verification request recalled by LEA. CASE ID: XXXXX")
// 3. LEA Sends Reminder -> // BACKEND: Trigger notification to FDA TopBar notification panel ("Reminder received from LEA for CASE ID XXXXX.")
// 4. FDA Submits Verification -> // BACKEND: Trigger notification to LEA TopBar notification panel ("FDA has completed verification for CASE ID XXXXX.")
// 5. FDA Rejects Verification -> // BACKEND: Trigger notification to LEA TopBar notification panel ("FDA rejected verification request for CASE ID XXXXX.")
// 6. LEA Acknowledges Rejection -> // BACKEND: Trigger notification to FDA TopBar notification panel ("LEA acknowledged rejection for CASE ID XXXXX.")
// 7. LEA Initiates Takedown -> // BACKEND: Trigger notification to FDA TopBar notification panel ("LEA initiated enforcement operation for CASE ID XXXXX.")
// 8. LEA Closes Case -> // BACKEND: Trigger notification to FDA TopBar notification panel ("LEA has closed CASE ID XXXXX.")
//
// WORKFLOW TRANSITIONS:
// Verification Queue (Pending) -> FDA reviews -> Registered or Unregistered -> Completed
// or
// Verification Queue (Pending) -> Rejected -> Rejected Requests
// ============================================================================

// ============================================================================
// 🔌 BACKEND: set to false once GET /verification-requests/lea-follow-up exists
// ============================================================================
const USE_LEA_RESPONSE_MOCK = true;

// 🔌 BACKEND: set UPLOAD to true once POST /verification-requests/{request_id}/fda-attachments exists.
const FDA_ATTACHMENTS_UI_ENABLED = true;
const FDA_ATTACHMENTS_UPLOAD_ENABLED = false;

// ADDED — FDA evidence attachment limits (matching LEA)
const FDA_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const FDA_MAX_FILES = 10;
const FDA_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.docx'];

const formatFdaFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// ⚠️ REMOVE THIS — Mock dataset for LEA Response tracking until backend endpoint is available.
// Covers: awaiting_lea, acknowledged, takedown_initiated, closed, registered+acknowledged, and rejected+acknowledged.
const MOCK_LEA_RESPONSE_RECORDS = [
  {
    // 🔌 BACKEND: expected field
    request_id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    // 🔌 BACKEND: expected field
    case_reference: "VR-2026-0301",
    // 🔌 BACKEND: expected field
    product_title: "Glow Skin Rejuvenating Facial Toner 60ml",
    // 🔌 BACKEND: expected field
    product_category: "Cosmetics",
    // 🔌 BACKEND: expected field
    manufacturer: "Brilliant Skin Essentials Inc.",
    // 🔌 BACKEND: expected field
    source: "walk_in",
    // 🔌 BACKEND: expected field
    product_code: "LOT-2025-BR-991",
    // 🔌 BACKEND: expected field
    fda_result: "unregistered",
    // 🔌 BACKEND: expected field
    responded_at: "2026-09-28T09:30:00Z",
    // 🔌 BACKEND: expected field
    verified_by_name: "Maria Santos, RPh",
    // 🔌 BACKEND: expected field
    lea_stage: "awaiting_lea",
    // 🔌 BACKEND: expected field
    last_updated_at: "2026-09-28T09:30:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_at: null,
    // 🔌 BACKEND: expected field
    acknowledged_by_name: null,
    // 🔌 BACKEND: expected field
    takedown_initiated_at: null,
    // 🔌 BACKEND: expected field
    takedown_initiated_by_name: null,
    // 🔌 BACKEND: expected field
    field_operation_notes: null,
    // 🔌 BACKEND: expected field
    closed_at: null,
    // 🔌 BACKEND: expected field
    closed_by_name: null,
    // 🔌 BACKEND: expected field
    close_reason: null,
    // 🔌 BACKEND: expected field - closing field operation update, needed because Close Case currently overwrites field_operation_notes
    closing_notes: null,
    // 🔌 BACKEND: expected field
    reminder_sent_at: "2026-10-01T14:15:00Z",
    // 🔌 BACKEND: expected field - attached_files (list of SharedFileResponse), same shape
    // as GET /verification-requests/completed/{id}
    attached_files: [
      // ⚠️ REMOVE THIS
      {
        file_id: "mock-lea-file-01",
        file_name: "toner_bottle_sample.jpg",
        mime_type: "image/jpeg",
        file_size_display: "1.4 MB",
      },
      // ⚠️ REMOVE THIS
      {
        file_id: "mock-lea-file-02",
        file_name: "walkin_sworn_complaint.pdf",
        mime_type: "application/pdf",
        file_size_display: "520.8 KB",
      },
    ],
  },
  {
    // 🔌 BACKEND: expected field
    request_id: "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    // 🔌 BACKEND: expected field
    case_reference: "VR-2026-0284",
    // 🔌 BACKEND: expected field
    product_title: "Rosmar Kagayaku Bleaching Whipped Soap 100g",
    // 🔌 BACKEND: expected field
    product_category: "Cosmetics",
    // 🔌 BACKEND: expected field
    manufacturer: "Rosmar Skin Essentials",
    // 🔌 BACKEND: expected field
    source: "walk_in",
    // 🔌 BACKEND: expected field
    product_code: "NN-100000849201",
    // 🔌 BACKEND: expected field
    fda_result: "registered",
    // 🔌 BACKEND: expected field
    responded_at: "2026-09-25T11:00:00Z",
    // 🔌 BACKEND: expected field
    verified_by_name: "Arlene Cruz, RPh",
    // 🔌 BACKEND: expected field
    lea_stage: "acknowledged",
    // 🔌 BACKEND: expected field
    last_updated_at: "2026-09-26T08:45:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_at: "2026-09-26T08:45:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_by_name: "Capt. Danilo Reyes, CIDG",
    // 🔌 BACKEND: expected field
    takedown_initiated_at: null,
    // 🔌 BACKEND: expected field
    takedown_initiated_by_name: null,
    // 🔌 BACKEND: expected field
    field_operation_notes: null,
    // 🔌 BACKEND: expected field
    closed_at: null,
    // 🔌 BACKEND: expected field
    closed_by_name: null,
    // 🔌 BACKEND: expected field
    close_reason: null,
    // 🔌 BACKEND: expected field - closing field operation update, needed because Close Case currently overwrites field_operation_notes
    closing_notes: null,
    // 🔌 BACKEND: expected field
    reminder_sent_at: null,
    // 🔌 BACKEND: expected field - attached_files (list of SharedFileResponse), same shape
    // as GET /verification-requests/completed/{id}
    attached_files: [],
  },
  {
    // 🔌 BACKEND: expected field
    request_id: "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
    // 🔌 BACKEND: expected field
    case_reference: "VR-2026-0268",
    // 🔌 BACKEND: expected field
    product_title: "Dr. Alvin Kojic Acid Dipalmitate Soap 135g",
    // 🔌 BACKEND: expected field
    product_category: "Cosmetics",
    // 🔌 BACKEND: expected field
    manufacturer: "Dr. Alvin Health and Beauty",
    // 🔌 BACKEND: expected field
    source: "walk_in",
    // 🔌 BACKEND: expected field
    product_code: "DA-LOT-7742",
    // 🔌 BACKEND: expected field
    fda_result: "unregistered",
    // 🔌 BACKEND: expected field
    responded_at: "2026-09-20T14:10:00Z",
    // 🔌 BACKEND: expected field
    verified_by_name: "Maria Santos, RPh",
    // 🔌 BACKEND: expected field
    lea_stage: "takedown_initiated",
    // 🔌 BACKEND: expected field
    last_updated_at: "2026-09-22T16:20:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_at: "2026-09-21T09:15:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_by_name: "Maj. Arthur Morales, CIDG",
    // 🔌 BACKEND: expected field
    takedown_initiated_at: "2026-09-22T16:20:00Z",
    // 🔌 BACKEND: expected field
    takedown_initiated_by_name: "Maj. Arthur Morales, CIDG",
    // 🔌 BACKEND: expected field
    field_operation_notes: "Joint surveillance scheduled with Divisoria retail enforcement unit.\nCounterfeit batch verified at stall #41. Takedown notice served.",
    // 🔌 BACKEND: expected field
    closed_at: null,
    // 🔌 BACKEND: expected field
    closed_by_name: null,
    // 🔌 BACKEND: expected field
    close_reason: null,
    // 🔌 BACKEND: expected field - closing field operation update, needed because Close Case currently overwrites field_operation_notes
    closing_notes: null,
    // 🔌 BACKEND: expected field
    reminder_sent_at: null,
    // 🔌 BACKEND: expected field - attached_files (list of SharedFileResponse), same shape
    // as GET /verification-requests/completed/{id}
    attached_files: [
      // ⚠️ REMOVE THIS
      {
        file_id: "mock-lea-file-03",
        file_name: "divisoria_stall_evidence.jpg",
        mime_type: "image/jpeg",
        file_size_display: "2.1 MB",
      },
    ],
  },
  {
    // 🔌 BACKEND: expected field
    request_id: "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
    // 🔌 BACKEND: expected field
    case_reference: "VR-2026-0240",
    // 🔌 BACKEND: expected field
    product_title: "Kojie San Skin Lightening Classic Soap 65g",
    // 🔌 BACKEND: expected field
    product_category: "Cosmetics",
    // 🔌 BACKEND: expected field
    manufacturer: "Beauty Elements Ventures Inc.",
    // 🔌 BACKEND: expected field
    source: "walk_in",
    // 🔌 BACKEND: expected field
    product_code: "KS-BATCH-9931",
    // 🔌 BACKEND: expected field
    fda_result: "unregistered",
    // 🔌 BACKEND: expected field
    responded_at: "2026-09-12T10:00:00Z",
    // 🔌 BACKEND: expected field
    verified_by_name: "Arlene Cruz, RPh",
    // 🔌 BACKEND: expected field
    lea_stage: "closed",
    // 🔌 BACKEND: expected field
    last_updated_at: "2026-09-18T15:30:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_at: "2026-09-13T11:20:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_by_name: "Capt. Danilo Reyes, CIDG",
    // 🔌 BACKEND: expected field
    takedown_initiated_at: "2026-09-14T13:00:00Z",
    // 🔌 BACKEND: expected field
    takedown_initiated_by_name: "Maj. Arthur Morales, CIDG",
    // 🔌 BACKEND: expected field
    field_operation_notes: "Physical seizure scheduled at Quiapo market stall. Warrant served on merchant.",
    // 🔌 BACKEND: expected field
    closed_at: "2026-09-18T15:30:00Z",
    // 🔌 BACKEND: expected field
    closed_by_name: "Col. Renato Mendoza, CIDG",
    // 🔌 BACKEND: expected field
    close_reason: "Completed",
    // 🔌 BACKEND: expected field - closing field operation update, needed because Close Case currently overwrites field_operation_notes
    closing_notes: "140 counterfeit bars confiscated and logged into CIDG evidence locker.\nSeller issued citation and online storefront takedown notice successfully executed.",
    // 🔌 BACKEND: expected field
    reminder_sent_at: null,
    // 🔌 BACKEND: expected field - attached_files (list of SharedFileResponse), same shape
    // as GET /verification-requests/completed/{id}
    attached_files: [
      // ⚠️ REMOVE THIS
      {
        file_id: "mock-lea-file-04",
        file_name: "confiscation_inventory.pdf",
        mime_type: "application/pdf",
        file_size_display: "340.5 KB",
      },
      // ⚠️ REMOVE THIS
      {
        file_id: "mock-lea-file-05",
        file_name: "storefront_takedown_receipt.pdf",
        mime_type: "application/pdf",
        file_size_display: "185.0 KB",
      },
    ],
  },
  {
    // 🔌 BACKEND: expected field
    request_id: "e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b",
    // 🔌 BACKEND: expected field
    case_reference: "VR-2026-0222",
    // 🔌 BACKEND: expected field
    product_title: "Fair & White Gold Ultimate Radiance Serum 30ml",
    // 🔌 BACKEND: expected field
    product_category: "Cosmetics",
    // 🔌 BACKEND: expected field
    manufacturer: "Labo Derma Paris (Imported)",
    // 🔌 BACKEND: expected field
    source: "walk_in",
    // 🔌 BACKEND: expected field
    product_code: null,
    // 🔌 BACKEND: expected field
    fda_result: "rejected",
    // 🔌 BACKEND: expected field
    responded_at: "2026-09-08T16:45:00Z",
    // 🔌 BACKEND: expected field
    verified_by_name: "Maria Santos, RPh",
    // 🔌 BACKEND: expected field
    lea_stage: "acknowledged",
    // 🔌 BACKEND: expected field
    last_updated_at: "2026-09-09T10:15:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_at: "2026-09-09T10:15:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_by_name: "Capt. Danilo Reyes, CIDG",
    // 🔌 BACKEND: expected field
    takedown_initiated_at: null,
    // 🔌 BACKEND: expected field
    takedown_initiated_by_name: null,
    // 🔌 BACKEND: expected field
    field_operation_notes: null,
    // 🔌 BACKEND: expected field
    closed_at: null,
    // 🔌 BACKEND: expected field
    closed_by_name: null,
    // 🔌 BACKEND: expected field
    close_reason: null,
    // 🔌 BACKEND: expected field - closing field operation update, needed because Close Case currently overwrites field_operation_notes
    closing_notes: null,
    // 🔌 BACKEND: expected field
    reminder_sent_at: null,
    // 🔌 BACKEND: expected field - attached_files (list of SharedFileResponse), same shape
    // as GET /verification-requests/completed/{id}
    attached_files: [],
  },
  {
    // 🔌 BACKEND: expected field
    request_id: "f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c",
    // 🔌 BACKEND: expected field
    case_reference: "VR-2026-0210",
    // 🔌 BACKEND: expected field
    product_title: "Belo SunExpert Whitening Sunscreen SPF 50 50ml",
    // 🔌 BACKEND: expected field
    product_category: "Cosmetics",
    // 🔌 BACKEND: expected field
    manufacturer: "Intelligent Skin Care, Inc. (Belo)",
    // 🔌 BACKEND: expected field
    source: "walk_in",
    // 🔌 BACKEND: expected field
    product_code: "NN-100000918234",
    // 🔌 BACKEND: expected field
    fda_result: "registered",
    // 🔌 BACKEND: expected field
    responded_at: "2026-10-02T13:40:00Z",
    // 🔌 BACKEND: expected field
    verified_by_name: "Arlene Cruz, RPh",
    // 🔌 BACKEND: expected field
    lea_stage: "awaiting_lea",
    // 🔌 BACKEND: expected field
    last_updated_at: "2026-10-02T13:40:00Z",
    // 🔌 BACKEND: expected field
    acknowledged_at: null,
    // 🔌 BACKEND: expected field
    acknowledged_by_name: null,
    // 🔌 BACKEND: expected field
    takedown_initiated_at: null,
    // 🔌 BACKEND: expected field
    takedown_initiated_by_name: null,
    // 🔌 BACKEND: expected field
    field_operation_notes: null,
    // 🔌 BACKEND: expected field
    closed_at: null,
    // 🔌 BACKEND: expected field
    closed_by_name: null,
    // 🔌 BACKEND: expected field
    close_reason: null,
    // 🔌 BACKEND: expected field - closing field operation update, needed because Close Case currently overwrites field_operation_notes
    closing_notes: null,
    // 🔌 BACKEND: expected field
    reminder_sent_at: null,
    // 🔌 BACKEND: expected field - attached_files (list of SharedFileResponse), same shape
    // as GET /verification-requests/completed/{id}
    attached_files: [
      // ⚠️ REMOVE THIS
      {
        file_id: "mock-lea-file-06",
        file_name: "sunscreen_label_scan.jpg",
        mime_type: "image/jpeg",
        file_size_display: "890.1 KB",
      },
    ],
  },
];

function FDAVerification() {
  const proc = useProcessing(); // ADDED — processing overlay state




  // BACKEND: active tab filter state ('queue' | 'completed' | 'rejected' | 'lea_response')
  const [fdaActiveTab, setFdaActiveTab] = useState('queue');

  // CHANGED — starts empty; real data is loaded by the fetch useEffect below.
  const [fdaQueueList, setFdaQueueList] = useState([]);
  // CHANGED — starts empty; replaced by real fetch from GET /verification-requests/completed.
  const [fdaCompletedList, setFdaCompletedList] = useState([]);
  // CHANGED — starts empty; replaced by real fetch from GET /verification-requests/rejected.
  const [fdaRejectedList, setFdaRejectedList] = useState([]);

  // LEA Response tracking state
  const [leaResponseList, setLeaResponseList] = useState(USE_LEA_RESPONSE_MOCK ? MOCK_LEA_RESPONSE_RECORDS : []);
  const [leaResponseLoading, setLeaResponseLoading] = useState(false);
  const [leaResponseTotal, setLeaResponseTotal] = useState(USE_LEA_RESPONSE_MOCK ? MOCK_LEA_RESPONSE_RECORDS.length : 0);
  const [leaSearch, setLeaSearch] = useState('');
  const [leaStageFilter, setLeaStageFilter] = useState('');
  const [leaResultFilter, setLeaResultFilter] = useState('');
  const [leaPage, setLeaPage] = useState(1);
  const leaTableWrapperRef = useRef(null);

  // ADDED — tracks whether the completed list fetch is in progress.
  const [completedLoading, setCompletedLoading] = useState(false);
  // ADDED — total record count from the server response; drives server-side pagination.
  const [completedTotal, setCompletedTotal] = useState(0);
  // ADDED — tracks whether the rejected list fetch is in progress.
  const [rejectedLoading, setRejectedLoading] = useState(false);
  // ADDED — total rejected record count from the server response; drives server-side pagination.
  const [rejectedTotal, setRejectedTotal] = useState(0);

  // ADDED — holds the three badge counts fetched from GET /verification-requests/counts.
  // Starts as null (not 0) so the UI shows "-" while the request is in-flight
  // instead of flashing a misleading "0" on first render.
  const [queueCounts, setQueueCounts] = useState(null);

  // ADDED — tracks whether the queue list fetch is in progress so the UI can
  // show a loading state instead of an empty list while waiting.
  const [queueLoading, setQueueLoading] = useState(true);

  // ADDED — holds the full detail object fetched from GET /verification-requests/{request_id}
  // when a card is selected. Separate from selectedQueueItem (which is the list-item
  // shape used only for the card highlight). Null while no card has been selected.
  const [selectedQueueDetail, setSelectedQueueDetail] = useState(null);

  // ADDED — true while the per-item detail fetch is in flight, so the detail
  // panel can show a loading indicator instead of stale or blank fields.
  const [detailLoading, setDetailLoading] = useState(false);

  // BACKEND: selected item pointer for Verification Queue
  // CHANGED — starts as null; real first selection is made after the fetch resolves.
  const [selectedQueueItem, setSelectedQueueItem] = useState(null);

  // BACKEND: Queue search query & priority filter states
  const [fdaSearchQuery, setFdaSearchQuery] = useState('');
  const [fdaPriorityFilter, setFdaPriorityFilter] = useState('all');

  // BACKEND: Completed Records Table Filters
  const [completedSearch, setCompletedSearch] = useState('');
  const [completedDateFrom, setCompletedDateFrom] = useState('');
  const [completedDateTo, setCompletedDateTo] = useState('');
  const [completedCategory, setCompletedCategory] = useState('');
  // ADDED — new Verification Result filter dropdown; maps to verification_result query param.
  // Empty string = All Results (param is omitted); 'registered' or 'unregistered' = filter.
  const [completedResultFilter, setCompletedResultFilter] = useState('');

  // BACKEND: Rejected Records Table Filters
  const [rejectedSearch, setRejectedSearch] = useState('');
  const [rejectedDateFrom, setRejectedDateFrom] = useState('');
  const [rejectedDateTo, setRejectedDateTo] = useState('');
  const [rejectedCategory, setRejectedCategory] = useState('');

  // Pagination for Completed & Rejected tables (25 rows per page)
  const FDA_VERIF_TABLE_PAGE_SIZE = 25;
  const [completedPage, setCompletedPage] = useState(1);
  const [rejectedPage, setRejectedPage] = useState(1);
  const [queuePage, setQueuePage] = useState(1);


  // BACKEND: Form inputs for FDA Verification Result section
  // Maps to: verification_requests.fda_verification_status ('Registered' | 'Unregistered')
  const [fdaVerificationStatus, setFdaVerificationStatus] = useState('');
  // Maps to: verification_requests.fda_cpr_number
  const [fdaCprNumber, setFdaCprNumber] = useState('');
  // Maps to: verification_requests.fda_cpr_expiry
  const [fdaCprExpiry, setFdaCprExpiry] = useState('');
  // Maps to: verification_requests.fda_official_remarks (Registered path)
  const [fdaOfficialRemarks, setFdaOfficialRemarks] = useState('');
  // Maps to: verification_requests.fda_official_remarks (Unregistered advisory path)
  const [fdaAdvisoryRemarks, setFdaAdvisoryRemarks] = useState('');
  // Maps to: verification_requests.fda_unregistered_reason
  const [fdaUnregisteredReason, setFdaUnregisteredReason] = useState('');
  // Maps to: verification_requests.fda_rejection_reason
  const [fdaRejectionReason, setFdaRejectionReason] = useState('');

  // ADDED — trigger used to refresh Completed and Rejected list fetches after a successful submit or reject.
  const [dataRefreshTrigger, setDataRefreshTrigger] = useState(0);

  // ADDED — refs for scrolling table containers back to top when table page changes (FIX 5)
  const completedTableWrapperRef = useRef(null);
  const rejectedTableWrapperRef = useRef(null);

  // CHANGED — refs for stale response guard (Fix 1 & 3) and unsaved changes tracking (Fix 2)
  const latestRequestIdRef = useRef(null);
  const formBaselineRef = useRef({
    status: '',
    cprNumber: '',
    cprExpiry: '',
    officialRemarks: '',
    advisoryRemarks: '',
    unregisteredReason: '',
    rejectionReason: '',
    attachedFilesCount: 0, // CHANGED — track attached files count for unsaved changes
  });

  // ADDED — FDA verification evidence attachment states
  const [fdaAttachedFiles, setFdaAttachedFiles] = useState([]);
  const [fdaFileError, setFdaFileError] = useState('');
  const [isFdaDragActive, setIsFdaDragActive] = useState(false);

  useEffect(() => {
    if (completedTableWrapperRef.current) {
      completedTableWrapperRef.current.scrollTop = 0;
    }
  }, [completedPage]);

  useEffect(() => {
    if (rejectedTableWrapperRef.current) {
      rejectedTableWrapperRef.current.scrollTop = 0;
    }
  }, [rejectedPage]);

  useEffect(() => {
    if (leaTableWrapperRef.current) {
      leaTableWrapperRef.current.scrollTop = 0;
    }
  }, [leaPage]);

  // BACKEND: UI view toggles & modal states
  const [fdaIsRejecting, setFdaIsRejecting] = useState(false);
  const [fdaModalConfig, setFdaModalConfig] = useState(null); // { type: 'submit' | 'reject' | 'save_draft', title, description }
  const [fdaSuccessAlert, setFdaSuccessAlert] = useState(null); // { message, type }
  const [fdaDocPreviewModal, setFdaDocPreviewModal] = useState(null); // document object
  const [fdaRecordModalData, setFdaRecordModalData] = useState(null); // Completed or Rejected record for View modal

  // ADDED — preview fetch state for the intake document preview modal.
  // fdaDocPreviewUrl holds a blob object URL (revoked on close); Loading and Error
  // track the in-flight fetch so the modal can show a spinner or fallback.
  const [fdaDocPreviewUrl, setFdaDocPreviewUrl] = useState(null);
  const [fdaDocPreviewLoading, setFdaDocPreviewLoading] = useState(false);
  const [fdaDocPreviewError, setFdaDocPreviewError] = useState(false);
  // CHANGED — three states for .docx conversion via mammoth (Fix 2)
  const [docxHtml, setDocxHtml] = useState('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState(false);

  // CHANGED — fetches a preview blob from GET /shared-files/{file_id}/preview whenever
  // fdaDocPreviewModal changes. Supports images, PDFs, and Word (.docx via mammoth);
  // other types are left to the download-only fallback.
  // Amendment 2: resets all three docx states at the top of every open run.
  // Amendment 3: uses a `cancelled` flag so async callbacks are no-ops after cleanup.
  useEffect(() => {
    if (!fdaDocPreviewModal) {
      setFdaDocPreviewUrl(null);
      setFdaDocPreviewError(false);
      // CHANGED — reset docx states when modal closes (Fix 2)
      setDocxHtml('');
      setDocxLoading(false);
      setDocxError(false);
      return;
    }

    // CHANGED — derive type from mime_type with file-extension fallback (Amendment 1)
    const mime = fdaDocPreviewModal.mime_type || '';
    const name = fdaDocPreviewModal.file_name || '';
    const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);
    const isDocx = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(name);

    if (!isImage && !isPdf && !isDocx) return; // unsupported types keep the placeholder

    // CHANGED — reset docx states at start of every open run (Amendment 2)
    setDocxHtml('');
    setDocxLoading(false);
    setDocxError(false);

    if (isDocx) {
      // CHANGED — docx branch with cancellation flag (Amendment 3)
      let cancelled = false;
      setDocxLoading(true);
      setDocxError(false);
      apiFetch(`/shared-files/${fdaDocPreviewModal.file_id}/preview`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((arrayBuffer) => mammoth.convertToHtml({ arrayBuffer }))
        .then((result) => {
          if (!cancelled) setDocxHtml(result.value);
        })
        .catch((err) => {
          console.error('Docx conversion error:', err);
          if (!cancelled) setDocxError(true);
        })
        .finally(() => {
          if (!cancelled) setDocxLoading(false);
        });
      return () => {
        cancelled = true; // CHANGED — prevent stale setState after unmount/file switch
      };
    }

    let objectUrl = null;
    setFdaDocPreviewLoading(true);
    setFdaDocPreviewError(false);

    apiFetch(`/shared-files/${fdaDocPreviewModal.file_id}/preview`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setFdaDocPreviewUrl(objectUrl);
      })
      .catch(() => setFdaDocPreviewError(true))
      .finally(() => setFdaDocPreviewLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl); // CHANGED — blob cleanup preserved
    };
  }, [fdaDocPreviewModal]);

  // Receives navigation state from the FDA Saved Drafts page — either
  // { openVerificationRequestId, draftId, mode } from "View"/"Continue
  // Editing", or nothing at all if the officer navigated here some other
  // way. Auto-opens the right request in the Verification Queue tab, and
  // — if a draftId was included — fetches the actual saved draft values
  // and pre-fills the determination form, so "Continue Editing" genuinely
  // continues rather than reopening a blank form.
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const incoming = location.state;
    if (!incoming?.openVerificationRequestId) return;

    const requestId = incoming.openVerificationRequestId;
    const draftId = incoming.draftId;

    const existing = fdaQueueList.find((q) => q.request_id === requestId);
    setFdaActiveTab('queue');

    if (existing) {
      applySelection(existing, true); // CHANGED — direct switch, bypasses prompt (Fix 2)
    } else {
      latestRequestIdRef.current = requestId; // CHANGED — update latestRequestIdRef (Fix 3)
      setSelectedQueueItem({ request_id: requestId });
      // CHANGED — reset formBaselineRef in minimal { request_id } branch (Fix 2 Amendment 2)
      formBaselineRef.current = {
        status: '',
        cprNumber: '',
        cprExpiry: '',
        officialRemarks: '',
        advisoryRemarks: '',
        unregisteredReason: '',
        rejectionReason: '',
        attachedFilesCount: 0,
      };
    }

    if (draftId) {
      // CHANGED — use shared loadDraftIntoForm helper (Fix 1)
      loadDraftIntoForm(draftId, requestId);
    } else {
      // No draft to restore — arrived from clicking a live queue card
      // directly, so just clear any stale form values from before.
      setFdaVerificationStatus('');
      setFdaCprNumber('');
      setFdaCprExpiry('');
      setFdaOfficialRemarks('');
      setFdaAdvisoryRemarks('');
      setFdaUnregisteredReason('');
      // CHANGED — reset formBaselineRef to blank in no draft branch (Fix 2 Amendment 2)
      formBaselineRef.current = {
        status: '',
        cprNumber: '',
        cprExpiry: '',
        officialRemarks: '',
        advisoryRemarks: '',
        unregisteredReason: '',
        rejectionReason: '',
        attachedFilesCount: 0,
      };
    }

    // Clear navigation state so refreshing/back doesn't re-trigger this.
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // TAB SELECTION & VIEW TRANSITIONS

  const handleTabChange = (tabKey) => {
    if (fdaActiveTab === tabKey) return;
    setFdaIsRejecting(false);
    setFdaActiveTab(tabKey);
  };


  // FILTERING LOGIC FOR VERIFICATION QUEUE & FULL-WIDTH TABLES

  // CHANGED — queue filtering is now done server-side via query params, so
  // filteredQueue is just the raw fetched list. The old client-side useMemo
  // that filtered by fdaSearchQuery and fdaPriorityFilter has been removed;
  // those states now drive the debounced fetch useEffect below instead.
  const filteredQueue = fdaQueueList;

  // In case we'd need a client-side filtering, uncomment this and remove the server-side code
  /* const filteredCompleted = useMemo(() => {
    return fdaCompletedList.filter((item) => {
      const q = completedSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.caseId.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.manufacturer.toLowerCase().includes(q) ||
        (item.productCode && item.productCode.toLowerCase().includes(q));
  
      const matchesCategory =
        !completedCategory || item.category === completedCategory;
  
      let matchesDateFrom = true;
      if (completedDateFrom) {
        matchesDateFrom = new Date(item.dateCompleted) >= new Date(completedDateFrom);
      }
  
      let matchesDateTo = true;
      if (completedDateTo) {
        matchesDateTo = new Date(item.dateCompleted) <= new Date(completedDateTo + 'T23:59:59');
      }
  
      return matchesSearch && matchesCategory && matchesDateFrom && matchesDateTo;
    });
  }, [fdaCompletedList, completedSearch, completedCategory, completedDateFrom, completedDateTo]); */

  // CHANGED — filtering is now done server-side via query params sent in the
  // fetchCompletedList useEffect below. fdaCompletedList already holds the
  // pre-filtered page of results returned by the backend.
  const filteredCompleted = fdaCompletedList;

  // CHANGED — filtering is now done server-side via query params sent in the
  // fetchRejectedList useEffect below. fdaRejectedList already holds the
  // pre-filtered page of results returned by the backend.
  // In case we'd need a client-side filtering, uncomment this and remove the server-side code:
  /* const filteredRejected = useMemo(() => {
    return fdaRejectedList.filter((item) => {
      const q = rejectedSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.caseId.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.manufacturer.toLowerCase().includes(q) ||
        (item.productCode && item.productCode.toLowerCase().includes(q));
  
      const matchesCategory =
        !rejectedCategory || item.category === rejectedCategory;
  
      let matchesDateFrom = true;
      if (rejectedDateFrom) {
        matchesDateFrom = new Date(item.dateRejected) >= new Date(rejectedDateFrom);
      }
  
      let matchesDateTo = true;
      if (rejectedDateTo) {
        matchesDateTo = new Date(item.dateRejected) <= new Date(rejectedDateTo + 'T23:59:59');
      }
  
      return matchesSearch && matchesCategory && matchesDateFrom && matchesDateTo;
    });
  }, [fdaRejectedList, rejectedSearch, rejectedCategory, rejectedDateFrom, rejectedDateTo]); */
  const filteredRejected = fdaRejectedList;

  // Filtered and sorted dataset for LEA Response tracking table
  // Default sort: most recently updated first (last_updated_at descending)
  const filteredLeaResponse = useMemo(() => {
    let list = [...leaResponseList];
    const q = leaSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          (item.case_reference || '').toLowerCase().includes(q) ||
          (item.product_title || '').toLowerCase().includes(q) ||
          (item.manufacturer || '').toLowerCase().includes(q)
      );
    }
    if (leaStageFilter) {
      list = list.filter((item) => item.lea_stage === leaStageFilter);
    }
    if (leaResultFilter) {
      list = list.filter((item) => (item.fda_result || '').toLowerCase() === leaResultFilter.toLowerCase());
    }
    list.sort((a, b) => {
      const timeA = a.last_updated_at ? new Date(a.last_updated_at).getTime() : 0;
      const timeB = b.last_updated_at ? new Date(b.last_updated_at).getTime() : 0;
      return timeB - timeA;
    });
    return list;
  }, [leaResponseList, leaSearch, leaStageFilter, leaResultFilter]);

  // Active item in Verification Queue
  const currentItem = selectedQueueItem;

  // Helper for success alerts
  const triggerAlert = (message, type = 'success') => {
    setFdaSuccessAlert({ message, type });
    setTimeout(() => {
      setFdaSuccessAlert(null);
    }, 4500);
  };

  // CHANGED — shared helper to fetch saved draft and load into determination form (Fix 1)
  const loadDraftIntoForm = (draftId, targetRequestId) => {
    apiFetch(`/drafts/fda-verification/${draftId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // CHANGED — stale-response guard: ignore draft response if active card changed (Fix 1)
        if (targetRequestId && latestRequestIdRef.current !== targetRequestId) return;

        let formattedStatus = '';
        const rawStatus = data.draft_verification_status ?? '';
        if (rawStatus) {
          formattedStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
        }

        let official = '';
        let advisory = '';
        if (data.draft_verification_status === 'registered' || data.draft_verification_status?.toLowerCase() === 'registered') {
          official = data.draft_response_notes ?? '';
        } else if (data.draft_verification_status === 'unregistered' || data.draft_verification_status?.toLowerCase() === 'unregistered') {
          advisory = data.draft_response_notes ?? '';
        }

        const cprNo = data.draft_cpr_number ?? '';
        const cprExp = data.draft_cpr_expiry ?? '';
        const unregReason = data.draft_unregistered_reason ?? '';

        setFdaOfficialRemarks(official);
        setFdaAdvisoryRemarks(advisory);
        setFdaCprNumber(cprNo);
        setFdaCprExpiry(cprExp);
        setFdaUnregisteredReason(unregReason);
        setFdaVerificationStatus(formattedStatus);

        // CHANGED — update baseline ref with loaded draft values (Fix 2 Amendment 2)
        formBaselineRef.current = {
          status: formattedStatus,
          cprNumber: cprNo,
          cprExpiry: cprExp,
          officialRemarks: official,
          advisoryRemarks: advisory,
          unregisteredReason: unregReason,
          rejectionReason: '',
          attachedFilesCount: 0,
        };
      })
      .catch(() => {
        // CHANGED — stale-response guard: ignore draft response if active card changed (Fix 1)
        if (targetRequestId && latestRequestIdRef.current !== targetRequestId) return;
        triggerAlert('Could not load the saved draft values. Starting with a blank form.', 'danger');
        setFdaVerificationStatus('');
        setFdaCprNumber('');
        setFdaCprExpiry('');
        setFdaOfficialRemarks('');
        setFdaAdvisoryRemarks('');
        setFdaUnregisteredReason('');
        // CHANGED — reset formBaselineRef to blank on load error (Fix 2 Amendment 2)
        formBaselineRef.current = {
          status: '',
          cprNumber: '',
          cprExpiry: '',
          officialRemarks: '',
          advisoryRemarks: '',
          unregisteredReason: '',
          rejectionReason: '',
          attachedFilesCount: 0,
        };
      });
  };

  // CHANGED — check if current form values differ from the baseline (Fix 2)
  const hasUnsavedChanges = () => {
    const base = formBaselineRef.current;
    if (!base) return false;
    return (
      fdaVerificationStatus !== base.status ||
      fdaCprNumber !== base.cprNumber ||
      fdaCprExpiry !== base.cprExpiry ||
      fdaOfficialRemarks !== base.officialRemarks ||
      fdaAdvisoryRemarks !== base.advisoryRemarks ||
      fdaUnregisteredReason !== base.unregisteredReason ||
      fdaRejectionReason !== base.rejectionReason ||
      fdaAttachedFiles.length !== (base.attachedFilesCount || 0)
    );
  };

  // ADDED — FDA evidence attachment handlers
  const handleFdaFileSelection = (incomingFiles) => {
    setFdaFileError('');
    if (!incomingFiles || incomingFiles.length === 0) return;

    const validFiles = [];
    let errorMsg = '';

    for (const file of incomingFiles) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!FDA_ALLOWED_EXTENSIONS.includes(ext)) {
        if (!errorMsg) errorMsg = 'Only JPG, PNG, PDF, and DOCX files are allowed.';
        continue;
      }
      if (file.size > FDA_MAX_FILE_SIZE_BYTES) {
        if (!errorMsg) errorMsg = `${file.name} exceeds the 25 MB file size limit.`;
        continue;
      }
      validFiles.push(file);
    }

    if (fdaAttachedFiles.length + validFiles.length > FDA_MAX_FILES) {
      errorMsg = 'You can attach a maximum of 10 files.';
      const availableSlots = Math.max(0, FDA_MAX_FILES - fdaAttachedFiles.length);
      const capped = validFiles.slice(0, availableSlots);
      setFdaAttachedFiles((prev) => [...prev, ...capped]);
    } else {
      setFdaAttachedFiles((prev) => [...prev, ...validFiles]);
    }

    if (errorMsg) {
      setFdaFileError(errorMsg);
    }
  };

  const handleFdaFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFdaFileSelection(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleFdaDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFdaDragActive(true);
  };

  const handleFdaDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFdaDragActive(false);
  };

  const handleFdaDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFdaDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFdaFileSelection(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  };

  const handleRemoveFdaFile = (indexToRemove) => {
    setFdaAttachedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setFdaFileError('');
  };

  // CHANGED — card selection switch logic with state resets and draft loading (Fix 1 & 2)
  const applySelection = (item, skipTabCheck = false) => {
    setFdaIsRejecting(false); // CHANGED — preserve setFdaIsRejecting(false) (Fix 2 Amendment 3)
    if (skipTabCheck || fdaActiveTab === 'queue') { // CHANGED — preserve fdaActiveTab === 'queue' guard (Fix 2 Amendment 3)
      latestRequestIdRef.current = item.request_id; // CHANGED — synchronously update latestRequestIdRef (Fix 3 Amendment)
      setSelectedQueueItem(item);
      setFdaRejectionReason(''); // CHANGED — clear fdaRejectionReason on card selection change (Fix 2b)
      setFdaVerificationStatus('');
      setFdaCprNumber('');
      setFdaCprExpiry('');
      setFdaOfficialRemarks('');
      setFdaAdvisoryRemarks('');
      setFdaUnregisteredReason('');
      setFdaAttachedFiles([]); // ADDED — reset attached files on card selection switch
      setFdaFileError(''); // ADDED — reset file error on card switch
      formBaselineRef.current = {
        status: '',
        cprNumber: '',
        cprExpiry: '',
        officialRemarks: '',
        advisoryRemarks: '',
        unregisteredReason: '',
        rejectionReason: '',
        attachedFilesCount: 0,
      };
      // NOTE: backend does not return has_draft/draft_id on list or detail; only drafts saved this session reload here.
      if (item.has_draft && (item.draft_id || item.draftId)) {
        loadDraftIntoForm(item.draft_id || item.draftId, item.request_id);
      }
    }
  };

  // CHANGED — checks for unsaved changes before switching to a different card (Fix 2)
  const handleSelectItem = (item) => {
    if (selectedQueueItem?.request_id === item.request_id) return;
    if (hasUnsavedChanges()) {
      setFdaModalConfig({
        type: 'discard',
        title: 'Discard unsaved changes?',
        description: 'The entered verification details for this request will be lost.',
        confirmText: 'Discard & Switch',
        confirmVariant: 'danger',
        targetItem: item,
      });
      return;
    }
    applySelection(item);
  };

  // ADDED — fetches the full detail for a queue item by its request_id.
  // Defined here (after triggerAlert) so the .catch() can call triggerAlert
  // without hitting a temporal dead zone. Called from handleSelectItem on
  // card click, and from a useEffect that watches selectedQueueItem so the
  // detail panel is also populated on the initial auto-select after page load.
  const fetchDetail = (requestId) => {
    setDetailLoading(true);
    apiFetch(`/verification-requests/${requestId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // CHANGED — stale-response guard: ignore if user has switched to a different card (Fix 3)
        if (latestRequestIdRef.current !== requestId) return;
        setSelectedQueueDetail(data);
        // FIX 1 — keep selectedQueueItem in sync so currentItem (used in toasts & dialogs)
        // is enriched with case_reference and other fields when arriving via Continue Editing.
        setSelectedQueueItem((prev) => (prev ? { ...prev, ...data } : data));
      })
      .catch(() => {
        // CHANGED — stale-response guard: ignore if user has switched to a different card (Fix 3)
        if (latestRequestIdRef.current !== requestId) return;
        triggerAlert('Could not load the verification request details.', 'danger');
      })
      .finally(() => {
        // CHANGED — stale-response guard: only reset loading for active card (Fix 3)
        if (latestRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      });
  };

  // ADDED — helper function to fetch badge counts from the backend endpoint.
  // Called on component mount and after successful submit or reject actions.
  const fetchCounts = () => {
    // CHANGED — return promise so await fetchCounts() waits
    return apiFetch('/verification-requests/counts')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setQueueCounts({
          verification_queue_count: data.verification_queue_count,
          completed_count: data.completed_count,
          rejected_count: data.rejected_count,
        });
      })
      .catch(() => {
        triggerAlert('Could not load verification queue counts from the server.', 'danger');
      });
  };

  useEffect(() => {
    fetchCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ADDED — fetches the real Verification Queue list from the backend.
  // Runs on mount and re-runs (with 300 ms debounce) whenever fdaSearchQuery
  // or fdaPriorityFilter changes. Both filters are sent as a single combined
  // request; if priority is 'all' the parameter is omitted entirely.
  // SMOOTH LOADING — only triggers full loading state if list is currently empty.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fdaQueueList.length === 0) {
        setQueueLoading(true);
      }

      const params = new URLSearchParams();
      if (fdaSearchQuery.trim()) params.set('search', fdaSearchQuery.trim());
      if (fdaPriorityFilter !== 'all') params.set('priority', fdaPriorityFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';

      apiFetch(`/verification-requests/awaiting-fda${qs}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setFdaQueueList(data);
          // Preserve currently selected card if it still exists in the new result
          setSelectedQueueItem((prev) => {
            if (prev && data.some((item) => item.request_id === prev.request_id)) {
              return prev;
            }
            return data[0] ?? null;
          });
        })
        .catch(() => {
          triggerAlert('Could not load the verification queue from the server.', 'danger');
        })
        .finally(() => setQueueLoading(false));
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fdaSearchQuery, fdaPriorityFilter, dataRefreshTrigger]);


  // ADDED — whenever selectedQueueItem changes (either from a manual card click
  // via handleSelectItem, or from the auto-select after the list fetch resolves),
  // fetch the full detail for that item. This single useEffect covers both paths
  // cleanly and avoids calling fetchDetail from two separate places.
  // FIX 3 — removed the setSelectedQueueDetail(null) call that was here.
  // Keeping stale data visible while the next fetch is in-flight prevents the
  // panel from blanking/flickering every time the user clicks a different card.
  useEffect(() => {
    if (selectedQueueItem?.request_id) {
      // CHANGED — set latestRequestIdRef.current immediately before fetchDetail (Fix 3 Amendment)
      latestRequestIdRef.current = selectedQueueItem.request_id;
      fetchDetail(selectedQueueItem.request_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQueueItem?.request_id]);


  // ADDED — fetches the Completed list from the backend whenever any filter or
  // page changes. completedSearch is debounced (300 ms); all other dependencies
  // trigger immediately since they come from dropdowns/date pickers, not typing.
  // SMOOTH LOADING — only triggers full loading state if list is currently empty.
  useEffect(() => {
    const doFetch = () => {
      if (fdaCompletedList.length === 0) {
        setCompletedLoading(true);
      }
      const params = new URLSearchParams();
      if (completedSearch.trim()) params.set('search', completedSearch.trim());
      if (completedCategory) params.set('category', completedCategory);
      if (completedDateFrom) params.set('date_from', completedDateFrom);
      if (completedDateTo) params.set('date_to', completedDateTo);
      // ADDED — sends verification_result only when a specific result is selected;
      // omitted entirely when empty ('All Results') to let the backend return both.
      if (completedResultFilter) params.set('verification_result', completedResultFilter);
      params.set('page', String(completedPage));
      params.set('page_size', '25');

      apiFetch(`/verification-requests/completed?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setFdaCompletedList(data.items);
          setCompletedTotal(data.total);
        })
        .catch(() => {
          triggerAlert('Could not load completed verification records from the server.', 'danger');
        })
        .finally(() => setCompletedLoading(false));
    };

    // Debounce only the text search; other filters fire immediately.
    const timer = setTimeout(doFetch, completedSearch ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // CHANGED — added completedResultFilter and dataRefreshTrigger to the dependency array.
  }, [completedSearch, completedCategory, completedDateFrom, completedDateTo, completedPage, completedResultFilter, dataRefreshTrigger]);

  // ADDED — fetches the Rejected list from the backend whenever any filter or
  // page changes. rejectedSearch is debounced (300 ms); all other dependencies
  // trigger immediately since they come from dropdowns/date pickers, not typing.
  // SMOOTH LOADING — only triggers full loading state if list is currently empty.
  useEffect(() => {
    const doFetch = () => {
      if (fdaRejectedList.length === 0) {
        setRejectedLoading(true);
      }
      const params = new URLSearchParams();
      if (rejectedSearch.trim()) params.set('search', rejectedSearch.trim());
      if (rejectedCategory) params.set('category', rejectedCategory);
      if (rejectedDateFrom) params.set('date_from', rejectedDateFrom);
      if (rejectedDateTo) params.set('date_to', rejectedDateTo);
      params.set('page', String(rejectedPage));
      params.set('page_size', '25');

      apiFetch(`/verification-requests/rejected?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setFdaRejectedList(data.items);
          setRejectedTotal(data.total);
        })
        .catch(() => {
          triggerAlert('Could not load rejected verification records from the server.', 'danger');
        })
        .finally(() => setRejectedLoading(false));
    };

    // Debounce only the text search; other filters fire immediately.
    const timer = setTimeout(doFetch, rejectedSearch ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejectedSearch, rejectedCategory, rejectedDateFrom, rejectedDateTo, rejectedPage, dataRefreshTrigger]);

  // 🔌 BACKEND: Fetch function for GET /verification-requests/lea-follow-up (list)
  // Reuses apiFetch with loading and error handling.
  // When USE_LEA_RESPONSE_MOCK is true, uses mock records instead of calling backend.
  useEffect(() => {
    if (USE_LEA_RESPONSE_MOCK) {
      setLeaResponseList(MOCK_LEA_RESPONSE_RECORDS);
      setLeaResponseTotal(MOCK_LEA_RESPONSE_RECORDS.length);
      return;
    }

    const doFetch = () => {
      if (leaResponseList.length === 0) {
        setLeaResponseLoading(true);
      }
      const params = new URLSearchParams();
      if (leaSearch.trim()) params.set('search', leaSearch.trim());
      if (leaStageFilter) params.set('stage', leaStageFilter);
      if (leaResultFilter) params.set('fda_result', leaResultFilter);
      params.set('page', String(leaPage));
      params.set('page_size', String(FDA_VERIF_TABLE_PAGE_SIZE));

      apiFetch(`/verification-requests/lea-follow-up?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (Array.isArray(data)) {
            setLeaResponseList(data);
            setLeaResponseTotal(data.length);
          } else if (data && Array.isArray(data.items)) {
            setLeaResponseList(data.items);
            setLeaResponseTotal(data.total ?? data.items.length);
          }
        })
        .catch(() => {
          triggerAlert('Could not load LEA Response tracking records from the server.', 'danger');
        })
        .finally(() => setLeaResponseLoading(false));
    };

    const timer = setTimeout(doFetch, leaSearch ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaSearch, leaStageFilter, leaResultFilter, leaPage, dataRefreshTrigger]);

  // CONFIRMATION MODAL HANDLERS

  // Open modal for Save Draft
  const handleOpenSaveDraftModal = () => {
    if (!currentItem) return;
    setFdaModalConfig({
      type: 'save_draft',
      title: 'Save Verification as Draft?',
      // CHANGED — uses case_reference (real field name) instead of the old caseId.
      description: `Save current verification draft for Case ID ${currentItem.case_reference}? You can return to continue working on this request anytime from the Verification Queue.`,
      confirmText: 'Save Draft',
      confirmVariant: 'secondary'
    });
  };

  // Open modal for Submit Verification
  // CHANGED — Added client-side validation per backend specifications before opening modal.
  const handleOpenSubmitModal = () => {
    if (!currentItem) return;
    if (!fdaVerificationStatus) {
      triggerAlert('Please select a Verification Status (Registered or Unregistered) before submitting.', 'danger');
      return;
    }

    const statusLower = fdaVerificationStatus.toLowerCase();
    if (statusLower === 'registered') {
      if (!fdaCprNumber.trim() || !fdaOfficialRemarks.trim()) {
        triggerAlert('CPR Registration Number and Official FDA Verification Remarks are required for a Registered determination.', 'danger');
        return;
      }
      if (fdaOfficialRemarks.trim().length < 10) {
        triggerAlert('Official FDA Verification Remarks must be at least 10 characters.', 'danger');
        return;
      }
      if (fdaCprExpiry) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;
        if (fdaCprExpiry <= todayStr) {
          triggerAlert('CPR Expiry Date must be in the future.', 'danger');
          return;
        }
      }
    } else if (statusLower === 'unregistered') {
      if (!fdaUnregisteredReason.trim()) {
        triggerAlert('Reason Product is Not Registered is required for an Unregistered determination.', 'danger');
        return;
      }
      if (fdaUnregisteredReason.trim().length < 10) {
        triggerAlert('Reason Product is Not Registered must be at least 10 characters.', 'danger');
        return;
      }
    }

    setFdaModalConfig({
      type: 'submit',
      title: 'Submit Verification Result back to LEA?',
      // CHANGED — uses case_reference (real field name) instead of the old caseId.
      description: `Transmit official FDA verification result (${fdaVerificationStatus.toUpperCase()}) for Case ID ${currentItem.case_reference} back to LEA-CIDG? This will finalize the verification and notify the LEA investigation team.`,
      confirmText: 'Submit Verification',
      confirmVariant: 'primary'
    });
  };

  // Open modal for Reject Request
  // CHANGED — Added client-side validation for non-empty rejection reason before opening modal.
  const handleOpenRejectModal = () => {
    if (!currentItem) return;
    if (!fdaRejectionReason.trim()) {
      triggerAlert('Please provide a rejection reason before rejecting this request.', 'danger');
      return;
    }
    if (fdaRejectionReason.trim().length < 10) {
      triggerAlert('Rejection reason must be at least 10 characters.', 'danger');
      return;
    }

    setFdaModalConfig({
      type: 'reject',
      title: 'Reject Verification Request?',
      // CHANGED — uses case_reference (real field name) instead of the old caseId.
      description: `Reject verification request for Case ID ${currentItem.case_reference} back to LEA-CIDG? The request will be recorded as Rejected and LEA officers will be notified with your rejection reason.`,
      confirmText: 'Confirm Rejection',
      confirmVariant: 'danger'
    });
  };

  // Modal execution handler
  // CHANGED — Wired Submit and Reject modal confirmations to real backend API endpoints:
  // POST /verification-requests/{request_id}/fda-response and POST /verification-requests/{request_id}/fda-reject.
  // Performs error handling, item removal, form reset, and counts re-fetch.
  const handleExecuteModalAction = async () => {
    if (!fdaModalConfig) return;

    if (fdaModalConfig.type === 'discard') {
      // CHANGED — call setFdaModalConfig(null) first, then applySelection (Fix 2 Amendment 4)
      const target = fdaModalConfig.targetItem;
      setFdaModalConfig(null);
      if (target) {
        applySelection(target);
      }
      return;
    }

    if (!currentItem) return;

    if (fdaModalConfig.type === 'save_draft') {
      // CHANGED — close modal before proc.run()
      setFdaModalConfig(null);
      let draftData = null;

      const ok = await proc.run(
        {
          title: 'SAVING DRAFT...',
          message: 'Saving verification findings draft...',
          withSuccess: false,
        },
        async () => {
          try {
            const payload = {
              draft_verification_status: fdaVerificationStatus.toLowerCase() || null,
              draft_cpr_number: fdaCprNumber.trim() || null,
              draft_cpr_expiry: fdaCprExpiry.trim() || null,
              draft_response_notes: fdaVerificationStatus.toLowerCase() === 'registered'
                ? (fdaOfficialRemarks.trim() || null)
                : (fdaAdvisoryRemarks.trim() || null),
              draft_unregistered_reason: fdaUnregisteredReason.trim() || null,
            };

            const res = await apiFetch(`/drafts/fda-verification/${currentItem.request_id}`, {
              method: 'POST',
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => null);
              const errMsg = errData?.detail || 'Failed to save draft.';
              triggerAlert(errMsg, 'danger');
              return false;
            }

            draftData = await res.json().catch(() => null);
            // Re-fetch badge counts and trigger queue refresh (same mechanism as Submit/Reject)
            await fetchCounts();
            return true;
          } catch (err) {
            triggerAlert('Network error occurred while saving the draft.', 'danger');
            return false;
          }
        }
      );

      if (ok) {
        // Update active queue item and queue list to reflect saved draft
        if (currentItem) {
          const updatedItem = {
            ...currentItem,
            has_draft: true,
            draft_id: draftData?.draft_id ?? currentItem.draft_id,
            draft_status: draftData?.draft_status ?? 'draft',
          };
          setSelectedQueueItem(updatedItem);
          setSelectedQueueDetail((prev) => (prev ? { ...prev, has_draft: true, draft_id: draftData?.draft_id ?? prev.draft_id } : prev));
          setFdaQueueList((prev) =>
            prev.map((item) =>
              item.request_id === currentItem.request_id
                ? { ...item, has_draft: true, draft_id: draftData?.draft_id ?? item.draft_id }
                : item
            )
          );
        }

        // Trigger queue refresh in background
        setDataRefreshTrigger((prev) => prev + 1);

        triggerAlert(`Draft saved successfully for Case ID ${currentItem.case_reference}.`, 'success');
        // CHANGED — update formBaselineRef to current form values on draft save success (Fix 2)
        formBaselineRef.current = {
          status: fdaVerificationStatus,
          cprNumber: fdaCprNumber,
          cprExpiry: fdaCprExpiry,
          officialRemarks: fdaOfficialRemarks,
          advisoryRemarks: fdaAdvisoryRemarks,
          unregisteredReason: fdaUnregisteredReason,
          rejectionReason: '',
          attachedFilesCount: 0,
        };
      }
    }
    else if (fdaModalConfig.type === 'submit') {
      // CHANGED — close modal before proc.run()
      setFdaModalConfig(null);

      const ok = await proc.run(
        {
          title: 'SUBMITTING VERIFICATION...',
          message: 'Submitting official FDA verification response...',
          withSuccess: false,
        },
        async () => {
          try {
            // CHANGED — upload attachments first if upload feature flag is active and files exist
            if (FDA_ATTACHMENTS_UPLOAD_ENABLED && fdaAttachedFiles.length > 0) {
              const formData = new FormData();
              fdaAttachedFiles.forEach((file) => formData.append('files', file));

              const uploadRes = await apiFetch(`/verification-requests/${currentItem.request_id}/fda-attachments`, {
                method: 'POST',
                body: formData,
              });

              if (!uploadRes.ok) {
                const uploadErrData = await uploadRes.json().catch(() => null);
                const uploadErrMsg = uploadErrData?.detail || 'Failed to upload attachments.';
                triggerAlert(uploadErrMsg, 'danger');
                return false;
              }
            }

            const payload = {
              verification_status: fdaVerificationStatus.toLowerCase(),
              cpr_number: fdaCprNumber.trim() || null,
              cpr_expiry: fdaCprExpiry.trim() || null,
              response_notes: fdaVerificationStatus.toLowerCase() === 'registered'
                ? (fdaOfficialRemarks.trim() || null)
                : (fdaAdvisoryRemarks.trim() || null),
              unregistered_reason: fdaUnregisteredReason.trim() || null
            };

            const res = await apiFetch(`/verification-requests/${currentItem.request_id}/fda-response`, {
              method: 'POST',
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => null);
              const errMsg = errData?.detail || 'Failed to submit verification response.';
              triggerAlert(errMsg, 'danger');
              return false;
            }

            await fetchCounts();
            return true;
          } catch (err) {
            triggerAlert('Network error occurred while submitting verification.', 'danger');
            return false;
          }
        }
      );

      if (ok) {
        const caseRef = currentItem.case_reference || selectedQueueDetail?.case_reference || '';
        triggerAlert(`Verification submitted successfully for Case ID ${caseRef}.`, 'success');

        if (fdaActiveTab === 'queue') {
          const remaining = fdaQueueList.filter((q) => q.request_id !== currentItem.request_id);
          setFdaQueueList(remaining);
          const nextItem = remaining[0] || null;
          setSelectedQueueItem(nextItem);
          if (!nextItem) {
            setSelectedQueueDetail(null);
          }
        }

        setFdaVerificationStatus('');
        setFdaCprNumber('');
        setFdaCprExpiry('');
        setFdaOfficialRemarks('');
        setFdaAdvisoryRemarks('');
        setFdaUnregisteredReason('');
        setFdaAttachedFiles([]); // ADDED — reset attached files on submit success
        setFdaFileError(''); // ADDED — reset file error on submit success
        // CHANGED — reset formBaselineRef to blank on submit success (Fix 2 Amendment 1)
        formBaselineRef.current = {
          status: '',
          cprNumber: '',
          cprExpiry: '',
          officialRemarks: '',
          advisoryRemarks: '',
          unregisteredReason: '',
          rejectionReason: '',
          attachedFilesCount: 0,
        };

        setDataRefreshTrigger((prev) => prev + 1);
      }
    }
    else if (fdaModalConfig.type === 'reject') {
      // CHANGED — close modal before proc.run()
      setFdaModalConfig(null);

      const ok = await proc.run(
        {
          title: 'REJECTING REQUEST...',
          message: 'Submitting rejection reason to LEA...',
          withSuccess: false,
        },
        async () => {
          try {
            const payload = {
              rejection_reason: fdaRejectionReason.trim()
            };

            const res = await apiFetch(`/verification-requests/${currentItem.request_id}/fda-reject`, {
              method: 'POST',
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => null);
              const errMsg = errData?.detail || 'Failed to reject verification request.';
              triggerAlert(errMsg, 'danger');
              return false;
            }

            // Re-fetch badge counts and trigger Completed/Rejected table refresh (FIX 4)
            await fetchCounts();
            return true;
          } catch (err) {
            triggerAlert('Network error occurred while rejecting verification request.', 'danger');
            return false;
          }
        }
      );

      if (ok) {
        const caseRef = currentItem.case_reference || selectedQueueDetail?.case_reference || '';
        triggerAlert(`Verification request rejected for Case ID ${caseRef}.`, 'success');

        // Remove from current list and select next item if available
        if (fdaActiveTab === 'queue') {
          const remaining = fdaQueueList.filter((q) => q.request_id !== currentItem.request_id);
          setFdaQueueList(remaining);
          const nextItem = remaining[0] || null;
          setSelectedQueueItem(nextItem);
          if (!nextItem) {
            setSelectedQueueDetail(null);
          }
        }

        // Reset form states
        setFdaRejectionReason('');
        setFdaIsRejecting(false);
        setFdaVerificationStatus('');
        setFdaCprNumber('');
        setFdaCprExpiry('');
        setFdaOfficialRemarks('');
        setFdaAdvisoryRemarks('');
        setFdaUnregisteredReason('');
        setFdaAttachedFiles([]); // ADDED — reset attached files on reject success
        setFdaFileError(''); // ADDED — reset file error on reject success
        // CHANGED — reset formBaselineRef to blank on reject success (Fix 2 Amendment 1)
        formBaselineRef.current = {
          status: '',
          cprNumber: '',
          cprExpiry: '',
          officialRemarks: '',
          advisoryRemarks: '',
          unregisteredReason: '',
          rejectionReason: '',
          attachedFilesCount: 0,
        };

        // Trigger Completed/Rejected table refresh (FIX 4)
        setDataRefreshTrigger((prev) => prev + 1);
      }
    }
  };

  // ADDED — fetches the full completed detail for a given request_id and opens
  // the existing Verification Record modal with real API field names.
  // Endpoint: GET /verification-requests/completed/{request_id}
  const handleViewCompletedRecord = (requestId) => {
    apiFetch(`/verification-requests/completed/${requestId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setFdaRecordModalData({ ...data, _type: 'completed' });
      })
      .catch(() => {
        triggerAlert('Could not load the verification record details.', 'danger');
      });
  };

  // ADDED — fetches the full rejected detail for a given request_id and opens
  // the existing Record modal with _type: 'rejected'.
  // Endpoint: GET /verification-requests/rejected/{request_id}
  const handleViewRejectedRecord = (requestId) => {
    apiFetch(`/verification-requests/rejected/${requestId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setFdaRecordModalData({ ...data, _type: 'rejected' });
      })
      .catch(() => {
        triggerAlert('Could not load the rejected request record details.', 'danger');
      });
  };

  // Open modal for LEA Response record view
  // Uses list data directly since the list payload includes all required follow-up fields
  const handleViewLeaRecord = (item) => {
    setFdaRecordModalData({ ...item, _type: 'lea_response' });
  };

  const getLatestNotePreview = (item) => {
    return item?.closing_notes || item?.field_operation_notes || item?.close_reason || null;
  };

  const getLeaStageLabel = (stage, fdaResult) => {
    const normResult = (fdaResult || '').toLowerCase();
    switch (stage) {
      case 'awaiting_lea':
        return 'Awaiting LEA Action';
      case 'acknowledged':
        if (normResult === 'registered' || normResult === 'rejected') {
          return 'Acknowledged - Case Closed';
        }
        return 'Acknowledged';
      case 'takedown_initiated':
        return 'Takedown Initiated';
      case 'closed':
        return 'Case Closed';
      default:
        return stage || '—';
    }
  };

  const getLeaStageBadgeClass = (stage, fdaResult) => {
    const normResult = (fdaResult || '').toLowerCase();
    switch (stage) {
      case 'awaiting_lea':
        return 'FdaVerif-lea-badge FdaVerif-lea-badge-awaiting';
      case 'acknowledged':
        if (normResult === 'registered' || normResult === 'rejected') {
          return 'FdaVerif-lea-badge FdaVerif-lea-badge-closed';
        }
        return 'FdaVerif-lea-badge FdaVerif-lea-badge-acknowledged';
      case 'takedown_initiated':
        return 'FdaVerif-lea-badge FdaVerif-lea-badge-initiated';
      case 'closed':
        return 'FdaVerif-lea-badge FdaVerif-lea-badge-closed';
      default:
        return 'FdaVerif-lea-badge FdaVerif-lea-badge-awaiting';
    }
  };

  const getFdaResultBadgeClass = (result) => {
    const res = (result || '').toLowerCase();
    if (res === 'registered') return 'FdaVerifResultTag FdaVerifTagReg';
    if (res === 'unregistered') return 'FdaVerifResultTag FdaVerifTagUnreg';
    if (res === 'rejected') return 'FdaVerifResultTag FdaVerifTagRejected';
    return 'FdaVerifResultTag';
  };

  const getSourceLabel = (source) => {
    if (source === 'walk_in') return 'Walk-in';
    if (source === 'citizen_app') return 'Citizen Mobile App';
    if (source === 'extension') return 'Browser Extension';
    return source || '—';
  };

  // CHANGED — switch cases updated to lowercase to match the backend's priority
  // values ('urgent', 'high', 'standard', 'critical'). Also adds 'critical'.
  const getPriorityBadgeClass = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'FdaVerifBadgeUrgent';
      case 'high':
        return 'FdaVerifBadgeHigh';
      case 'critical':
        return 'FdaVerifBadgeUrgent'; // same red styling as urgent
      case 'standard':
      default:
        return 'FdaVerifBadgeStandard';
    }
  };

  return (
    <div className="FdaDashboardMain">
      <Sidebar sidebarType="FDA" />
      <div className="FdaContentContainer">
        <TopBar topbarType="FDA" />

        <div className="FdaMainFeed FdaVerifFeedContainer">

          {/* HEADER SECTION */}

          <div className="FdaVerifHeader">
            <div className="FdaVerifHeaderLeft">
              <p className="FdaVerifEyebrow">FDA · VERIFICATION MANAGEMENT SYSTEM</p>
              <h1 className="FdaVerifTitle">FDA Verification Queue</h1>
              <p className="FdaVerifSubtitle">
                Inspect verification requests submitted by LEA, review attached evidence, verify product CPR / LTO registrations, and submit official FDA findings.
              </p>
            </div>
          </div>


          {/* FLOATING SUCCESS / WARNING TOAST ALERT */}

          {fdaSuccessAlert && (
            <div className={`FdaVerifToastAlert FdaVerifToast_${fdaSuccessAlert.type}`} role="alert">
              <div className="FdaVerifToastIconWrap">
                {fdaSuccessAlert.type === 'success' && <CheckCircle size={18} />}
                {fdaSuccessAlert.type === 'info' && <Info size={18} />}
                {fdaSuccessAlert.type === 'warning' && <AlertTriangle size={18} />}
                {fdaSuccessAlert.type === 'danger' && <XCircle size={18} />}
              </div>
              <div className="FdaVerifToastBody">
                <p className="FdaVerifToastMessage">{fdaSuccessAlert.message}</p>
              </div>
              <button
                className="FdaVerifToastCloseBtn"
                onClick={() => setFdaSuccessAlert(null)}
                aria-label="Close notification"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* STATS METRIC SUMMARY BAR - INFORMATIONAL ONLY (NON-CLICKABLE) */}

          <div className="FdaVerifStatsBar">

            <div className="FdaVerifStatCard">
              <div className="FdaVerifStatCardTop">
                <span className="FdaVerifStatBadge FdaVerifStatBadgeQueue">
                  <Clock size={14} />
                </span>
              </div>
              {/* CHANGED — was fdaQueueList.length (dummy count); now reads from
                  queueCounts.verification_queue_count fetched from the backend.
                  Shows "-" while the fetch is pending. */}
              <span className="FdaVerifStatValue">{queueCounts !== null ? queueCounts.verification_queue_count : '-'}</span>
              <span className="FdaVerifStatLabel">Verification Queue</span>
            </div>

            <div className="FdaVerifStatCard">
              <div className="FdaVerifStatCardTop">
                <span className="FdaVerifStatBadge FdaVerifStatBadgeCompleted">
                  <CheckCircle2 size={14} />
                </span>
              </div>
              {/* CHANGED — was fdaCompletedList.length (dummy count); now reads
                  from queueCounts.completed_count fetched from the backend. */}
              <span className="FdaVerifStatValue">{queueCounts !== null ? queueCounts.completed_count : '-'}</span>
              <span className="FdaVerifStatLabel">Completed</span>
            </div>

            <div className="FdaVerifStatCard">
              <div className="FdaVerifStatCardTop">
                <span className="FdaVerifStatBadge FdaVerifStatBadgeRejected">
                  <XCircle size={14} />
                </span>
              </div>
              {/* CHANGED — was fdaRejectedList.length (dummy count); now reads
                  from queueCounts.rejected_count fetched from the backend. */}
              <span className="FdaVerifStatValue">{queueCounts !== null ? queueCounts.rejected_count : '-'}</span>
              <span className="FdaVerifStatLabel">Rejected Requests</span>
            </div>

            <div className="FdaVerifStatCard">
              <div className="FdaVerifStatCardTop">
                <span className="FdaVerifStatBadge FdaVerifStatBadgeLea">
                  <Send size={14} />
                </span>
              </div>
              <span className="FdaVerifStatValue">{leaResponseTotal}</span>
              <span className="FdaVerifStatLabel">LEA Response</span>
            </div>

          </div>

          {/* WORKFLOW NAVIGATION TABS - VISUALLY IDENTICAL TO VIEW REPORTS PILL TABS */}
          {/* BACKEND: Tab switching triggers state filter & loads corresponding API dataset */}
          <div className="FdaFilterRow FdaVerifTabsRow">
            <div className="FdaPillContainer">
              {/* CHANGED — removed count badge from tab button */}
              <button
                className={`FdaPill ${fdaActiveTab === 'queue' ? 'active' : ''}`}
                onClick={() => handleTabChange('queue')}
                id="fda-tab-verification-queue"
              >
                Verification Queue
              </button>

              {/* CHANGED — removed count badge from tab button */}
              <button
                className={`FdaPill ${fdaActiveTab === 'completed' ? 'active' : ''}`}
                onClick={() => handleTabChange('completed')}
                id="fda-tab-completed"
              >
                Completed
              </button>

              {/* CHANGED — removed count badge from tab button */}
              <button
                className={`FdaPill ${fdaActiveTab === 'rejected' ? 'active' : ''}`}
                onClick={() => handleTabChange('rejected')}
                id="fda-tab-rejected"
              >
                Rejected Requests
              </button>

              {/* CHANGED — removed count badge from tab button */}
              <button
                className={`FdaPill ${fdaActiveTab === 'lea_response' ? 'active' : ''}`}
                onClick={() => handleTabChange('lea_response')}
                id="fda-tab-lea-response"
              >
                LEA Response
              </button>
            </div>
          </div>


          {/* VERIFICATION QUEUE — SPLIT LAYOUT (ONLY FOR QUEUE TAB) */}

          {fdaActiveTab === 'queue' && (
            <div className="FdaVerifSplitLayout">

              {/* LEFT COLUMN: QUEUE LIST PANEL */}

              <div className="FdaVerifQueueColumn">

                {/* Search & Priority Filter Header */}
                <div className="FdaVerifFilterHeader">
                  <div className="FdaVerifSearchBox">
                    <Search size={16} className="FdaVerifSearchIcon" />
                    <input
                      type="text"
                      className="FdaVerifSearchInput"
                      placeholder="Search Case ID, Product, or Manufacturer..."
                      maxLength={150}
                      value={fdaSearchQuery}
                      onChange={(e) => { setFdaSearchQuery(e.target.value); setQueuePage(1); }}
                      id="fda-verification-search-input"
                    />
                    {fdaSearchQuery && (
                      <button className="FdaVerifClearSearchBtn" onClick={() => { setFdaSearchQuery(''); setQueuePage(1); }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="FdaVerifPriorityFilterWrap">
                    <Filter size={14} className="FdaVerifFilterIcon" />
                    <select
                      className="FdaVerifPrioritySelect"
                      value={fdaPriorityFilter}
                      onChange={(e) => { setFdaPriorityFilter(e.target.value); setQueuePage(1); }}
                      id="fda-verification-priority-filter"
                    >
                      <option value="all">All Priorities</option>
                      {/* CHANGED — option values are now lowercase to match the backend.
                          'critical' added to align with the real API priority enum. */}
                      <option value="urgent">Urgent</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="standard">Standard</option>
                    </select>
                  </div>
                </div>

                {/* Request Cards List */}
                <div className="FdaVerifCardsScrollList">
                  {/* ADDED — shows a loading skeleton row only on initial load when queue is empty */}
                  {queueLoading && filteredQueue.length === 0 ? (
                    <div className="FdaVerifEmptyList">
                      <Clock size={32} className="FdaVerifEmptyIcon" />
                      <p className="FdaVerifEmptyTitle">Loading Queue…</p>
                      <p className="FdaVerifEmptyText">Fetching verification requests from the server.</p>
                    </div>
                  ) : filteredQueue.length === 0 ? (
                    <div className="FdaVerifEmptyList">
                      <Clock size={32} className="FdaVerifEmptyIcon" />
                      <p className="FdaVerifEmptyTitle">No Queue Requests</p>
                      <p className="FdaVerifEmptyText">There are currently no new verification requests matching your filter.</p>
                    </div>
                  ) : (() => {
                    const QUEUE_PAGE_SIZE = 10;
                    const totalQueuePages = Math.ceil(filteredQueue.length / QUEUE_PAGE_SIZE) || 1;
                    const safeQueuePage = Math.min(Math.max(1, queuePage), totalQueuePages);
                    const queueStartIdx = (safeQueuePage - 1) * QUEUE_PAGE_SIZE;
                    const queueEndIdx = Math.min(queueStartIdx + QUEUE_PAGE_SIZE, filteredQueue.length);
                    const paginatedQueue = filteredQueue.slice(queueStartIdx, queueEndIdx);
                    return (
                      <>
                        {paginatedQueue.map((item) => {
                          const isSelected = selectedQueueItem?.request_id === item.request_id;
                          return (
                            <div
                              key={item.request_id}
                              className={`FdaVerifCard ${isSelected ? 'FdaVerifCardSelected' : ''}`}
                              onClick={() => handleSelectItem(item)}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="FdaVerifCardTop">
                                <span className="FdaVerifCaseId">{item.case_reference}</span>
                                <span className={`FdaVerifPriorityBadge ${getPriorityBadgeClass(item.priority)}`}>
                                  {item.priority
                                    ? item.priority.charAt(0).toUpperCase() + item.priority.slice(1)
                                    : ''}
                                </span>
                              </div>

                              <h3 className="FdaVerifProductName">{item.product_name}</h3>

                              <div className="FdaVerifCardMetaRow">
                                <span>{item.manufacturer}</span>
                              </div>

                              <div className="FdaVerifCardFooter">
                                <span className="FdaVerifCategoryTag">{item.product_category}</span>
                                <span className="FdaVerifDateReceived">
                                  <Calendar size={12} />
                                  {item.requested_at
                                    ? new Date(item.requested_at).toLocaleString('en-US', {
                                      year: 'numeric',
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: true,
                                    })
                                    : '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {filteredQueue.length > 0 && (
                          <div className="FdaCaseListFooter">
                            <span className="FdaFooterInfo">
                              Showing {queueStartIdx + 1}–{queueEndIdx} of {filteredQueue.length}
                            </span>
                            <div className="FdaPagination">
                              <button
                                className="BtnPageNav"
                                disabled={safeQueuePage === 1}
                                onClick={() => setQueuePage(safeQueuePage - 1)}
                              >
                                <ChevronLeft size={14} />
                                Prev
                              </button>
                              {Array.from({ length: totalQueuePages }, (_, i) => i + 1).map(page => (
                                <button
                                  key={page}
                                  className={`FdaPageNumber ${safeQueuePage === page ? 'active' : ''}`}
                                  onClick={() => setQueuePage(page)}
                                >
                                  {page}
                                </button>
                              ))}
                              <button
                                className="BtnPageNav"
                                disabled={safeQueuePage === totalQueuePages}
                                onClick={() => setQueuePage(safeQueuePage + 1)}
                              >
                                Next
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>


              {/* RIGHT COLUMN: SELECTED REQUEST DETAILS PANEL */}
              <div className="FdaVerifDetailsColumn">
                {!currentItem ? (
                  <div className="FdaVerifEmptyDetails">
                    <FileText size={44} className="FdaVerifEmptyDetailsIcon" />
                    <h3>No Request Selected</h3>
                    <p>Select a verification request from the left queue list to review details and perform FDA verification actions.</p>
                  </div>
                ) : (
                  <div className="FdaVerifDetailsScrollBody">

                    {/* DETAILS HEADER BAR */}
                    {/* CHANGED — uses real field names from selectedQueueDetail (full
                        detail response) instead of the old dummy currentItem fields.
                        Falls back to currentItem (list-item shape) while the detail
                        fetch is still loading so the breadcrumb is never blank. */}
                    <div className="FdaVerifDetailsHeader">
                      <div>
                        <div className="FdaVerifDetailsBreadcrumb">
                          <span className="FdaVerifBreadcrumbActive">
                            {selectedQueueDetail?.case_reference ?? currentItem.case_reference}
                          </span>
                          {/* ADDED — subtle inline indicator when refetching details in background */}
                          {detailLoading && selectedQueueDetail && (
                            <span style={{ marginLeft: '8px', fontSize: '11px', color: '#1B4332', opacity: 0.8, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} /> Updating…
                            </span>
                          )}
                        </div>
                        <h2 className="FdaVerifDetailsTitle">
                          {selectedQueueDetail?.product_name ?? currentItem.product_name}
                        </h2>
                        <p className="FdaVerifDetailsSubTitle">Manufacturer: <strong>
                          {selectedQueueDetail?.manufacturer ?? currentItem.manufacturer}
                        </strong></p>
                      </div>
                    </div>

                    {/* MERGED CARD: Case Information + Verification Request Information + Auto-Attached Evidence */}
                    <div className="FdaVerifMergedInfoCard">

                      {/* CHANGED — full loading skeleton only displays on initial load (when selectedQueueDetail is null AND detailLoading is true).
                          When switching cards, existing detail data stays visible while the new request resolves in background without flickering. */}
                      {detailLoading && !selectedQueueDetail ? (
                        <div className="FdaVerifEmptyDetails" style={{ minHeight: '180px' }}>
                          <FileText size={32} className="FdaVerifEmptyDetailsIcon" />
                          <p style={{ marginTop: '0.5rem', color: 'var(--fda-text-muted, #888)' }}>Loading request details…</p>
                        </div>
                      ) : (
                        <>
                          {/* SECTION 1: CASE INFORMATION */}
                          <div className="FdaVerifMergedSection">
                            <div className="FdaVerifSectionHeader">
                              <FileText size={16} className="FdaVerifGreenIcon" />
                              <h3>Case Information</h3>
                            </div>

                            <div className="FdaVerifGrid2">
                              <div className="FdaVerifInfoGroup">
                                <span className="FdaVerifInfoLabel">Case ID (LEA Reference):</span>
                                {/* CHANGED — was currentItem.caseId (dummy); now reads from
                                    selectedQueueDetail.case_reference (real field name). */}
                                <span className="FdaVerifInfoValueHighlight">{selectedQueueDetail?.case_reference ?? '—'}</span>
                              </div>

                              <div className="FdaVerifInfoGroup">
                                <span className="FdaVerifInfoLabel">Product Name:</span>
                                {/* CHANGED — was currentItem.productName; now product_name. */}
                                <span className="FdaVerifInfoValue">{selectedQueueDetail?.product_name ?? '—'}</span>
                              </div>

                              <div className="FdaVerifInfoGroup">
                                <span className="FdaVerifInfoLabel">Manufacturer:</span>
                                {/* CHANGED — field name unchanged (manufacturer), now from selectedQueueDetail. */}
                                <span className="FdaVerifInfoValue">{selectedQueueDetail?.manufacturer ?? '—'}</span>
                              </div>

                              <div className="FdaVerifInfoGroup">
                                <span className="FdaVerifInfoLabel">Requesting LEA Officer / Unit:</span>
                                {/* CHANGED — was currentItem.complainant (dummy); real field is
                                    requested_by_name. Show 'N/A' when null so 'null' never
                                    appears as literal text. */}
                                <span className="FdaVerifInfoValue">
                                  {selectedQueueDetail?.requested_by_name ?? 'N/A'}
                                </span>
                              </div>

                              <div className="FdaVerifInfoGroup">
                                <span className="FdaVerifInfoLabel">Product Category:</span>
                                {/* CHANGED — was currentItem.category; now product_category. */}
                                <span className="FdaVerifInfoValue">{selectedQueueDetail?.product_category ?? '—'}</span>
                              </div>

                              <div className="FdaVerifInfoGroup">
                                {/* CHANGED — label updated to Date Received: (Fix 4) */}
                                <span className="FdaVerifInfoLabel">Date Received:</span>
                                {/* CHANGED — was currentItem.dateLogged (dummy string); now
                                    formats selectedQueueDetail.requested_at (ISO 8601) using
                                    the same toLocaleString pattern used elsewhere in this file. */}
                                <span className="FdaVerifInfoValue">
                                  {selectedQueueDetail?.requested_at
                                    ? new Date(selectedQueueDetail.requested_at).toLocaleString('en-US', {
                                      year: 'numeric',
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: true,
                                    })
                                    : '—'}
                                </span>
                              </div>

                              <div className="FdaVerifInfoGroup FdaVerifGridFull">
                                <span className="FdaVerifInfoLabel">Verification Request Source:</span>
                                {/* CHANGED — was currentItem.source which showed the raw backend
                                    value e.g. "walk_in". Every request in this queue is
                                    LEA-originated by definition, so we always display the
                                    human-readable static label instead of transforming a field. */}
                                <span className="FdaVerifInfoValue">LEA Verification Request</span>
                              </div>
                            </div>
                          </div>

                          <hr className="FdaVerifSectionDivider" />

                          {/* SECTION 2: VERIFICATION REQUEST INFORMATION FROM LEA */}

                          <div className="FdaVerifMergedSection">
                            <div className="FdaVerifSectionHeader">
                              <FileText size={16} className="FdaVerifGreenIcon" />
                              <h3>Verification Request Information (LEA-CIDG)</h3>
                            </div>

                            <div className="FdaVerifGrid2">
                              <div className="FdaVerifInfoGroup">
                                <span className="FdaVerifInfoLabel">Product Code / Barcode:</span>
                                {/* CHANGED — was currentItem.productCode; now product_code
                                    from selectedQueueDetail. Null-safe fallback to 'N/A'. */}
                                <span className="FdaVerifCodeBadge">
                                  {selectedQueueDetail?.product_code || 'N/A'}
                                </span>
                              </div>

                              <div className="FdaVerifInfoGroup">
                                <span className="FdaVerifInfoLabel">Priority Level:</span>
                                {/* CHANGED — was currentItem.priority (dummy capitalized);
                                    now from selectedQueueDetail.priority (lowercase from
                                    backend). Capitalize for display, same as card badge. */}
                                <span className={`FdaVerifPriorityBadge ${getPriorityBadgeClass(selectedQueueDetail?.priority)}`}>
                                  {selectedQueueDetail?.priority
                                    ? selectedQueueDetail.priority.charAt(0).toUpperCase() + selectedQueueDetail.priority.slice(1)
                                    : '—'}
                                </span>
                              </div>

                              <div className="FdaVerifInfoGroup FdaVerifGridFull">
                                <span className="FdaVerifInfoLabel">Notes &amp; Statement from LEA Officers:</span>
                                {/* CHANGED — was currentItem.leaNotes (dummy); now
                                    complaint_statement from selectedQueueDetail. */}
                                <div className="FdaVerifNotesBox">
                                  {/* CHANGED — use trim() || so empty/whitespace strings fall back (Fix 3) */}
                                  <p>{selectedQueueDetail?.complaint_statement?.trim() || 'No statement provided.'}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <hr className="FdaVerifSectionDivider" />

                          {/* SECTION 3: AUTO-ATTACHED EVIDENCE & REQUEST DOCUMENTS */}

                          <div className="FdaVerifMergedSection">
                            <div className="FdaVerifSectionHeader">
                              <Paperclip size={16} className="FdaVerifGreenIcon" />
                              <h3>Auto-Attached Evidence &amp; Request Documents</h3>
                            </div>

                            {/* CHANGED — was currentItem.documents (dummy array); now
                                selectedQueueDetail.attached_files (real field name).
                                Each file uses file_id as the React key and for the
                                download endpoint. Download action calls
                                GET /shared-files/{file_id}/download with Bearer auth
                                and triggers a browser download via a temporary anchor. */}
                            <div className="FdaVerifDocsGrid">
                              {selectedQueueDetail?.attached_files && selectedQueueDetail.attached_files.length > 0 ? (
                                selectedQueueDetail.attached_files.map((file) => (
                                  <div key={file.file_id} className="FdaVerifDocCard">
                                    <div className="FdaVerifDocIcon">
                                      <FileText size={18} />
                                    </div>
                                    <div className="FdaVerifDocInfo">
                                      {/* CHANGED — was doc.name; now file.file_name. */}
                                      <p className="FdaVerifDocName">{file.file_name}</p>
                                      {/* CHANGED — was doc.size; now file.file_size_display
                                          (human-readable string e.g. "334.2 KB" already
                                          formatted by the backend). */}
                                      <span className="FdaVerifDocMeta">{file.file_size_display}</span>
                                    </div>
                                    <div className="FdaVerifDocActions">
                                      {/* FIX 1 — restored original eye-icon pattern: clicking
                                          opens the preview modal (fdaDocPreviewModal). The
                                          actual download fetch has been MOVED to the
                                          "Download Attachment" button inside that modal.
                                          The eye icon's only job is to populate the modal. */}
                                      <button
                                        className="FdaVerifDocActionBtn"
                                        title="Inspect Attachment"
                                        onClick={() => setFdaDocPreviewModal(file)}
                                      >
                                        <Eye size={13} />
                                      </button>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="FdaVerifNoDocsText">No evidence documents attached to this request.</p>
                              )}
                            </div>
                          </div>
                        </>
                      )}

                    </div>

                    {/* SECTION 4: FDA VERIFICATION RESULT INTERACTIVE CONTROL PANEL — REMAINS A SEPARATE STANDALONE CARD */}
                    {/* (For Verification Queue Tab) */}

                    <div className="FdaVerifSectionCard FdaVerifControlPanelCard">

                      {!fdaIsRejecting ? (
                        <>
                          <div className="FdaVerifSectionHeader">
                            <ShieldCheck size={18} className="FdaVerifGreenIcon" />
                            <div>
                              <h3 className="FdaVerifControlTitle">FDA Verification Result Section</h3>
                              <p className="FdaVerifControlSub">Select verification determination and enter official FDA database findings.</p>
                            </div>
                          </div>

                          <div className="FdaVerifControlForm">

                            {/* Verification Status Radio Selection */}
                            <div className="FdaVerifFormGroup">
                              <label className="FdaVerifFormLabel">
                                Verification Status <span className="FdaVerifRequired">*</span>
                              </label>

                              {/* BACKEND: maps to verification_requests.fda_verification_status */}
                              <div className="FdaVerifRadioOptionsGroup">
                                <label
                                  className={`FdaVerifRadioCard ${fdaVerificationStatus === 'Registered' ? 'FdaVerifRadioRegisteredActive' : ''}`}
                                  id="fda-radio-status-registered"
                                >
                                  <input
                                    type="radio"
                                    name="fdaVerificationStatus"
                                    value="Registered"
                                    checked={fdaVerificationStatus === 'Registered'}
                                    onChange={(e) => setFdaVerificationStatus(e.target.value)}
                                  />
                                  <div className="FdaVerifRadioContent">
                                    <div className="FdaVerifRadioHeader">
                                      <CheckCircle size={16} className="FdaVerifGreenIcon" />
                                      <span className="FdaVerifRadioTitle">Registered Product</span>
                                    </div>
                                    <p className="FdaVerifRadioDesc">Product holds valid, active FDA Certificate of Product Registration (CPR).</p>
                                  </div>
                                </label>

                                <label
                                  className={`FdaVerifRadioCard ${fdaVerificationStatus === 'Unregistered' ? 'FdaVerifRadioUnregisteredActive' : ''}`}
                                  id="fda-radio-status-unregistered"
                                >
                                  <input
                                    type="radio"
                                    name="fdaVerificationStatus"
                                    value="Unregistered"
                                    checked={fdaVerificationStatus === 'Unregistered'}
                                    onChange={(e) => setFdaVerificationStatus(e.target.value)}
                                  />
                                  <div className="FdaVerifRadioContent">
                                    <div className="FdaVerifRadioHeader">
                                      <AlertTriangle size={16} className="FdaVerifRedIcon" />
                                      <span className="FdaVerifRadioTitle">Unregistered Product</span>
                                    </div>
                                    <p className="FdaVerifRadioDesc">No valid CPR found, expired license, or counterfeit registration mark.</p>
                                  </div>
                                </label>
                              </div>
                            </div>

                            {/* DYNAMIC PANEL 1: REGISTERED CONFIRMATION PANEL */}
                            {fdaVerificationStatus === 'Registered' && (
                              <div className="FdaVerifRegisteredPanel">
                                <div className="FdaVerifPanelHeaderGreen">
                                  <CheckCircle size={18} />
                                  <div>
                                    <h4>CONFIRMED REGISTERED PRODUCT</h4>
                                    <p>Provide verified CPR details and official regulatory remarks.</p>
                                  </div>
                                </div>

                                <div className="FdaVerifGrid2" style={{ marginBottom: '12px' }}>
                                  <div className="FdaVerifFormGroup">
                                    <label className="FdaVerifFormLabel">
                                      FDA CPR Registration Number <span className="FdaVerifRequired">*</span>
                                    </label>
                                    {/* BACKEND: maps to verification_requests.fda_cpr_number */}
                                    <input
                                      type="text"
                                      className="FdaVerifTextInput"
                                      placeholder="e.g. FDA-CPR-2024-99812"
                                      maxLength={100}
                                      value={fdaCprNumber}
                                      onChange={(e) => setFdaCprNumber(e.target.value)}
                                      id="fda-input-cpr-number"
                                    />
                                  </div>

                                  <div className="FdaVerifFormGroup">
                                    <label className="FdaVerifFormLabel">CPR Validity / Expiry Date</label>
                                    {/* BACKEND: maps to verification_requests.fda_cpr_expiry */}
                                    <input
                                      type="date"
                                      className="FdaVerifTextInput"
                                      value={fdaCprExpiry}
                                      onChange={(e) => setFdaCprExpiry(e.target.value)}
                                      id="fda-input-cpr-expiry"
                                    />
                                  </div>
                                </div>

                                <div className="FdaVerifFormGroup">
                                  <label className="FdaVerifFormLabel">
                                    Official FDA Verification Remarks <span className="FdaVerifRequired">*</span>
                                  </label>
                                  {/* BACKEND: maps to verification_requests.fda_official_remarks */}
                                  <textarea
                                    className="FdaVerifTextarea"
                                    rows={3}
                                    placeholder="Enter official remarks confirming registration status, CPR validity, manufacturer License to Operate (LTO) details, and compliance notes..."
                                    maxLength={2000}
                                    minLength={10}
                                    value={fdaOfficialRemarks}
                                    onChange={(e) => setFdaOfficialRemarks(e.target.value)}
                                    id="fda-textarea-registered-remarks"
                                  ></textarea>
                                </div>
                              </div>
                            )}

                            {/* DYNAMIC PANEL 2: UNREGISTERED WARNING PANEL */}
                            {fdaVerificationStatus === 'Unregistered' && (
                              <div className="FdaVerifUnregisteredPanel">
                                <div className="FdaVerifPanelHeaderOrange">
                                  <AlertTriangle size={18} className="FdaVerifRedIcon" />
                                  <div>
                                    <h4>UNREGISTERED PRODUCT WARNING</h4>
                                    <p>Specify exact reasons why product is not registered and regulatory advisories.</p>
                                  </div>
                                </div>

                                <div className="FdaVerifFormGroup" style={{ marginBottom: '12px' }}>
                                  <label className="FdaVerifFormLabel">
                                    Reason Product is Not Registered <span className="FdaVerifRequired">*</span>
                                  </label>
                                  {/* BACKEND: maps to verification_requests.fda_unregistered_reason */}
                                  <textarea
                                    className="FdaVerifTextarea"
                                    rows={3}
                                    placeholder="Provide detailed rationale (e.g., No CPR or LTO found in FDA database, counterfeit CPR code on label, revoked registration, prohibited ingredients)..."
                                    maxLength={2000}
                                    minLength={10}
                                    value={fdaUnregisteredReason}
                                    onChange={(e) => setFdaUnregisteredReason(e.target.value)}
                                    id="fda-textarea-unregistered-reason"
                                  ></textarea>
                                </div>

                                <div className="FdaVerifFormGroup">
                                  <label className="FdaVerifFormLabel">
                                    Advisory & Enforcement Recommendations for LEA
                                  </label>
                                  {/* FIX 3 — bound to fdaAdvisoryRemarks (separate state from fdaOfficialRemarks) */}
                                  <textarea
                                    className="FdaVerifTextarea"
                                    rows={2}
                                    placeholder="Recommended enforcement steps for LEA-CIDG (e.g. Initiate market seizure, request online domain takedown, issue public health warning)..."
                                    maxLength={2000}
                                    value={fdaAdvisoryRemarks}
                                    onChange={(e) => setFdaAdvisoryRemarks(e.target.value)}
                                    id="fda-textarea-unregistered-remarks"
                                  ></textarea>
                                </div>
                              </div>
                            )}

                            {/* CHANGED — FDA Evidence Attachment Section */}
                            {FDA_ATTACHMENTS_UI_ENABLED &&
                              (fdaVerificationStatus === 'Registered' || fdaVerificationStatus === 'Unregistered') &&
                              !fdaIsRejecting && (
                                <div className="FdaVerifFormGroup">
                                  <label className="FdaVerifFormLabel">
                                    Attach Files / Evidence <span className="FdaVerifUploadNote">(Optional)</span>
                                  </label>

                                  <div className="FdaVerifUploadArea">
                                    <input
                                      type="file"
                                      id="fdaEvidenceUpload"
                                      multiple
                                      accept=".jpg,.jpeg,.png,.pdf,.docx"
                                      onChange={handleFdaFileChange}
                                      hidden
                                    />

                                    <label
                                      htmlFor="fdaEvidenceUpload"
                                      className={`FdaFileUploadWrapper ${isFdaDragActive ? 'FdaFileUploadWrapperDragActive' : ''}`}
                                      onDragOver={handleFdaDragOver}
                                      onDragLeave={handleFdaDragLeave}
                                      onDrop={handleFdaDrop}
                                    >
                                      <div className="FdaFileUploadContent">
                                        <Paperclip size={22} />
                                        <span className="FdaVerifUploadTitle">Drop files or click to upload</span>
                                        <span className="FdaVerifUploadSub">PDF, JPG, PNG, DOCX · Max 25 MB each · Up to 10 files</span>
                                      </div>
                                    </label>

                                    <span className="FdaVerifUploadNote">Attachments are not saved in drafts.</span>

                                    {fdaFileError && (
                                      <span className="FdaVerifUploadError">
                                        <AlertCircle size={12} /> {fdaFileError}
                                      </span>
                                    )}

                                    {fdaAttachedFiles.length > 0 && (
                                      <div className="FdaVerifDocsGrid">
                                        {fdaAttachedFiles.map((file, index) => {
                                          const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
                                          return (
                                            <div key={`${file.name}-${index}`} className="FdaVerifDocCard">
                                              <div className="FdaVerifDocIcon">
                                                {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                                              </div>
                                              <div className="FdaVerifDocInfo">
                                                <p className="FdaVerifDocName" title={file.name}>{file.name}</p>
                                                <span className="FdaVerifDocMeta">{formatFdaFileSize(file.size)}</span>
                                              </div>
                                              <div className="FdaVerifDocActions">
                                                <button
                                                  type="button"
                                                  className="FdaVerifDocActionBtn"
                                                  title="Remove File"
                                                  onClick={() => handleRemoveFdaFile(index)}
                                                >
                                                  <X size={13} />
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* TEMP — remove once the backend endpoint exists. */}
                                    {!FDA_ATTACHMENTS_UPLOAD_ENABLED && fdaAttachedFiles.length > 0 && (
                                      <span className="FdaVerifUploadNotice">
                                        Attachments are not sent yet. Backend upload is coming.
                                      </span>
                                    )}
                                  </div>
                                </div>
                            )}

                          </div>
                        </>
                      ) : (
                        /* REJECTION INLINE MODE PANEL */
                        <div className="FdaVerifInlineRejectPanel">
                          <div className="FdaVerifInlineRejectHeader">
                            <XCircle size={18} className="FdaVerifRedIcon" />
                            <div>
                              <h4>REJECT VERIFICATION REQUEST TO LEA</h4>
                              <p>Provide reason for rejecting this verification request back to LEA-CIDG officers.</p>
                            </div>
                          </div>

                          <div className="FdaVerifFormGroup">
                            <label className="FdaVerifFormLabel">
                              Rejection Rationale & Required Field Corrections <span className="FdaVerifRequired">*</span>
                            </label>
                            {/* BACKEND: maps to verification_requests.fda_rejection_reason */}
                            <textarea
                              className="FdaVerifTextarea FdaVerifTextareaReject"
                              rows={4}
                              placeholder="Explain clearly why the request is rejected (e.g. Incomplete product photos, missing lot number, duplicate case submission, unreadable label images)..."
                              maxLength={2000}
                              minLength={10}
                              value={fdaRejectionReason}
                              onChange={(e) => setFdaRejectionReason(e.target.value)}
                              id="fda-textarea-rejection-reason"
                            ></textarea>
                          </div>

                          <div className="FdaVerifRejectActionRow">
                            <button
                              className="FdaVerifBtnOutline"
                              onClick={() => setFdaIsRejecting(false)}
                            >
                              Cancel Rejection
                            </button>

                            {/* BACKEND: POST /api/fda/verification-requests/:id/reject */}
                            {/* BACKEND: Trigger notification to LEA TopBar notification panel */}
                            <button
                              className="FdaVerifBtnDanger"
                              onClick={handleOpenRejectModal}
                              id="fda-btn-confirm-reject-trigger"
                            >
                              <XCircle size={15} />
                              <span>Reject Request & Send to LEA</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ACTION BUTTONS BAR */}
                      {!fdaIsRejecting && (
                        <div className="FdaVerifActionBar">
                          <div className="FdaVerifActionBarLeft">
                            <button
                              className="FdaVerifBtnRejectMode"
                              onClick={() => setFdaIsRejecting(true)}
                              title="Reject request back to LEA"
                              id="fda-btn-open-reject-mode"
                            >
                              <XCircle size={15} />
                              <span>Reject Request</span>
                            </button>
                          </div>

                          <div className="FdaVerifActionBarRight">
                            {/* BACKEND: PATCH /api/fda/verification-requests/:id/draft */}
                            {/* BACKEND: Trigger notification to FDA TopBar notification panel */}
                            <button
                              className="FdaVerifBtnOutline"
                              onClick={handleOpenSaveDraftModal}
                              id="fda-btn-save-draft"
                            >
                              <Save size={15} />
                              <span>Save Draft</span>
                            </button>

                            {/* BACKEND: POST /api/fda/verification-requests/:id/submit */}
                            {/* BACKEND: Trigger notification to LEA TopBar notification panel */}
                            <button
                              className="FdaVerifBtnPrimary"
                              onClick={handleOpenSubmitModal}
                              id="fda-btn-submit-verification"
                            >
                              <Send size={15} />
                              <span>Submit Verification</span>
                            </button>
                          </div>
                        </div>
                      )}

                    </div>

                  </div>
                )}
              </div>

            </div>
          )}

          {/* COMPLETED VERIFICATIONS — FULL-WIDTH TABLE */}


          {/* CHANGED — Completed tab is now fully server-driven. filteredCompleted holds
              the page returned by the backend; pagination uses completedTotal (server)
              instead of client-side slice calculations. */}
          {fdaActiveTab === 'completed' && (() => {
            // CHANGED — server-side pagination: total comes from the API response.
            const COMPLETED_PAGE_SIZE = 25;
            const totalCompletedPages = Math.ceil(completedTotal / COMPLETED_PAGE_SIZE) || 1;
            const safeCompletedPage = Math.min(Math.max(1, completedPage), totalCompletedPages);
            const cStartIdx = (safeCompletedPage - 1) * COMPLETED_PAGE_SIZE;
            const cEndIdx = Math.min(cStartIdx + COMPLETED_PAGE_SIZE, completedTotal);
            return (
              <div className="FdaVerifTableSection">

                {/* Filter Panel — search fixed-width left, dropdowns grouped right */}
                <div className="FdaVerifFilterPanel">
                  <div className="FdaSearchWrapper FdaSearchFixed">
                    <Search size={16} className="FdaSearchIcon" />
                    {/* CHANGED — triggers debounced server-side search via completedSearch state */}
                    <input
                      type="text"
                      placeholder="Search Case ID, Product or Manufacturer..."
                      className="FdaSearchInput"
                      maxLength={150}
                      value={completedSearch}
                      onChange={(e) => { setCompletedSearch(e.target.value); setCompletedPage(1); }}
                      id="fda-completed-search-input"
                    />
                  </div>

                  <div className="FdaFilterGroupsRight">
                    <div className="FdaFilterGroup">
                      {/* CHANGED — sends date_from query param to GET /verification-requests/completed */}
                      <label>From</label>
                      <input
                        type="date"
                        className="FdaVerifDateInput"
                        value={completedDateFrom}
                        onChange={(e) => { setCompletedDateFrom(e.target.value); setCompletedPage(1); }}
                        title="Date Verified From"
                      />
                    </div>

                    <div className="FdaFilterGroup">
                      {/* CHANGED — sends date_to query param to GET /verification-requests/completed */}
                      <label>To</label>
                      <input
                        type="date"
                        className="FdaVerifDateInput"
                        value={completedDateTo}
                        onChange={(e) => { setCompletedDateTo(e.target.value); setCompletedPage(1); }}
                        title="Date Verified To"
                      />
                    </div>

                    <div className="FdaFilterGroup">
                      {/* CHANGED — sends category query param to GET /verification-requests/completed */}
                      <label>Category</label>
                      <select
                        value={completedCategory}
                        onChange={(e) => { setCompletedCategory(e.target.value); setCompletedPage(1); }}
                        id="fda-completed-category-filter"
                      >
                        <option value="">All Categories</option>
                        <option value="Cosmetics">Cosmetics</option>
                        <option value="Food">Food</option>
                        <option value="Devices">Devices</option>
                        <option value="Drugs">Drugs</option>
                      </select>
                    </div>

                    {/* ADDED — Verification Result dropdown; sends verification_result query param.
                        Mirrors the exact structure/classes of the Category dropdown above. */}
                    <div className="FdaFilterGroup">
                      <label>Verification Result</label>
                      <select
                        value={completedResultFilter}
                        onChange={(e) => { setCompletedResultFilter(e.target.value); setCompletedPage(1); }}
                        id="fda-completed-result-filter"
                      >
                        <option value="">All Results</option>
                        <option value="registered">Registered</option>
                        <option value="unregistered">Unregistered</option>
                      </select>
                    </div>

                    {/* FIX 2 — always mounted (visibility:hidden vs conditional render) so
                        the flex row never shifts when the button appears/disappears.
                        disabled prevents clicks when hidden. */}
                    {/* Fix 2 — display:none when inactive so button takes 0px width and controls sit flush right */}
                    <button
                      className="BtnClearFiltersIcon"
                      onClick={() => { setCompletedSearch(''); setCompletedDateFrom(''); setCompletedDateTo(''); setCompletedCategory(''); setCompletedResultFilter(''); setCompletedPage(1); }}
                      disabled={!(completedSearch || completedDateFrom || completedDateTo || completedCategory || completedResultFilter)}
                      aria-label="Clear Filters"
                      title="Clear Filters"
                      style={{
                        display: (completedSearch || completedDateFrom || completedDateTo || completedCategory || completedResultFilter) ? 'inline-flex' : 'none'
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* CHANGED — table now maps real API field names from GET /verification-requests/completed */}
                <div className="FdaTableCard FdaVerifTableCard">
                  <div className="FdaTableWrapper" ref={completedTableWrapperRef}>
                    <table className="FdaTable">
                      <thead>
                        <tr>
                          <th>CASE ID</th>
                          <th>PRODUCT NAME</th>
                          <th>MANUFACTURER</th>
                          <th>CATEGORY</th>
                          <th>DATE RECEIVED</th>
                          <th>DATE VERIFIED</th>
                          <th>VERIFICATION RESULT</th>
                          <th>VERIFIED BY</th>
                          <th style={{ width: '60px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* ADDED — loading row only when initial fetch is in flight and table is empty */}
                        {completedLoading && filteredCompleted.length === 0 ? (
                          <tr>
                            <td colSpan="9" className="FdaEmptyState">
                              <Clock size={28} style={{ opacity: 0.4 }} />
                              <p>Loading completed records…</p>
                            </td>
                          </tr>
                        ) : filteredCompleted.length > 0 ? (
                          filteredCompleted.map((item) => (
                            // CHANGED — key and all cells now use real API field names.
                            <tr key={item.request_id}>
                              {/* CHANGED — was item.caseId; now case_reference */}
                              <td className="CaseIdCell">{item.case_reference}</td>
                              <td>
                                <div className="ProductCell">
                                  {/* CHANGED — was item.productName; now product_name */}
                                  <span className="ProductCellTitle">{item.product_name}</span>
                                </div>
                              </td>
                              {/* manufacturer field name is the same */}
                              <td style={{ fontSize: '12px', color: '#1F2937', opacity: 0.8 }}>{item.manufacturer}</td>
                              {/* CHANGED — was item.category; now product_category */}
                              <td>{item.product_category}</td>
                              {/* CHANGED — was item.dateReceived (pre-formatted); now requested_at (ISO) formatted here */}
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {item.requested_at
                                  ? new Date(item.requested_at).toLocaleString('en-US', {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit', hour12: true,
                                  })
                                  : '—'}
                              </td>
                              {/* CHANGED — was item.dateCompleted; now responded_at (ISO) formatted here */}
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {item.responded_at
                                  ? new Date(item.responded_at).toLocaleString('en-US', {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit', hour12: true,
                                  })
                                  : '—'}
                              </td>
                              {/* CHANGED — was item.verificationResult (capitalized dummy);
                                  now verification_result (lowercase from backend) — capitalize for display. */}
                              <td>
                                <span className={`FdaVerifResultTag ${item.verification_result === 'registered' ? 'FdaVerifTagReg' : 'FdaVerifTagUnreg'
                                  }`}>
                                  {item.verification_result
                                    ? item.verification_result.charAt(0).toUpperCase() + item.verification_result.slice(1)
                                    : '—'}
                                </span>
                              </td>
                              {/* CHANGED — was item.verifierName; now verified_by_name (null → 'N/A') */}
                              <td style={{ fontSize: '12px' }}>{item.verified_by_name ?? 'N/A'}</td>
                              <td style={{ textAlign: 'center' }}>
                                {/* CHANGED — was inline setFdaRecordModalData; now calls
                                    handleViewCompletedRecord which fetches the full detail
                                    from GET /verification-requests/completed/{request_id}. */}
                                <button
                                  className="BtnActionView"
                                  onClick={() => handleViewCompletedRecord(item.request_id)}
                                  title="View record details"
                                  id={`fda-btn-view-completed-${item.request_id}`}
                                >
                                  <Eye size={16} />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="9" className="FdaEmptyState">
                              <Search size={32} />
                              <p>No completed verification records match your current filters.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* CHANGED — pagination now driven by completedTotal (server) not client array length */}
                  <div className="FdaTableFooter">
                    <span className="FdaFooterInfo">
                      Showing {completedTotal === 0 ? 0 : cStartIdx + 1}–{cEndIdx} of {completedTotal} entries
                    </span>
                    <div className="FdaPagination">
                      <button
                        className="BtnPageNav"
                        disabled={safeCompletedPage === 1}
                        onClick={() => setCompletedPage(safeCompletedPage - 1)}
                      >
                        <ChevronLeft size={14} />
                        Prev
                      </button>
                      {Array.from({ length: totalCompletedPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          className={`FdaPageNumber ${safeCompletedPage === page ? 'active' : ''}`}
                          onClick={() => setCompletedPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        className="BtnPageNav"
                        disabled={safeCompletedPage === totalCompletedPages}
                        onClick={() => setCompletedPage(safeCompletedPage + 1)}
                      >
                        Next
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ============================================================================ */}
          {/* REJECTED REQUESTS — FULL-WIDTH TABLE */}
          {/* ============================================================================ */}

          {/* CHANGED — Rejected tab is now fully server-driven. filteredRejected holds
              the page returned by the backend; pagination uses rejectedTotal (server)
              instead of client-side slice calculations. */}
          {fdaActiveTab === 'rejected' && (() => {
            // CHANGED — server-side pagination: total comes from the API response.
            const REJECTED_PAGE_SIZE = 25;
            const totalRejectedPages = Math.ceil(rejectedTotal / REJECTED_PAGE_SIZE) || 1;
            const safeRejectedPage = Math.min(Math.max(1, rejectedPage), totalRejectedPages);
            const rStartIdx = (safeRejectedPage - 1) * REJECTED_PAGE_SIZE;
            const rEndIdx = Math.min(rStartIdx + REJECTED_PAGE_SIZE, rejectedTotal);
            return (
              <div className="FdaVerifTableSection">

                {/* Filter Panel — search fixed-width left, dropdowns grouped right */}
                <div className="FdaVerifFilterPanel">
                  <div className="FdaSearchWrapper FdaSearchFixed">
                    <Search size={16} className="FdaSearchIcon" />
                    {/* CHANGED — triggers debounced server-side search via rejectedSearch state */}
                    <input
                      type="text"
                      placeholder="Search Case ID, Product or Manufacturer..."
                      className="FdaSearchInput"
                      maxLength={150}
                      value={rejectedSearch}
                      onChange={(e) => { setRejectedSearch(e.target.value); setRejectedPage(1); }}
                      id="fda-rejected-search-input"
                    />
                  </div>

                  <div className="FdaFilterGroupsRight">
                    <div className="FdaFilterGroup">
                      {/* CHANGED — sends date_from query param to GET /verification-requests/rejected */}
                      <label>From</label>
                      <input
                        type="date"
                        className="FdaVerifDateInput"
                        value={rejectedDateFrom}
                        onChange={(e) => { setRejectedDateFrom(e.target.value); setRejectedPage(1); }}
                        title="Date Rejected From"
                      />
                    </div>

                    <div className="FdaFilterGroup">
                      {/* CHANGED — sends date_to query param to GET /verification-requests/rejected */}
                      <label>To</label>
                      <input
                        type="date"
                        className="FdaVerifDateInput"
                        value={rejectedDateTo}
                        onChange={(e) => { setRejectedDateTo(e.target.value); setRejectedPage(1); }}
                        title="Date Rejected To"
                      />
                    </div>

                    <div className="FdaFilterGroup">
                      {/* CHANGED — sends category query param to GET /verification-requests/rejected.
                          FIXED: 'Foods' corrected to 'Food' to match real backend category strings. */}
                      <label>Category</label>
                      <select
                        value={rejectedCategory}
                        onChange={(e) => { setRejectedCategory(e.target.value); setRejectedPage(1); }}
                        id="fda-rejected-category-filter"
                      >
                        <option value="">All Categories</option> {/* CHANGED — value="" matches initial state and Completed tab (Fix 1) */}
                        <option value="Cosmetics">Cosmetics</option>
                        <option value="Food">Food</option>
                        <option value="Devices">Devices</option>
                        <option value="Drugs">Drugs</option>
                      </select>
                    </div>

                    {/* FIX 2 — always mounted (visibility:hidden vs conditional render) so
                        the flex row never shifts when the button appears/disappears.
                        disabled prevents clicks when hidden. */}
                    {/* Fix 2 — display:none when inactive so button takes 0px width and controls sit flush right */}
                    <button
                      className="BtnClearFiltersIcon"
                      onClick={() => { setRejectedSearch(''); setRejectedDateFrom(''); setRejectedDateTo(''); setRejectedCategory(''); setFdaActiveTab(fdaActiveTab); setQueuePage(1); setCompletedPage(1); setRejectedPage(1); }}
                      disabled={!(rejectedSearch || rejectedDateFrom || rejectedDateTo || rejectedCategory)}
                      aria-label="Clear Filters"
                      title="Clear Filters"
                      style={{
                        display: (rejectedSearch || rejectedDateFrom || rejectedDateTo || rejectedCategory) ? 'inline-flex' : 'none'
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* CHANGED — table now maps real API field names from GET /verification-requests/rejected */}
                <div className="FdaTableCard FdaVerifTableCard">
                  <div className="FdaTableWrapper" ref={rejectedTableWrapperRef}>
                    <table className="FdaTable">
                      <thead>
                        <tr>
                          <th>CASE ID</th>
                          <th>PRODUCT NAME</th>
                          <th>MANUFACTURER</th>
                          <th>CATEGORY</th>
                          <th>DATE RECEIVED</th>
                          <th>DATE REJECTED</th>
                          <th>REJECTED BY</th>
                          <th style={{ width: '60px', textAlign: 'center' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* ADDED — loading row only when initial fetch is in flight and table is empty */}
                        {rejectedLoading && filteredRejected.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="FdaEmptyState">
                              <Clock size={28} style={{ opacity: 0.4 }} />
                              <p>Loading rejected records…</p>
                            </td>
                          </tr>
                        ) : filteredRejected.length > 0 ? (
                          filteredRejected.map((item) => (
                            // CHANGED — key and all cells now use real API field names.
                            <tr key={item.request_id}>
                              {/* CHANGED — was item.caseId; now case_reference */}
                              <td className="CaseIdCell">{item.case_reference}</td>
                              <td>
                                <div className="ProductCell">
                                  {/* CHANGED — was item.productName; now product_name */}
                                  <span className="ProductCellTitle">{item.product_name}</span>
                                </div>
                              </td>
                              {/* manufacturer field name is the same */}
                              <td style={{ fontSize: '12px', color: '#1F2937', opacity: 0.8 }}>{item.manufacturer}</td>
                              {/* CHANGED — was item.category; now product_category */}
                              <td>{item.product_category}</td>
                              {/* CHANGED — was item.dateReceived (pre-formatted); now requested_at (ISO) formatted here */}
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {item.requested_at
                                  ? new Date(item.requested_at).toLocaleString('en-US', {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit', hour12: true,
                                  })
                                  : '—'}
                              </td>
                              {/* CHANGED — was item.dateRejected (pre-formatted); now responded_at (ISO) formatted here */}
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {item.responded_at
                                  ? new Date(item.responded_at).toLocaleString('en-US', {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit', hour12: true,
                                  })
                                  : '—'}
                              </td>
                              {/* CHANGED — was item.rejectedBy; now rejected_by_name (null → 'N/A') */}
                              <td style={{ fontSize: '12px' }}>{item.rejected_by_name ?? 'N/A'}</td>
                              <td style={{ textAlign: 'center' }}>
                                {/* CHANGED — was inline setFdaRecordModalData; now calls
                                    handleViewRejectedRecord which fetches the full detail
                                    from GET /verification-requests/rejected/{request_id}. */}
                                <button
                                  className="BtnActionView"
                                  onClick={() => handleViewRejectedRecord(item.request_id)}
                                  title="View rejection details"
                                  id={`fda-btn-view-rejected-${item.request_id}`}
                                >
                                  <Eye size={16} />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="8" className="FdaEmptyState">
                              <Search size={32} />
                              <p>No rejected requests match your current filters.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* CHANGED — pagination now driven by rejectedTotal (server) not client array length */}
                  <div className="FdaTableFooter">
                    <span className="FdaFooterInfo">
                      Showing {rejectedTotal === 0 ? 0 : rStartIdx + 1}–{rEndIdx} of {rejectedTotal} entries
                    </span>
                    <div className="FdaPagination">
                      <button
                        className="BtnPageNav"
                        disabled={safeRejectedPage === 1}
                        onClick={() => setRejectedPage(safeRejectedPage - 1)}
                      >
                        <ChevronLeft size={14} />
                        Prev
                      </button>
                      {Array.from({ length: totalRejectedPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          className={`FdaPageNumber ${safeRejectedPage === page ? 'active' : ''}`}
                          onClick={() => setRejectedPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        className="BtnPageNav"
                        disabled={safeRejectedPage === totalRejectedPages}
                        onClick={() => setRejectedPage(safeRejectedPage + 1)}
                      >
                        Next
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ============================================================================ */}
          {/* LEA RESPONSE TRACKING — FULL-WIDTH TABLE */}
          {/* ============================================================================ */}
          {fdaActiveTab === 'lea_response' && (() => {
            const LEA_PAGE_SIZE = FDA_VERIF_TABLE_PAGE_SIZE;
            const totalLeaPages = Math.ceil(filteredLeaResponse.length / LEA_PAGE_SIZE) || 1;
            const safeLeaPage = Math.min(Math.max(1, leaPage), totalLeaPages);
            const lStartIdx = (safeLeaPage - 1) * LEA_PAGE_SIZE;
            const lEndIdx = Math.min(lStartIdx + LEA_PAGE_SIZE, filteredLeaResponse.length);
            const paginatedLea = filteredLeaResponse.slice(lStartIdx, lEndIdx);

            return (
              <div className="FdaVerifTableSection">

                {/* Filter Panel — search fixed-width left, dropdowns grouped right */}
                <div className="FdaVerifFilterPanel">
                  <div className="FdaSearchWrapper FdaSearchFixed">
                    <Search size={16} className="FdaSearchIcon" />
                    <input
                      type="text"
                      placeholder="Search Case ID or Product Name..."
                      className="FdaSearchInput"
                      maxLength={150}
                      value={leaSearch}
                      onChange={(e) => { setLeaSearch(e.target.value); setLeaPage(1); }}
                      id="fda-lea-search-input"
                    />
                    {leaSearch && (
                      <button className="FdaVerifClearSearchBtn" onClick={() => { setLeaSearch(''); setLeaPage(1); }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="FdaFilterGroupsRight">
                    <div className="FdaFilterGroup">
                      <label>FDA Result</label>
                      <select
                        value={leaResultFilter}
                        onChange={(e) => {
                          const newRes = e.target.value;
                          setLeaResultFilter(newRes);
                          setLeaPage(1);
                          if ((newRes === 'registered' || newRes === 'rejected') && (leaStageFilter === 'takedown_initiated' || leaStageFilter === 'closed')) {
                            setLeaStageFilter('');
                          } else if (newRes === 'unregistered' && leaStageFilter === 'acknowledged') {
                            setLeaStageFilter('');
                          }
                        }}
                        id="fda-lea-result-filter"
                      >
                        <option value="">All Results</option>
                        <option value="registered">Registered</option>
                        <option value="unregistered">Unregistered</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>

                    <div className="FdaFilterGroup">
                      <label>LEA Stage</label>
                      <select
                        value={leaStageFilter}
                        onChange={(e) => { setLeaStageFilter(e.target.value); setLeaPage(1); }}
                        id="fda-lea-stage-filter"
                      >
                        <option value="">All Stages</option>
                        <option value="awaiting_lea">Awaiting LEA Action</option>
                        {(!leaResultFilter || leaResultFilter === 'registered' || leaResultFilter === 'rejected') && (
                          <option value="acknowledged">
                            {leaResultFilter === 'registered' || leaResultFilter === 'rejected'
                              ? 'Acknowledged - Case Closed'
                              : 'Acknowledged'}
                          </option>
                        )}
                        {(!leaResultFilter || leaResultFilter === 'unregistered') && (
                          <>
                            <option value="takedown_initiated">Takedown Initiated</option>
                            <option value="closed">Case Closed</option>
                          </>
                        )}
                      </select>
                    </div>

                    <button
                      className="BtnClearFiltersIcon"
                      onClick={() => { setLeaSearch(''); setLeaStageFilter(''); setLeaResultFilter(''); setLeaPage(1); }}
                      disabled={!(leaSearch || leaStageFilter || leaResultFilter)}
                      aria-label="Clear Filters"
                      title="Clear Filters"
                      style={{
                        display: (leaSearch || leaStageFilter || leaResultFilter) ? 'inline-flex' : 'none'
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* LEA Response Records Table */}
                <div className="FdaTableCard FdaVerifTableCard">
                  <div className="FdaTableWrapper" ref={leaTableWrapperRef}>
                    <table className="FdaTable">
                      <thead>
                        <tr>
                          <th>CASE ID</th>
                          <th>PRODUCT NAME</th>
                          <th>FDA RESULT</th>
                          <th>DATE FDA RESPONDED</th>
                          <th>LEA STAGE</th>
                          <th>LAST UPDATED</th>
                          <th style={{ width: '60px', textAlign: 'center' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaResponseLoading && filteredLeaResponse.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="FdaEmptyState">
                              <Clock size={28} style={{ opacity: 0.4 }} />
                              <p>Loading LEA response tracking records…</p>
                            </td>
                          </tr>
                        ) : paginatedLea.length > 0 ? (
                          paginatedLea.map((item) => {
                            const latestNote = getLatestNotePreview(item);
                            return (
                              <tr key={item.request_id}>
                                <td className="CaseIdCell">{item.case_reference}</td>
                                <td>
                                  <div className="ProductCell">
                                    <span className="ProductCellTitle">{item.product_title}</span>
                                  </div>
                                </td>
                                <td>
                                  <span className={getFdaResultBadgeClass(item.fda_result)}>
                                    {item.fda_result
                                      ? item.fda_result.charAt(0).toUpperCase() + item.fda_result.slice(1)
                                      : '—'}
                                  </span>
                                </td>
                                <td style={{ whiteSpace: 'nowrap' }}>
                                  {item.responded_at
                                    ? new Date(item.responded_at).toLocaleString('en-US', {
                                      year: 'numeric', month: '2-digit', day: '2-digit',
                                      hour: '2-digit', minute: '2-digit', hour12: true,
                                    })
                                    : '—'}
                                </td>
                                <td>
                                  <span className={getLeaStageBadgeClass(item.lea_stage, item.fda_result)}>
                                    {getLeaStageLabel(item.lea_stage, item.fda_result)}
                                  </span>
                                  {latestNote && (
                                    <span
                                      className="FdaVerif-lea-stage-note-preview"
                                      title={latestNote}
                                    >
                                      {latestNote}
                                    </span>
                                  )}
                                </td>
                                <td
                                  style={{ whiteSpace: 'nowrap' }}
                                  title={latestNote ? `Latest update: ${latestNote}` : undefined}
                                >
                                  {item.last_updated_at
                                    ? new Date(item.last_updated_at).toLocaleString('en-US', {
                                      year: 'numeric', month: '2-digit', day: '2-digit',
                                      hour: '2-digit', minute: '2-digit', hour12: true,
                                    })
                                    : '—'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    className="BtnActionView"
                                    onClick={() => handleViewLeaRecord(item)}
                                    title="View LEA follow-up details"
                                    id={`fda-btn-view-lea-${item.request_id}`}
                                  >
                                    <Eye size={16} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="7" className="FdaEmptyState">
                              <Search size={32} />
                              <p>No LEA response tracking records match your current filters.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="FdaTableFooter">
                    <span className="FdaFooterInfo">
                      Showing {filteredLeaResponse.length === 0 ? 0 : lStartIdx + 1}–{lEndIdx} of {filteredLeaResponse.length} entries
                    </span>
                    <div className="FdaPagination">
                      <button
                        className="BtnPageNav"
                        disabled={safeLeaPage === 1}
                        onClick={() => setLeaPage(safeLeaPage - 1)}
                      >
                        <ChevronLeft size={14} />
                        Prev
                      </button>
                      {Array.from({ length: totalLeaPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          className={`FdaPageNumber ${safeLeaPage === page ? 'active' : ''}`}
                          onClick={() => setLeaPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        className="BtnPageNav"
                        disabled={safeLeaPage === totalLeaPages}
                        onClick={() => setLeaPage(safeLeaPage + 1)}
                      >
                        Next
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ============================================================================ */}
          {/* CONFIRMATION MODAL OVERLAY */}
          {/* ============================================================================ */}
          {fdaModalConfig && (
            <div className="FdaVerifModalOverlay" role="dialog" aria-modal="true">
              <div className="FdaVerifModalContainer">
                <div className="FdaVerifModalHeader">
                  {/* CHANGED — reuse FdaVerifModalIcon_reject and AlertTriangle icon for discard type (Fix 2) */}
                  <div className={`FdaVerifModalIconWrap FdaVerifModalIcon_${fdaModalConfig.type === 'discard' ? 'reject' : fdaModalConfig.type}`}>
                    {fdaModalConfig.type === 'submit' && <ShieldCheck size={22} />}
                    {fdaModalConfig.type === 'save_draft' && <Save size={22} />}
                    {(fdaModalConfig.type === 'reject' || fdaModalConfig.type === 'discard') && <AlertTriangle size={22} />}
                  </div>
                  <div>
                    <h3 className="FdaVerifModalTitle">{fdaModalConfig.title}</h3>
                    <p className="FdaVerifModalDesc">{fdaModalConfig.description}</p>
                  </div>
                </div>

                <div className="FdaVerifModalFooter">
                  <button
                    className="FdaVerifBtnModalCancel"
                    onClick={() => setFdaModalConfig(null)}
                  >
                    Cancel
                  </button>

                  <button
                    className={`FdaVerifBtnModalConfirm FdaVerifBtnModal_${fdaModalConfig.confirmVariant}`}
                    onClick={handleExecuteModalAction}
                    id="fda-modal-confirm-action-btn"
                  >
                    {fdaModalConfig.confirmText}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================================ */}
          {/* RECORD VIEW MODAL (COMPLETED & REJECTED) */}
          {/* ============================================================================ */}
          {/* CHANGED — Record View Modal now maps real API field names from the completed
              detail endpoint (GET /verification-requests/completed/{request_id}).
              Dummy field names replaced. LTO field removed entirely (not in real API).
              verification_result is lowercase from the backend; capitalised for display.
              requested_by_name shown as 'N/A' when null.
              Both registered and unregistered paths use response_notes for remarks.
              Fallback to old camelCase names so the Rejected tab's existing dummy data
              still renders without changes. */}
          {fdaRecordModalData && (
            <div className="FdaVerifModalOverlay" role="dialog" aria-modal="true">
              {/* CHANGED — added FdaVerif-rejected-modal-container modifier for rejected records to match preview modal size */}
              <div className={`FdaRecordModalContainer${fdaRecordModalData._type === 'completed' ? ' FdaVerif-completed-modal-container' : fdaRecordModalData._type === 'lea_response' ? ' FdaVerif-lea-modal-container' : fdaRecordModalData._type === 'rejected' ? ' FdaVerif-rejected-modal-container' : ''}`}>

                {/* Modal Header */}
                <div className="FdaRecordModalHeader">
                  <div className="FdaRecordModalTitleGroup">
                    {fdaRecordModalData._type === 'lea_response' ? (
                      <>
                        <Send size={20} className="FdaVerifBlueIcon" />
                        <div>
                          <h3>LEA Follow-up Tracking Record</h3>
                          <p className="FdaRecordModalSubtitle">
                            {fdaRecordModalData.case_reference} &bull; Last updated on
                            {fdaRecordModalData.last_updated_at
                              ? ` ${new Date(fdaRecordModalData.last_updated_at).toLocaleString('en-US', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit', hour12: true,
                              })}`
                              : ''}
                          </p>
                        </div>
                      </>
                    ) : fdaRecordModalData._type === 'completed' ? (
                      <>
                        <ShieldCheck size={20} className="FdaVerifGreenIcon" />
                        <div>
                          <h3>Verification Record</h3>
                          {/* CHANGED — was .caseId / .dateCompleted (dummy);
                              now case_reference / responded_at (real API fields). */}
                          <p className="FdaRecordModalSubtitle">
                            {fdaRecordModalData.case_reference} &bull; Completed on
                            {fdaRecordModalData.responded_at
                              ? ` ${new Date(fdaRecordModalData.responded_at).toLocaleString('en-US', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit', hour12: true,
                              })}`
                              : ''}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <XCircle size={20} className="FdaVerifRedIcon" />
                        <div>
                          <h3>Rejected Request Record</h3>
                          {/* CHANGED — was .caseId / .dateRejected (dummy);
                              now case_reference / responded_at (real API fields). */}
                          <p className="FdaRecordModalSubtitle">
                            {fdaRecordModalData.case_reference ?? fdaRecordModalData.caseId} &bull; Rejected on
                            {fdaRecordModalData.responded_at
                              ? ` ${new Date(fdaRecordModalData.responded_at).toLocaleString('en-US', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit', hour12: true,
                              })}`
                              : (fdaRecordModalData.dateRejected ? ` ${fdaRecordModalData.dateRejected}` : '')}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Modal Body */}
                <div className="FdaRecordModalBody">
                  {/* Core Details Grid */}
                  <div className="FdaRecordInfoGrid">
                    <div className="FdaRecordInfoItem">
                      <span className="FdaVerifInfoLabel">CASE ID</span>
                      {/* CHANGED — was .caseId; now case_reference (fallback for rejected dummy) */}
                      <span className="FdaVerifInfoValueHighlight">{fdaRecordModalData.case_reference ?? fdaRecordModalData.caseId}</span>
                    </div>
                    <div className="FdaRecordInfoItem">
                      <span className="FdaVerifInfoLabel">PRODUCT NAME</span>
                      {/* CHANGED — was .productName; now product_title / product_name */}
                      <span className="FdaVerifInfoValue">{fdaRecordModalData.product_title ?? fdaRecordModalData.product_name ?? fdaRecordModalData.productName}</span>
                    </div>
                    <div className="FdaRecordInfoItem">
                      <span className="FdaVerifInfoLabel">MANUFACTURER</span>
                      <span className="FdaVerifInfoValue">{fdaRecordModalData.manufacturer || '—'}</span>
                    </div>
                    <div className="FdaRecordInfoItem">
                      <span className="FdaVerifInfoLabel">PRODUCT CATEGORY</span>
                      {/* CHANGED — was .category; now product_category */}
                      <span className="FdaVerifInfoValue">{fdaRecordModalData.product_category ?? fdaRecordModalData.category ?? '—'}</span>
                    </div>
                    {fdaRecordModalData._type === 'lea_response' ? (
                      <>
                        <div className="FdaRecordInfoItem">
                          <span className="FdaVerifInfoLabel">SOURCE</span>
                          {/* 🔌 BACKEND: lea-follow-up should return walk-in cases only (source = 'walk_in') */}
                          <span className="FdaSourceBadge" style={{ width: 'fit-content' }}>
                            <Footprints size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                            Walk-in
                          </span>
                        </div>
                        <div className="FdaRecordInfoItem">
                          <span className="FdaVerifInfoLabel">PRODUCT CODE</span>
                          <span className="FdaVerifInfoValue">{fdaRecordModalData.product_code || '—'}</span>
                        </div>
                        <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
                          <span className="FdaVerifInfoLabel">Attached Files / Evidence</span>
                          <div className="FdaVerifDocsGrid">
                            {fdaRecordModalData.attached_files && fdaRecordModalData.attached_files.length > 0 ? (
                              fdaRecordModalData.attached_files.map((file) => {
                                const isImage = file.mime_type?.startsWith('image/') ||
                                  /\.(jpg|jpeg|png|gif|webp)$/i.test(file.file_name || '');
                                return (
                                  <div key={file.file_id} className="FdaVerifDocCard">
                                    <div className="FdaVerifDocIcon">
                                      {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                                    </div>
                                    <div className="FdaVerifDocInfo">
                                      <p className="FdaVerifDocName" title={file.file_name}>{file.file_name}</p>
                                      <span className="FdaVerifDocMeta">{file.file_size_display}</span>
                                    </div>
                                    <div className="FdaVerifDocActions">
                                      <button
                                        className="FdaVerifDocActionBtn"
                                        title="Inspect Attachment"
                                        onClick={() => setFdaDocPreviewModal(file)}
                                      >
                                        <Eye size={13} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="FdaVerifNoDocsText">No attached files</p>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="FdaRecordInfoItem">
                          <span className="FdaVerifInfoLabel">DATE RECEIVED</span>
                          {/* CHANGED — was .dateReceived (pre-formatted string);
                              now requested_at (ISO) formatted inline. */}
                          <span className="FdaVerifInfoValue">
                            {fdaRecordModalData.requested_at
                              ? new Date(fdaRecordModalData.requested_at).toLocaleString('en-US', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit', hour12: true,
                              })
                              : (fdaRecordModalData.dateReceived ?? '—')}
                          </span>
                        </div>
                        <div className="FdaRecordInfoItem">
                          <span className="FdaVerifInfoLabel">REQUESTING LEA OFFICER</span>
                          {/* CHANGED — was .complainant; now requested_by_name (null → 'N/A') */}
                          <span className="FdaVerifInfoValue">
                            {fdaRecordModalData.requested_by_name ?? fdaRecordModalData.complainant ?? 'N/A'}
                          </span>
                        </div>
                        {fdaRecordModalData._type === 'completed' && (
                          <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
                            <span className="FdaVerifInfoLabel">Attached Files / Evidence</span>
                            <div className="FdaVerifDocsGrid">
                              {fdaRecordModalData.attached_files && fdaRecordModalData.attached_files.length > 0 ? (
                                fdaRecordModalData.attached_files.map((file) => {
                                  const isImage = file.mime_type?.startsWith('image/') ||
                                    /\.(jpg|jpeg|png|gif|webp)$/i.test(file.file_name || '');
                                  return (
                                    <div key={file.file_id} className="FdaVerifDocCard">
                                      <div className="FdaVerifDocIcon">
                                        {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                                      </div>
                                      <div className="FdaVerifDocInfo">
                                        <p className="FdaVerifDocName" title={file.file_name}>{file.file_name}</p>
                                        <span className="FdaVerifDocMeta">{file.file_size_display}</span>
                                      </div>
                                      <div className="FdaVerifDocActions">
                                        <button
                                          className="FdaVerifDocActionBtn"
                                          title="Inspect Attachment"
                                          onClick={() => setFdaDocPreviewModal(file)}
                                        >
                                          <Eye size={13} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="FdaVerifNoDocsText">No attached files</p>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* COMPLETED RECORD DETAILS */}
                  {fdaRecordModalData._type === 'completed' && (
                    <div className={`FdaRecordResultSection${fdaRecordModalData.verification_result === 'unregistered' ? ' FdaRecordUnregisteredResultSection' : ''}`}>
                      <div className="FdaRecordSectionTitle">
                        <ShieldCheck size={15} className="FdaVerifGreenIcon" />
                        <span>Official FDA Verification Result</span>
                      </div>

                      <div className="FdaRecordResultRow">
                        <span className="FdaVerifInfoLabel">Verification Determination:</span>
                        {/* CHANGED — was .verificationResult (capitalized dummy);
                            now verification_result (lowercase from API) — capitalised here. */}
                        <span className={`FdaVerifResultTag ${fdaRecordModalData.verification_result === 'registered' ? 'FdaVerifTagReg' : 'FdaVerifTagUnreg'
                          }`}>
                          {fdaRecordModalData.verification_result
                            ? fdaRecordModalData.verification_result.charAt(0).toUpperCase() + fdaRecordModalData.verification_result.slice(1)
                            : '—'}
                        </span>
                      </div>

                      {/* CHANGED — condition now uses lowercase 'registered' to match real API value */}
                      {fdaRecordModalData.verification_result === 'registered' ? (
                        <div className="FdaRecordInfoGrid">
                          <div className="FdaRecordInfoItem">
                            <span className="FdaVerifInfoLabel">FDA CPR Number</span>
                            {/* CHANGED — was .cprNumber; now cpr_number */}
                            <span className="FdaVerifInfoValueHighlight">{fdaRecordModalData.cpr_number ?? '—'}</span>
                          </div>
                          <div className="FdaRecordInfoItem">
                            <span className="FdaVerifInfoLabel">CPR Expiry Date</span>
                            {/* CHANGED — was .cprExpiry; now cpr_expiry */}
                            <span className="FdaVerifInfoValue">{fdaRecordModalData.cpr_expiry ?? '—'}</span>
                          </div>
                          {/* REMOVED — License to Operate (LTO) field deleted;
                              not present in the real API response. */}
                          <div className="FdaRecordInfoItem">
                            <span className="FdaVerifInfoLabel">Verified By</span>
                            {/* CHANGED — was .verifierName / .verifierTitle; now verified_by_name (null → 'N/A') */}
                            <span className="FdaVerifInfoValue">{fdaRecordModalData.verified_by_name ?? 'N/A'}</span>
                          </div>
                          <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
                            <span className="FdaVerifInfoLabel">Official FDA Remarks</span>
                            {/* CHANGED — was .remarks; now response_notes */}
                            <p className="FdaRecordRemarksText">{fdaRecordModalData.response_notes ?? '—'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="FdaRecordInfoGrid">
                          <div className="FdaRecordInfoItem">
                            <span className="FdaVerifInfoLabel">Verified By</span>
                            {/* CHANGED — was .verifierName / .verifierTitle; now verified_by_name (null → 'N/A') */}
                            <span className="FdaVerifInfoValue">{fdaRecordModalData.verified_by_name ?? 'N/A'}</span>
                          </div>
                          <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
                            <span className="FdaVerifInfoLabel">Reason Product is Unregistered</span>
                            {/* CHANGED — was .unregisteredReason; now unregistered_reason */}
                            <p className="FdaRecordRemarksText">{fdaRecordModalData.unregistered_reason ?? '—'}</p>
                          </div>
                          <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
                            <span className="FdaVerifInfoLabel">FDA Advisory Remarks</span>
                            {/* CHANGED — was .remarks; now response_notes */}
                            <p className="FdaRecordRemarksText">{fdaRecordModalData.response_notes ?? '—'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* REJECTED RECORD DETAILS */}
                  {fdaRecordModalData._type === 'rejected' && (
                    <div className="FdaRecordResultSection FdaRecordRejectedSection">
                      <div className="FdaRecordSectionTitle">
                        <XCircle size={15} className="FdaVerifRedIcon" />
                        <span>Rejection Details</span>
                      </div>

                      <div className="FdaRecordInfoGrid">
                        <div className="FdaRecordInfoItem">
                          <span className="FdaVerifInfoLabel">Rejected By</span>
                          {/* CHANGED — was .rejectedBy (dummy); now rejected_by_name (null → 'N/A') */}
                          <span className="FdaVerifInfoValue">{fdaRecordModalData.rejected_by_name ?? 'N/A'}</span>
                        </div>
                        <div className="FdaRecordInfoItem">
                          <span className="FdaVerifInfoLabel">Date Rejected</span>
                          {/* CHANGED — was .dateRejected (pre-formatted string);
                              now responded_at (ISO) formatted inline. */}
                          <span className="FdaVerifInfoValue">
                            {fdaRecordModalData.responded_at
                              ? new Date(fdaRecordModalData.responded_at).toLocaleString('en-US', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit', hour12: true,
                              })
                              : (fdaRecordModalData.dateRejected ?? '—')}
                          </span>
                        </div>
                        <div className="FdaRecordInfoItem FdaRecordInfoItemFull">
                          <span className="FdaVerifInfoLabel">Rejection Rationale (Sent to LEA)</span>
                          {/* CHANGED — was .rejectionReason (dummy); now rejection_reason */}
                          <div className="FdaRecordRejectionReasonBox">
                            <p>{fdaRecordModalData.rejection_reason ?? '—'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* LEA RESPONSE RECORD DETAILS & TIMELINE */}
                  {fdaRecordModalData._type === 'lea_response' && (
                    <>
                      {/* Section b: FDA Result */}
                      <div className="FdaRecordResultSection" style={{ background: '#FFFFFF', border: '1.5px solid #EDEDED' }}>
                        <div className="FdaRecordSectionTitle" style={{ color: '#1B4332' }}>
                          <ShieldCheck size={15} className="FdaVerifGreenIcon" />
                          <span>Official FDA Result</span>
                        </div>
                        <div className="FdaRecordInfoGrid" style={{ background: '#FDFDFD', border: '1px solid #EDEDED' }}>
                          <div className="FdaRecordInfoItem">
                            <span className="FdaVerifInfoLabel">DETERMINATION</span>
                            <span className={getFdaResultBadgeClass(fdaRecordModalData.fda_result)}>
                              {(fdaRecordModalData.fda_result || '').toUpperCase()}
                            </span>
                          </div>
                          <div className="FdaRecordInfoItem">
                            <span className="FdaVerifInfoLabel">VERIFIED BY</span>
                            <span className="FdaVerifInfoValue">{fdaRecordModalData.verified_by_name || 'N/A'}</span>
                          </div>
                          <div className="FdaRecordInfoItem">
                            <span className="FdaVerifInfoLabel">DATE RESPONDED</span>
                            <span className="FdaVerifInfoValue">
                              {fdaRecordModalData.responded_at
                                ? new Date(fdaRecordModalData.responded_at).toLocaleString('en-US', {
                                  year: 'numeric', month: 'short', day: 'numeric',
                                  hour: '2-digit', minute: '2-digit', hour12: true,
                                })
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Section d: Reminders (if present) */}
                      {fdaRecordModalData.reminder_sent_at && (
                        <div className="FdaVerif-lea-reminder-card">
                          <AlertTriangle size={16} />
                          <div>
                            <strong>LEA Reminder Sent:</strong> LEA officers transmitted an expedited follow-up reminder on{' '}
                            {new Date(fdaRecordModalData.reminder_sent_at).toLocaleString('en-US', {
                              year: 'numeric', month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit', hour12: true,
                            })}.
                          </div>
                        </div>
                      )}

                      {/* Section c: LEA Follow-up Timeline (Vertical Stepper) */}
                      <div className="FdaVerif-lea-stepper-wrap">
                        <span className="FdaVerifInfoLabel" style={{ marginBottom: '8px', display: 'block' }}>
                          LEA FOLLOW-UP PROGRESSION
                        </span>

                        <div className="FdaVerif-lea-stepper">
                          {(() => {
                            const normResult = (fdaRecordModalData.fda_result || '').toLowerCase();
                            const isRegisteredOrRejected = normResult === 'registered' || normResult === 'rejected';

                            const stageOrder = isRegisteredOrRejected
                              ? ['awaiting_lea', 'acknowledged']
                              // CHANGED — LEA has no acknowledge step for unregistered cases; goes straight to takedown
                              : ['awaiting_lea', 'takedown_initiated', 'closed'];

                            const currentStageIndex = stageOrder.indexOf(fdaRecordModalData.lea_stage);
                            const effectiveCurrentIndex = currentStageIndex >= 0 ? currentStageIndex : 0;

                            const stepsConfig = isRegisteredOrRejected
                              ? [
                                  {
                                    key: 'awaiting_lea',
                                    title: 'Awaiting LEA Action',
                                    date: fdaRecordModalData.responded_at,
                                    dateLabel: 'Date FDA Responded:',
                                    actor: null,
                                  },
                                  {
                                    key: 'acknowledged',
                                    title: 'Acknowledged - Case Closed',
                                    date: fdaRecordModalData.acknowledged_at,
                                    dateLabel: 'Acknowledged At:',
                                    actor: fdaRecordModalData.acknowledged_by_name,
                                    actorLabel: 'Acknowledged By:',
                                  },
                                ]
                              : [
                                  {
                                    key: 'awaiting_lea',
                                    title: 'Awaiting LEA Action',
                                    date: fdaRecordModalData.responded_at,
                                    dateLabel: 'Date FDA Responded:',
                                    actor: null,
                                  },
                                  // CHANGED — removed 'acknowledged' step; LEA transitions directly from awaiting_lea to takedown_initiated
                                  {
                                    key: 'takedown_initiated',
                                    title: 'Takedown Initiated',
                                    date: fdaRecordModalData.takedown_initiated_at,
                                    dateLabel: 'Initiated At:',
                                    actor: fdaRecordModalData.takedown_initiated_by_name,
                                    actorLabel: 'Initiated By:',
                                    fieldOperationNotes: fdaRecordModalData.field_operation_notes,
                                  },
                                  {
                                    key: 'closed',
                                    title: 'Case Closed',
                                    date: fdaRecordModalData.closed_at,
                                    dateLabel: 'Closed At:',
                                    actor: fdaRecordModalData.closed_by_name,
                                    actorLabel: 'Closed By:',
                                    closingNotes: fdaRecordModalData.closing_notes,
                                    closeReason: fdaRecordModalData.close_reason,
                                  },
                                ];

                            return stepsConfig.map((step, idx) => {
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
                                            {new Date(step.date).toLocaleString('en-US', {
                                              year: 'numeric', month: 'short', day: 'numeric',
                                              hour: '2-digit', minute: '2-digit', hour12: true,
                                            })}
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
                                        <p className="FdaVerif-lea-notes-text">{step.fieldOperationNotes}</p>
                                      </div>
                                    )}

                                    {/* Closing notes block */}
                                    {step.closingNotes && (
                                      <div className="FdaVerif-lea-step-notes FdaVerif-lea-step-notes-closing">
                                        <strong>Field operation status update (at closing)</strong>
                                        <p className="FdaVerif-lea-notes-text">{step.closingNotes}</p>
                                      </div>
                                    )}

                                    {/* Reason Closed block */}
                                    {step.closeReason && (
                                      <div className="FdaVerif-lea-step-notes FdaVerif-lea-step-notes-reason">
                                        <strong>Reason Closed</strong>
                                        <p className="FdaVerif-lea-notes-text">{step.closeReason}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </>
                  )}

                </div>

                {/* Modal Footer */}
                <div className="FdaRecordModalFooter">
                  {/* BACKEND: GET /api/fda/verification-requests/:id/export-pdf */}
                  {/* CHANGED — wired to real export endpoints (CHANGE 3).
                      Routes to completed or rejected export based on _type tag.
                      Also fixed fdaRecordModalData.caseId → case_reference. */}
                  {fdaRecordModalData._type !== 'lea_response' && (
                    <button
                      className="FdaVerifBtnOutline"
                      onClick={() => {
                        const endpoint = fdaRecordModalData._type === 'completed'
                          ? `/verification-requests/completed/${fdaRecordModalData.request_id}/export-pdf`
                          : `/verification-requests/rejected/${fdaRecordModalData.request_id}/export-pdf`;

                        // CHANGE — swap the raw fetch + manual header for apiFetch:
                        apiFetch(endpoint)
                          .then((res) => {
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            return res.blob();
                          })
                          .then((blob) => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${fdaRecordModalData.case_reference}-${fdaRecordModalData._type}-record.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                            triggerAlert(`Exported record for ${fdaRecordModalData.case_reference} as PDF.`, 'info');
                            setFdaRecordModalData(null);
                          })
                          .catch(() => {
                            triggerAlert('Could not export the PDF. Please try again.', 'danger');
                          });
                      }}
                    >
                      <Download size={14} />
                      <span>Export Record as PDF</span>
                    </button>
                  )}
                  <button
                    className="FdaVerifBtnModalCancel"
                    onClick={() => setFdaRecordModalData(null)}
                  >
                    Close
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* ============================================================================ */}
          {/* INTAKE DOCUMENT PREVIEW MODAL */}
          {/* ============================================================================ */}
          {/* FIX 1 — updated to use real API field names from selectedQueueDetail.attached_files:
              fdaDocPreviewModal is now set to the file object itself (not a dummy doc object),
              so .file_name replaces old .name, .file_size_display replaces old .size,
              .mime_type is now available for display. The actual download fetch (Bearer auth
              → blob → anchor click) lives here in the "Download Attachment" button,
              moved from the inline card button. */}
          {fdaDocPreviewModal && (
            <div className="FdaVerifModalOverlay" role="dialog" aria-modal="true" style={{ zIndex: 1100 }}>
              <div className="FdaVerifDocModalContainer">
                <div className="FdaVerifDocModalHeader">
                  <div className="FdaVerifDocModalTitleGroup">
                    <Paperclip size={18} className="FdaVerifGreenIcon" />
                    <div>
                      {/* FIX 1 — was fdaDocPreviewModal.name (dummy); now file_name. */}
                      <h3>{fdaDocPreviewModal.file_name}</h3>
                      {/* FIX 1 — was .category • .size (dummy); now mime_type • file_size_display. */}
                      <p className="FdaVerifDocModalMeta">
                        {fdaDocPreviewModal.mime_type} &bull; {fdaDocPreviewModal.file_size_display}
                      </p>
                    </div>
                  </div>
                  <button
                    className="FdaVerifIconButton"
                    onClick={() => setFdaDocPreviewModal(null)}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* CHANGED — replaced static placeholder with live image/PDF/docx preview.
                    Fetched from GET /shared-files/{file_id}/preview (CHANGE 2).
                    Amendment 1: isImage/isPdf/isDocx computed from mime_type OR file extension
                    to avoid bare .mime_type.startsWith() calls when mime_type is missing. */}
                <div className="FdaVerifDocModalBody">
                  {/* CHANGED — compute type flags inline using same logic as the effect (Amendment 1) */}
                  {(() => {
                    const _mime = fdaDocPreviewModal.mime_type || '';
                    const _name = fdaDocPreviewModal.file_name || '';
                    const isImage = _mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(_name);
                    const isPdf = _mime === 'application/pdf' || /\.pdf$/i.test(_name);
                    const isDocx = _mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(_name);
                    if (isImage || isPdf) {
                      return fdaDocPreviewLoading ? (
                        <div className="FdaVerifDocPlaceholderPreview">
                          <p className="FdaVerifPreviewText">Loading preview&hellip;</p>
                        </div>
                      ) : fdaDocPreviewError ? (
                        <div className="FdaVerifDocPlaceholderPreview">
                          <FileText size={48} className="FdaVerifDocPreviewIcon" />
                          <p className="FdaVerifPreviewTitle">Preview unavailable</p>
                          <p className="FdaVerifPreviewText">Try downloading the file instead.</p>
                        </div>
                      ) : isImage ? (
                        <img
                          src={fdaDocPreviewUrl}
                          alt={fdaDocPreviewModal.file_name}
                          className="FdaVerifDocImagePreview"
                        />
                      ) : (
                        <iframe
                          src={fdaDocPreviewUrl}
                          title={fdaDocPreviewModal.file_name}
                          className="FdaVerifDocPdfPreview"
                        />
                      );
                    }
                    // CHANGED — docx branch added (Fix 2), mirrors lea-verification-request.jsx
                    if (isDocx) {
                      return docxLoading ? (
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
                      );
                    }
                    return (
                      <div className="FdaVerifDocPlaceholderPreview">
                        <FileText size={48} className="FdaVerifDocPreviewIcon" />
                        <p className="FdaVerifPreviewTitle">Preview not supported</p>
                        <p className="FdaVerifPreviewText">
                          <strong>{fdaDocPreviewModal.file_name}</strong> can't be previewed inline &mdash; use download instead.
                        </p>
                      </div>
                    );
                  })()}
                </div>

                <div className="FdaVerifModalFooter">
                  <button
                    className="FdaVerifBtnOutline"
                    onClick={() => setFdaDocPreviewModal(null)}
                  >
                    Close Preview
                  </button>
                  {/* FIX 1 — "Download Attachment" button now performs the actual
                      download fetch (moved here from the inline card button).
                      Calls GET /shared-files/{file_id}/download with Bearer auth,
                      converts the blob to an object URL, and triggers a browser
                      download via a temporary anchor element. */}
                  <button
                    className="FdaVerifBtnDownloadAttachment"
                    onClick={() => {
                      apiFetch(`/shared-files/${fdaDocPreviewModal.file_id}/download`)
                        .then((res) => {
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          return res.blob();
                        })
                        .then((blob) => {
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = fdaDocPreviewModal.file_name;
                          a.click();
                          URL.revokeObjectURL(url);
                          setFdaDocPreviewModal(null);
                        })
                        .catch(() => {
                          triggerAlert('Could not download the file. Please try again.', 'danger');
                        });
                    }}
                  >
                    <Download size={14} />
                    <span>Download Attachment</span>
                  </button>
                </div>
              </div>
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
      </div>
    </div>
  );
}

export default FDAVerification;