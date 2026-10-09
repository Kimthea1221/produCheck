// ADDED — useEffect added alongside existing useState to support backend data fetching.
// ADDED — useRef added to track whether data has ever loaded (used for one-time skeleton gate).
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Sidebar from "../component/sidebar";
import TopBar from "../component/top-bar";
import "./fda-css.css";
import {
  Eye,
  MoreVertical,
  PenLine,
  Trash2,
  Info,
  Inbox,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  X,
  Clock,
  FileText, // ADDED — for draft view modal attachments
  Image as ImageIcon, // ADDED — for draft view modal attachments
  Paperclip, // ADDED — for draft view modal attachments & queue header parity
  ShieldCheck, // ADDED — for draft view modal verification result section
  CheckCircle, // ADDED — for draft view modal confirmed registered panel
  Download, // ADDED — for draft view modal attachment preview download
} from "lucide-react";
import { apiFetch } from "../../utils/apiFetch";
import mammoth from "mammoth"; // ADDED — for docx attachment preview in draft view modal



// CHANGED — was a client-side page size of 5; now 10 to match the server's
// default page_size sent in every GET /drafts/fda-verification/ request.
const ITEMS_PER_PAGE = 25;

// 🔌 BACKEND: draft attachments are not stored yet. Set false and read attached_files from the draft response once the backend supports it.
const USE_DRAFT_ATTACHMENT_MOCK = true;

// ⚠️ REMOVE THIS — Mock dataset for draft attachments until backend stores draft files
const MOCK_DRAFT_ATTACHMENTS = [
  {
    // ⚠️ REMOVE THIS
    file_id: "mock-draft-file-01",
    file_name: "cpr_certificate_photo.jpg",
    mime_type: "image/jpeg",
    file_size_display: "2.4 MB",
  },
  {
    // ⚠️ REMOVE THIS
    file_id: "mock-draft-file-02",
    file_name: "fda_database_screenshot.png",
    mime_type: "image/png",
    file_size_display: "1.1 MB",
  },
  {
    // ⚠️ REMOVE THIS
    file_id: "mock-draft-file-03",
    file_name: "product_label_inspection.pdf",
    mime_type: "application/pdf",
    file_size_display: "450.8 KB",
  },
];

// ADDED — maps priority string to corresponding badge CSS class (matches fda-verification.jsx)
const getPriorityBadgeClass = (priority) => {
  switch (priority) {
    case "urgent":
      return "FdaVerifBadgeUrgent";
    case "high":
      return "FdaVerifBadgeHigh";
    case "critical":
      return "FdaVerifBadgeUrgent";
    case "standard":
    default:
      return "FdaVerifBadgeStandard";
  }
};

