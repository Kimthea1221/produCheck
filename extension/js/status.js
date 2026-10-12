// status.js
import { whenSessionReady, isUserLoggedIn, getComplaintStatus } from "../scripts/session.js";

const STAGE_ORDER = ['open', 'under_review', 'takedown_requested'];
const STAGE_LABELS = { open: 'OPEN', under_review: 'UNDER REVIEW', takedown_requested: 'REQUEST FOR TAKEDOWN' };
const STEP_LABELS = ['Open', 'Under Review', 'Request for Takedown'];

function renderComplaintCard(complaint) {
  const currentIndex = STAGE_ORDER.indexOf(complaint.stage);
  let trackHtml = '';

  STEP_LABELS.forEach((label, i) => {
    let circleClass = 'step-upcoming';
    let circleContent = i + 1;

    if (i < currentIndex) {
      circleClass = 'step-complete';
      circleContent = '✓';
    } else if (i === currentIndex) {
      circleClass = 'step-current';
      circleContent = i + 1;
    }

    trackHtml += `
      <div class="step">
        <div class="step-circle ${circleClass}">${circleContent}</div>
        <span class="step-label">${label}</span>
      </div>
    `;

    if (i < STEP_LABELS.length - 1) {
      const connectorClass = i < currentIndex ? 'connector-complete' : '';
      trackHtml += `<div class="step-connector ${connectorClass}"></div>`;
    }
  });

  const badgeClass = `badge-${complaint.stage.replace('_', '-')}`;

  return `
    <div class="status-card" id="status-card-${complaint.id}">
      <div class="status-card-top">
        <h3 class="status-product-name">${complaint.productName}</h3>
        <span class="status-badge ${badgeClass}">${STAGE_LABELS[complaint.stage]}</span>
      </div>
      <div class="progress-track">${trackHtml}</div>
      <p class="status-note">${complaint.note}</p>
      <span class="status-see-details"><a href="#" class="see-details-link" data-toggle-status-detail="${complaint.id}">See Details</a></span>
      <div class="status-item-detail hidden" id="status-detail-${complaint.id}">
        <p class="detail-row"><span class="detail-label">Platform:</span> ${complaint.platform}</p>
        <p class="detail-row"><span class="detail-label">Time:</span> ${complaint.time}</p>
        <p class="detail-row"><span class="detail-label">Link/URL:</span> ${complaint.link}</p>
        <p class="detail-row"><span class="detail-label">Store:</span> ${complaint.storeName}</p>
        ${complaint.description ? `<p class="detail-row"><span class="detail-label">Description:</span> ${complaint.description}</p>` : ''}
        ${complaint.attachment ? `<img src="${complaint.attachment}" class="attach-preview-img" alt="Attachment">` : ''}
      </div>
    </div>
  `;
}

async function renderComplaintStatusPage() {
  const emptyView = document.getElementById('status-empty-view');
  const populatedView = document.getElementById('status-populated-view');
  const emptyText = document.getElementById('status-empty-text-main');

  const isGuest = typeof isUserLoggedIn === 'function' ? !isUserLoggedIn() : false;

  if (isGuest) {
    if (emptyText) emptyText.innerHTML = 'No contents to show. <a href="auth.html" class="guest-notice-link">Sign in/up</a> for tracking.';
    if (emptyView) emptyView.classList.remove('hidden');
    if (populatedView) populatedView.classList.add('hidden');
    return;
  }

  let res;
  try {
    res = await getComplaintStatus();
  } catch (e) {
    console.error(e);
    return; 
  }

  const complaints = res.map(c => ({
      id: c.complaint_id,
      stage: c.new_status,
      productName: c.product_title,
      note: c.change_note || "",
      platform: c.platform,
      time: c.created_at,
      link: c.product_url,
      storeName: c.store_name,
      description: c.consumer_description
  }));

  if (!complaints || complaints.length === 0) {
    if (emptyText) emptyText.textContent = 'Complaint Status page is currently empty.';
    if (emptyView) emptyView.classList.remove('hidden');
    if (populatedView) populatedView.classList.add('hidden');
    return;
  }

  if (emptyView) emptyView.classList.add('hidden');
  if (populatedView) populatedView.classList.remove('hidden');
  const listEl = document.getElementById('status-list');
  if (listEl) listEl.innerHTML = complaints.map(renderComplaintCard).join('');

  document.querySelectorAll('[data-toggle-status-detail]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const detailEl = document.getElementById(`status-detail-${link.dataset.toggleStatusDetail}`);
      if (detailEl) detailEl.classList.toggle('hidden');
    });
  });

}

document.addEventListener('DOMContentLoaded', () => {
  whenSessionReady(() => {
    renderComplaintStatusPage();
  });
});