// merged lea-save-drafts.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './lea-css.css';
import Sidebar from '../component/sidebar';
import TopBar from '../component/top-bar';
import { PenLine, Trash2, Info, Eye, MoreVertical, X, Inbox } from 'lucide-react';
import { apiFetch } from '../../utils/apiFetch';

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
  // Filtering and sorting — still done client-side, on the real
  // fetched data now instead of the mock array
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
      // Formats the date the same readable way it's displayed in the
      // table, so searching "August" or a specific date actually matches
      // what the officer sees on screen
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

          {/* MERGED-CHANGED — re-added the DraftsFilterLeft / DraftsFilterRight wrapper divs from the
                        design source. lea-css.css's @media (max-width: 768px) rules target these exact classes
                        to stack search left / filters right responsively — without the wrappers here, that
                        responsive behavior has nothing to apply to. Target's real filter values/handlers are
                        unchanged, just re-grouped into the two wrappers, and the Clear Filters button (target's
                        own addition) now sits inside DraftsFilterRight alongside the dropdowns. */}
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

                {/* Change 1 — icon-only Clear Filters button (X icon, no text label) */}
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

          {/* MERGED-CHANGED — Total Drafts moved outside the DraftsFilterSection box, to match the
                        Dismissed Cases "Total Cases" placement for uniformity across both pages: its own line,
                        outside the filter panel's bordered/padded container, not nested inside it. */}
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

      {/* ADDED — View Draft Modal (read-only), same modal classes as the delete confirm modal */}
      {viewModalData && (
        <div className='ModalOverlay'>
          <div className='ModalBox' style={{ width: '580px', maxWidth: '90vw' }}>
            <h3>Draft Details</h3>
            <p><strong>Type:</strong> {GetDraftTypeLabel(viewModalData.draft_type)}</p>
            <p><strong>Product Category:</strong> {viewModalData.product_category}</p>
            <p><strong>Product Name:</strong> {viewModalData.product_name}</p>
            <p><strong>Complainant:</strong> {viewModalData.complainant_name}</p>
            <p><strong>Last Edited:</strong> {new Date(viewModalData.updated_at).toLocaleString()}</p>
            <p><strong>Saved By:</strong> {viewModalData.saved_by_name || 'You'}</p>
            <p><strong>Status:</strong> {viewModalData.draft_status === 'draft' ? 'Draft' : 'Incomplete'}</p>
            <div className='ModalActions'>
              <button className='BtnCancelModal' onClick={() => setViewModalData(null)}>Close</button>
            </div>
          </div>
        </div>
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
