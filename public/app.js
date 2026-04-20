// ── State ──────────────────────────────────────────────────────────────────
let allProspects = [];
let currentProspect = null;

// ── Navigation ─────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`view-${view}`).classList.add('active');
    if (view === 'dashboard') loadDashboard();
  });
});

// ── Search ─────────────────────────────────────────────────────────────────
document.getElementById('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const industry = document.getElementById('s-industry').value;
  const location = document.getElementById('s-location').value;
  const companySize = document.getElementById('s-size').value;

  const btn = document.getElementById('search-btn');
  const label = document.getElementById('search-label');
  const spinner = document.getElementById('search-spinner');
  const status = document.getElementById('search-status');

  btn.disabled = true;
  label.textContent = 'Searching…';
  spinner.classList.remove('hidden');
  status.className = 'search-status info';
  status.classList.remove('hidden');
  status.textContent = `Running 5 web searches for ${industry} executives in Guatemala…`;

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ industry, location, companySize }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Search failed');

    status.className = 'search-status success';
    status.textContent = `Found ${data.found} prospects — ${data.added} new added (${data.total} total saved).`;

    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('results-title').textContent =
      `${data.prospects.length} New Prospects — ${industry}${location ? ' · ' + location : ''}`;

    renderCards(data.prospects, 'cards-container');
  } catch (err) {
    status.className = 'search-status error';
    status.textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
    label.textContent = 'Search Prospects';
    spinner.classList.add('hidden');
  }
});

// ── Render prospect cards ──────────────────────────────────────────────────
function renderCards(prospects, containerId) {
  const container = document.getElementById(containerId);
  if (!prospects.length) {
    container.innerHTML = '<p style="color:#6c757d;padding:1rem;">No new prospects found in this search. Try a different industry or location.</p>';
    return;
  }
  container.innerHTML = prospects.map(p => cardHTML(p)).join('');
}

function fitTag(score) {
  const s = score || 'Low';
  return `<span class="tag tag-fit-${s}">${s} Fit</span>`;
}

function statusTag(status) {
  const s = status || 'New';
  const cls = s.replace(/\s/g, '-');
  return `<span class="tag tag-status-${cls}">${s}</span>`;
}

