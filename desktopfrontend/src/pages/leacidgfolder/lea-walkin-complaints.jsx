// new lea-walkin-complaints.jsx 
import './lea-css.css'
import Sidebar from '../component/sidebar'
import TopBar from '../component/top-bar'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import mammoth from 'mammoth'
import {
  Eye,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
  Clock3,
  BellRing,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  Calendar,
  User,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react'

import { apiFetch } from '../../utils/apiFetch';

// ⚠️ REMOVE THIS: Mock toggle and control for walk-in verification progress
const USE_WALKIN_PROCESS_MOCK = true;
// ⚠️ REMOVE THIS: Change to 'takedown_initiated' or 'completed' to preview later stages
const MOCK_UNREGISTERED_COMPLAINT_STATUS = 'takedown_requested';

// 🔌 BACKEND: GET /complaints/{id}/walkin-detail should return a `verification` object (or null). Expected keys:
// request_id, request_status ('pending'|'confirmed_registered'|'confirmed_unregistered'|'rejected'|'recalled'),
// priority, product_code, notes_to_fda, requested_at, requested_by_name, reminder_sent_at,
// verification_result ('registered'|'unregistered'|'rejected'|null), cpr_number, cpr_expiry,
// unregistered_reason, rejection_reason, response_notes, verified_by_name, responded_at,
// acknowledged_at, acknowledged_by_name, complaint_status ('open'|'under_review'|
// 'takedown_requested'|'takedown_initiated'|'completed'|'dismissed'), takedown_initiated_at,
// takedown_initiated_by_name, field_operation_notes, closed_at, closed_by_name,
// reason_closed ('completed'|'registered'|'rejected'), reason_detail

// ⚠️ REMOVE THIS: Mock provider generating realistic Philippine cosmetic data for walk-in verification progress preview
function getMockWalkinVerification(status, complaint) {
  if (status === 'queued') {
    return null;
  }

  if (status === 'pending') {
    return {
      request_id: 'vr-mock-001',
      request_status: 'pending',
      priority: 'standard',
      product_code: 'BC-893012-PH',
      notes_to_fda: 'Citizen reported severe dermatitis and rash within 48 hours of using this facial cream purchased at Divisoria market. Suspected counterfeit or unregistered cosmetic formulation with heavy metal contamination.',
      requested_at: '2026-10-04T09:30:00Z',
      requested_by_name: 'Agent Danilo Reyes, CIDG',
      reminder_sent_at: '2026-10-06T14:15:00Z',
      verification_result: null,
      cpr_number: null,
      cpr_expiry: null,
      unregistered_reason: null,
      rejection_reason: null,
      response_notes: null,
      verified_by_name: null,
      responded_at: null,
      acknowledged_at: null,
      acknowledged_by_name: null,
      complaint_status: 'open',
      takedown_initiated_at: null,
      takedown_initiated_by_name: null,
      field_operation_notes: null,
      closed_at: null,
      closed_by_name: null,
      reason_closed: null,
      reason_detail: null,
    };
  }

  if (status === 'confirmed_registered') {
    return {
      request_id: 'vr-mock-002',
      request_status: 'confirmed_registered',
      priority: 'high',
      product_code: 'NN-100000941235',
      notes_to_fda: 'Walk-in complainant reported skin peeling and chemical burns after applying whitening serum bought from an online distributor stall in Quiapo.',
      requested_at: '2026-09-28T10:15:00Z',
      requested_by_name: 'Agent Maria Santos, CIDG',
      reminder_sent_at: null,
      verification_result: 'registered',
      cpr_number: 'NN-100000941235',
      cpr_expiry: '2027-11-30',
      unregistered_reason: null,
      rejection_reason: null,
      response_notes: 'Product holds an active Cosmetic Product Notification with the FDA Center for Cosmetics Regulation and Research (CCRR). Batch number matches authentic manufacturer distribution records. Citizen reaction may indicate individual hypersensitivity or improper storage handling.',
      verified_by_name: 'Ma. Cristina Rodriguez, RPh (FDA CCRR)',
      responded_at: '2026-09-30T11:45:00Z',
      acknowledged_at: '2026-10-01T08:20:00Z',
      acknowledged_by_name: 'Agent Maria Santos, CIDG',
      complaint_status: 'dismissed',
      takedown_initiated_at: null,
      takedown_initiated_by_name: null,
      field_operation_notes: null,
      closed_at: '2026-10-01T08:20:00Z',
      closed_by_name: 'Agent Maria Santos, CIDG',
      reason_closed: 'registered',
      reason_detail: 'Verified authentic FDA-notified cosmetic product. Case closed and referred to consumer advisory unit.',
    };
  }

  if (status === 'confirmed_unregistered') {
    const cStatus = MOCK_UNREGISTERED_COMPLAINT_STATUS;
    return {
      request_id: 'vr-mock-003',
      request_status: 'confirmed_unregistered',
      priority: 'urgent',
      product_code: 'GBC-EXP-4402',
      notes_to_fda: 'Complainant submitted samples of whitening toner sold with unverified foreign labels in Baclaran shopping center. Chemical odor reported.',
      requested_at: '2026-09-22T08:45:00Z',
      requested_by_name: 'Agent Rafael Cruz, CIDG',
      reminder_sent_at: null,
      verification_result: 'unregistered',
      cpr_number: null,
      cpr_expiry: null,
      unregistered_reason: 'No record of Cosmetic Notification or Certificate of Product Registration in FDA Philippines Database. Product contains undeclared Hydroquinone and Mercury levels exceeding permissible safety limits under ASEAN Cosmetic Directive.',
      rejection_reason: null,
      response_notes: 'Immediate enforcement action recommended pursuant to RA 9711 (FDA Act of 2009). Issue seizure order and confiscate inventory from retailer and regional warehouse distributors.',
      verified_by_name: 'Eduardo M. Bautista, Chemist III (FDA Enforcement Task Force)',
      responded_at: '2026-09-24T14:30:00Z',
      acknowledged_at: '2026-09-25T09:00:00Z',
      acknowledged_by_name: 'Agent Rafael Cruz, CIDG',
      complaint_status: cStatus,
      takedown_initiated_at: (cStatus === 'takedown_initiated' || cStatus === 'completed') ? '2026-09-26T10:00:00Z' : null,
      takedown_initiated_by_name: (cStatus === 'takedown_initiated' || cStatus === 'completed') ? 'Lt. Col. Arthur Valenzuela, CIDG Region IV-A' : null,
      field_operation_notes: (cStatus === 'takedown_initiated' || cStatus === 'completed') ? 'Joint raid conducted with FDA Regional Field Office. 4 retail stalls inspected; 320 bottles seized and secured under chain of custody. Notice of Violation served to shop manager.' : null,
      closed_at: cStatus === 'completed' ? '2026-10-02T16:30:00Z' : null,
      closed_by_name: cStatus === 'completed' ? 'Agent Rafael Cruz, CIDG' : null,
      reason_closed: cStatus === 'completed' ? 'completed' : null,
      reason_detail: cStatus === 'completed' ? 'Enforcement operation successfully concluded. All illicit stocks impounded and forwarded to FDA laboratory for judicial evidentiary proceedings.' : null,
    };
  }

  if (status === 'rejected') {
    return {
      request_id: 'vr-mock-004',
      request_status: 'rejected',
      priority: 'low',
      product_code: 'UNKNOWN-SOAP-01',
      notes_to_fda: 'Citizen presented handwritten receipt for an unlabeled herbal bath soap purchased at a provincial weekend flea market.',
      requested_at: '2026-09-18T13:10:00Z',
      requested_by_name: 'Agent Leo Magbanua, CIDG',
      reminder_sent_at: null,
      verification_result: 'rejected',
      cpr_number: null,
      cpr_expiry: null,
      unregistered_reason: null,
      rejection_reason: 'Insufficient product identification data. Labeling images provided do not show brand name, manufacturer details, lot/batch number, or primary packaging for FDA database cross-reference.',
      response_notes: 'Please obtain higher-resolution packaging photographs or an official manufacturer invoice before resubmitting verification request.',
      verified_by_name: 'Carmina S. Mendoza (FDA Regulatory Officer)',
      responded_at: '2026-09-20T10:00:00Z',
      acknowledged_at: '2026-09-21T11:15:00Z',
      acknowledged_by_name: 'Agent Leo Magbanua, CIDG',
      complaint_status: 'dismissed',
      takedown_initiated_at: null,
      takedown_initiated_by_name: null,
      field_operation_notes: null,
      closed_at: '2026-09-21T11:15:00Z',
      closed_by_name: 'Agent Leo Magbanua, CIDG',
      reason_closed: 'rejected',
      reason_detail: 'Verification request rejected due to illegible evidence. Citizen contacted to provide clearer packaging samples.',
    };
  }

  return null;
}

// BACKEND: Status values must match the backend complaint workflow states exactly.
function WcGetStatusClass(status) {
  switch (status) {
    case 'queued':
      return 'WcStatus-queued';

    case 'pending':
      return 'WcStatus-pending';

    case 'confirmed_registered':
      return 'WcStatus-confirmed-registered';

    case 'confirmed_unregistered':
      return 'WcStatus-confirmed-unregistered';

    case 'rejected':
      return 'WcStatus-rejected';

    case 'takedown_initiated':
      return 'WcStatus-takedown-initiated';

    case 'completed':
      return 'WcStatus-completed';

    default:
      return '';
  }
}

function WcGetStatusLabel(status) {
  switch (status) {
    case 'queued':
      return 'Ready to Send';

    case 'pending':
      return 'Pending FDA Verification';

    case 'confirmed_registered':
      return 'Confirmed Registered';

    case 'confirmed_unregistered':
      return 'Confirmed Unregistered';

    case 'rejected':
      return 'Verification Rejected';

    case 'takedown_initiated':
      return 'Takedown Initiated';

    case 'completed':
      return 'Takedown Completed';

    default:
      return status;
  }
}

function formatPurchaseDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : String(dateStr);
  } catch {
    return String(dateStr);
  }
}

