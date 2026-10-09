// merged lea-save-drafts.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './lea-css.css';
import Sidebar from '../component/sidebar';
import TopBar from '../component/top-bar';
import {
  PenLine,
  Trash2,
  Info,
  Eye,
  MoreVertical,
  X,
  Inbox,
  FileText,
  Paperclip,
  Image as ImageIcon,
  Download,
  AlertCircle
} from 'lucide-react';
import { apiFetch } from '../../utils/apiFetch';
import mammoth from 'mammoth';

// CHANGED — checks real backend values now ("draft"/"incomplete",
// lowercase), not the old mock-data capitalized strings
function GetDraftStatusClass(status) {
  if (status === 'draft') return 'status-draft';
  if (status === 'incomplete') return 'status-incomplete';
  return '';
}

// ADDED — backend sends draft_type as "walkin"/"verification"; this
// converts that into the readable label your UI already displays
function GetDraftTypeLabel(draftType) {
  if (draftType === 'walkin') return 'Walk-in Intake';
  if (draftType === 'verification') return 'Verification Request';
  return draftType;
}

// Helper: format purchase date YYYY-MM-DD to readable date
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

// Helper: format amount paid as Philippine peso with 2 decimals
function formatAmountPaid(amount) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = Number(amount);
  if (isNaN(num)) return String(amount);
  return `₱${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Helper: format ISO datetime to readable local date/time
function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(isoString);
  }
}

// Helper: format byte count to readable string
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper: format ID type enum to readable string
function formatIdType(idType) {
  if (!idType) return '—';
  switch (String(idType).toLowerCase()) {
    case 'philsys':
      return 'PhilSys';
    case 'passport':
      return 'Passport';
    case 'drivers_license':
      return "Driver's License";
    case 'other':
      return 'Other';
    default:
      return idType;
  }
}

// Helper: converts raw source values into readable labels
function GetSourceLabel(source) {
  if (!source) return '—';
  if (source === 'walk_in') return 'Walk-in Filing';
  if (source === 'extension') return 'Browser Extension';
  return source;
}

// Helper: priority level display label
function formatPriority(priority) {
  if (!priority) return '—';
  switch (String(priority).toLowerCase()) {
    case 'standard':
      return 'Standard';
    case 'high':
      return 'High (48h)';
    case 'urgent':
      return 'Urgent (24h)';
    case 'critical':
      return 'Critical (1h)';
    default:
      return priority.charAt(0).toUpperCase() + priority.slice(1);
  }
}

// ============================================================================
// CHILD COMPONENT: LEA DRAFT VIEW MODAL (FDA Layout Parity with LEA Styling)
// ============================================================================
function LeaDraftViewModal({ draft, onClose, onContinueEditing }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Attachment preview modal state (for verification drafts)
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [docxHtml, setDocxHtml] = useState('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState(false);

  // Detail fetch on mount / draft change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const endpoint = draft.draft_type === 'walkin'
      ? `/drafts/walkin/${draft.draft_id}`
      : `/drafts/verification/${draft.draft_id}`;

    apiFetch(endpoint)
      .then(async (res) => {
        if (!res.ok) {
          let errDetail = 'Failed to load draft details.';
          try {
            const data = await res.json();
            if (data?.detail) {
              errDetail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
            }
          } catch {
            // ignore
          }
          throw new Error(errDetail);
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Could not load draft details.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft.draft_id, draft.draft_type]);

  // Attachment preview effect (verification drafts only, shared-files endpoint)
  useEffect(() => {
    if (!previewFile) {
      setPreviewUrl(null);
      setPreviewError(false);
      setDocxHtml('');
      setDocxLoading(false);
      setDocxError(false);
      return;
    }

    const mime = previewFile.mime_type || '';
    const name = previewFile.file_name || '';
    const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);
    const isDocx = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(name);

    if (!isImage && !isPdf && !isDocx) return;

    setDocxHtml('');
    setDocxLoading(false);
    setDocxError(false);

    if (isDocx) {
      let cancelled = false;
      setDocxLoading(true);
      setDocxError(false);
      apiFetch(`/shared-files/${previewFile.file_id}/preview`)
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
        cancelled = true;
      };
    }

    let objectUrl = null;
    setPreviewLoading(true);
    setPreviewError(false);

    apiFetch(`/shared-files/${previewFile.file_id}/preview`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => setPreviewError(true))
      .finally(() => setPreviewLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewFile]);

  const productName = draft.product_name || detail?.product_name || detail?.complaint?.product_title || '—';
  const draftTypeLabel = GetDraftTypeLabel(draft.draft_type);
  const formattedDate = formatDateTime(draft.updated_at);
  const savedByName = draft.saved_by_name || 'You';

  return (
    <div className="LeaDraftModalOverlay">
      <div className="LeaDraftModalContainer" onClick={(e) => e.stopPropagation()}>
        {/* Fixed Header: Icon, Title, Subtitle with Product Name · Type · Saved By · Date, and Status Badge */}
        <div className="LeaDraftModalHeader">
          <div className="LeaDraftModalTitleGroup">
            <FileText size={22} className="LeaDraftHeaderIcon" />
            <div>
              <h3>Draft Summary</h3>
              <p className="LeaDraftModalSubtitle">
                {productName} &bull; {draftTypeLabel} &bull; Saved by {savedByName} &bull; Last modified {formattedDate}
              </p>
            </div>
          </div>
          <span className={`StatusBadge ${GetDraftStatusClass(draft.draft_status)}`}>
            {draft.draft_status === 'draft' ? 'Draft' : 'Incomplete'}
          </span>
        </div>

        {/* Scrollable Body */}
        <div className="LeaDraftModalBody">
          {loading && (
            <p className="LeaDraftLoadingLine">Loading draft details&hellip;</p>
          )}

          {error && (
            <div className="LeaDraftAlertLine">
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && draft.draft_type === 'walkin' && (
            <>
              {/* SECTION 1: COMPLAINANT DETAILS */}
              <div>
                <div className="LeaDraftSectionHeader">
                  <FileText size={16} className="LeaDraftHeaderIcon" />
                  <h3>Complainant Details</h3>
                </div>
                <div className="LeaDraftGrid2">
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Complainant Name:</span>
                    <span className="LeaDraftInfoValue">
                      {detail?.full_name || draft.complainant_name || '—'}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Contact Number:</span>
                    <span className="LeaDraftInfoValue">{detail?.contact_number || '—'}</span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Email Address:</span>
                    <span className="LeaDraftInfoValue">{detail?.email || '—'}</span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">ID Presented:</span>
                    <span className="LeaDraftInfoValue">{formatIdType(detail?.id_type)}</span>
                  </div>
                  <div className="LeaDraftInfoGroup LeaDraftGridFull">
                    <span className="LeaDraftInfoLabel">Address:</span>
                    <span className="LeaDraftInfoValue">{detail?.address || '—'}</span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Saved By:</span>
                    <span className="LeaDraftInfoValue">{savedByName}</span>
                  </div>
                </div>
              </div>

              <hr className="LeaDraftSectionDivider" />

              {/* SECTION 2: REPORTED PRODUCT & PURCHASE DETAILS */}
              <div>
                <div className="LeaDraftSectionHeader">
                  <FileText size={16} className="LeaDraftHeaderIcon" />
                  <h3>Reported Product &amp; Purchase Details</h3>
                </div>
                <div className="LeaDraftGrid2">
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Product Name:</span>
                    <span className="LeaDraftInfoValue">
                      {detail?.product_name || draft.product_name || '—'}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Manufacturer / Seller:</span>
                    <span className="LeaDraftInfoValue">
                      {detail?.manufacturer || draft.manufacturer || '—'}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Product Category:</span>
                    <span className="LeaDraftInfoValue">
                      {detail?.product_category || draft.product_category || '—'}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Place of Purchase:</span>
                    <span className="LeaDraftInfoValue">{detail?.place_of_purchase || '—'}</span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Date of Purchase:</span>
                    <span className="LeaDraftInfoValue">{formatPurchaseDate(detail?.date_of_purchase)}</span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Amount Paid:</span>
                    <span className="LeaDraftInfoValue">{formatAmountPaid(detail?.amount_paid)}</span>
                  </div>
                </div>
              </div>

              <hr className="LeaDraftSectionDivider" />

              {/* SECTION 3: COMPLAINANT STATEMENT */}
              <div>
                <div className="LeaDraftSectionHeader">
                  <FileText size={16} className="LeaDraftHeaderIcon" />
                  <h3>Complainant Statement</h3>
                </div>
                <div className="LeaDraftNotesBox">
                  <p>{detail?.nature_of_complaint?.trim() || 'No statement entered yet.'}</p>
                </div>
              </div>

              <hr className="LeaDraftSectionDivider" />

              {/* SECTION 4: ATTACHED EVIDENCE & DOCUMENTS */}
              <div>
                <div className="LeaDraftSectionHeader">
                  <Paperclip size={16} className="LeaDraftHeaderIcon" />
                  <h3>Attached Evidence &amp; Documents</h3>
                </div>
                <div className="LeaVerifDocsGrid">
                  {detail?.attachments && detail.attachments.length > 0 ? (
                    detail.attachments.map((att, idx) => {
                      const mime = att.mime_type || '';
                      const name = att.file_name || '';
                      const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
                      return (
                        <div key={att.attachment_id || idx} className="LeaVerifDocCard">
                          <div className="LeaVerifDocIcon">
                            {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                          </div>
                          <div className="LeaVerifDocInfo">
                            <p className="LeaVerifDocName" title={att.file_name}>
                              {att.file_name}
                            </p>
                            <span className="LeaVerifDocMeta">
                              {att.file_size_display || (att.file_size_bytes ? formatFileSize(att.file_size_bytes) : '')}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="LeaDraftNoDocsText">No files attached.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {!loading && !error && draft.draft_type === 'verification' && (
            <>
              {/* SECTION 1: CASE INFORMATION */}
              <div>
                <div className="LeaDraftSectionHeader">
                  <FileText size={16} className="LeaDraftHeaderIcon" />
                  <h3>Case Information</h3>
                </div>
                <div className="LeaDraftGrid2">
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Case ID:</span>
                    <span className="LeaDraftInfoValueHighlight">
                      {detail?.complaint?.case_reference || '—'}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Product Name:</span>
                    <span className="LeaDraftInfoValue">
                      {detail?.complaint?.product_title || draft.product_name || '—'}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Manufacturer:</span>
                    <span className="LeaDraftInfoValue">
                      {detail?.complaint?.manufacturer || draft.manufacturer || '—'}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Product Category:</span>
                    <span className="LeaDraftInfoValue">
                      {detail?.complaint?.product_category || draft.product_category || '—'}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Complainant Name:</span>
                    <span className="LeaDraftInfoValue">
                      {detail?.complaint?.complainant_name || draft.complainant_name || '—'}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Date Logged:</span>
                    <span className="LeaDraftInfoValue">{formatDateTime(detail?.complaint?.created_at)}</span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Complaint Source:</span>
                    <span className="LeaDraftInfoValue">{GetSourceLabel(detail?.complaint?.source)}</span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Saved By:</span>
                    <span className="LeaDraftInfoValue">{savedByName}</span>
                  </div>
                </div>
              </div>

              <hr className="LeaDraftSectionDivider" />

              {/* SECTION 2: VERIFICATION REQUEST TO FDA */}
              <div>
                <div className="LeaDraftSectionHeader">
                  <FileText size={16} className="LeaDraftHeaderIcon" />
                  <h3>Verification Request to FDA</h3>
                </div>
                <div className="LeaDraftGrid2">
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Product Code:</span>
                    <span className="LeaDraftCodeBadge">{detail?.product_code || '—'}</span>
                  </div>
                  <div className="LeaDraftInfoGroup">
                    <span className="LeaDraftInfoLabel">Priority:</span>
                    <span className={`LeaDraftPriorityBadge LeaDraftPriority_${detail?.priority || 'standard'}`}>
                      {formatPriority(detail?.priority)}
                    </span>
                  </div>
                  <div className="LeaDraftInfoGroup LeaDraftGridFull">
                    <span className="LeaDraftInfoLabel">Notes to FDA Verifier:</span>
                    <div className="LeaDraftNotesBox">
                      <p>{detail?.notes_to_fda?.trim() || 'No notes entered.'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="LeaDraftSectionDivider" />

              {/* SECTION 3: AUTO-ATTACHED EVIDENCE & REQUEST DOCUMENTS */}
              <div>
                <div className="LeaDraftSectionHeader">
                  <Paperclip size={16} className="LeaDraftHeaderIcon" />
                  <h3>Auto-Attached Evidence &amp; Request Documents</h3>
                </div>
                <div className="LeaVerifDocsGrid">
                  {detail?.complaint?.attached_files && detail.complaint.attached_files.length > 0 ? (
                    detail.complaint.attached_files.map((file, idx) => {
                      const mime = file.mime_type || '';
                      const name = file.file_name || '';
                      const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
                      return (
                        <div key={file.file_id || idx} className="LeaVerifDocCard">
                          <div className="LeaVerifDocIcon">
                            {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                          </div>
                          <div className="LeaVerifDocInfo">
                            <p className="LeaVerifDocName" title={file.file_name}>
                              {file.file_name}
                            </p>
                            <span className="LeaVerifDocMeta">
                              {file.file_size_display || (file.file_size_bytes ? formatFileSize(file.file_size_bytes) : '')}
                            </span>
                          </div>
                          <div className="LeaVerifDocActions">
                            <button
                              type="button"
                              className="LeaVerifDocActionBtn"
                              title="Inspect Attachment"
                              onClick={() => setPreviewFile(file)}
                            >
                              <Eye size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="LeaDraftNoDocsText">No files attached.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Fixed Footer: Close and Continue Editing Buttons */}
        <div className="LeaDraftModalFooter">
          <button
            type="button"
            className="LeaDraftBtnClose"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="LeaDraftBtnContinue"
            onClick={() => {
              onClose();
              onContinueEditing(draft);
            }}
          >
            Continue Editing
          </button>
        </div>
      </div>

      {/* Attachment Preview Modal (opens above draft modal) */}
      {previewFile && (
        <div className="ModalOverlay LeaDraftPreviewOverlay" role="dialog" aria-modal="true">
          <div className="LeaVerifDocModalContainer">
            <div className="LeaVerifDocModalHeader">
              <div className="LeaVerifDocModalTitleGroup">
                <Paperclip size={18} className="LeaDraftHeaderIcon" />
                <div>
                  <h3>{previewFile.file_name}</h3>
                  <p className="LeaVerifDocModalMeta">
                    {previewFile.mime_type} &bull; {previewFile.file_size_display || (previewFile.file_size_bytes ? formatFileSize(previewFile.file_size_bytes) : '')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="LeaVerifIconButton"
                onClick={() => setPreviewFile(null)}
                aria-label="Close Preview"
              >
                <X size={18} />
              </button>
            </div>

            <div className="LeaVerifDocModalBody">
              {(() => {
                const _mime = previewFile.mime_type || '';
                const _name = previewFile.file_name || '';
                const isImage = _mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(_name);
                const isPdf = _mime === 'application/pdf' || /\.pdf$/i.test(_name);
                const isDocx = _mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(_name);

                if (isImage || isPdf) {
                  return previewLoading ? (
                    <div className="LeaVerifDocPlaceholderPreview">
                      <p className="LeaVerifPreviewText">Loading preview&hellip;</p>
                    </div>
                  ) : previewError ? (
                    <div className="LeaVerifDocPlaceholderPreview">
                      <FileText size={48} className="LeaVerifDocPreviewIcon" />
                      <p className="LeaVerifPreviewTitle">Preview unavailable</p>
                      <p className="LeaVerifPreviewText">Try downloading the file instead.</p>
                    </div>
                  ) : isImage ? (
                    <img
                      src={previewUrl}
                      alt={previewFile.file_name}
                      className="LeaVerifDocImagePreview"
                    />
                  ) : (
                    <iframe
                      src={previewUrl}
                      title={previewFile.file_name}
                      className="LeaVerifDocPdfPreview"
                    />
                  );
                }

                if (isDocx) {
                  return docxLoading ? (
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
                  );
                }

                return (
                  <div className="LeaVerifDocPlaceholderPreview">
                    <FileText size={48} className="LeaVerifDocPreviewIcon" />
                    <p className="LeaVerifPreviewTitle">Preview not supported</p>
                    <p className="LeaVerifPreviewText">
                      <strong>{previewFile.file_name}</strong> can't be previewed inline &mdash; use download instead.
                    </p>
                  </div>
                );
              })()}
            </div>

            <div className="LeaVerifModalFooter">
              <button
                type="button"
                className="LeaVerifBtnOutline"
                onClick={() => setPreviewFile(null)}
              >
                Close Preview
              </button>
              <button
                type="button"
                className="LeaVerifBtnPrimary"
                onClick={() => {
                  const fileId = previewFile.file_id;
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
                      a.download = previewFile.file_name;
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
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT: LeaSavedDraft
// ============================================================================
function LeaSavedDraft() {
  const navigate = useNavigate();

  // CHANGED — starts empty, filled by a real fetch below instead of mock data
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  // States for filter and search controls
  const [activeTab, setActiveTab] = useState('All'); // 'All', 'Walk-in Intake', 'Verification Request'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All', 'Draft', 'Incomplete'
  const [sortOption, setSortOption] = useState('Recently Edited'); // 'Recently Edited', 'Oldest First', 'Product Name'
  const [currentPage, setCurrentPage] = useState(1);
  const DRAFT_PAGE_SIZE = 25;
  useEffect(() => { setCurrentPage(1); }, [activeTab, searchQuery, statusFilter, sortOption]);

  // States for Modals and Toast notifications
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // ADDED — dropdown menu open/close state per row, and view-modal data
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [viewModalData, setViewModalData] = useState(null);

  // ADDED — fetches the real combined drafts list on page load
  useEffect(() => {
    setLoading(true);

    apiFetch('/drafts/')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load drafts.');
        return res.json();
      })
      .then((data) => setDrafts(data))
      .catch(() => showToast('Could not load drafts.'))
      .finally(() => setLoading(false));
  }, []);

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    setSearchQuery('');
    setStatusFilter('All');
    setSortOption('recently_edited');
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setSortOption('recently_edited');
    setCurrentPage(1);
  };

  const handleDeleteClick = (draft) => {
    setDraftToDelete(draft);
    setShowDeleteModal(true);
  };

  // CHANGED — actually calls the backend now, using the right
  // endpoint depending on draft_type
  const handleConfirmDelete = async () => {
    if (!draftToDelete) return;

    const endpoint = draftToDelete.draft_type === 'walkin'
      ? `/drafts/walkin/${draftToDelete.draft_id}`
      : `/drafts/verification/${draftToDelete.draft_id}`;

    try {
      const res = await apiFetch(endpoint, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete draft.');

      setDrafts(drafts.filter((d) => d.draft_id !== draftToDelete.draft_id));
      showToast('Draft deleted successfully');
    } catch (err) {
      showToast(err.message);
    } finally {
      setShowDeleteModal(false);
      setDraftToDelete(null);
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  };

  // CHANGED — passes the real draft_id through navigation, so the
  // destination page knows exactly which draft to load
  const handleEditDraft = (draft) => {
    showToast(`Loading draft for ${draft.product_name}...`);
    setTimeout(() => {
      if (draft.draft_type === 'walkin') {
        navigate('/leacidgfolder/lea-new-intake', { state: { draftId: draft.draft_id } });
      } else {
        navigate('/leacidgfolder/lea-verification-request', { state: { draftId: draft.draft_id } });
      }
    }, 1200);
  };

  // ADDED — dropdown open/close toggle per row with portal positioning
  const toggleDropdown = (draftId, e) => {
    if (openDropdownId === draftId) {
      setOpenDropdownId(null);
    } else {
      if (e && e.currentTarget) {
        const rect = e.currentTarget.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUpward = spaceBelow < 120;
        setDropdownPos({
          top: openUpward ? Math.max(8, rect.top - 84) : rect.bottom + 4,
          left: Math.max(8, rect.right - 190),
        });
      }
      setOpenDropdownId(draftId);
    }
  };

  useEffect(() => {
    if (!openDropdownId) return;
    const handleOutsideClick = (event) => {
      if (
        !event.target.closest('.LeaDropdownMenu') &&
        !event.target.closest('.LeaDropdownTrigger')
      ) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [openDropdownId]);

  // Filtering and sorting calculations
  const filteredDrafts = drafts.filter(draft => {
    // Tab / Type filter
    if (activeTab !== 'All' && draft.draft_type !== activeTab) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'All' && draft.draft_status !== statusFilter) {
      return false;
    }

    // Search query filter (EVERY field is checked except save_by)
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      const matchesProduct = draft.product_name?.toLowerCase().includes(query) ?? false;
      const matchesCategory = draft.product_category?.toLowerCase().includes(query) ?? false;
      const matchesComplainant = draft.complainant_name?.toLowerCase().includes(query) ?? false;
      const matchesType = GetDraftTypeLabel(draft.draft_type).toLowerCase().includes(query);
      const matchesStatus = draft.draft_status.toLowerCase().includes(query);
      const matchesDate = new Date(draft.updated_at).toLocaleString().toLowerCase().includes(query);

      if (!matchesProduct && !matchesCategory && !matchesComplainant && !matchesType && !matchesStatus && !matchesDate) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    if (sortOption === 'recently_edited') {
      return new Date(b.updated_at) - new Date(a.updated_at);
    } else if (sortOption === 'oldest_first') {
      return new Date(a.updated_at) - new Date(b.updated_at);
    } else if (sortOption === 'product_name_az') {
      return (a.product_name || '').localeCompare(b.product_name || '');
    }
    return 0;
  });

  return (
    <div className='LeaDashboardMain'>
      <Sidebar sidebarType="LEA" />
      <div className='LeaContentContainer'>
        <TopBar topbarType="LEA" />
        <div className="LeaMainfeed">
          <div className='LeaHeader'>
            <div>
              <p>LEA-CIDG: Saved Drafts</p>
              <p>SAVED DRAFTS</p>
            </div>
          </div>

          <div className="VerificationTabs">
            <div className="VerificationTabsButton">
              <button
                className={`ButtonTab ${activeTab === 'All' ? 'active' : ''}`}
                onClick={() => handleTabClick('All')}
              >
                All Drafts
              </button>
              <button
                className={`ButtonTab ${activeTab === 'walkin' ? 'active' : ''}`}
                onClick={() => handleTabClick('walkin')}
              >
                Walk-in Intake
              </button>
              <button
                className={`ButtonTab ${activeTab === 'verification' ? 'active' : ''}`}
                onClick={() => handleTabClick('verification')}
              >
                Verification Request
              </button>
            </div>
          </div>

          <div className="DraftsFilterSection">
            <div className="DraftsFilterControls">
              <div className="DraftsFilterLeft">
                <input
                  type="text"
                  className="DraftsSearchInput"
                  placeholder="Search by Product Name or Product Category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  maxLength={150}
                />
              </div>

              <div className="DraftsFilterRight">
                <select
                  className="DraftsFilterDropdown"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="incomplete">Incomplete</option>
                </select>

                <select
                  className="DraftsFilterDropdown"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                >
                  <option value="recently_edited">Recently Edited</option>
                  <option value="oldest_first">Oldest First</option>
                  <option value="product_name_az">Product Name (A–Z)</option>
                </select>

                {(() => {
                  const hasActiveFilters = Boolean(searchQuery.trim() !== '' || statusFilter !== 'All' || (sortOption !== 'Recently Edited' && sortOption !== 'recently_edited'));
                  return (
                    <button
                      className="BtnClearFiltersIcon"
                      onClick={handleClearFilters}
                      disabled={!hasActiveFilters}
                      aria-label="Clear Filters"
                      title="Clear Filters"
                      style={{ display: hasActiveFilters ? 'inline-flex' : 'none' }}
                    >
                      <X size={16} />
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="DraftsTotalCount">
            Total Drafts: {filteredDrafts.length}
          </div>

          {loading ? (
            <div className="EmptyStateContainer">
              <p>Loading drafts...</p>
            </div>
          ) : filteredDrafts.length > 0 ? (
            <div className='TableCard'>
              <table className='ComplaintsTable'>
                <thead>
                  <tr>
                    <th>DRAFT TYPE</th>
                    <th>PRODUCT CATEGORY</th>
                    <th>PRODUCT NAME</th>
                    <th>COMPLAINANT</th>
                    <th>LAST EDITED</th>
                    <th>SAVED BY</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalPages = Math.ceil(filteredDrafts.length / DRAFT_PAGE_SIZE) || 1;
                    const safePage = Math.min(Math.max(1, currentPage), totalPages);
                    const startIndex = (safePage - 1) * DRAFT_PAGE_SIZE;
                    const endIndex = Math.min(startIndex + DRAFT_PAGE_SIZE, filteredDrafts.length);
                    const paginatedDrafts = filteredDrafts.slice(startIndex, endIndex);

                    return paginatedDrafts.map((draft) => (
                      <tr key={draft.draft_id}>
                        <td style={{ fontWeight: '600', color: '#13213C' }}>
                          {GetDraftTypeLabel(draft.draft_type)}
                        </td>
                        <td>{draft.product_category}</td>
                        <td className='ProductName'>{draft.product_name}</td>
                        <td>{draft.complainant_name}</td>
                        <td>{new Date(draft.updated_at).toLocaleString()}</td>
                        <td>{draft.saved_by_name || 'You'}</td>
                        <td>
                          <span className={`StatusBadge ${GetDraftStatusClass(draft.draft_status)}`}>
                            {draft.draft_status === 'draft' ? 'Draft' : 'Incomplete'}
                          </span>
                        </td>
                        <td>
                          <div className="LeaDropdownWrapper">
                            <button
                              className="LeaViewBtn"
                              title="View Draft"
                              onClick={() => setViewModalData(draft)}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              className="LeaDropdownTrigger"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDropdown(draft.draft_id, e);
                              }}
                            >
                              <MoreVertical size={15} />
                            </button>

                            {openDropdownId === draft.draft_id &&
                              createPortal(
                                <div
                                  className="LeaDropdownMenu"
                                  style={{
                                    position: 'fixed',
                                    top: `${dropdownPos.top}px`,
                                    left: `${dropdownPos.left}px`,
                                    zIndex: 9999,
                                    width: `150px`,
                                  }}
                                >
                                  <button
                                    className="LeaDropdownItem"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleEditDraft(draft);
                                    }}
                                  >
                                    <PenLine size={14} /> Continue Editing
                                  </button>
                                  <button
                                    className="LeaDropdownItem"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleDeleteClick(draft);
                                    }}
                                  >
                                    <Trash2 size={14} /> Delete Draft
                                  </button>
                                </div>,
                                document.body
                              )}
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>

              {(() => {
                const totalPages = Math.ceil(filteredDrafts.length / DRAFT_PAGE_SIZE) || 1;
                const safePage = Math.min(Math.max(1, currentPage), totalPages);
                const startIndex = (safePage - 1) * DRAFT_PAGE_SIZE;
                const endIndex = Math.min(startIndex + DRAFT_PAGE_SIZE, filteredDrafts.length);
                return (
                  <div className='Pagination'>
                    <p>Showing {filteredDrafts.length === 0 ? 0 : startIndex + 1}–{endIndex} of {filteredDrafts.length}</p>
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
            </div>
          ) : (
            <div className="EmptyStateContainer">
              <div className="EmptyStateIcon"> <Inbox size={40} /></div>
              <h3 className="EmptyStateTitle">No saved drafts yet</h3>
              <p className="EmptyStateMessage">
                You haven't saved any drafts.<br />
                Any complaint or verification request you save as a draft will appear here.
              </p>
              <span
                className="EmptyStateLink"
                onClick={() => navigate('/leacidgfolder/lea-new-intake')}
              >
                Create New Complaint
              </span>
            </div>
          )}

        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && draftToDelete && (
        <div className='ModalOverlay'>
          <div className='ModalBox'>
            <h3>Confirm Delete</h3>
            <p>
              Are you sure you want to delete the draft for <strong>{draftToDelete.product_name}</strong>? This action cannot be undone.
            </p>
            <div className='ModalActions'>
              <button className='BtnCancelModal' onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className='BtnConfirmDelete' onClick={handleConfirmDelete}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* View Draft Modal (FDA layout parity with LEA styling) */}
      {viewModalData && (
        <LeaDraftViewModal
          draft={viewModalData}
          onClose={() => setViewModalData(null)}
          onContinueEditing={handleEditDraft}
        />
      )}

      {/* FDA-STYLE FLOATING TOAST NOTIFICATION ALERT */}
      {toastMessage && (
        <div className="LeaToastAlert LeaToast_info" role="alert">
          <div className="LeaToastIconWrap">
            <Info size={18} />
          </div>
          <div className="LeaToastBody">
            <p className="LeaToastMessage">{toastMessage}</p>
          </div>
          <button
            className="LeaToastCloseBtn"
            onClick={() => setToastMessage(null)}
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default LeaSavedDraft;
