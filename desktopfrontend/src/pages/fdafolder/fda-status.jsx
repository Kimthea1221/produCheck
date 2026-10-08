// desktopfrontend/src/pages/fdafolder/fda-status.jsx   
import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "../component/sidebar";
import TopBar from "../component/top-bar";
import './fda-css.css';
import {
  Search,
  Filter,
  Mail,
  Send,
  BellRing,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  XCircle,
  X,
  Paperclip,
  Download,
  Eye,
  Image as ImageIcon,
  Globe,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { apiFetch } from "../../utils/apiFetch";

// Options for the "New status" dropdown on the right panel — what FDA
// personnel can manually set a complaint TO.
const STATUS_OPTIONS = [
  { value: "under_review", label: "Under Review" },
  { value: "takedown_requested", label: "Takedown Requested" },
  { value: "completed", label: "Completed" },
  { value: "dismissed", label: "Dismissed" },
];

// Options for the left-panel filter — what a complaint can currently BE,
// including "open" and "All" since those are things you'd want to filter by.
const CASE_FILTER_OPTIONS = [
  { value: "All", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "under_review", label: "Under Review" },
  { value: "takedown_requested", label: "Takedown Requested" },
  { value: "completed", label: "Completed" },
  { value: "dismissed", label: "Dismissed" },
];

const STATUS_LABELS = {
  open: "Open",
  under_review: "Under Review",
  takedown_requested: "Takedown Requested",
  completed: "Completed",
  dismissed: "Dismissed",
};

const COMPLETED_MESSAGE =
  "This complaint has been completed. The seller listing was taken down following FDA enforcement action.";

const DISMISS_PRESETS = [
  "Product found to be registered under a different FDA record.",
  "Registration currently in process.",
  "Insufficient evidence to proceed.",
];

const FINAL_STATUSES = ["completed", "dismissed"];

const CASES_PER_PAGE = 10;
const HISTORY_PER_PAGE = 25;

function getStatusBadgeStyle(status) {
  switch (status) {
    case "completed":
      return { backgroundColor: "rgba(27, 67, 50, 0.1)", color: "#1B4332" };
    case "takedown_requested":
      return { backgroundColor: "rgba(185, 28, 28, 0.1)", color: "#B91C1C" };
    case "under_review":
      return { backgroundColor: "rgba(19, 33, 60, 0.1)", color: "#13213c" };
    case "dismissed":
      return { backgroundColor: "rgba(31, 41, 55, 0.08)", color: "rgba(31, 41, 55, 0.6)" };
    default: // "open"
      return { backgroundColor: "rgba(217, 119, 6, 0.1)", color: "#D97706" };
  }
}

const thumbnailStyle = {
  width: 220,
  height: 150,
  objectFit: "cover",
  borderRadius: 8,
  cursor: "pointer",
};

// 🔌 BACKEND: Flip to false once GET /complaints-status-update serializes the PROPOSED key 'product_url'
const USE_PRODUCT_LINK_MOCK = true;

// 🔌 BACKEND: no real extension complaints needed once the flag is false
const USE_STATUS_SAMPLE_CASE_MOCK = true;

// ⚠️ REMOVE THIS: Sample mock complaint for UI preview when database has 0 extension complaints
const STATUS_SAMPLE_CASE_MOCK = {
  complaintId: "mock-sample-case",
  caseReference: "SAMPLE-0001",
  productTitle: "Sample Whitening Cream 50g (mockup)",
  manufacturer: "Sample Manufacturer",
  region: "Region III",
  status: "open",
  reporterUsername: "sample.consumer",
  reporterEmail: "sample.consumer@example.com",
  hasAttachment: false,
  attachmentName: null,
};

// ADDED — Resolves product link at display time without mutating records or API payloads
function getMockProductLink(complaint, allComplaints) {
  if (!complaint) return null;
  if (USE_PRODUCT_LINK_MOCK) {
    const rawIndex = (allComplaints || []).findIndex((c) => c.complaintId === complaint.complaintId);
    const index = rawIndex >= 0 ? rawIndex : 0;
    // ⚠️ REMOVE THIS: Sample valid https link (Open + Copy + domain)
    if (index % 3 === 0) {
      return "https://www.lazada.com.ph/products/unregistered-skin-whitening-cream-i123456789.html";
    }
    // ⚠️ REMOVE THIS: Sample non-http javascript: test value (plain text, no Open button)
    if (index % 3 === 1) {
      return "javascript:alert('malicious_xss_test')";
    }
    // ⚠️ REMOVE THIS: Sample very long https URL with a long query string to test wrapping
    return "https://shopee.ph/product-listing-unregistered-fda-cosmetic-special-formula-intensive-skin-revitalizing-serum-v2?sp_atk=89a7b6c5-4d3e-2f1a-0b9c-8d7e6f5a4b3c&xptdk=e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b&source_tracker=organic_search_desktop_consumer_feed_campaign_philippines_2026_investigation";
  }
  // When flag is false, read the PROPOSED key product_url
  return complaint.product_url || null;
}

function FdaStatus() {
  const [complaints, setComplaints] = useState([]);
  const [statusHistory, setStatusHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Left panel: search + filter + pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [isCaseFilterOpen, setIsCaseFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [casePage, setCasePage] = useState(1);

  const [selectedComplaintId, setSelectedComplaintId] = useState(null);

  // Search + status filter combined
  const isSearchOrFilterActive = searchQuery.trim() !== "" || filterStatus !== "All";
  // ADDED — Show sample case at display time ONLY when fetched complaints is empty and no search/filter is active
  const shouldShowSampleCase = USE_STATUS_SAMPLE_CASE_MOCK && complaints.length === 0 && !isSearchOrFilterActive;
  const displayComplaints = shouldShowSampleCase ? [STATUS_SAMPLE_CASE_MOCK] : complaints;

  // ADDED — Resolve active selection: selects the sample case if shouldShowSampleCase and no explicit selection
  const activeSelectedId = selectedComplaintId || (shouldShowSampleCase ? STATUS_SAMPLE_CASE_MOCK.complaintId : null);
  const selectedComplaint =
    displayComplaints.find((c) => c.complaintId === activeSelectedId) || null;
  const isSampleCase = selectedComplaint?.complaintId === "mock-sample-case";

  // Draft form state (right panel)
  const [newStatus, setNewStatus] = useState("");
  const [dismissPreset, setDismissPreset] = useState("");
  const [dismissNote, setDismissNote] = useState("");

  // Optional evidence attachment — mirrors the extension's own attach flow
  // (base64 data URL + filename), so the backend can decode it the same way.
  // const [attachmentFile, setAttachmentFile] = useState(null);
  // const [attachmentPreview, setAttachmentPreview] = useState(null);
  // const [attachmentName, setAttachmentName] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState(null);
  const [attachmentFailed, setAttachmentFailed] = useState(false);
  const [showAttachmentPreview, setShowAttachmentPreview] = useState(false);
  // const [attachmentSizeDisplay, setAttachmentSizeDisplay] = useState(null);

  const [historyPage, setHistoryPage] = useState(1);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toastError, setToastError] = useState(null);
  const [toastVariant, setToastVariant] = useState("danger");

  // ADDED — Copy link feedback state & cleanup ref
  const [copiedProductLink, setCopiedProductLink] = useState(false);
  const copyTimerRef = useRef(null);

  // ADDED — Reset copied state & clear timer when selected complaint changes
  useEffect(() => {
    setCopiedProductLink(false);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [selectedComplaintId]);

  // ADDED — Clean up copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  // ADDED — Safe copy handler with try/catch and 2s timeout
  const handleCopyProductLink = async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedProductLink(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedProductLink(false);
        copyTimerRef.current = null;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  useEffect(() => {
    if (!toastError) return;
    const duration = toastVariant === "warning" ? 8000 : toastVariant === "success" ? 5000 : 4000;
    const timer = setTimeout(() => {
      setToastError(null);
    }, duration);
    return () => clearTimeout(timer);
  }, [toastError, toastVariant]);

  const ALLOWED_TRANSITIONS = {
    open: ["under_review", "takedown_requested", "completed", "dismissed"],
    under_review: ["takedown_requested", "completed", "dismissed"],
    takedown_requested: ["completed", "dismissed"],
  };

  function getAvailableStatusOptions(currentStatus) {
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    return STATUS_OPTIONS.filter((opt) => allowed.includes(opt.value));
  }

  // Fetch complaints from the backend 
  const fetchComplaints = useCallback(async (preserveSelection = true) => {
    try {
      const res = await apiFetch("/complaints-status-update");
      if (!res.ok) throw new Error("Failed to load complaints");
      const data = await res.json();
      setComplaints(data);
      if (!preserveSelection && data.length > 0) {
        setSelectedComplaintId((prev) => prev || data[0].complaintId);
      }
      return data;
    }  catch (err) {
      setToastVariant("danger");
      setToastError("Could not load complaints. Please refresh.");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints(false);
  }, [fetchComplaints]);

  useEffect(() => {
    if (!selectedComplaint) return;
    setNewStatus("");
    setDismissPreset("");
    setDismissNote("");
    // setAttachmentFile(null);
    // setAttachmentPreview(null);
    // setAttachmentName(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComplaintId, selectedComplaint?.status]);

  useEffect(() => {
    // ADDED — Guard: never fetch attachment for mock sample case
    if (!selectedComplaint?.hasAttachment || isSampleCase) {
      setAttachmentUrl(null);
      setAttachmentFailed(false);
      return;
    }

    let objectUrl = null;
    let cancelled = false;

  const loadAttachment = async () => {
    try {
      const res = await apiFetch(`/complaints/${selectedComplaint.complaintId}/attachment`);
      if (!res.ok) {
        setAttachmentFailed(true);
        return;
      }
      setAttachmentFailed(false);

      const blob = await res.blob();
      if (cancelled) return;
      
      objectUrl = URL.createObjectURL(blob);
      setAttachmentUrl(objectUrl);
    } catch (err) {
      console.error("Failed to load attachment:", err);
      setAttachmentFailed(true);
    }
  };
  loadAttachment();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedComplaintId]);

  // Search + status filter combined over displayComplaints
  const filteredComplaints = displayComplaints.filter((c) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      (c.caseReference || "").toLowerCase().includes(query) ||
      (c.productTitle || "").toLowerCase().includes(query) ||
      (c.manufacturer || "").toLowerCase().includes(query);
    const matchesStatus = filterStatus === "All" || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Case list pagination
  const totalCasePages = Math.ceil(filteredComplaints.length / CASES_PER_PAGE) || 1;
  const safeCasePage = Math.min(Math.max(1, casePage), totalCasePages);
  const caseStart = (safeCasePage - 1) * CASES_PER_PAGE;
  const pagedComplaints = filteredComplaints.slice(caseStart, caseStart + CASES_PER_PAGE);

  const getOutgoingMessage = () => {
    if (newStatus === "completed") return COMPLETED_MESSAGE;
    if (newStatus === "dismissed") return dismissNote || dismissPreset;
    return null;
  };

  // ADDED — Display-time product link resolution
  const resolvedProductLink = getMockProductLink(selectedComplaint, displayComplaints);
  const hasProductLink = Boolean(resolvedProductLink && resolvedProductLink.trim());
  const isHttpUrl = Boolean(resolvedProductLink && /^https?:\/\//i.test(resolvedProductLink.trim()));

  let urlDomain = "";
  if (isHttpUrl) {
    try {
      const parsed = new URL(resolvedProductLink.trim());
      urlDomain = parsed.hostname;
    } catch {
      urlDomain = "";
    }
  }

  // Same read approach as the extension's attach box — FileReader to a
  // base64 data URL, so it can be sent as a plain JSON string field.
  // const handleAttachmentChange = (e) => {
  //   const file = e.target.files[0];
  //   if (!file) return;

  //   // setAttachmentFile(file);
  //   setAttachmentName(file.name);

  //   const reader = new FileReader();
  //   reader.onload = () => {
  //     setAttachmentPreview(reader.result);
  //   };
  //   reader.readAsDataURL(file);
  // };

  // const handleRemoveAttachment = () => {
  //   // setAttachmentFile(null);
  //   setAttachmentPreview(null);
  //   setAttachmentName(null);
  // };

  const handlePushUpdate = async () => {
    if (!selectedComplaint || isSampleCase) return;

    if (!newStatus) {
      setToastVariant("danger");
      setToastError("Please select a status before pushing an update.");
      return;
    }

    if (newStatus === selectedComplaint.status) {
      setToastVariant("warning");
      setToastError("Please select a different status before pushing an update.");
      return;
    }

    const outgoingMessage = getOutgoingMessage();
    if (newStatus === "dismissed" && !outgoingMessage) {
      setToastVariant("danger");
      setToastError("Please choose or write a reason for dismissing this complaint.");
      return;
    }

    if (outgoingMessage && outgoingMessage.length > 500) {
      setToastVariant("danger");
      setToastError("Dismissal reason must be 500 characters or fewer.");
      return;
    }

    // const previousStatus = selectedComplaint.status;

    // setComplaints((prev) =>
    //   prev.map((c) =>
    //     c.complaintId === selectedComplaint.complaintId
    //       ? { ...c, status: newStatus }
    //       : c
    //   )
    // );

    // const entry = {
    //   historyId: `h${Date.now()}`,
    //   caseReference: selectedComplaint.caseReference,
    //   productTitle: selectedComplaint.productTitle,
    //   previousStatus,
    //   newStatus,
    //   changeNote: outgoingMessage || "",
    //   changedBy: "fda.admin", // TODO: replace once auth is wired up
    //   changedAt: new Date().toLocaleString(),
    // };
    // setStatusHistory((prev) => [entry, ...prev]);
    // setHistoryPage(1);

    // send update status to the backend
    try {
        const res = await apiFetch(`/complaints/${selectedComplaint.complaintId}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status: newStatus,
            change_note: outgoingMessage,
            // Optional — null when no file was attached. Backend needs to
            // accept these two fields; see fda-status.jsx attachment notes.
            // attachment_data: attachmentPreview,
            // attachment_name: attachmentName,
          }),
        });
  
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));

          let message;
          if (typeof err.detail === "string") {
            message = err.detail;
          } else if (Array.isArray(err.detail)) {
            // FastAPI 422 validation errors
            message = err.detail.map((d) => d.msg).join("; ");
          } else if (res.status >= 500) {
            message = "Something went wrong on the server. Please refresh and check the complaint's status before trying again.";
          } else {
            message = "Failed to update status. Please try again.";
          }

          setToastVariant("danger");
          setToastError(err.detail || "Failed to update status. Please try again.");
          await fetchComplaints(true);
          return;
        }
  
        const updatedComplaint = await res.json();
        const previousStatus = selectedComplaint.status;
  
        setComplaints((prev) =>
          prev.map((c) =>
            c.complaintId === selectedComplaint.complaintId
              ? { ...c, status: updatedComplaint.status }
              : c
          )
        );
          // Re-fetch complaints list to synchronize true server state
        await fetchComplaints(true);

        const nextStatus =
          updatedComplaint.status === "open" ? "under_review" : updatedComplaint.status;
        setNewStatus(nextStatus);
        setDismissPreset("");
        setDismissNote("");

        if (updatedComplaint.notificationWarning) {
          setToastVariant("warning");
          setToastError(updatedComplaint.notificationWarning);
        } else {
          const label = STATUS_LABELS[updatedComplaint.status];
          setToastVariant("success");
          setToastError(
            selectedComplaint.reporterEmail
              ? `${selectedComplaint.caseReference} updated to "${label}". The consumer has been notified.`
              : `${selectedComplaint.caseReference} updated to "${label}". No email on file, so no email was sent.`
          );
        }

      const entry = {
        historyId: `h${Date.now()}`,
        caseReference: selectedComplaint.caseReference,
        productTitle: selectedComplaint.productTitle,
        previousStatus,
        newStatus,
        changeNote: outgoingMessage || "",
        changedBy: "current desktop user",
        changedAt: new Date().toLocaleString(),
      };
      setStatusHistory((prev) => [entry, ...prev]);
      setHistoryPage(1);
      // setAttachmentFile(null);
      // setAttachmentPreview(null);
      // setAttachmentName(null);
    } catch (err) {
      console.error("Push update failed:", err);
      setToastVariant("danger");
      setToastError(
        err instanceof TypeError
          ? "Network error — please check your connection and try again."
          : "Something went wrong while updating. Please refresh and check the complaint's status."
      );
    }
  };

  const totalHistoryPages = Math.ceil(statusHistory.length / HISTORY_PER_PAGE) || 1;
  const safeHistoryPage = Math.min(Math.max(1, historyPage), totalHistoryPages);
  const historyStart = (safeHistoryPage - 1) * HISTORY_PER_PAGE;
  const pagedHistory = statusHistory.slice(historyStart, historyStart + HISTORY_PER_PAGE);
 
  // if (isLoading) {
  //   return (
  //     <div className="FdaDashboardMain">
  //       <Sidebar sidebarType="FDA" />
  //       <div className="FdaContentContainer">
  //         <TopBar topbarType="FDA" />
  //         <div className="FdaMainFeed">Loading complaints...</div>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="FdaDashboardMain">
      <Sidebar sidebarType="FDA" />
      <div className="FdaContentContainer">
        <TopBar topbarType="FDA" />
        <div className="FdaMainFeed">

          <div className="FdaHeader">
            <div className="FdaHeaderLeft">
              <p className="FdaEyebrow">FDA · Consumer Communications</p>
              <h1 className="FdaHeaderTitle">Status updates & notifications</h1>
              <p className="FdaSubtitle">
                Update a complaint's progress, push it to the consumer's browser extension, and notify the original reporter.
              </p>
            </div>
          </div>

          <div className="FdaStatusGrid">
            {/* LEFT: complaint list */}
            <div className="FdaCaseListPanel">
              {isLoading ? (
                <div className="FdaCaseListEmpty" style={{ padding: "24px 16px" }}>
                  Loading complaints…
                </div>
              ) : (
                <>
                <div className="FdaCaseListSearch">
                  <div className="FdaCaseListControls">
                    <div className="FdaSearchWrapper">
                      <Search size={16} className="FdaSearchIcon" />
                      <input
                        type="text"
                        placeholder="Search case ID or product..."
                        className="FdaSearchInput"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCasePage(1);
                        }}
                      />
                    </div>
                    <button
                      className={`BtnFilters ${isCaseFilterOpen ? "active" : ""}`}
                      onClick={() => setIsCaseFilterOpen(!isCaseFilterOpen)}
                      title="Filter by status"
                    >
                      <Filter size={16} />
                    </button>
                  </div>

                  {isCaseFilterOpen && (
                    <div className="FdaFilterGroup FdaCaseListFilterPanel">
                      <label>Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => {
                          setFilterStatus(e.target.value);
                          setCasePage(1);
                        }}
                      >
                        {CASE_FILTER_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="FdaCaseList">
                  {pagedComplaints.length === 0 ? (
                    <div className="FdaCaseListEmpty">No complaints match your search or filter.</div>
                  ) : (
                    pagedComplaints.map((c) => (
                      <button
                        key={c.complaintId}
                        className={`FdaCaseCard ${c.complaintId === selectedComplaint?.complaintId ? "active" : ""}`}
                        onClick={() => setSelectedComplaintId(c.complaintId)}
                      >
                        <div className="FdaCaseCardTop">
                          <span className="FdaCaseCardId">{c.caseReference}</span>
                          {c.complaintId === "mock-sample-case" && (
                            <span className="FdaVerifMockBadge">Sample case (mockup)</span>
                          )}
                          <span className="FdaBadge" style={getStatusBadgeStyle(c.status)}>
                            {STATUS_LABELS[c.status]}
                          </span>
                        </div>
                        <div className="FdaCaseCardTitle">{c.productTitle}</div>
                        <div className="FdaCaseCardSub">{c.manufacturer} · {c.region}</div>
                      </button>
                    ))
                  )}
                </div>

                {filteredComplaints.length > 0 && (
                  <div className="FdaCaseListFooter">
                    <span className="FdaFooterInfo">
                      Showing {caseStart + 1}–{Math.min(caseStart + CASES_PER_PAGE, filteredComplaints.length)} of {filteredComplaints.length}
                    </span>
                    <div className="FdaPagination">
                      <button
                        className="BtnPageNav"
                        disabled={safeCasePage === 1}
                        onClick={() => setCasePage(safeCasePage - 1)}
                      >
                        <ChevronLeft size={14} />
                        Prev
                      </button>
                      {Array.from({ length: totalCasePages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          className={`FdaPageNumber ${safeCasePage === page ? "active" : ""}`}
                          onClick={() => setCasePage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        className="BtnPageNav"
                        disabled={safeCasePage === totalCasePages}
                        onClick={() => setCasePage(safeCasePage + 1)}
                      >
                        Next
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>

            {/* RIGHT: selected complaint detail + form */}
            <div className="FdaDetailPanel">
              {!selectedComplaint ? (
                <div className="FdaVerifEmptyDetails">
                  <Mail size={44} className="FdaVerifEmptyDetailsIcon" />
                  <h3>No Complaint Selected</h3>
                  <p>Select a complaint from the left list to review details and push a status update.</p>
                </div>
              ) : (
                <>
                  {!selectedComplaint.reporterEmail && (
                    <div className="FdaNoticeBanner" style={{ marginTop: 16, marginBottom: 10 }}>
                      <Mail size={18} />
                      <div className="FdaNoticeBannerText">
                        This complaint has no email on file (likely a submission from deleted account).
                        The consumer will not receive an email notification when you push this update.
                      </div>
                    </div>

                  )}

                  <div className="FdaDetailPanelHeader">
                    <div>
                      <small>
                        {selectedComplaint.caseReference}
                        {isSampleCase && (
                          <span className="FdaVerifMockBadge FdaStatusSampleBadge">
                            Sample case (mockup)
                          </span>
                        )}
                      </small>
                      <h2>{selectedComplaint.productTitle}</h2>
                      <p>{selectedComplaint.manufacturer} · {selectedComplaint.region}</p>
                    </div>
                    <div>
                      <small style={{ display: "block", marginBottom: 6, textAlign: "right" }}>Current</small>
                      <span className="FdaBadge" style={getStatusBadgeStyle(selectedComplaint.status)}>
                        {STATUS_LABELS[selectedComplaint.status]}
                      </span>
                    </div>
                  </div>

                  {/* ADDED — PROPOSED: Product Link directly under case header for extension cases */}
                  {hasProductLink && (
                    <div className="FdaStatusProductLinkWrap">
                      <div className="FdaStatusProductLinkCard">
                        <div className="FdaStatusProductLinkHeader">
                          <div className="FdaStatusProductLinkTitleGroup">
                            <Globe size={16} className="FdaVerifBlueIcon" />
                            <h3 className="FdaStatusProductLinkTitle">Reported Product Link</h3>
                            {USE_PRODUCT_LINK_MOCK && (
                              <span className="FdaVerifMockBadge">Mock preview</span>
                            )}
                          </div>
                          {urlDomain && (
                            <span className="FdaStatusProductLinkDomain">
                              {urlDomain}
                            </span>
                          )}
                        </div>

                        <div className="FdaStatusProductLinkBody">
                          <div className="FdaStatusProductLinkUrlBox">
                            <span className="FdaStatusProductLinkText" title={resolvedProductLink}>
                              {resolvedProductLink}
                            </span>
                          </div>

                          <div className="FdaStatusProductLinkActions">
                            {isHttpUrl && (
                              <a
                                href={resolvedProductLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="FdaStatusProductLinkBtn FdaStatusProductLinkBtn_open"
                                title="Open product link in new tab"
                              >
                                <ExternalLink size={13} />
                                <span>Open link</span>
                              </a>
                            )}
                            <button
                              type="button"
                              className="FdaStatusProductLinkBtn"
                              onClick={() => handleCopyProductLink(resolvedProductLink)}
                              title="Copy link to clipboard"
                            >
                              {copiedProductLink ? (
                                <>
                                  <Check size={13} className="FdaStatusProductLinkCopiedIcon" />
                                  <span className="FdaStatusProductLinkCopiedText">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={13} />
                                  <span>Copy link</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                {FINAL_STATUSES.includes(selectedComplaint.status) ? (
                  <div className="FdaNoticeBanner" style={{ marginTop: 16 }}>
                    <ShieldCheck size={18} />
                    <div className="FdaNoticeBannerText">
                      This complaint is marked as {STATUS_LABELS[selectedComplaint.status]} and is final —
                      its status can no longer be changed.
                    </div>
                  </div>
                ) : (
                  <>
                  <div className="FdaFormRow">
                    <div className="FdaFormGroup">
                      <label>New status</label>
                      {isSampleCase && (
                        <div className="FdaStatusSampleNotice">
                          Sample case: updates are disabled.
                        </div>
                      )}
                      <select
                        className="FdaStatusSelect"
                        style={{ width: "100%" }}
                        value={newStatus}
                        disabled={isSampleCase}
                        onChange={(e) => setNewStatus(e.target.value)}
                      >
                        <option value="" disabled>
                          {STATUS_LABELS[selectedComplaint.status]}
                        </option>
                        {getAvailableStatusOptions(selectedComplaint.status).map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="FdaFormGroup">
                      <label>Reporter on record</label>
                      <div className="FdaReporterField">
                        <Mail size={14} />
                        {selectedComplaint.reporterUsername} · {selectedComplaint.reporterEmail}
                      </div>
                    </div>
                  </div>

                  <div className="FdaFormGroup" style={{ marginBottom: 18 }}>
                    <div className="FdaVerifSectionCard">
                      <div className="FdaVerifSectionHeader">
                        <Paperclip size={16} className="FdaVerifBlueIcon" />
                        <h3>Evidence Attached by Consumer</h3>
                      </div>
                      <div className="FdaVerifDocsGrid">
                        {selectedComplaint.hasAttachment && attachmentUrl ? (
                          <div className="FdaVerifDocCard">
                            <div className="FdaVerifDocIcon">
                              <ImageIcon size={18} />
                            </div>
                            <div className="FdaVerifDocInfo">
                              <p className="FdaVerifDocName">{selectedComplaint.attachmentName || "Screenshot"}</p>
                              {/* <span className="FdaVerifDocMeta">{attachmentSizeDisplay}</span> */}
                            </div>
                            <div className="FdaVerifDocActions">
                              <button
                                className="FdaVerifDocActionBtn"
                                title="Inspect Attachment"
                                onClick={() => setShowAttachmentPreview(true)}
                              >
                                <Eye size={13} />
                              </button>
                            </div>
                          </div>
                        ) : attachmentFailed ? (
                            <p className="FdaVerifNoDocsText">Couldn't load this attachment.</p>
                        ) : selectedComplaint.hasAttachment ? (
                            <p className="FdaVerifNoDocsText">Loading attachment&hellip;</p>
                        ) : (
                          <p className="FdaVerifNoDocsText">No evidence documents attached to this complaint.</p>
                        )}
                      </div>
                    </div>

                        {showAttachmentPreview && attachmentUrl && (
                          <div className="FdaVerifModalOverlay" role="dialog" aria-modal="true">
                            <div className="FdaVerifDocModalContainer">
                              <div className="FdaVerifDocModalHeader">
                                <div className="FdaVerifDocModalTitleGroup">
                                  <Paperclip size={18} className="FdaVerifGreenIcon" />
                                  <div>
                                    <h3>{selectedComplaint.attachmentName || "Attached evidence"}</h3>
                                  </div>
                                </div>
                                <button className="FdaVerifIconButton" onClick={() => setShowAttachmentPreview(false)}>
                                  <X size={18} />
                                </button>
                              </div>

                              <div className="FdaVerifDocModalBody">
                                <img
                                  src={attachmentUrl}
                                  alt={selectedComplaint.attachmentName || "Complaint evidence"}
                                  className="FdaVerifDocImagePreview"
                                />
                              </div>

                              <div className="FdaVerifModalFooter">
                                <button className="FdaVerifBtnOutline" onClick={() => setShowAttachmentPreview(false)}>
                                  Close Preview
                                </button>
                                <button
                                  className="FdaVerifBtnDownloadAttachment"
                                  onClick={() => {
                                    const a = document.createElement("a");
                                    a.href = attachmentUrl;
                                    a.download = selectedComplaint.attachmentName || "evidence";
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

                      {newStatus === "completed" && (
                        <div className="FdaCompletedNotice">{COMPLETED_MESSAGE}</div>
                      )}

                      {newStatus === "dismissed" && (
                        <div className="FdaMessageBox">
                          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(31,41,55,0.6)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                            Reason for dismissal
                          </label>
                          <select
                            value={dismissPreset}
                            onChange={(e) => {
                              setDismissPreset(e.target.value);
                              setDismissNote(e.target.value);
                            }}
                          >
                            <option value="">Choose a common reason (optional)...</option>
                            {DISMISS_PRESETS.map((reason) => (
                              <option key={reason} value={reason}>{reason}</option>
                            ))}
                          </select>
                          <textarea
                            placeholder="Write or edit the reason the consumer will see..."
                            value={dismissNote}
                            onChange={(e) => setDismissNote(e.target.value)}
                            maxLength={500}
                          />
                          <div
                            style={{
                              fontSize: 11,
                              textAlign: "right",
                              marginTop: 4,
                              color: dismissNote.length >= 500 ? "#B91C1C" : "rgba(31,41,55,0.5)",
                            }}
                          >
                            {dismissNote.length}/500
                          </div>
                        </div>
                      )}

                      <div className="FdaNoticeBanner">
                        <BellRing size={18} />
                        <div className="FdaNoticeBannerText">
                          Pushing this update automatically syncs it to the consumer's browser extension
                          and sends them an in-app + email notification. This isn't optional per update.
                        </div>
                      </div>

                  <div className="FdaNotificationPreview">
                    <label>Notification preview</label>
                    <div className="FdaNotifPreviewCard">
                      <div className="FdaNotifPreviewIcon"><ShieldCheck size={16} /></div>
                      <div>
                        <div className="FdaNotifPreviewTop">
                          <strong>FDA Complaint Update</strong>
                          <span className="FdaBadge" style={getStatusBadgeStyle(newStatus)}>
                            {STATUS_LABELS[newStatus] || "No status selected"}
                          </span>
                        </div>
                        <div className="FdaNotifPreviewMeta">
                          {selectedComplaint.productTitle} · {selectedComplaint.caseReference}
                        </div>
                        <div className="FdaNotifPreviewMsg">
                          {!newStatus
                            ? "Select a status above to preview the notification message."
                            : getOutgoingMessage() ||
                              `Your report has been received and is now marked as "${STATUS_LABELS[newStatus]}".`}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="FdaPushRow">
                    <button
                      className="BtnPushUpdate"
                      disabled={isSampleCase}
                      onClick={() => {
                        if (!selectedComplaint || isSampleCase) return;
                        
                        if (!newStatus) {
                          setToastVariant("danger");
                          setToastError("Please select a status before pushing an update.");
                          return;
                        }

                        if (newStatus === selectedComplaint.status) {
                          setToastVariant("danger");
                          setToastError("Please select a different status before pushing an update.");
                          return;
                        }

                        const outgoingMessage = getOutgoingMessage();
                        if (newStatus === "dismissed" && !outgoingMessage) {
                          setToastVariant("danger");
                          setToastError("Please choose or write a reason for dismissing this complaint.");
                          return;
                        }
                        
                        if (outgoingMessage && outgoingMessage.length > 500) {
                          setToastVariant("danger");
                          setToastError("Dismissal reason must be 500 characters or fewer.");
                          return;
                        }

                        setToastError(null);
                        setToastVariant("danger");
                        setShowConfirmModal(true);
                      }}
                    >
                      <Send size={15} />
                      Push update
                    </button>
                  </div>
                </>
                )}
              </>
              )}
            </div>
          </div>

          {/* RECENT STATUS PUSHES */}
          <div className="FdaHistorySection">
            <div className="FdaHistoryTitle">Recent status pushes</div>

            {pagedHistory.map((entry) => (
              <div className="FdaHistoryItem" key={entry.historyId}>
                <div className="FdaHistoryIcon"><ShieldCheck size={14} /></div>
                <div>
                  <div className="FdaHistoryTop">
                    <strong>{entry.productTitle}</strong>
                    <span className="FdaBadge" style={getStatusBadgeStyle(entry.newStatus)}>
                      {STATUS_LABELS[entry.newStatus]}
                    </span>
                  </div>
                  {entry.changeNote && <div className="FdaHistoryNote">{entry.changeNote}</div>}
                  <div className="FdaHistoryMeta">
                    <span>{entry.caseReference}</span>
                    <span>by {entry.changedBy}</span>
                    <span>{entry.changedAt}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="FdaTableFooter">
              <span className="FdaFooterInfo">
                Showing {statusHistory.length === 0 ? 0 : historyStart + 1}-
                {Math.min(historyStart + HISTORY_PER_PAGE, statusHistory.length)} of {statusHistory.length}
              </span>
              <div className="FdaPagination">
                <button
                  className="BtnPageNav"
                  disabled={safeHistoryPage === 1}
                  onClick={() => setHistoryPage(safeHistoryPage - 1)}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                {Array.from({ length: totalHistoryPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    className={`FdaPageNumber ${safeHistoryPage === page ? "active" : ""}`}
                    onClick={() => setHistoryPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="BtnPageNav"
                  disabled={safeHistoryPage === totalHistoryPages}
                  onClick={() => setHistoryPage(safeHistoryPage + 1)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* CONFIRMATION MODAL */}
          {showConfirmModal && selectedComplaint && !isSampleCase && (
            <div className="FdaVerifModalOverlay" role="dialog" aria-modal="true">
              <div className="FdaVerifModalContainer" style={{ maxWidth: "480px" }}>
                <div className="FdaVerifModalHeader">
                  <div className="FdaVerifModalIconWrap FdaVerifModalIcon_submit">
                    <Send size={20} />
                  </div>
                  <div>
                    <h3 className="FdaVerifModalTitle">Confirm Status Update</h3>
                    <p className="FdaVerifModalDesc">
                      Please review the details before pushing this update.
                    </p>
                  </div>
                </div>

                <div style={{ margin: "16px 0", display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #EDEDED", paddingBottom: "8px" }}>
                    <span style={{ color: "#6B7280", fontWeight: 500 }}>Case ID</span>
                    <span style={{ fontWeight: 600, color: "#111827" }}>{selectedComplaint.caseReference}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #EDEDED", paddingBottom: "8px" }}>
                    <span style={{ color: "#6B7280", fontWeight: 500 }}>Product Name</span>
                    <span style={{ fontWeight: 600, color: "#111827" }}>{selectedComplaint.productTitle}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #EDEDED", paddingBottom: "8px" }}>
                    <span style={{ color: "#6B7280", fontWeight: 500 }}>New Status</span>
                    <span className="FdaBadge" style={getStatusBadgeStyle(newStatus)}>
                      {STATUS_LABELS[newStatus] || "No status selected"}
                    </span>
                  </div>
                </div>

                <div className="FdaNoticeBanner" style={{ marginBottom: "16px" }}>
                  <BellRing size={16} />
                  <div className="FdaNoticeBannerText" style={{ fontSize: "12px" }}>
                    Pushing this update will sync it to the consumer's email notification.
                  </div>
                </div>

                <div className="FdaVerifModalFooter">
                  <button
                    type="button"
                    className="FdaVerifBtnModalCancel"
                    onClick={() => setShowConfirmModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="FdaVerifBtnModalConfirm FdaVerifBtnModal_primary"
                    onClick={() => {
                      setShowConfirmModal(false);
                      handlePushUpdate();
                    }}
                  >
                    Confirm / Push Update
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FLOATING TOAST ALERT NOTIFICATION */}
          {toastError && (
            <div
              className={`FdaVerifToastAlert FdaVerifToast_${toastVariant}`}
              role="alert"
            >
              <div className="FdaVerifToastIconWrap">
                {toastVariant === "success" && <ShieldCheck size={18} />}
                {toastVariant === "warning" && <BellRing size={18} />}
                {toastVariant === "danger" && <XCircle size={18} />}
              </div>
              <div className="FdaVerifToastBody">
                <p className="FdaVerifToastMessage">{toastError}</p>
              </div>
              <button
                className="FdaVerifToastCloseBtn"
                onClick={() => setToastError(null)}
                aria-label="Close notification"
              >
                <X size={14} />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default FdaStatus;