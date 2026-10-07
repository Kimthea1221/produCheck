// new lea-walkin-complaints.jsx 
import './lea-css.css'
import Sidebar from '../component/sidebar'
import TopBar from '../component/top-bar'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import mammoth from 'mammoth'
import { Eye, MoreVertical, Pencil, Trash2, X, Paperclip, FileText, Image as ImageIcon, Download } from 'lucide-react'

import { apiFetch } from '../../utils/apiFetch';

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
        // CHANGED — dates get the ="..." treatment so Excel can't
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