function formatAmountPaid(amount) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = Number(amount);
  if (isNaN(num)) return String(amount);
  return `₱${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }) + ' ' + d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function LeaWalkinComplaints() {
  // BACKEND:
  // Load complaints from API.
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch('/complaints/walkin/')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setComplaints(data.map((c) => ({
          id: c.case_reference,
          complaintId: c.complaint_id,
          product: c.product_title,
          manufacturer: c.manufacturer,
          complainant: c.complainant_name,
          status: c.status,
          category: c.product_category,
          logged: new Date(c.created_at).toLocaleString(),
        })))
      })
      .finally(() => setLoading(false))
  }, [])
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const WALKIN_PAGE_SIZE = 25
  useEffect(() => { setCurrentPage(1); }, [search, selectedStatus, selectedCategory]);
  const [viewModal, setViewModal] = useState(false)
  const [selectedComplaint, setSelectedComplaint] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [singleDeleteTarget, setSingleDeleteTarget] = useState(null)
  const [showSingleDeleteModal, setShowSingleDeleteModal] = useState(false)
  const menuRef = useRef(null)

  // Document preview modal state
  const [docPreviewModal, setDocPreviewModal] = useState(null)
  const [docPreviewUrl, setDocPreviewUrl] = useState(null)
  const [docPreviewLoading, setDocPreviewLoading] = useState(false)
  const [docPreviewError, setDocPreviewError] = useState(false)
  const [docxHtml, setDocxHtml] = useState('')
  const [docxLoading, setDocxLoading] = useState(false)
  const [docxError, setDocxError] = useState(false)

  // Fetches inline preview when docPreviewModal is set
  useEffect(() => {
    if (!docPreviewModal) {
      setDocPreviewUrl(null)
      setDocPreviewError(false)
      setDocxHtml('')
      setDocxLoading(false)
      setDocxError(false)
      return
    }

    const mime = docPreviewModal.mime_type || docPreviewModal.type || ''
    const name = docPreviewModal.file_name || docPreviewModal.name || ''
    const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name)
    const isDocx = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(name)

    if (!isImage && !isPdf && !isDocx) return

    if (isDocx) {
      setDocxLoading(true)
      setDocxError(false)

      if (docPreviewModal.url) {
        fetch(docPreviewModal.url)
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.arrayBuffer()
          })
          .then(arrayBuffer => mammoth.convertToHtml({ arrayBuffer }))
          .then(result => { setDocxHtml(result.value) })
          .catch(err => {
            console.error('Docx preview error:', err)
            setDocxError(true)
          })
          .finally(() => setDocxLoading(false))
        return
      }

      const fileId = docPreviewModal.file_id || docPreviewModal.id
      if (!fileId) {
        setDocxLoading(false)
        setDocxError(true)
        return
      }

      apiFetch(`/shared-files/${fileId}/preview`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.arrayBuffer()
        })
        .then((arrayBuffer) => mammoth.convertToHtml({ arrayBuffer }))
        .then((result) => { setDocxHtml(result.value) })
        .catch((err) => {
          console.error('Docx preview error:', err)
          setDocxError(true)
        })
        .finally(() => setDocxLoading(false))
      return
    }

    if (docPreviewModal.url) {
      setDocPreviewUrl(docPreviewModal.url)
      return
    }

    const fileId = docPreviewModal.file_id || docPreviewModal.id
    if (!fileId) return

    let objectUrl = null
    setDocPreviewLoading(true)
    setDocPreviewError(false)

    apiFetch(`/shared-files/${fileId}/preview`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setDocPreviewUrl(objectUrl)
      })
      .catch(() => setDocPreviewError(true))
      .finally(() => setDocPreviewLoading(false))

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [docPreviewModal])

  // BACKEND:
  // Filter using API query parameters if server-side filtering is implemented.
  const filtered = complaints.filter((c) => {
    const matchesSearch = (c.id || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.product || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.complainant || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.manufacturer || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus = selectedStatus === 'All' ||
      c.status === selectedStatus ||
      (selectedStatus === 'rejected' && c.status === 'recalled');
    const matchesCategory = selectedCategory === 'All' || c.category === selectedCategory;

    return matchesSearch && matchesStatus && matchesCategory;
  })

  const [detailLoading, setDetailLoading] = useState(false)

  const handleViewButton = (complaint) => {
    setSelectedComplaint(complaint)
    setViewModal(true)

    setDetailLoading(true)
    apiFetch(`/complaints/${complaint.complaintId}/walkin-detail`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        // ⚠️ REMOVE THIS: Attach mock verification if backend data.verification is missing and mock is active
        const mockVerif = USE_WALKIN_PROCESS_MOCK ? getMockWalkinVerification(complaint.status, complaint) : null;

        setSelectedComplaint((prev) => (prev && prev.id === complaint.id ? {
          ...prev,
          statement: data.nature_of_complaint,
          attached_files: data.attached_files,
          status: data.status,
          email: data.email,
          contact_number: data.contact_number,
          address: data.address,
          id_type: data.id_type,
          place_of_purchase: data.place_of_purchase,
          date_of_purchase: data.date_of_purchase,
          amount_paid: data.amount_paid,
          verification: data.verification || mockVerif, // 🔌 BACKEND: GET /complaints/{id}/walkin-detail should return a `verification` object (or null)
        } : prev))
      })
      .catch((err) => console.error('Failed to load complaint detail:', err))
      .finally(() => setDetailLoading(false))
  }
  const handleCloseViewbutton = () => {
    setViewModal(false)
    setSelectedComplaint(null)
  }

  // Three-dot dropdown: toggle open/close per row, capturing position for portal
  const handleToggleMenu = (id, e) => {
    if (openMenuId === id) {
      setOpenMenuId(null)
    } else {
      if (e && e.currentTarget) {
        const rect = e.currentTarget.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const openUpward = spaceBelow < 120
        setMenuPos({
          top: openUpward ? Math.max(8, rect.top - 90) : rect.bottom + 4,
          left: Math.max(8, rect.right - 190),
        })
      }
      setOpenMenuId(id)
    }
  }

  // Single-row delete via dropdown
  const handleDropdownDeleteClick = (complaint) => {
    setOpenMenuId(null)
    setSingleDeleteTarget(complaint)
    setShowSingleDeleteModal(true)
  }

  const handleConfirmSingleDelete = () => {
    apiFetch(`/complaints/walkin/${singleDeleteTarget.complaintId}`, {
      method: 'DELETE',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setComplaints((prev) => prev.filter((c) => c.id !== singleDeleteTarget.id))
      })
      .catch((err) => console.error('Failed to delete complaint:', err))
      .finally(() => {
        setSingleDeleteTarget(null)
        setShowSingleDeleteModal(false)
      })
  }

  const handleCancelSingleDelete = () => {
    setSingleDeleteTarget(null)
    setShowSingleDeleteModal(false)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (openMenuId === null) return
    const handleOutsideClick = (e) => {
      if (
        !e.target.closest('.WcMenuWrapper') &&
        !e.target.closest('.WcDropdownMenu')
      ) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [openMenuId])

  const navigate = useNavigate();

  const OpenNewIntakePageButton = () => {
    navigate('/leacidgfolder/lea-new-intake');
  };

  const handleEditComplaint = (complaint) => {
    navigate('/leacidgfolder/lea-new-intake', {
      state: { complaintId: complaint.complaintId }
    });
  };

  const handleExportCSV = () => {
    const headers = ['Case ID', 'Product', 'Manufacturer', 'Complainant', 'Status', 'Category', 'Logged']
    const rows = filtered.map((c) => [
        c.id,
        c.product,
        c.manufacturer,
        c.complainant,
        WcGetStatusLabel(c.status),
        c.category,
        c.logged,
    ])
    const escapeCell = (val, isDate = false) => {
        const escaped = String(val ?? '').replace(/"/g, '""')
        // CHANGED — dates get the =""..."" treatment so Excel can't
        // auto-convert/reformat them and truncate the column (##### bug)
        return isDate ? `"=""${escaped}"""` : `"${escaped}"`
    }
    const csvContent = [
        headers.map((h) => escapeCell(h)).join(','),
        ...rows.map((row) => row.map((val, i) => escapeCell(val, i === 6)).join(','))
    ].join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `walkin-complaints-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className='LeaDashboardMain LeaWalkinComplaintsMain'>
      <Sidebar sidebarType="LEA" />
      <div className='LeaContentContainer'>
        <TopBar topbarType="LEA" />
        <div className='LeaMainfeed LeaWalkinComplaintsFeed'>
          <div className='LeaHeader'>
            <div>
              <p>LEA-CIDG: Walk-in Complaints</p>
              <p>CITIZEN-REPORTED COMPLAINTS</p>
            </div>
          </div>

          {/* Buttons now on their own row below the title, right-aligned */}
          <div className='WalkinButtonActionsRow'>
            <button className='BtnExportCSV' onClick={handleExportCSV}>Export CSV</button>
            <button className='BtnNewComplaint' onClick={OpenNewIntakePageButton}>New Complaint</button>
          </div>

          {/* Filter & Search Section */}
          <div className="DraftsFilterSection">
            <div className="DraftsFilterControls">
              <div className="DraftsFilterLeft">
                <input
                  type="text"
                  className="DraftsSearchInput"
                  placeholder="Search Case ID, Product or Complainant..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={150}
                />
              </div>
              <div className="DraftsFilterRight">
                <select
                  className="DraftsFilterDropdown"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="All">All Status</option>
                  <option value="queued">Ready to Send</option>
                  <option value="pending">Pending FDA Verification</option>
                  <option value="confirmed_registered">Confirmed Registered</option>
                  <option value="confirmed_unregistered">Confirmed Unregistered</option>
                  <option value="rejected">Verification Rejected</option>
                  {/* 🔌 BACKEND: the list/detail status never returns these values yet (derived from the verification request status). They will work once the backend returns the complaint status. */}
                  <option value="takedown_initiated">Takedown Initiated</option>
                  <option value="completed">Takedown Completed</option>
                </select>

                <select
                  className="DraftsFilterDropdown"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="All">All Categories</option>
                  <option value="Cosmetics">Cosmetics</option>
                  <option value="Food">Food</option>
                  <option value="Devices">Devices</option>
                  <option value="Drugs">Drugs</option>
                </select>

                {/* Change 1 — icon-only Clear Filters button (X icon, no text label) */}
                {(() => {
                  const hasWalkinFilters = Boolean(search || selectedStatus !== 'All' || selectedCategory !== 'All');
                  return (
                    <button
                      className="BtnClearFiltersIcon"
                      aria-label="Clear Filters"
                      title="Clear Filters"
                      disabled={!hasWalkinFilters}
                      style={{ display: hasWalkinFilters ? 'inline-flex' : 'none' }}
                      onClick={() => {
                        setSearch('');
                        setSelectedStatus('All');
                        setSelectedCategory('All');
                      }}
                    >
                      <X size={16} />
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className='TableCard'>
            <table className='ComplaintsTable WcComplaintsTable'>
              <thead>
                <tr>
                  <th>CASE ID</th>
                  <th>PRODUCT</th>
                  <th>MANUFACTURER</th>
                  <th>COMPLAINANT</th>
                  <th>STATUS</th>
                  <th>CATEGORY</th>
                  <th>LOGGED</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalPages = Math.ceil(filtered.length / WALKIN_PAGE_SIZE) || 1;
                  const safePage = Math.min(Math.max(1, currentPage), totalPages);
                  const startIndex = (safePage - 1) * WALKIN_PAGE_SIZE;
                  const endIndex = Math.min(startIndex + WALKIN_PAGE_SIZE, filtered.length);
                  const paginatedComplaints = filtered.slice(startIndex, endIndex);

                  return paginatedComplaints.map((complaint) => (
                    <tr key={complaint.id}>
                      <td className='ClassId'>{complaint.id}</td>
                      <td>
                        <p className='WcProductName'>{complaint.product}</p>
                      </td>
                      <td>
                        <p className='WcManufacturerName'>{complaint.manufacturer}</p>
                      </td>
                      <td>{complaint.complainant}</td>
                      <td>
                        <span className={`WcStatusBadge ${WcGetStatusClass(complaint.status)}`}>
                          {WcGetStatusLabel(complaint.status)}
                        </span>
                      </td>
                      <td className='WcCategoryCell'>{complaint.category}</td>
                      <td>{complaint.logged}</td>
                      <td>
                        <div className='WcActionCell' ref={openMenuId === complaint.id ? menuRef : null}>
                          <span className='WcActionTooltipWrap'>
                            <button
                              className='WcBtnIconView'
                              onClick={() => handleViewButton(complaint)}
                              aria-label='View complaint'
                            >
                              <Eye size={16} />
                            </button>
                            <span className='WcTooltip'>View</span>
                          </span>

                          {complaint.status === 'queued' && (
                            <div className='WcMenuWrapper'>
                              <button
                                className='WcBtnIconMore'
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleMenu(complaint.id, e)
                                }}
                                aria-label='More actions'
                              >
                                <MoreVertical size={16} />
                              </button>
                              {openMenuId === complaint.id &&
                                createPortal(
                                  <div
                                    className='WcDropdownMenu'
                                    style={{
                                      position: 'fixed',
                                      top: `${menuPos.top}px`,
                                      left: `${menuPos.left}px`,
                                      zIndex: 9999,
                                      width: `150px`,
                                    }}
                                  >
                                    <button
                                      className='WcDropdownItem WcDropdownItem--edit'
                                      onClick={() => {
                                        setOpenMenuId(null)
                                        handleEditComplaint(complaint)
                                      }}
                                    >
                                      <Pencil size={14} />
                                      Edit Complaint
                                    </button>
                                    <button
                                      className='WcDropdownItem WcDropdownItem--delete'
                                      onClick={() => handleDropdownDeleteClick(complaint)}
                                    >
                                      <Trash2 size={14} />
                                      Delete Complaint
                                    </button>
                                  </div>,
                                  document.body
                                )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>

            {(() => {
              const totalPages = Math.ceil(filtered.length / WALKIN_PAGE_SIZE) || 1;
              const safePage = Math.min(Math.max(1, currentPage), totalPages);
              const startIndex = (safePage - 1) * WALKIN_PAGE_SIZE;
              const endIndex = Math.min(startIndex + WALKIN_PAGE_SIZE, filtered.length);
              return (
                <div className='Pagination'>
                  <p>Showing {filtered.length === 0 ? 0 : startIndex + 1}–{endIndex} of {filtered.length}</p>
                  <div className='PaginationBtn'>
                    <button
                      className='BtnPage'
                      disabled={safePage === 1}
                      onClick={() => setCurrentPage(safePage - 1)}
                    >
                      Previous
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        className={`BtnPage ${safePage === p ? 'active' : ''}`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      className='BtnPage'
                      disabled={safePage === totalPages}
                      onClick={() => setCurrentPage(safePage + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              );
            })()}
            {viewModal && selectedComplaint && (
              <div className='ModalOverlay'>
                {/* CHANGED — Added WcDetailModalFdaSize modifier class to match FDA case details modal sizing */}
                <div className='ModalViewButton WcDetailModal WcDetailModalFdaSize' onClick={(e) => e.stopPropagation()}>
                  {/* ADDED — Fixed header matching FDA case details modal */}
                  <div className='WcDetailModalHeader'>
                    <div>
                      {/* ADDED — Muted eyebrow label above product title matching FDA case details modal */}
                      <small className='WcDetailEyebrow'>Complaint Details · {selectedComplaint.id}</small>
                      <h4>{selectedComplaint.product}</h4>
                    </div>
                  </div>

                  {/* ADDED — Scrollable body container matching FDA case details modal */}
                  <div className='WcDetailModalBody'>
                    <div className='ModalSummary'>
                      <div>
                        {/* CHANGED — Wrapped fetched values in WcFieldValueBox for bordered read-only box styling */}
                        <p><strong>Case ID:</strong> <br></br><span className='WcFieldValueBox'>{selectedComplaint.id}</span></p>
                        <p><strong>Manufacturer:</strong><br></br><span className='WcFieldValueBox'>{selectedComplaint.manufacturer || '—'}</span></p>
                        <p><strong>Category:</strong><br></br><span className='WcFieldValueBox'>{selectedComplaint.category || '—'}</span></p>
                        <p><strong>Place of Purchase:</strong><br></br><span className='WcFieldValueBox'>{detailLoading ? 'Loading…' : (selectedComplaint.place_of_purchase || '—')}</span></p>
                        <p><strong>Date of Purchase:</strong><br></br><span className='WcFieldValueBox'>{detailLoading ? 'Loading…' : formatPurchaseDate(selectedComplaint.date_of_purchase)}</span></p>
                        <p><strong>Amount Paid:</strong><br></br><span className='WcFieldValueBox'>{detailLoading ? 'Loading…' : formatAmountPaid(selectedComplaint.amount_paid)}</span></p>
                      </div>
                      <div>
                        {/* CHANGED — Wrapped fetched values in WcFieldValueBox for bordered read-only box styling */}
                        <p><strong>Complainant:</strong><br></br><span className='WcFieldValueBox'>{selectedComplaint.complainant || '—'}</span></p>
                        <p><strong>Contact Number:</strong><br></br><span className='WcFieldValueBox'>{detailLoading ? 'Loading…' : (selectedComplaint.contact_number || '—')}</span></p>
                        <p><strong>Email:</strong><br></br><span className='WcFieldValueBox'>{detailLoading ? 'Loading…' : (selectedComplaint.email || '—')}</span></p>
                        <p><strong>Address:</strong><br></br><span className='WcFieldValueBox'>{detailLoading ? 'Loading…' : (selectedComplaint.address || '—')}</span></p>
                        <p><strong>ID Presented:</strong><br></br><span className='WcFieldValueBox'>{detailLoading ? 'Loading…' : (selectedComplaint.id_type || '—')}</span></p>
                        <p><strong>Logged:</strong><br></br><span className='WcFieldValueBox'>{selectedComplaint.logged}</span></p>
                        <p><strong>Status:</strong> <br></br>
                          <span className='WcFieldValueBox'>
                            <span className={`WcStatusBadge ${WcGetStatusClass(selectedComplaint.status)}`}>
                              {WcGetStatusLabel(selectedComplaint.status)}
                            </span>
                          </span>
                        </p>
                      </div>
                    </div>
                    <h6 className='Statementcomp'>COMPLAINANT STATEMENT</h6>
                    <div className='StatementBox'>
                      <p>{detailLoading ? 'Loading…' : (selectedComplaint.statement || selectedComplaint.complainant_statement || selectedComplaint.description || 'Example statement....')}</p>
                    </div>

                    {/* Auto-Attached Evidence & Request Documents */}
                    <div className="LeaVerifSectionCard" style={{ marginTop: '16px', marginBottom: '16px' }}>
                      <div className="LeaVerifSectionHeader">
                        <Paperclip size={16} className="LeaVerifBlueIcon" />
                        <h3>Auto-Attached Evidence &amp; Request Documents</h3>
                      </div>
                      <div className="LeaVerifDocsGrid">
                        {(() => {
                          const attachedFiles = selectedComplaint?.attached_files || selectedComplaint?.attachedFiles || selectedComplaint?.evidence || selectedComplaint?.files || selectedComplaint?.attachments || [];
                          if (attachedFiles.length > 0) {
                            return attachedFiles.map((f, idx) => (
                              <div key={f.file_id || f.id || idx} className="LeaVerifDocCard">
                                <div className="LeaVerifDocIcon">
                                  {(f.mime_type?.startsWith('image/') || f.type?.startsWith('image/')) ? (
                                    <ImageIcon size={18} />
                                  ) : (
                                    <FileText size={18} />
                                  )}
                                </div>
                                <div className="LeaVerifDocInfo">
                                  <p className="LeaVerifDocName">{f.file_name || f.name}</p>
                                  <span className="LeaVerifDocMeta">{f.file_size_display || f.size}</span>
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
                            ));
                          }
                          return (
                            <p className="LeaVerifNoDocsText">No evidence documents attached to this complaint.</p>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Verification & Enforcement Progress Section */}
                    {(selectedComplaint.status === 'queued' || selectedComplaint?.verification) && (
                      <div className="WcVerifSectionCard">
                        <div className="WcVerifSectionHeader">
                          <ShieldCheck size={16} className="WcVerifBlueIcon" />
                          <h3>Verification &amp; Enforcement Progress</h3>
                        </div>

                        {/* A) Status 'queued' (works without backend): muted info box */}
                        {selectedComplaint.status === 'queued' && (
                          <div className="WcVerifInfoBox">
                            <Info size={16} className="WcVerifInfoIcon" />
                            <p>Complaint logged and ready to send. Open Verification Requests &gt; Ready to Send to compose the request to FDA.</p>
                          </div>
                        )}

                        {/* Renders when verification object exists and is not 'recalled' */}
                        {selectedComplaint?.verification && (
                          <>
                            {/* B) Verification Request Subsection (when request_status is not 'recalled') */}
                            {selectedComplaint.verification.request_status !== 'recalled' && (
                              <div className="WcVerifSubSection">
                                <div className="WcVerifSubHeader">
                                  <FileText size={15} className="WcVerifBlueIcon" />
                                  <h4>Verification Request Details</h4>
                                </div>
                                <div className="WcVerifRequestGrid">
                                  {selectedComplaint.verification.product_code && (
                                    <div className="WcVerifGridItem">
                                      <label className="WcVerifFieldLabel">Product Code</label>
                                      <p className="WcVerifFieldValue">{selectedComplaint.verification.product_code}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.priority && (
                                    <div className="WcVerifGridItem">
                                      <label className="WcVerifFieldLabel">Priority</label>
                                      <p className="WcVerifFieldValue">
                                        {selectedComplaint.verification.priority.charAt(0).toUpperCase() + selectedComplaint.verification.priority.slice(1)}
                                      </p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.requested_by_name && (
                                    <div className="WcVerifGridItem">
                                      <label className="WcVerifFieldLabel">Requested By</label>
                                      <p className="WcVerifFieldValue">{selectedComplaint.verification.requested_by_name}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.requested_at && (
                                    <div className="WcVerifGridItem">
                                      <label className="WcVerifFieldLabel">Date Requested</label>
                                      <p className="WcVerifFieldValue">{formatDateTime(selectedComplaint.verification.requested_at)}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.notes_to_fda && (
                                    <div className="WcVerifGridItem WcVerifFullWidth">
                                      <label className="WcVerifFieldLabel">Notes to FDA Verifier</label>
                                      <div className="WcVerifNotesBox">
                                        <p className="WcVerifNotesText">{selectedComplaint.verification.notes_to_fda}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* C) Awaiting FDA (verification_result null): banner with send date and optional reminder */}
                            {!selectedComplaint.verification.verification_result && (
                              <div className="WcVerifAwaitingBanner">
                                <div className="WcVerifAwaitingHeader">
                                  <div className="WcVerifWaitingIconBox"><Clock3 size={16} /></div>
                                  <h4>Awaiting FDA Response</h4>
                                </div>
                                <p className="WcVerifAwaitingText">
                                  Request sent {formatDateTime(selectedComplaint.verification.requested_at)}. FDA verifier will respond with a digital confirmation of registration status.
                                </p>
                                {selectedComplaint.verification.reminder_sent_at && (
                                  <p className="WcVerifReminderNotice">
                                    <BellRing size={13} />
                                    Reminder sent {formatDateTime(selectedComplaint.verification.reminder_sent_at)}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* D) Registered: CONFIRMED REGISTERED PRODUCT banner */}
                            {selectedComplaint.verification.verification_result === 'registered' && (
                              <div className="ResponseBox ResponseRegistered" style={{ marginBottom: '16px' }}>
                                <div className="LeaVerifResponseStatusHeader LeaVerifRegisteredHeader">
                                  <CheckCircle style={{ color: '#10B981', backgroundColor: '#D1FAE5' }} />
                                  <div className="StatementReturn">
                                    <h3>CONFIRMED REGISTERED PRODUCT</h3>
                                  </div>
                                </div>

                                <div className="LeaVerifResultFieldsGrid">
                                  {selectedComplaint.verification.verified_by_name && (
                                    <div className="LeaVerifResultField">
                                      <label className="LeaVerifFieldLabel">Verified By</label>
                                      <p className="LeaVerifFieldValue">{selectedComplaint.verification.verified_by_name}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.responded_at && (
                                    <div className="LeaVerifResultField">
                                      <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                                      <p className="LeaVerifFieldValue">{formatDateTime(selectedComplaint.verification.responded_at)}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.cpr_number && (
                                    <div className="LeaVerifResultField">
                                      <label className="LeaVerifFieldLabel">FDA CPR Registration Number</label>
                                      <p className="LeaVerifFieldValue">{selectedComplaint.verification.cpr_number}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.cpr_expiry && (
                                    <div className="LeaVerifResultField">
                                      <label className="LeaVerifFieldLabel">CPR Validity / Expiry Date</label>
                                      <p className="LeaVerifFieldValue">{selectedComplaint.verification.cpr_expiry}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.response_notes && (
                                    <div className="LeaVerifResultField LeaVerifFullWidthField">
                                      <label className="LeaVerifFieldLabel">Official FDA Verification Remarks</label>
                                      <p className="LeaVerifFieldValue" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        {selectedComplaint.verification.response_notes}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* E) Unregistered: CONFIRMED UNREGISTERED PRODUCT banner */}
                            {selectedComplaint.verification.verification_result === 'unregistered' && (
                              <div className="ResponseBox ResponseUnregistered" style={{ marginBottom: '16px' }}>
                                <div className="LeaVerifResponseStatusHeader LeaVerifUnregisteredHeader">
                                  <AlertTriangle style={{ color: '#EF4444', backgroundColor: '#FEE2E2' }} />
                                  <div className="StatementReturn">
                                    <h3>CONFIRMED UNREGISTERED PRODUCT</h3>
                                  </div>
                                </div>

                                <div className="LeaVerifResultFieldsGrid">
                                  {selectedComplaint.verification.verified_by_name && (
                                    <div className="LeaVerifResultField">
                                      <label className="LeaVerifFieldLabel">Verified By</label>
                                      <p className="LeaVerifFieldValue">{selectedComplaint.verification.verified_by_name}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.responded_at && (
                                    <div className="LeaVerifResultField">
                                      <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                                      <p className="LeaVerifFieldValue">{formatDateTime(selectedComplaint.verification.responded_at)}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.unregistered_reason && (
                                    <div className="LeaVerifResultField LeaVerifFullWidthField">
                                      <label className="LeaVerifFieldLabel">Reason Product is Not Registered</label>
                                      <p className="LeaVerifFieldValue" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        {selectedComplaint.verification.unregistered_reason}
                                      </p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.response_notes && (
                                    <div className="LeaVerifResultField LeaVerifFullWidthField">
                                      <label className="LeaVerifFieldLabel">Advisory &amp; Enforcement Recommendations for LEA</label>
                                      <p className="LeaVerifFieldValue" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        {selectedComplaint.verification.response_notes}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* F) Rejected: VERIFICATION REQUEST REJECTED banner */}
                            {selectedComplaint.verification.verification_result === 'rejected' && (
                              <div className="ResponseBox ResponseRejected" style={{ marginBottom: '16px' }}>
                                <div className="LeaVerifResponseStatusHeader LeaVerifRejectedHeader">
                                  <XCircle style={{ color: '#EF4444', backgroundColor: '#FEE2E2' }} />
                                  <div className="StatementReturn">
                                    <h3>VERIFICATION REQUEST REJECTED</h3>
                                  </div>
                                </div>

                                <div className="LeaVerifRejectionFieldsGrid">
                                  {(selectedComplaint.verification.verified_by_name || selectedComplaint.verification.verifier_name) && (
                                    <div className="LeaVerifResultField">
                                      <label className="LeaVerifFieldLabel">Rejected By</label>
                                      <p className="LeaVerifFieldValue">{selectedComplaint.verification.verified_by_name || selectedComplaint.verification.verifier_name}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.responded_at && (
                                    <div className="LeaVerifResultField">
                                      <label className="LeaVerifFieldLabel">Date Returned / Responded</label>
                                      <p className="LeaVerifFieldValue">{formatDateTime(selectedComplaint.verification.responded_at)}</p>
                                    </div>
                                  )}
                                  {selectedComplaint.verification.rejection_reason && (
                                    <div className="LeaVerifResultField LeaVerifFullWidthField">
                                      <label className="LeaVerifFieldLabel">Reason for Rejection</label>
                                      <p className="LeaVerifFieldValue" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        {selectedComplaint.verification.rejection_reason}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* G) LEA Follow-up Stepper under D, E and F */}
                            {selectedComplaint.verification.verification_result && (() => {
                              const vResult = selectedComplaint.verification.verification_result;
                              const isRegOrRej = vResult === 'registered' || vResult === 'rejected';

                              if (isRegOrRej) {
                                const isAck = Boolean(selectedComplaint.verification.acknowledged_at);
                                const steps = [
                                  {
                                    key: 'awaiting_lea',
                                    title: 'Awaiting LEA Action',
                                    isCompleted: isAck,
                                    isCurrent: !isAck,
                                    date: selectedComplaint.verification.responded_at,
                                    dateLabel: 'Date FDA Responded:',
                                  },
                                  {
                                    key: 'acknowledged',
                                    title: 'Acknowledged - Case Closed',
                                    isCompleted: isAck,
                                    isCurrent: false,
                                    isFuture: !isAck,
                                    date: selectedComplaint.verification.acknowledged_at,
                                    dateLabel: 'Acknowledged At:',
                                    actor: selectedComplaint.verification.acknowledged_by_name,
                                    actorLabel: 'Acknowledged By:',
                                  },
                                ];

                                return (
                                  <div className="WcVerifStepperWrap">
                                    <span className="WcVerifStepperHeaderLabel">LEA FOLLOW-UP PROGRESSION</span>
                                    <div className="WcVerifStepper">
                                      {steps.map((st, idx) => {
                                        let stepClass = 'WcVerifStep';
                                        if (st.isCompleted) stepClass += ' is-completed';
                                        if (st.isCurrent) stepClass += ' is-current';
                                        if (st.isFuture) stepClass += ' is-future';

                                        return (
                                          <div key={st.key} className={stepClass}>
                                            <div className="WcVerifStepIcon">
                                              {st.isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                                            </div>
                                            <div className="WcVerifStepContent">
                                              <div className="WcVerifStepHeader">
                                                <span className="WcVerifStepTitle">
                                                  {st.title}
                                                  {st.isCurrent && <span className="WcVerifStepCurrentTag">Current Stage</span>}
                                                </span>
                                              </div>
                                              {(st.date || st.actor) && (
                                                <div className="WcVerifStepMeta">
                                                  {st.date && (
                                                    <span>
                                                      <Calendar size={12} />
                                                      <strong>{st.dateLabel}</strong> {formatDateTime(st.date)}
                                                    </span>
                                                  )}
                                                  {st.actor && (
                                                    <span>
                                                      <User size={12} />
                                                      <strong>{st.actorLabel}</strong> {st.actor}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              }

                              // Unregistered: 3 steps driven by complaint_status
                              const cStatus = selectedComplaint.verification.complaint_status || 'takedown_requested';
                              const isTakedownInitiated = cStatus === 'takedown_initiated';
                              const isCompleted = cStatus === 'completed';

                              const unregSteps = [
                                {
                                  key: 'awaiting_lea',
                                  title: 'Awaiting LEA Action',
                                  isCompleted: isTakedownInitiated || isCompleted,
                                  isCurrent: !isTakedownInitiated && !isCompleted,
                                  isFuture: false,
                                  date: selectedComplaint.verification.responded_at,
                                  dateLabel: 'Date FDA Responded:',
                                },
                                {
                                  key: 'takedown_initiated',
                                  title: 'Takedown Initiated',
                                  isCompleted: isCompleted,
                                  isCurrent: isTakedownInitiated,
                                  isFuture: !isTakedownInitiated && !isCompleted,
                                  date: selectedComplaint.verification.takedown_initiated_at,
                                  dateLabel: 'Initiated At:',
                                  actor: selectedComplaint.verification.takedown_initiated_by_name,
                                  actorLabel: 'Initiated By:',
                                  notes: selectedComplaint.verification.field_operation_notes,
                                },
                                {
                                  key: 'closed',
                                  title: 'Case Closed',
                                  isCompleted: isCompleted,
                                  isCurrent: false,
                                  isFuture: !isCompleted,
                                  date: selectedComplaint.verification.closed_at,
                                  dateLabel: 'Closed At:',
                                  actor: selectedComplaint.verification.closed_by_name,
                                  actorLabel: 'Closed By:',
                                  reasonClosed: selectedComplaint.verification.reason_detail || selectedComplaint.verification.reason_closed,
                                },
                              ];

                              return (
                                <div className="WcVerifStepperWrap">
                                  <span className="WcVerifStepperHeaderLabel">LEA FOLLOW-UP PROGRESSION</span>
                                  <div className="WcVerifStepper">
                                    {unregSteps.map((st, idx) => {
                                      let stepClass = 'WcVerifStep';
                                      if (st.isCompleted) stepClass += ' is-completed';
                                      if (st.isCurrent) stepClass += ' is-current';
                                      if (st.isFuture) stepClass += ' is-future';

                                      return (
                                        <div key={st.key} className={stepClass}>
                                          <div className="WcVerifStepIcon">
                                            {st.isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                                          </div>
                                          <div className="WcVerifStepContent">
                                            <div className="WcVerifStepHeader">
                                              <span className="WcVerifStepTitle">
                                                {st.title}
                                                {st.isCurrent && <span className="WcVerifStepCurrentTag">Current Stage</span>}
                                              </span>
                                            </div>
                                            {(st.date || st.actor) && (
                                              <div className="WcVerifStepMeta">
                                                {st.date && (
                                                  <span>
                                                    <Calendar size={12} />
                                                    <strong>{st.dateLabel}</strong> {formatDateTime(st.date)}
                                                  </span>
                                                )}
                                                {st.actor && (
                                                  <span>
                                                    <User size={12} />
                                                    <strong>{st.actorLabel}</strong> {st.actor}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                            {st.notes && (
                                              <div className="WcVerifStepNotes">
                                                <strong>Field operation status update</strong>
                                                <p className="WcVerifNotesText">{st.notes}</p>
                                              </div>
                                            )}
                                            {st.reasonClosed && (
                                              <div className="WcVerifStepNotes WcVerifStepNotesReason">
                                                <strong>Reason Closed</strong>
                                                <p className="WcVerifNotesText">{st.reasonClosed}</p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* CHANGED — Fixed footer matching FDA case details modal */}
                  <div className='ModalActions WcDetailModalFooter'>
                    <button className='BtnCancelModal' onClick={handleCloseViewbutton}>Close</button>
                  </div>
                </div>
              </div>
            )}

            {/* Attachment Preview Modal */}
            {docPreviewModal && (
              <div className="ModalOverlay" style={{ zIndex: 1000 }}>
                <div className="LeaVerifDocModalContainer">
                  <div className="LeaVerifDocModalHeader">
                    <div className="LeaVerifDocModalTitleGroup">
                      <Paperclip size={16} className="LeaVerifBlueIcon" />
                      <div>
                        <h3>{docPreviewModal.file_name || docPreviewModal.name}</h3>
                        <p className="LeaVerifDocModalMeta">
                          {docPreviewModal.mime_type || docPreviewModal.type || 'Document'} &bull; {docPreviewModal.file_size_display || docPreviewModal.size || ''}
                        </p>
                      </div>
                    </div>
                    <button className="LeaVerifIconButton" onClick={() => setDocPreviewModal(null)}>
                      <X size={18} />
                    </button>
                  </div>

                  <div className="LeaVerifDocModalBody">
                    {(docPreviewModal.mime_type?.startsWith('image/') || docPreviewModal.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(docPreviewModal.file_name || docPreviewModal.name)) ? (
                      <img
                        src={docPreviewUrl}
                        alt={docPreviewModal.file_name || docPreviewModal.name}
                        className="LeaVerifDocImagePreview"
                      />
                    ) : (docPreviewModal.mime_type === 'application/pdf' || docPreviewModal.type === 'application/pdf' || /\.pdf$/i.test(docPreviewModal.file_name || docPreviewModal.name)) ? (
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
                          title={docPreviewModal.file_name || docPreviewModal.name}
                          className="LeaVerifDocPdfPreview"
                        />
                      )
                    ) : (docPreviewModal.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(docPreviewModal.file_name || docPreviewModal.name)) ? (
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
                          <strong>{docPreviewModal.file_name || docPreviewModal.name}</strong> can't be previewed inline &mdash; use download instead.
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
                      onClick={() => {
                        const fileId = docPreviewModal.file_id || docPreviewModal.id;
                        if (!fileId && docPreviewModal.url) {
                          const a = document.createElement('a');
                          a.href = docPreviewModal.url;
                          a.download = docPreviewModal.file_name || docPreviewModal.name || 'download';
                          a.click();
                          return;
                        }
                        if (!fileId) return;
                        apiFetch(`/shared-files/${fileId}/download`)
                          .then((res) => {
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            return res.blob();
                          })
                          .then((blob) => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = docPreviewModal.file_name || docPreviewModal.name;
                            a.click();
                            URL.revokeObjectURL(url);
                          })
                          .catch((err) => {
                            console.error('Download failed:', err);
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

            {/* Single-row delete confirmation (from dropdown) */}
            {showSingleDeleteModal && singleDeleteTarget && (
              <div className='ModalOverlay'>
                <div className='ModalBox'>
                  <h3>Confirm Delete</h3>
                  <p>Are you sure you want to delete complaint <strong>{singleDeleteTarget.id}</strong>? This action cannot be undone.</p>
                  <div className='ModalActions'>
                    <button className='BtnCancelModal' onClick={handleCancelSingleDelete}>Cancel</button>
                    <button className='BtnConfirmDelete' onClick={handleConfirmSingleDelete}>Yes, Delete</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LeaWalkinComplaints