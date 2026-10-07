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
  Paperclip
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