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
} from "lucide-react";
import { apiFetch } from "../../utils/apiFetch";


// CHANGED — was a client-side page size of 5; now 10 to match the server's
// default page_size sent in every GET /drafts/fda-verification/ request.
const ITEMS_PER_PAGE = 25;

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
                CHANGED — no longer requires a separate detail fetch. The list response
                already contains all fields the modal displays (case_reference, product_name,
                manufacturer, product_category, draft_status), so setViewModalData(draft)
                is called directly with the row object. Field names updated throughout:
                viewModalData.caseId       → viewModalData.case_reference
                viewModalData.product      → viewModalData.product_name
                viewModalData.category     → viewModalData.product_category
                viewModalData.lastModified → formatDate(viewModalData.updated_at)
                SOURCE row removed entirely — no source field in real draft data.
                DRAFT STATUS badge reads the real draft_status value (not hardcoded "Draft"). */}
      {viewModalData && (
        <div className="FdaVerifModalOverlay">
          <div className="FdaRecordModalContainer" style={{ width: "700px", maxWidth: "96vw" }}>
            <div className="FdaRecordModalHeader">
              <div className="FdaRecordModalTitleGroup">
                <Eye size={20} className="FdaVerifGreenIcon" />
                <div>
                  <h3>Draft Summary</h3>
                  {/* CHANGED — was viewModalData.caseId • viewModalData.lastModified;
                                        now uses real field names and formats updated_at via formatDate(). */}
                  <p className="FdaRecordModalSubtitle">
                    {viewModalData.case_reference} &bull; Last modified{" "}
                    {formatDate(viewModalData.updated_at)}
                  </p>
                </div>
              </div>
              <button
                className="FdaVerifIconButton"
                onClick={() => setViewModalData(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="FdaRecordModalBody">
              <div className="FdaRecordInfoGrid">
                <div className="FdaRecordInfoItem">
                  <span className="FdaVerifInfoLabel">CASE ID</span>
                  {/* CHANGED — was viewModalData.caseId */}
                  <span className="FdaVerifInfoValueHighlight">
                    {viewModalData.case_reference}
                  </span>
                </div>
                <div className="FdaRecordInfoItem">
                  <span className="FdaVerifInfoLabel">PRODUCT NAME</span>
                  {/* CHANGED — was viewModalData.product */}
                  <span className="FdaVerifInfoValue">{viewModalData.product_name}</span>
                </div>
                <div className="FdaRecordInfoItem">
                  <span className="FdaVerifInfoLabel">MANUFACTURER</span>
                  {/* Unchanged field name — manufacturer is the same in both shapes. */}
                  <span className="FdaVerifInfoValue">{viewModalData.manufacturer}</span>
                </div>
                <div className="FdaRecordInfoItem">
                  <span className="FdaVerifInfoLabel">CATEGORY</span>
                  {/* CHANGED — was viewModalData.category */}
                  <span className="FdaVerifInfoValue">{viewModalData.product_category}</span>
                </div>
                {/* REMOVED — SOURCE row deleted. The real backend draft response
                                    has no source field, so this row no longer exists in either
                                    the table or the modal. */}
                <div className="FdaRecordInfoItem">
                  <span className="FdaVerifInfoLabel">DRAFT STATUS</span>
                  {/* CHANGED — was hardcoded <span>Draft</span>; now reads the
                                        real draft_status value from the backend and capitalizes it
                                        via capitalizeStatus() so "draft" → "Draft", "incomplete"
                                        → "Incomplete", etc. */}
                  <span className="FdaSavedDraftStatusBadge">
                    {capitalizeStatus(viewModalData.draft_status)}
                  </span>
                </div>
              </div>
            </div>

            <div className="FdaRecordModalFooter">
              <button
                className="FdaVerifBtnOutline"
                onClick={() => setViewModalData(null)}
              >
                Close
              </button>
              <button
                className="FdaBtnCloseModal"
                onClick={() => {
                  setViewModalData(null);
                  // CHANGED — handleContinueEditing now uses the real
                  // verification_request_id for navigation (see handler above).
                  handleContinueEditing(viewModalData);
                }}
              >
                Continue Editing
              </button>
            </div>
          </div>
        </div>
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