// ADDED — Child modal component displaying full Verification Queue panels for saved draft
function FdaDraftViewModal({ draft, onClose, onContinueEditing, formatDate }) {
  // Detail fetches
  const [requestDetail, setRequestDetail] = useState(null);
  const [requestLoading, setRequestLoading] = useState(true);
  const [requestError, setRequestError] = useState(false);

  const [draftDetail, setDraftDetail] = useState(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draftError, setDraftError] = useState(false);

  // Attached file preview modal state (queue parity)
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [docxHtml, setDocxHtml] = useState("");
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState(false);

  // Fetch parent request details and draft determination
  useEffect(() => {
    let cancelled = false;
    setRequestLoading(true);
    setRequestError(false);
    setDraftLoading(true);
    setDraftError(false);

    // 1. GET /verification-requests/{request_id}
    apiFetch(`/verification-requests/${draft.verification_request_id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setRequestDetail(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRequestError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRequestLoading(false);
        }
      });

    // 2. GET /drafts/fda-verification/{draft_id}
    apiFetch(`/drafts/fda-verification/${draft.draft_id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setDraftDetail(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDraftError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDraftLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft.draft_id, draft.verification_request_id]);

  // Preview file effect (copies queue preview behavior)
  useEffect(() => {
    if (!previewFile) {
      setPreviewUrl(null);
      setPreviewError(false);
      setDocxHtml("");
      setDocxLoading(false);
      setDocxError(false);
      return;
    }

    const mime = previewFile.mime_type || "";
    const name = previewFile.file_name || "";
    const isImage = mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
    const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name);
    const isDocx = mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(name);

    if (!isImage && !isPdf && !isDocx) return;

    setDocxHtml("");
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
          console.error("Docx conversion error:", err);
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

  const rawStatus = draftDetail?.draft_verification_status?.toLowerCase();
  const isRegistered = rawStatus === "registered";
  const isUnregistered = rawStatus === "unregistered";
  const hasDetermination = isRegistered || isUnregistered;

  return (
    <div className="FdaVerifModalOverlay">
      <div className="FdaRecordModalContainer FdaVerifDraftModalSize">
        {/* Header */}
        <div className="FdaRecordModalHeader">
          <div className="FdaRecordModalTitleGroup">
            <Eye size={20} className="FdaVerifGreenIcon" />
            <div>
              <h3>Draft Summary</h3>
              <p className="FdaRecordModalSubtitle">
                {draft.case_reference} &bull; Last modified {formatDate(draft.updated_at)}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="FdaVerifIconButton"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="FdaRecordModalBody">
          {/* SECTION 1: CASE INFORMATION */}
          <div className="FdaVerifMergedSection">
            <div className="FdaVerifSectionHeader">
              <FileText size={16} className="FdaVerifGreenIcon" />
              <h3>Case Information</h3>
            </div>

            {requestError && (
              <p className="FdaVerifDraftMutedLine FdaVerifDraftAlertLine">
                Could not load request details (the request may have been recalled or is no longer awaiting FDA). LEA files are unavailable.
              </p>
            )}

            <div className="FdaVerifGrid2">
              <div className="FdaVerifInfoGroup">
                <span className="FdaVerifInfoLabel">Case ID (LEA Reference):</span>
                <span className="FdaVerifInfoValueHighlight">
                  {requestDetail?.case_reference || draft.case_reference || "—"}
                </span>
              </div>

              <div className="FdaVerifInfoGroup">
                <span className="FdaVerifInfoLabel">Product Name:</span>
                <span className="FdaVerifInfoValue">
                  {requestDetail?.product_name || draft.product_name || "—"}
                </span>
              </div>

              <div className="FdaVerifInfoGroup">
                <span className="FdaVerifInfoLabel">Manufacturer:</span>
                <span className="FdaVerifInfoValue">
                  {requestDetail?.manufacturer || draft.manufacturer || "—"}
                </span>
              </div>

              <div className="FdaVerifInfoGroup">
                <span className="FdaVerifInfoLabel">Requesting LEA Officer / Unit:</span>
                <span className="FdaVerifInfoValue">
                  {requestDetail?.requested_by_name ?? (requestLoading ? "Loading…" : "N/A")}
                </span>
              </div>

              <div className="FdaVerifInfoGroup">
                <span className="FdaVerifInfoLabel">Product Category:</span>
                <span className="FdaVerifInfoValue">
                  {requestDetail?.product_category || draft.product_category || "—"}
                </span>
              </div>

              <div className="FdaVerifInfoGroup">
                <span className="FdaVerifInfoLabel">Date Received:</span>
                <span className="FdaVerifInfoValue">
                  {requestDetail?.requested_at
                    ? new Date(requestDetail.requested_at).toLocaleString("en-US", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })
                    : (requestLoading ? "Loading…" : "—")}
                </span>
              </div>

              <div className="FdaVerifInfoGroup FdaVerifGridFull">
                <span className="FdaVerifInfoLabel">Verification Request Source:</span>
                <span className="FdaVerifInfoValue">LEA Verification Request</span>
              </div>
            </div>
          </div>

          <hr className="FdaVerifSectionDivider" />

          {/* SECTION 2: VERIFICATION REQUEST INFORMATION (LEA-CIDG) */}
          <div className="FdaVerifMergedSection">
            <div className="FdaVerifSectionHeader">
              <FileText size={16} className="FdaVerifGreenIcon" />
              <h3>Verification Request Information (LEA-CIDG)</h3>
            </div>

            <div className="FdaVerifGrid2">
              <div className="FdaVerifInfoGroup">
                <span className="FdaVerifInfoLabel">Product Code / Barcode:</span>
                <span className="FdaVerifCodeBadge">
                  {requestDetail?.product_code || (requestLoading ? "…" : "N/A")}
                </span>
              </div>

              <div className="FdaVerifInfoGroup">
                <span className="FdaVerifInfoLabel">Priority Level:</span>
                <span className={`FdaVerifPriorityBadge ${getPriorityBadgeClass(requestDetail?.priority)}`}>
                  {requestDetail?.priority
                    ? requestDetail.priority.charAt(0).toUpperCase() + requestDetail.priority.slice(1)
                    : (requestLoading ? "…" : "—")}
                </span>
              </div>

              <div className="FdaVerifInfoGroup FdaVerifGridFull">
                <span className="FdaVerifInfoLabel">Notes &amp; Statement from LEA Officers:</span>
                <div className="FdaVerifNotesBox">
                  <p>{requestDetail?.complaint_statement?.trim() || (requestLoading ? "Loading statement…" : "No statement provided.")}</p>
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

            <div className="FdaVerifDocsGrid">
              {requestDetail?.attached_files && requestDetail.attached_files.length > 0 ? (
                requestDetail.attached_files.map((file) => (
                  <div key={file.file_id} className="FdaVerifDocCard">
                    <div className="FdaVerifDocIcon">
                      <FileText size={18} />
                    </div>
                    <div className="FdaVerifDocInfo">
                      <p className="FdaVerifDocName">{file.file_name}</p>
                      <span className="FdaVerifDocMeta">{file.file_size_display}</span>
                    </div>
                    <div className="FdaVerifDocActions">
                      <button
                        type="button"
                        className="FdaVerifDocActionBtn"
                        title="Inspect Attachment"
                        onClick={() => setPreviewFile(file)}
                      >
                        <Eye size={13} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="FdaVerifNoDocsText">
                  {requestLoading ? "Loading attached documents…" : "No evidence documents attached to this request."}
                </p>
              )}
            </div>
          </div>

          <hr className="FdaVerifSectionDivider" />

          {/* SECTION 4: FDA VERIFICATION RESULT SECTION (SAVED DRAFT) */}
          <div className="FdaVerifMergedSection">
            <div className="FdaVerifSectionHeader">
              <ShieldCheck size={18} className="FdaVerifGreenIcon" />
              <div>
                <h3>FDA Verification Result Section</h3>
                <p className="FdaVerifDraftSub">Saved verification determination and official FDA database findings.</p>
              </div>
            </div>

            {draftError && (
              <p className="FdaVerifDraftMutedLine FdaVerifDraftAlertLine">
                Could not load saved draft determination.
              </p>
            )}

            {!hasDetermination ? (
              <div className="FdaVerifGrid2">
                <div className="FdaVerifInfoGroup">
                  <span className="FdaVerifInfoLabel">Verification Status:</span>
                  <span className="FdaVerifInfoValue">—</span>
                  <p className="FdaVerifDraftMutedLine">No determination saved yet</p>
                </div>
              </div>
            ) : isRegistered ? (
              <div className="FdaVerifRegisteredPanel FdaVerifDraftPanel">
                <div className="FdaVerifPanelHeaderGreen">
                  <CheckCircle size={18} />
                  <div>
                    <h4>CONFIRMED REGISTERED PRODUCT</h4>
                    <p>Saved CPR details and official regulatory remarks.</p>
                  </div>
                </div>

                <div className="FdaVerifGrid2 FdaVerifDraftGridGap">
                  <div className="FdaVerifInfoGroup">
                    <span className="FdaVerifInfoLabel">FDA CPR Registration Number:</span>
                    <span className="FdaVerifInfoValue">{draftDetail?.draft_cpr_number || "—"}</span>
                  </div>

                  <div className="FdaVerifInfoGroup">
                    <span className="FdaVerifInfoLabel">CPR Validity / Expiry Date:</span>
                    <span className="FdaVerifInfoValue">{draftDetail?.draft_cpr_expiry || "—"}</span>
                  </div>
                </div>

                <div className="FdaVerifInfoGroup">
                  <span className="FdaVerifInfoLabel">Official FDA Verification Remarks:</span>
                  <div className="FdaVerifNotesBox FdaVerifDraftRemarksBox">
                    <p>{draftDetail?.draft_response_notes?.trim() || "—"}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="FdaVerifUnregisteredPanel FdaVerifDraftPanel">
                <div className="FdaVerifPanelHeaderOrange">
                  <AlertTriangle size={18} className="FdaVerifRedIcon" />
                  <div>
                    <h4>UNREGISTERED PRODUCT WARNING</h4>
                    <p>Saved rationale and regulatory advisories for LEA.</p>
                  </div>
                </div>

                <div className="FdaVerifInfoGroup FdaVerifDraftGroupGap">
                  <span className="FdaVerifInfoLabel">Reason Product is Not Registered:</span>
                  <div className="FdaVerifNotesBox FdaVerifDraftRemarksBox">
                    <p>{draftDetail?.draft_unregistered_reason?.trim() || "—"}</p>
                  </div>
                </div>

                <div className="FdaVerifInfoGroup">
                  <span className="FdaVerifInfoLabel">Advisory &amp; Enforcement Recommendations for LEA:</span>
                  <div className="FdaVerifNotesBox FdaVerifDraftRemarksBox">
                    <p>{draftDetail?.draft_response_notes?.trim() || "—"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: ATTACH FILES / EVIDENCE (MOCK) — Shown only when status is Registered or Unregistered */}
          {hasDetermination && USE_DRAFT_ATTACHMENT_MOCK && (
            <>
              <hr className="FdaVerifSectionDivider" />
              <div className="FdaVerifMergedSection FdaVerifMockAttach">
                <div className="FdaVerifAttachHeaderRow">
                  <span className="FdaVerifInfoLabel">ATTACHED FILES / EVIDENCE</span>
                  <span className="FdaVerifMockBadge">Mock preview</span>
                </div>

                <div className="FdaVerifDocsGrid">
                  {MOCK_DRAFT_ATTACHMENTS.map((file) => {
                    const isImage =
                      file.mime_type?.startsWith("image/") ||
                      /\.(jpg|jpeg|png|gif|webp)$/i.test(file.file_name || "");
                    return (
                      <div key={file.file_id} className="FdaVerifDocCard">
                        <div className="FdaVerifDocIcon">
                          {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                        </div>
                        <div className="FdaVerifDocInfo">
                          <p className="FdaVerifDocName" title={file.file_name}>
                            {file.file_name}
                          </p>
                          <span className="FdaVerifDocMeta">{file.file_size_display}</span>
                        </div>
                        <div className="FdaVerifDocActions">
                          <button
                            type="button"
                            className="FdaVerifDocActionBtn"
                            title="Mock file, no preview"
                            disabled
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="FdaRecordModalFooter">
          <button
            type="button"
            className="FdaVerifBtnOutline"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="FdaBtnCloseModal"
            onClick={() => {
              onClose();
              onContinueEditing(draft);
            }}
          >
            Continue Editing
          </button>
        </div>
      </div>

      {/* Attachment Preview Modal (Queue parity, renders above draft modal) */}
      {previewFile && (
        <div className="FdaVerifModalOverlay FdaVerifDraftPreviewOverlay" role="dialog" aria-modal="true">
          <div className="FdaVerifDocModalContainer">
            <div className="FdaVerifDocModalHeader">
              <div className="FdaVerifDocModalTitleGroup">
                <Paperclip size={18} className="FdaVerifGreenIcon" />
                <div>
                  <h3>{previewFile.file_name}</h3>
                  <p className="FdaVerifDocModalMeta">
                    {previewFile.mime_type} &bull; {previewFile.file_size_display}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="FdaVerifIconButton"
                onClick={() => setPreviewFile(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="FdaVerifDocModalBody">
              {(() => {
                const _mime = previewFile.mime_type || "";
                const _name = previewFile.file_name || "";
                const isImage = _mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(_name);
                const isPdf = _mime === "application/pdf" || /\.pdf$/i.test(_name);
                const isDocx = _mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(_name);

                if (isImage || isPdf) {
                  return previewLoading ? (
                    <div className="FdaVerifDocPlaceholderPreview">
                      <p className="FdaVerifPreviewText">Loading preview&hellip;</p>
                    </div>
                  ) : previewError ? (
                    <div className="FdaVerifDocPlaceholderPreview">
                      <FileText size={48} className="FdaVerifDocPreviewIcon" />
                      <p className="FdaVerifPreviewTitle">Preview unavailable</p>
                      <p className="FdaVerifPreviewText">Try downloading the file instead.</p>
                    </div>
                  ) : isImage ? (
                    <img
                      src={previewUrl}
                      alt={previewFile.file_name}
                      className="FdaVerifDocImagePreview"
                    />
                  ) : (
                    <iframe
                      src={previewUrl}
                      title={previewFile.file_name}
                      className="FdaVerifDocPdfPreview"
                    />
                  );
                }

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
                      <strong>{previewFile.file_name}</strong> can't be previewed inline &mdash; use download instead.
                    </p>
                  </div>
                );
              })()}
            </div>

            <div className="FdaVerifModalFooter">
              <button
                type="button"
                className="FdaVerifBtnOutline"
                onClick={() => setPreviewFile(null)}
              >
                Close Preview
              </button>
              <button
                type="button"
                className="FdaVerifBtnDownloadAttachment"
                onClick={() => {
                  apiFetch(`/shared-files/${previewFile.file_id}/download`)
                    .then((res) => {
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      return res.blob();
                    })
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = previewFile.file_name;
                      a.click();
                      URL.revokeObjectURL(url);
                      setPreviewFile(null);
                    })
                    .catch(() => {
                      // catch download failure
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

function FDASavedDraft() {


  const navigate = useNavigate();

  // CHANGED — was a hardcoded dummy array; now starts empty and is populated
  // by the fetch useEffect below (GET /drafts/fda-verification/).
  const [drafts, setDrafts] = useState([]);

  // ADDED — total record count returned by the server; replaces the old
  // client-side filteredDrafts.length that drove pagination calculations.
  const [draftsTotal, setDraftsTotal] = useState(0);

  // ADDED — true only while the very first fetch is in-flight and the drafts
  // list is still empty. Re-fetches triggered by filter/search changes do NOT
  // set this flag (existing rows stay visible during background refreshes).
  const [draftsLoading, setDraftsLoading] = useState(false);

  // Filters — searchQuery and categoryFilter carry over from the dummy version;
  // dateFilter shape is unchanged (single YYYY-MM-DD string, maps to date_filter).
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  // CHANGED — default was "All"; now "" so the param is omitted when unset,
  // matching the pattern used in fda-verification.jsx's Completed/Rejected tabs.
  const [dateFilter, setDateFilter] = useState("");

  // CHANGED — was keyed on dummy caseId string; now keyed on draft_id (UUID)
  // returned by the backend so each row's dropdown is uniquely identified.
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // Delete modal — unchanged structure; draftToDelete now holds a real draft
  // object with draft_id instead of the dummy shape.
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState(null);

  // ADDED — tracks whether the DELETE request is in-flight so the modal
  // buttons can be disabled and show "Deleting…" feedback.
  const [deleteLoading, setDeleteLoading] = useState(false);

  // View Draft Summary modal — unchanged; now receives real draft objects.
  const [viewModalData, setViewModalData] = useState(null);

  // Toast — unchanged.
  const [toastMessage, setToastMessage] = useState(null);

  // CHANGED — was used to drive client-side slice-based pagination;
  // now sends the page number as a query param to the server instead.
  const [currentPage, setCurrentPage] = useState(1);

  // ADDED — ref that becomes true after the very first successful response from
  // GET /drafts/fda-verification/. Unlike state, mutating a ref does not trigger
  // a re-render, making it the right tool for this "has ever loaded" gate.
  // Used in two places:
  //   1. doFetch — only calls setDraftsLoading(true) before the first real load.
  //   2. The render condition — skeleton only shows when this is still false.
  // Once true it stays true for the lifetime of the page, so even if a filter
  // returns zero results (drafts.length === 0 after a successful empty response),
  // the loading skeleton will never re-appear.
  const hasLoadedOnce = useRef(false);

  // Unchanged helper — shows a toast for 2.2 s then auto-dismisses.
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2200);
  };

  // ADDED — fetches the real drafts list from GET /drafts/fda-verification/.
  // Runs on mount and re-runs whenever searchQuery (debounced 300 ms),
  // categoryFilter, dateFilter, or currentPage changes.
  // SMOOTH LOADING RULE — setDraftsLoading(true) only when the list is genuinely
  // empty (first-ever load). For filter/search/pagination re-fetches where prior
  // data already exists, the existing rows stay visible in-place until the new
  // response arrives, eliminating table flicker on every keystroke or dropdown pick.
  useEffect(() => {
    const doFetch = () => {
      // CHANGED — was `if (drafts.length === 0)` which incorrectly re-triggered
      // the skeleton whenever a filter/search returned zero results (because
      // drafts would be set to [] after a successful empty response, making
      // drafts.length === 0 true again on the next re-fetch).
      // Now gates on hasLoadedOnce.current instead: the skeleton can ONLY appear
      // before the very first response ever comes back. After that the ref is true
      // and this block is permanently skipped for every subsequent re-fetch.
      if (!hasLoadedOnce.current) {
        setDraftsLoading(true);
      }

      const params = new URLSearchParams();
      // ADDED — sends free-text search matching case_reference, product_name,
      // or manufacturer on the backend; omitted when empty.
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      // ADDED — sends exact-match category filter; omitted when "All Categories"
      // (empty string) is selected so the backend returns all categories.
      if (categoryFilter) params.set("category", categoryFilter);
      // ADDED — single date filter (YYYY-MM-DD); maps to the date_filter query
      // param which matches drafts whose updated_at falls on that calendar day.
      if (dateFilter) params.set("date_filter", dateFilter);
      // ADDED — server-side page index and size; replaces the old client-side
      // Array.slice() pagination that ran entirely in the browser.
      params.set("page", String(currentPage));
      params.set("page_size", String(ITEMS_PER_PAGE));

      apiFetch(`/drafts/fda-verification/?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          // CHANGED — was setDrafts(dummyArray); now sets the real items
          // returned by the server and stores the server-reported total.
          setDrafts(data.items);
          setDraftsTotal(data.total);
          // ADDED — mark that at least one real response has arrived.
          // Subsequent calls to doFetch will skip setDraftsLoading(true)
          // and the skeleton will never render again, even when the result
          // set is empty (e.g. a search with no matches).
          hasLoadedOnce.current = true;
        })
        .catch(() => {
          // ADDED — surfaces fetch errors via the existing showToast helper
          // instead of silently failing, consistent with fda-verification.jsx.
          showToast("Could not load drafts from the server.");
        })
        .finally(() => setDraftsLoading(false));
    };

    // ADDED — debounce only the text search input (~300 ms) so we don't fire
    // a request on every keystroke. Dropdowns and date pickers fire immediately
    // (0 ms delay) because they produce a single change event per interaction.
    const timer = setTimeout(doFetch, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, categoryFilter, dateFilter, currentPage]);

  // ---- Pagination (server-driven) ----------------------------------------

  // CHANGED — was Math.ceil(filteredDrafts.length / ITEMS_PER_PAGE) using the
  // client-side filtered array length; now uses the server-reported total so
  // the page count is always in sync with the real dataset size.
  const totalPages = Math.max(1, Math.ceil(draftsTotal / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  // ---- Helpers for display ------------------------------------------------

  // ADDED — formats ISO 8601 timestamps from the backend (e.g. updated_at) using
  // the same toLocaleString pattern used throughout fda-verification.jsx:
  // en-US locale, MM/DD/YYYY HH:MM AM/PM, 12-hour clock.
  const formatDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // ADDED — capitalizes the first letter of a backend status string (e.g.
  // "draft" → "Draft", "incomplete" → "Incomplete") for display. Replaces the
  // old hardcoded "Draft" literal that was used in both the table and the modal.
  const capitalizeStatus = (status) => {
    if (!status) return "—";
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // ---- Action handlers ----------------------------------------------------

  // CHANGED — was keyed on dummy caseId; now uses draft_id (UUID from backend)
  // so each row's MoreVertical dropdown toggles independently by its real key.
  // Uses element rect to position the portal dropdown menu so it escapes scroll clipping.
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

  // Close dropdown on outside click or window scroll
  useEffect(() => {
    if (!openDropdownId) return;
    const handleOutsideClick = (event) => {
      if (
        !event.target.closest(".FdaDropdownMenu") &&
        !event.target.closest(".FdaDropdownTrigger")
      ) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [openDropdownId]);

  // CHANGED — was navigate(..., { state: { openDraftId: draft.caseId,
  // draftRecord: draft } }) using the dummy caseId and a fake reconstructed
  // record object. Now passes the real verification_request_id AND draft_id
  // so the receiving page (fda-verification.jsx) can fetch real case data AND
  // restore the officer's previously saved form values from the draft record.
  const handleViewDraft = (draft) => {
    setOpenDropdownId(null);
    // CHANGED — was draft.caseId; now draft.case_reference (real field name).
    showToast(`Opening draft ${draft.case_reference}...`);
    setTimeout(() => {
      navigate("/fdafolder/fda-verification", {
        state: {
          // CHANGED — key renamed from openDraftId to openVerificationRequestId;
          // value changed from dummy caseId to real verification_request_id UUID.
          openVerificationRequestId: draft.verification_request_id,
          // ADDED — draft_id is needed by the receiving page to call
          // GET /drafts/fda-verification/{draft_id} and pre-fill the form fields
          // with the officer's previously saved draft values.
          draftId: draft.draft_id,
          mode: "edit",
        },
      });
    }, 1000);
  };

  // CHANGED — same navigation state changes as handleViewDraft above.
  // Was: { openDraftId: draft.caseId, draftRecord: draft, mode: "edit" }
  // Now: { openVerificationRequestId, draftId, mode: "edit" }
  // ADDED — draftId included so the receiving page can fetch and restore
  // the officer's previously saved draft form values via
  // GET /drafts/fda-verification/{draft_id}.
  const handleContinueEditing = (draft) => {
    setOpenDropdownId(null);
    // CHANGED — was draft.caseId; now draft.case_reference.
    showToast(`Resuming draft ${draft.case_reference}...`);
    setTimeout(() => {
      navigate("/fdafolder/fda-verification", {
        state: {
          openVerificationRequestId: draft.verification_request_id,
          // ADDED — same draftId as handleViewDraft; enables form pre-fill on arrival.
          draftId: draft.draft_id,
          mode: "edit",
        },
      });
    }, 1000);
  };

  // Unchanged logic — opens the delete confirmation modal.
  const handleDeleteClick = (draft) => {
    setOpenDropdownId(null);
    setDraftToDelete(draft);
    setShowDeleteModal(true);
  };

  // CHANGED — was a local array filter (prev.filter(d => d.caseId !== ...));
  // now calls DELETE /drafts/fda-verification/{draft_id} on the backend.
  // On success: removes the item from the local list by draft_id and decrements
  // draftsTotal so the pagination footer stays accurate without a full re-fetch.
  // On error: reads the 'detail' field from the JSON response body and surfaces
  // it via showToast (not a generic message), matching the task spec.
  const handleConfirmDelete = () => {
    if (!draftToDelete) return;
    setDeleteLoading(true);

    apiFetch(`/drafts/fda-verification/${draftToDelete.draft_id}`, {
      method: "DELETE",
    })
      .then((res) => {
        if (!res.ok) {
          // ADDED — parse error detail from the response body so the
          // toast shows the backend's actual error message, not a generic one.
          return res.json().then((body) => {
            throw new Error(body?.detail || `HTTP ${res.status}`);
          });
        }
        // CHANGED — was prev.filter(d => d.caseId !== draftToDelete.caseId);
        // now filters by draft_id (the real primary key from the backend).
        setDrafts((prev) =>
          prev.filter((d) => d.draft_id !== draftToDelete.draft_id)
        );
        // ADDED — decrements the server total so the footer count and
        // page calculations stay correct without triggering a full re-fetch.
        setDraftsTotal((prev) => Math.max(0, prev - 1));
        setShowDeleteModal(false);
        setDraftToDelete(null);
        showToast("Draft deleted successfully");
      })
      .catch((err) => {
        // ADDED — surfaces the real error message from the backend via toast.
        showToast(err.message || "Failed to delete the draft.");
      })
      .finally(() => setDeleteLoading(false));
  };

  // CHANGED — was resetting sourceFilter alongside the other filters;
  // sourceFilter state and its dropdown have been removed entirely because
  // the real backend drafts response has no source field.
  const handleClearFilters = () => {
    setSearchQuery("");
    // CHANGED — was setCategoryFilter("All"); default is now "" (empty string)
    // so the category param is omitted from the fetch when no filter is active.
    setCategoryFilter("");
    setDateFilter("");
    setCurrentPage(1);
  };

  // Filtering -client side, uncomment only when switching to client-side filtering
  /* const filteredDrafts = drafts.filter((draft) => {
      if (categoryFilter !== "All" && draft.category !== categoryFilter) return false;
      if (sourceFilter !== "All" && draft.source !== sourceFilter) return false;
      if (dateFilter && !draft.lastModified.startsWith(dateFilter)) return false;

      if (searchQuery.trim() !== "") {
          const query = searchQuery.toLowerCase();
          const matchesCaseId = draft.caseId.toLowerCase().includes(query);
          const matchesProduct = draft.product.toLowerCase().includes(query);
          const matchesManufacturer = draft.manufacturer.toLowerCase().includes(query);
          if (!matchesCaseId && !matchesManufacturer && !matchesProduct) return false;
      }

      return true;
  });

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredDrafts.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDrafts = filteredDrafts.slice(
      (safePage - 1) * ITEMS_PER_PAGE,
      safePage * ITEMS_PER_PAGE
  ); */

  // ADDED — true when any filter has an active value; used to show/hide the
  // Clear Filters button via visibility:hidden (always mounted, no layout shift).
  const hasActiveFilters = searchQuery || categoryFilter || dateFilter;

  // ---- Render -------------------------------------------------------------

  return (
    <div className="FdaDashboardMain">
      <Sidebar sidebarType="FDA" />
      <div className="FdaContentContainer">
        <TopBar topbarType="FDA" />
        <div className="FdaMainFeed">

          {/* Header */}
          <div className="FdaVerifHeader">
            <div className="FdaVerifHeaderLeft">
              <p className="FdaVerifEyebrow">FDA · SAVED DRAFTS</p>
              <h1 className="FdaVerifTitle">Saved Drafts</h1>
              <p className="FdaVerifSubtitle">
                Verification requests saved from the Verification Queue. Continue
                editing or submit them once ready.
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="FdaProductFilterPanel">
            <div className="FdaSearchFixed">
              <div className="FdaSearchWrapper">
                {/* CHANGED — onChange now also resets currentPage to 1 so a
                                    new search always starts from page 1 of the server results. */}
                <input
                  type="text"
                  className="FdaSearchInput"
                  placeholder="Search Case ID, Product, or Manufacturer..."
                  maxLength={150}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  id="fda-drafts-search-input"
                />
              </div>
            </div>

            <div className="FdaFilterGroupsRight">
              <div className="FdaFilterGroup">
                <label>Category</label>
                {/* FIXED — option values now match real backend category strings
                                    exactly: "Food" (not "Foods"). Default value "" omits the param when
                                    "All Categories" is selected, matching the backend contract. */}
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  id="fda-drafts-category-filter"
                >
                  <option value="">All Categories</option>
                  <option value="Cosmetics">Cosmetics</option>
                  <option value="Food">Food</option>
                  <option value="Devices">Health Devices</option>
                  <option value="Drugs">Drugs</option>
                </select>
              </div>

              {/* REMOVED — Source filter dropdown removed entirely.
                                The real backend draft response has no source field;
                                sourceFilter state, the dropdown UI, and its reset in
                                handleClearFilters have all been deleted. */}

              <div className="FdaFilterGroup">
                <label>Date Modified</label>
                {/* CHANGED — maps to the date_filter query param (single
                                    YYYY-MM-DD date). Unchanged from the dummy version in
                                    shape, but now wired to the server filter instead of
                                    a local Array.filter() call. */}
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  id="fda-drafts-date-filter"
                />
              </div>

              {/* Fix 2 — display:none when inactive so button takes 0px width and controls sit flush right */}
              <button
                className="BtnFiltersIcon"
                onClick={handleClearFilters}
                disabled={!hasActiveFilters}
                aria-label="Clear Filters"
                title="Clear Filters"
                style={{ display: hasActiveFilters ? "inline-flex" : "none" }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Drafts Table
                        CHANGED — three-branch render instead of the old two-branch:
                        1. Initial loading skeleton (draftsLoading && !hasLoadedOnce.current)
                        2. Populated table  (drafts.length > 0)
                        3. Empty state      (no data after a successful load)
                        Branches 2 and 3 stay visible during background re-fetches so
                        there is no flicker when the user types or changes a filter.
                        FIXED — skeleton condition uses !hasLoadedOnce.current (ref) instead
                        of drafts.length === 0 (state), so the skeleton never reappears
                        after any filter returns an empty result set. */}
          {draftsLoading && !hasLoadedOnce.current ? (
            /* ADDED — initial loading skeleton: shown ONLY before the very first
               successful response ever arrives. Once hasLoadedOnce.current is true
               this branch can never match again, regardless of filter results.
               Uses the same Clock icon and table-spanning td pattern as
               fda-verification.jsx's Completed/Rejected loading rows. */
            <div className="FdaTableCard FdaSavedDraftTableCard">
              <div className="FdaTableWrapper FdaSavedDraftTableWrapper">
                <table className="FdaTable">
                  <thead>
                    <tr>
                      <th>CASE ID</th>
                      <th>PRODUCT NAME</th>
                      <th>MANUFACTURER</th>
                      <th>CATEGORY</th>
                      <th>LAST MODIFIED</th>
                      <th>DRAFT STATUS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan="7" className="FdaEmptyState" style={{ textAlign: "center", padding: "32px", color: "rgba(31,41,55,0.5)" }}>
                        <Clock size={28} style={{ opacity: 0.4, marginBottom: "8px" }} />
                        <p style={{ margin: 0 }}>Loading drafts…</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : drafts.length > 0 ? (
            <div className="FdaTableCard FdaSavedDraftTableCard">
              <div className="FdaTableWrapper FdaSavedDraftTableWrapper">
                <table className="FdaTable">
                  <thead>
                    <tr>
                      <th>CASE ID</th>
                      <th>PRODUCT NAME</th>
                      <th>MANUFACTURER</th>
                      <th>CATEGORY</th>
                      {/* REMOVED — SOURCE column header deleted. The real backend
                                                draft response has no source field. */}
                      <th>LAST MODIFIED</th>
                      <th>DRAFT STATUS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* CHANGED — maps real API field names from the GET
                                            /drafts/fda-verification/ response instead of dummy fields:
                                            draft.caseId       → draft.case_reference
                                            draft.product      → draft.product_name
                                            draft.category     → draft.product_category
                                            draft.lastModified → draft.updated_at (formatted via formatDate)
                                            draft.source       → REMOVED (no source field in real data)
                                            React key is now draft.draft_id (UUID) instead of draft.caseId. */}
                    {drafts.map((draft) => (
                      <tr key={draft.draft_id}>
                        {/* CHANGED — was draft.caseId */}
                        <td className="CaseIdCell">{draft.case_reference}</td>
                        {/* CHANGED — was draft.product */}
                        <td className="ProductNameCell">{draft.product_name}</td>
                        <td className="ManufacturerCell">{draft.manufacturer}</td>
                        {/* CHANGED — was draft.category */}
                        <td>{draft.product_category}</td>
                        {/* REMOVED — SOURCE cell deleted (no source field). */}
                        <td className="FdaSavedDraftLastModified">
                          {/* CHANGED — was the raw dummy "2026-07-29 10:14" string;
                                                        now formats the ISO 8601 updated_at timestamp using
                                                        the same toLocaleString en-US 12-hour pattern used
                                                        throughout fda-verification.jsx. */}
                          {formatDate(draft.updated_at)}
                        </td>
                        <td>
                          {/* CHANGED — was hardcoded <span>Draft</span>;
                                                        now reads the real draft_status from the backend
                                                        ("draft" or "incomplete") and capitalizes it for
                                                        display via capitalizeStatus(). */}
                          <span className="FdaSavedDraftStatusBadge">
                            {capitalizeStatus(draft.draft_status)}
                          </span>
                        </td>
                        <td>
                          <div className="FdaDropdownWrapper">
                            <button
                              className="FdaViewBtn"
                              title="View Draft"
                              onClick={() => setViewModalData(draft)}
                              // ADDED — unique id for browser testing / accessibility.
                              id={`fda-draft-view-${draft.draft_id}`}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              className="FdaDropdownTrigger"
                              // CHANGED — was toggleDropdown(draft.caseId);
                              // now uses draft_id (real primary key) and passes event for positioning.
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDropdown(draft.draft_id, e);
                              }}
                              id={`fda-draft-menu-${draft.draft_id}`}
                            >
                              <MoreVertical size={15} />
                            </button>

                            {/* Rendered via portal to escape table scroll container clipping */}
                            {openDropdownId === draft.draft_id &&
                              createPortal(
                                <div
                                  className="FdaDropdownMenu"
                                  style={{
                                    position: "fixed",
                                    top: `${dropdownPos.top}px`,
                                    left: `${dropdownPos.left}px`,
                                    zIndex: 9999,
                                    width:`150px`,
                                  }}
                                >
                                  <button
                                    className="FdaDropdownItem"
                                    onClick={() => handleContinueEditing(draft)}
                                  >
                                    <PenLine size={14} /> Continue Editing
                                  </button>
                                  <button
                                    className="FdaDropdownItem"
                                    onClick={() => handleDeleteClick(draft)}
                                  >
                                    <Trash2 size={14} /> Delete Draft
                                  </button>
                                </div>,
                                document.body
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* CHANGED — was client-side pagination using filteredDrafts.length
                                and Array.slice(); now server-side: page numbers come from
                                draftsTotal / ITEMS_PER_PAGE (server-reported total). Prev/Next
                                buttons and page number buttons are structurally unchanged. */}
              <div className="FdaTableFooter">
                <span className="FdaFooterInfo">
                  {/* CHANGED — was filteredDrafts.length; now draftsTotal. */}
                  Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(safePage * ITEMS_PER_PAGE, draftsTotal)} of{" "}
                  {draftsTotal} drafts
                </span>
                <div className="FdaPagination">
                  <button
                    className="BtnPageNav"
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage(safePage - 1)}
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      className={`FdaPageNumber ${page === safePage ? "active" : ""}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    className="BtnPageNav"
                    disabled={safePage === totalPages}
                    onClick={() => setCurrentPage(safePage + 1)}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Empty State — unchanged from dummy version; renders when the
               server returns an empty items array and we are not loading. */
            <div className="FdaTableCard">
              <div className="FdaSavedDraftEmptyState">
                <div className="FdaSavedDraftEmptyIconWrap">
                  <Inbox size={28} />
                </div>
                <h3>No Saved Drafts</h3>
                <p>
                  You currently have no saved verification request drafts. Drafts
                  saved from the Verification Queue will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal
                CHANGED — draftToDelete.caseId references replaced with real field names;
                deleteLoading flag added to disable buttons and show "Deleting…" while
                the DELETE request is in-flight. */}
      {showDeleteModal && draftToDelete && (
        <div className="FdaModalOverlay">
          <div className="FdaModalContent" style={{ maxWidth: "440px" }}>
            <div className="FdaSavedDraftModalHeaderRow">
              <div className="FdaSavedDraftDeleteIconWrap">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="FdaSavedDraftModalTitle">Delete Draft?</h3>
                <p className="FdaSavedDraftModalDesc">
                  Are you sure you want to permanently delete this draft
                  {/* CHANGED — was draftToDelete.caseId; now case_reference. */}
                  verification request ({draftToDelete.case_reference})? This action
                  cannot be undone.
                </p>
              </div>
            </div>
            <div className="FdaModalFooter">
              <button
                className="BtnModalCancel"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDraftToDelete(null);
                }}
                // ADDED — disabled while DELETE request is in-flight.
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="BtnModalDelete"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
              >
                {/* ADDED — shows "Deleting…" feedback while the request runs. */}
                {deleteLoading ? "Deleting…" : "Delete Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Draft Summary Modal
          CHANGED — delegates to FdaDraftViewModal child component, fetching full
          verification request details and saved determination with full queue panel parity */}
      {viewModalData && (
        <FdaDraftViewModal
          draft={viewModalData}
          onClose={() => setViewModalData(null)}
          onContinueEditing={handleContinueEditing}
          formatDate={formatDate}
        />
      )}


      {/* Toast Notification — unchanged. */}
      {toastMessage && (
        <div className="FdaSavedDraftToast">
          <Info size={16} />
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default FDASavedDraft;