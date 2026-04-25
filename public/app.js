// ── State ──────────────────────────────────────────────────────────────────
let allProspects = [];
let currentProspect = null;

const INDUSTRIES = [
  'Manufacturing & Industry', 'Retail & Consumer Goods', 'Technology & Software',
  'Financial Services & Banking', 'Agriculture & Agribusiness', 'Construction & Real Estate',
  'Healthcare & Pharma', 'Logistics & Supply Chain', 'Food & Beverage',
  'Professional Services', 'Other',
];

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
  status.textContent = `Running 5 web searches for ${industry} executives in ${location || 'Guatemala'}…`;

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
    ${p.email ? `<div class="card-email"><a href="mailto:${esc(p.email)}">${esc(p.email)}</a> ${confidenceBadge(p.emailConfidence)}</div>` : ''}
    <div class="card-actions">
      <button class="btn-sm btn-view" onclick="openModal('${p.id}')">View / Edit</button>
      <button class="btn-sm btn-enrich" onclick="enrichProspect('${p.id}', this)">Find More Info</button>
      <button class="btn-sm btn-email" onclick="findEmail('${p.id}', this)">${p.email ? 'Re-check Email' : 'Find Email'}</button>
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

// ── Find Email ─────────────────────────────────────────────────────────────
async function findEmail(id, btn) {
  const original = btn.textContent;
  btn.textContent = 'Searching…';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/prospects/${id}/find-email`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const p = allProspects.find(x => x.id === id);
    if (p) { p.email = data.email; p.emailConfidence = data.confidence; }

    btn.textContent = 'Found!';
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);

    if (currentProspect?.id === id) {
      if (currentProspect) { currentProspect.email = data.email; currentProspect.emailConfidence = data.confidence; }
      openModal(id);
    }
    renderTable();
  } catch (err) {
    btn.textContent = 'Not found';
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
    alert('Email search: ' + err.message);
  }
}

function confidenceBadge(score) {
  const color = score >= 80 ? '#1a7f4b' : score >= 50 ? '#c9a84c' : '#c0392b';
  return `<span style="font-size:0.7rem;color:${color};font-weight:600;">${score}%</span>`;
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
    <div class="modal-edit-header">
      <input class="modal-name-input" value="${esc(p.name)}" placeholder="Name"
             onblur="saveField('${p.id}', 'name', this)" />
      <div class="modal-title-row">
        <input class="modal-title-input" value="${esc(p.title)}" placeholder="Title"
               onblur="saveField('${p.id}', 'title', this)" />
        <span class="modal-sep">·</span>
        <input class="modal-company-input" value="${esc(p.company)}" placeholder="Company"
               onblur="saveField('${p.id}', 'company', this)" />
      </div>
    </div>

    <div class="modal-field-grid">
      <div class="modal-field">
        <label>Industry</label>
        <select onchange="saveField('${p.id}', 'industry', this)">
          ${INDUSTRIES.map(i => `<option ${p.industry===i?'selected':''}>${esc(i)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-field">
        <label>Fit Score</label>
        <select onchange="saveField('${p.id}', 'fitScore', this)">
          ${['High','Medium','Low'].map(f => `<option ${p.fitScore===f?'selected':''}>${f}</option>`).join('')}
        </select>
      </div>
      <div class="modal-field modal-field-full">
        <label>LinkedIn URL</label>
        <input type="text" value="${esc(p.linkedinUrl||'')}" placeholder="https://www.linkedin.com/in/…"
               onblur="saveField('${p.id}', 'linkedinUrl', this)" />
      </div>
    </div>

    <span id="modal-saved-indicator" class="modal-saved hidden">✓ saved</span>

    ${p.sourceUrl ? `<a href="${p.sourceUrl}" target="_blank" rel="noopener" class="card-source" style="margin-bottom:0.75rem;display:block;">${p.linkedinUrl ? 'LinkedIn' : 'Source'}: ${p.sourceUrl}</a>` : ''}

    <div class="modal-section">
      <h4>Email</h4>
      ${p.email
        ? `<div style="display:flex;align-items:center;gap:0.5rem;"><a href="mailto:${esc(p.email)}" style="font-weight:600;">${esc(p.email)}</a> ${confidenceBadge(p.emailConfidence)} <span style="font-size:0.75rem;color:#888;">(${esc(p.emailDomain)})</span></div>`
        : `<button class="btn-sm btn-email" onclick="findEmail('${p.id}', this)">Find Email</button>`
      }
    </div>

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

async function saveField(id, field, el) {
  const value = el.value?.trim() !== undefined ? el.value.trim() : el.value;
  await updateField(id, field, value);
  const indicator = document.getElementById('modal-saved-indicator');
  if (indicator) {
    indicator.classList.remove('hidden');
    clearTimeout(indicator._t);
    indicator._t = setTimeout(() => indicator.classList.add('hidden'), 1500);
  }
  // Refresh card in search results if visible
  const p = allProspects.find(x => x.id === id);
  if (p) {
    const card = document.getElementById(`card-${id}`);
    if (card) card.outerHTML = cardHTML(p);
  }
  renderTable();
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
  ['f-country', 'f-industry', 'f-status', 'f-fit', 'f-sort'].forEach(id => {
    const el = document.getElementById(id);
    el.removeEventListener('change', renderTable);
    el.addEventListener('change', renderTable);
  });

  renderTable();
}

function renderTable() {
  const fCountry = document.getElementById('f-country')?.value || '';
  const fInd = document.getElementById('f-industry')?.value || '';
  const fSt = document.getElementById('f-status')?.value || '';
  const fFit = document.getElementById('f-fit')?.value || '';
  const fSort = document.getElementById('f-sort')?.value || 'name';

  let data = allProspects
    .filter(p => !fCountry || (p.searchContext?.location || 'Guatemala') === fCountry)
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
      <td>${p.linkedinUrl ? `<a href="${esc(p.linkedinUrl)}" target="_blank" rel="noopener" style="font-size:0.82rem;">View</a>` : '—'}</td>
      <td>${fitTag(p.fitScore)}</td>
      <td>${statusTag(p.status)}</td>
      <td>${p.email ? `<a href="mailto:${esc(p.email)}" style="font-size:0.8rem;">${esc(p.email)}</a> ${confidenceBadge(p.emailConfidence)}` : `<button class="btn-sm btn-email" onclick="findEmail('${p.id}', this)">Find Email</button>`}</td>
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

async function bulkLinkedIn() {
  const btn = document.getElementById('linkedin-btn');
  const total = allProspects.length;
  if (!confirm(`This will search LinkedIn for all ${total} prospects and correct names. It may take a few minutes. Continue?`)) return;

  btn.textContent = 'Searching… (this takes a while)';
  btn.disabled = true;

  try {
    const res = await fetch('/api/bulk-linkedin', { method: 'POST', timeout: 300000 });
    const data = await res.json();
    alert(`Done! Found LinkedIn for ${data.updated} prospects, corrected ${data.corrected} names.`);
    loadDashboard();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.textContent = 'Find LinkedIn for All';
    btn.disabled = false;
  }
}

async function cleanupProspects() {
  if (!confirm('This will remove all entries with invalid names or titles. Continue?')) return;
  const res = await fetch('/api/cleanup', { method: 'POST' });
  const data = await res.json();
  alert(`Cleanup complete: removed ${data.removed} invalid entries. ${data.after} valid prospects remain.`);
  loadDashboard();
}