function cardHTML(p) {
  const sourceLabel = p.linkedinUrl ? 'LinkedIn' : 'Source';
  return `
  <div class="card fit-${p.fitScore}" id="card-${p.id}">
    <div class="card-header">
      <div>
        <div class="card-name">${esc(p.name)}</div>
        <div class="card-title">${esc(p.title)}</div>
      </div>
      <div>${fitTag(p.fitScore)}</div>
    </div>
    <div class="card-company">${esc(p.company)}</div>
    <div class="card-meta">
      <span class="tag tag-industry">${esc(p.industry)}</span>
      ${statusTag(p.status)}
      ${p.companySizeEstimate ? `<span class="tag tag-industry">${esc(p.companySizeEstimate)}</span>` : ''}
    </div>
    ${p.snippet ? `<div class="card-snippet">${esc(p.snippet)}</div>` : ''}
    ${p.sourceUrl ? `<a href="${p.sourceUrl}" class="card-source" target="_blank" rel="noopener">${sourceLabel}: ${p.sourceUrl.replace(/^https?:\/\//, '').slice(0, 50)}</a>` : ''}
    <div class="card-actions">
      <button class="btn-sm btn-view" onclick="openModal('${p.id}')">View / Edit</button>
      <button class="btn-sm btn-enrich" onclick="enrichProspect('${p.id}', this)">Find More Info</button>
      <button class="btn-sm btn-delete" onclick="deleteProspect('${p.id}')">Remove</button>
    </div>
  </div>`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Enrich ─────────────────────────────────────────────────────────────────
async function enrichProspect(id, btn) {
  const original = btn.textContent;
  btn.textContent = 'Searching…';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/prospects/${id}/enrich`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    btn.textContent = 'Done!';
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);

    // Refresh modal if open
    if (currentProspect && currentProspect.id === id) {
      currentProspect.enrichmentSummary = data.summary;
      openModal(id);
    }
  } catch (err) {
    btn.textContent = 'Error';
    btn.disabled = false;
    alert('Enrichment failed: ' + err.message);
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────
async function deleteProspect(id) {
  if (!confirm('Remove this prospect?')) return;
  await fetch(`/api/prospects/${id}`, { method: 'DELETE' });
  document.getElementById(`card-${id}`)?.remove();
  allProspects = allProspects.filter(p => p.id !== id);
  renderTable();
}

// ── Modal ──────────────────────────────────────────────────────────────────
async function openModal(id) {
  if (!allProspects.length) await loadProspects();
  let p = allProspects.find(x => x.id === id);
  if (!p) {
    const res = await fetch('/api/prospects');
    allProspects = await res.json();
    p = allProspects.find(x => x.id === id);
  }
  if (!p) return;
  currentProspect = p;

  document.getElementById('modal-content').innerHTML = `
    <div class="modal-name">${esc(p.name)}</div>
    <div class="modal-title">${esc(p.title)} · ${esc(p.company)}</div>
    <div class="card-meta" style="margin-bottom:1rem;">
      ${fitTag(p.fitScore)}
      ${statusTag(p.status)}
      <span class="tag tag-industry">${esc(p.industry)}</span>
      ${p.companySizeEstimate ? `<span class="tag tag-industry">${esc(p.companySizeEstimate)}</span>` : ''}
    </div>

    ${p.sourceUrl ? `<a href="${p.sourceUrl}" target="_blank" rel="noopener" class="card-source" style="margin-bottom:0.5rem;display:block;">${p.linkedinUrl ? 'LinkedIn' : 'Source'}: ${p.sourceUrl}</a>` : ''}

    ${p.enrichmentSummary ? `
    <div class="modal-section">
      <h4>Research Summary</h4>
      <div class="modal-enrichment">${p.enrichmentSummary}</div>
    </div>` : ''}

    <div class="modal-section">
      <h4>Status</h4>
      <select class="status-select" id="modal-status" onchange="updateField('${p.id}', 'status', this.value)">
        <option ${p.status==='New'?'selected':''}>New</option>
        <option ${p.status==='Contacted'?'selected':''}>Contacted</option>
        <option ${p.status==='Not a fit'?'selected':''}>Not a fit</option>
        <option ${p.status==='Member'?'selected':''}>Member</option>
      </select>
    </div>

    <div class="modal-section">
      <h4>Notes</h4>
      <textarea class="notes-textarea" id="modal-notes" placeholder="Add notes about this prospect…">${esc(p.notes || '')}</textarea>
    </div>

    <div class="modal-actions">
      <button class="btn-primary" onclick="saveNotes('${p.id}')">Save Notes</button>
      <button class="btn-sm btn-enrich" style="padding:10px 16px;" onclick="enrichProspect('${p.id}', this)">Find More Info</button>
      <button class="btn-sm btn-delete" style="padding:10px 16px;" onclick="deleteProspect('${p.id}');closeModal()">Remove</button>
    </div>
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  currentProspect = null;
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

async function updateField(id, field, value) {
  await fetch(`/api/prospects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
  const p = allProspects.find(x => x.id === id);
  if (p) p[field] = value;
}

async function saveNotes(id) {
  const notes = document.getElementById('modal-notes').value;
  await updateField(id, 'notes', notes);
  const p = allProspects.find(x => x.id === id);
  if (p) p.notes = notes;
  const btn = document.querySelector('.modal-actions .btn-primary');
  if (btn) { btn.textContent = 'Saved!'; setTimeout(() => { btn.textContent = 'Save Notes'; }, 1500); }
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function loadProspects() {
  const res = await fetch('/api/prospects');
  allProspects = await res.json();
}

async function loadDashboard() {
  await loadProspects();

  // Stats
  const statsRes = await fetch('/api/stats');
  const stats = await statsRes.json();

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card"><div class="stat-number">${stats.total}</div><div class="stat-label">Total Prospects</div></div>
    <div class="stat-card"><div class="stat-number" style="color:#1a7f4b">${stats.byFit?.High || 0}</div><div class="stat-label">High Fit</div></div>
    <div class="stat-card"><div class="stat-number" style="color:#c9a84c">${stats.byFit?.Medium || 0}</div><div class="stat-label">Medium Fit</div></div>
    <div class="stat-card"><div class="stat-number" style="color:#0052cc">${stats.byStatus?.New || 0}</div><div class="stat-label">New</div></div>
    <div class="stat-card"><div class="stat-number" style="color:#e67e22">${stats.byStatus?.Contacted || 0}</div><div class="stat-label">Contacted</div></div>
    <div class="stat-card"><div class="stat-number" style="color:#1a7f4b">${stats.byStatus?.Member || 0}</div><div class="stat-label">Members</div></div>
  `;

  // Populate industry filter
  const industries = [...new Set(allProspects.map(p => p.industry))].sort();
  const fInd = document.getElementById('f-industry');
  fInd.innerHTML = '<option value="">All Industries</option>' +
    industries.map(i => `<option>${i}</option>`).join('');

  // Attach filter listeners
  ['f-industry', 'f-status', 'f-fit', 'f-sort'].forEach(id => {
    const el = document.getElementById(id);
    el.removeEventListener('change', renderTable);
    el.addEventListener('change', renderTable);
  });

  renderTable();
}

function renderTable() {
  const fInd = document.getElementById('f-industry')?.value || '';
  const fSt = document.getElementById('f-status')?.value || '';
  const fFit = document.getElementById('f-fit')?.value || '';
  const fSort = document.getElementById('f-sort')?.value || 'name';

  let data = allProspects
    .filter(p => !fInd || p.industry === fInd)
    .filter(p => !fSt || p.status === fSt)
    .filter(p => !fFit || p.fitScore === fFit);

  const fitOrder = { High: 0, Medium: 1, Low: 2 };
  data.sort((a, b) => {
    if (fSort === 'fitScore') return (fitOrder[a.fitScore] ?? 3) - (fitOrder[b.fitScore] ?? 3);
    if (fSort === 'addedAt') return new Date(b.addedAt) - new Date(a.addedAt);
    return (a[fSort] || '').localeCompare(b[fSort] || '');
  });

  const tbody = document.getElementById('dashboard-tbody');
  const empty = document.getElementById('no-prospects');

  if (!data.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  try {
  tbody.innerHTML = data.map(p => `
    <tr>
      <td class="td-name">${esc(p.name || '—')}</td>
      <td class="td-title">${esc(p.title || '—')}</td>
      <td>${esc((p.company || '—').replace(/\n/g, ' '))}</td>
      <td><span class="tag tag-industry" style="font-size:0.72rem">${esc(p.industry || 'Other')}</span></td>
      <td>${esc(p.companySizeEstimate || '—')}</td>
      <td>${fitTag(p.fitScore)}</td>
      <td>${statusTag(p.status)}</td>
      <td style="display:flex;gap:5px;flex-wrap:wrap;">
        <button class="btn-sm btn-view" onclick="openModal('${p.id}')">View</button>
        <button class="btn-sm btn-enrich" onclick="enrichProspect('${p.id}', this)">Enrich</button>
      </td>
    </tr>
  `).join('');
  } catch(err) {
    console.error('Table render error:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="color:red;padding:1rem;">Error rendering table: ${err.message}</td></tr>`;
  }
}

function exportCSV() {
  window.location.href = '/api/export/csv';
}

async function cleanupProspects() {
  if (!confirm('This will remove all entries with invalid names or titles. Continue?')) return;
  const res = await fetch('/api/cleanup', { method: 'POST' });
  const data = await res.json();
  alert(`Cleanup complete: removed ${data.removed} invalid entries. ${data.after} valid prospects remain.`);
  loadDashboard();
}
