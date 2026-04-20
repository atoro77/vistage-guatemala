require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'prospects.json');

app.use(express.json());
app.use(express.static('public'));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Industry classification ────────────────────────────────────────────────

const INDUSTRIES = [
  'Manufacturing & Industry',
  'Retail & Consumer Goods',
  'Technology & Software',
  'Financial Services & Banking',
  'Agriculture & Agribusiness',
  'Construction & Real Estate',
  'Healthcare & Pharma',
  'Logistics & Supply Chain',
  'Food & Beverage',
  'Professional Services',
  'Other',
];

const INDUSTRY_KEYWORDS = {
  'Manufacturing & Industry': ['manufactura', 'manufacturing', 'industrial', 'fábrica', 'factory', 'producción', 'production', 'planta'],
  'Retail & Consumer Goods': ['retail', 'tienda', 'store', 'comercio', 'comercial', 'consumer', 'distribución', 'distribution', 'supermercado'],
  'Technology & Software': ['tecnología', 'technology', 'software', 'tech', 'digital', 'sistemas', 'TI', 'IT', 'startup', 'fintech'],
  'Financial Services & Banking': ['banco', 'bank', 'financiero', 'financial', 'seguros', 'insurance', 'inversión', 'investment', 'crédito'],
  'Agriculture & Agribusiness': ['agrícola', 'agricultura', 'agro', 'agribusiness', 'campo', 'coffee', 'café', 'caña', 'palm', 'sugar'],
  'Construction & Real Estate': ['construcción', 'construction', 'inmobiliaria', 'real estate', 'bienes raíces', 'infraestructura', 'developer'],
  'Healthcare & Pharma': ['salud', 'health', 'médico', 'medical', 'farmacéutica', 'pharma', 'hospital', 'clínica', 'clinic'],
  'Logistics & Supply Chain': ['logística', 'logistics', 'transporte', 'transport', 'cadena', 'supply chain', 'carga', 'freight', 'almacén'],
  'Food & Beverage': ['alimentos', 'food', 'bebidas', 'beverage', 'restaurante', 'restaurant', 'comida', 'alimento', 'snack'],
  'Professional Services': ['consultoría', 'consulting', 'legal', 'abogados', 'law', 'auditoría', 'audit', 'contabilidad', 'accounting', 'marketing'],
};

function classifyIndustry(text) {
  const lower = text.toLowerCase();
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return industry;
  }
  return 'Other';
}

// ── Vistage fit scoring ────────────────────────────────────────────────────

const HIGH_TITLES = ['ceo', 'president', 'presidente', 'owner', 'propietario', 'gerente general', 'managing director', 'director general', 'director ejecutivo'];
const MEDIUM_TITLES = ['country manager', 'vp ', 'vice president', 'vicepresidente', 'director', 'gerente'];

function scoreFit(title, companyInfo, industry) {
  const t = (title || '').toLowerCase();
  const info = (companyInfo || '').toLowerCase();

  const isHigh = HIGH_TITLES.some(h => t.includes(h));
  const isMedium = !isHigh && MEDIUM_TITLES.some(m => t.includes(m));

  const sizeSignals = ['employees', 'empleados', 'staff', 'workers', 'colaboradores'];
  const hasSize = sizeSignals.some(s => info.includes(s));

  const publicSector = ['gobierno', 'government', 'municipal', 'ministerio', 'ong', 'ngo', 'fundación', 'foundation'];
  const isPublic = publicSector.some(p => t.includes(p) || info.includes(p));

  if (isPublic) return 'Low';
  if (isHigh) return 'High';
  if (isMedium && hasSize) return 'High';
  if (isMedium) return 'Medium';
  return 'Low';
}

// ── Tavily search ──────────────────────────────────────────────────────────

async function tavilySearch(query, maxResults = 10) {
  const response = await axios.post(
    'https://api.tavily.com/search',
    {
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    },
    { timeout: 20000 }
  );
  return response.data.results || [];
}

// ── Name validation ────────────────────────────────────────────────────────

const NOT_NAMES = new Set([
  // Titles / roles
  'Director', 'Gerente', 'General', 'Managing', 'Country', 'President',
  'Presidente', 'Manager', 'Executive', 'Officer', 'Chairman', 'Owner',
  'Founder', 'Partner', 'Associate', 'Senior', 'Junior', 'Vice',
  // Geography
  'Guatemala', 'Ciudad', 'Norte', 'Sur', 'Este', 'Oeste', 'Central',
  'Nacional', 'Internacional', 'Americas', 'America', 'Latin', 'Global',
  'Regional', 'Local', 'Zona', 'Area', 'Área', 'Region', 'Región',
  // Industries / sectors
  'Empresa', 'Empresas', 'Consumer', 'Retail', 'Manufacturing', 'Financial',
  'Services', 'Technology', 'Agriculture', 'Construction', 'Healthcare',
  'Logistics', 'Food', 'Beverage', 'Professional', 'Banking', 'Software',
  'Industry', 'Industries', 'Supply', 'Chain', 'Real', 'Estate', 'Pharma',
  'Agribusiness', 'Goods', 'Sciences', 'Science', 'Exports', 'Imports',
  'Sector', 'Sectorial', 'Commerce', 'Comercial', 'Comercio', 'Market',
  'Markets', 'Mercado', 'Trade', 'Business', 'Negocios', 'Negocio',
  // Organizations
  'Foundation', 'Fundacion', 'Fundación', 'Institute', 'Instituto',
  'Association', 'Asociacion', 'Asociación', 'Federation', 'Federacion',
  'Organization', 'Organizacion', 'Corporation', 'Corporacion', 'Corporación',
  'Group', 'Grupo', 'Centro', 'Council', 'Consejo', 'Chamber', 'Camara',
  'Cámara', 'Network', 'Networks', 'Alliance', 'Coalition',
  // Health / medical
  'Cancer', 'Prostate', 'Salud', 'Health', 'Hospital', 'Clinica', 'Clínica',
  'Medical', 'Medicine', 'Medicina', 'Pharma', 'Therapy', 'Care',
  // Spanish common words mistaken for names
  'Paz', 'Vida', 'Voz', 'Vox', 'Nueva', 'Nuevo', 'Gran', 'Grande',
  'Santo', 'Santa', 'San', 'Los', 'Las', 'Del', 'Una', 'Uno',
  // Common non-name words
  'World', 'Report', 'Keynote', 'Annual', 'Forum', 'Summit', 'Conference',
  'Life', 'News', 'Media', 'People', 'Also', 'Viewed', 'LinkedIn',
  'About', 'Experience', 'Hoja', 'Distribuidora',
  'Solutions', 'Soluciones', 'Systems', 'Sistemas',
  'Digital', 'Data', 'National', 'International', 'Top', 'Best',
  'Latin', 'Latam', 'Inter', 'Expo', 'Open', 'Plus', 'Pro',
]);

const CONNECTORS = new Set(['de', 'la', 'del', 'los', 'las', 'y', 'van', 'von', 'el', 'al']);

function isValidName(name) {
  if (!name || name.length < 5 || name.length > 45) return false;
  const words = name.trim().split(/\s+/);
  const content = words.filter(w => !CONNECTORS.has(w.toLowerCase()));
  // Person names have 2–3 content words (first + last, or first + middle + last)
  if (content.length < 2 || content.length > 3) return false;
  for (const w of words) {
    if (CONNECTORS.has(w.toLowerCase())) continue;
    if (NOT_NAMES.has(w)) return false;
    // Must be a proper noun: capital first letter, rest lowercase, only letters
    if (!/^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{1,19}$/.test(w)) return false;
  }
  return true;
}

// ── Parse raw search results into prospect objects ─────────────────────────

const EXEC_TITLE_RE = /\b(CEO|President|Presidente|Owner|Propietario|Gerente General|Managing Director|Director General|Director Ejecutivo|Country Manager|Vice President|Vicepresidente|VP|Director|Gerente)\b/i;

function extractProspects(results, searchContext) {
  const prospects = [];
  const seen = new Set();

  for (const result of results) {
    const { url, title = '', content = '' } = result;
    const fullText = `${title} ${content}`;

    let name = null;
    let execTitle = null;
    let company = null;
    let linkedinUrl = url.includes('linkedin.com/in/') ? url.split('?')[0] : null;

    if (url.includes('linkedin.com/in/')) {
      // LinkedIn page title format: "FirstName LastName - Title at Company | LinkedIn"
      const cleanTitle = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
      const dashIdx = cleanTitle.indexOf(' - ');

      if (dashIdx > 0) {
        name = cleanTitle.slice(0, dashIdx).trim();
        const rest = cleanTitle.slice(dashIdx + 3).trim();
        // "Title at/en Company" or "Title en Company"
        const atMatch = /^(.+?)\s+(?:at|en|@)\s+(.+)$/i.exec(rest);
        if (atMatch) {
          execTitle = atMatch[1].trim();
          company = atMatch[2].trim();
        } else {
          execTitle = rest;
        }
      } else {
        name = cleanTitle;
      }

      // If title still missing, scan content
      if (!execTitle) {
        const tm = EXEC_TITLE_RE.exec(content);
        if (tm) execTitle = tm[1];
      }
    } else {
      // Non-LinkedIn source: find exec title first
      const tm = EXEC_TITLE_RE.exec(fullText);
      if (!tm) continue;
      execTitle = tm[1];

      // Grab any LinkedIn URL embedded in the content
      const liMatch = /https?:\/\/(?:www\.|[a-z]{2}\.)?linkedin\.com\/in\/[a-z0-9_-]+/i.exec(content);
      if (liMatch) linkedinUrl = liMatch[0].split('?')[0];

      // Only accept a name if it appears directly before an exec title separated by a dash/pipe
      // e.g. "Juan Pérez - CEO at Empresa" → "Juan Pérez"
      const strictMatch = /^([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+){1,2})\s*[-–|]\s*(?:CEO|President|Presidente|Owner|Propietario|Gerente|Managing|Director|Country|Vice|VP)/i.exec(title);
      if (strictMatch) {
        const candidate = strictMatch[1].trim();
        if (isValidName(candidate)) name = candidate;
      }

      // Company from "Title at/en Company" in the page title
      const compMatch = /(?:at|en|@)\s+([A-ZÁÉÍÓÚÑÜ][A-Za-záéíóúñü&.,\s]{2,50})(?:\s*[,|·\n]|$)/.exec(title);
      if (compMatch) company = compMatch[1].trim();
    }

    if (!isValidName(name) || !execTitle) continue;

    const key = `${name.toLowerCase()}-${execTitle.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Company fallback: scan experience section in content
    if (!company || company.length < 3) {
      const expMatch = /###\s+([A-ZÁÉÍÓÚÑÜ][A-Za-záéíóúñü&.,\s]{2,50})\s*\n/.exec(content);
      if (expMatch) company = expMatch[1].trim();
    }
    if (!company || company.length < 3) company = 'Unknown';

    // Industry: auto-classify; if result is "Other", trust the searched industry
    let industry = classifyIndustry(`${title} ${content.slice(0, 600)}`);
    if (industry === 'Other' && searchContext.industry) industry = searchContext.industry;

    const fitScore = scoreFit(execTitle, fullText, industry);

    prospects.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name,
      title: execTitle,
      company,
      industry,
      companySizeEstimate: extractSizeSignal(fullText),
      sourceUrl: url,
      linkedinUrl,
      notes: '',
      fitScore,
      status: 'New',
      enrichmentSummary: null,
      snippet: content.slice(0, 300),
      addedAt: new Date().toISOString(),
      searchContext,
    });
  }

  return prospects;
}

function extractSizeSignal(text) {
  const patterns = [
    /(\d[\d,]+)\s*(?:employees|empleados|trabajadores|colaboradores)/i,
    /(?:more than|más de|over)\s*(\d[\d,]+)\s*(?:employees|empleados)/i,
    /(\d+)\s*(?:mil|thousand)\s*(?:employees|empleados)/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return `~${m[1]} employees`;
  }
  return null;
}

// ── Industry-specific Spanish search terms ────────────────────────────────

const INDUSTRY_TERMS = {
  'Manufacturing & Industry':       ['manufactura', 'industria', 'planta industrial', 'producción'],
  'Retail & Consumer Goods':        ['retail', 'tienda', 'distribución', 'consumo masivo', 'comercio'],
  'Technology & Software':          ['tecnología', 'software', 'tech', 'digital', 'sistemas'],
  'Financial Services & Banking':   ['banco', 'financiero', 'seguros', 'servicios financieros'],
  'Agriculture & Agribusiness':     ['agrícola', 'agro', 'café', 'caña de azúcar', 'palma africana'],
  'Construction & Real Estate':     ['construcción', 'inmobiliaria', 'bienes raíces', 'constructora'],
  'Healthcare & Pharma':            ['salud', 'farmacéutica', 'hospital', 'clínica', 'médico'],
  'Logistics & Supply Chain':       ['logística', 'transporte', 'carga', 'cadena de suministro'],
  'Food & Beverage':                ['alimentos', 'bebidas', 'alimentos y bebidas'],
  'Professional Services':          ['consultoría', 'servicios profesionales', 'legal', 'auditoría'],
  'Other':                          ['empresa', 'compañía', 'negocio'],
};

// ── Build search queries ───────────────────────────────────────────────────

function buildQueries(industry, location, companySize) {
  const loc = location || 'Guatemala';
  const terms = INDUSTRY_TERMS[industry] || [industry];
  const t1 = terms[0];
  const t2 = terms[1] || terms[0];

  const queries = [
    `site:linkedin.com/in "${t1}" Guatemala "Gerente General" OR CEO`,
    `"Gerente General" OR "Director General" ${t1} Guatemala empresa`,
    `CEO OR Presidente ${t2} Guatemala empresa ejecutivo`,
    `"Managing Director" OR "Country Manager" ${t1} Guatemala`,
    `directivo ejecutivo ${t1} Guatemala liderazgo empresarial`,
  ];

  if (loc !== 'Guatemala') {
    queries[4] = `CEO OR "Gerente General" ${t1} ${loc} Guatemala`;
  }

  return queries.slice(0, 5);
}

// ── Persistent storage helpers ─────────────────────────────────────────────

async function loadProspects() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveProspects(prospects) {
  await fs.writeFile(DATA_FILE, JSON.stringify(prospects, null, 2));
}

async function mergeProspects(newOnes) {
  const existing = await loadProspects();
  const existingKeys = new Set(existing.map(p => `${p.name}-${p.title}`.toLowerCase()));
  const added = newOnes.filter(p => !existingKeys.has(`${p.name}-${p.title}`.toLowerCase()));
  const merged = [...existing, ...added];
  await saveProspects(merged);
  return { added: added.length, total: merged.length, prospects: added };
}

// ── API Routes ─────────────────────────────────────────────────────────────

// Search for prospects
app.post('/api/search', async (req, res) => {
  const { industry, location, companySize } = req.body;

  if (!industry) return res.status(400).json({ error: 'Industry is required' });
  if (!process.env.TAVILY_API_KEY) return res.status(500).json({ error: 'TAVILY_API_KEY not configured' });

  try {
    const queries = buildQueries(industry, location, companySize);
    const searchContext = { industry, location, companySize };

    const allResults = [];
    for (const query of queries) {
      try {
        const results = await tavilySearch(query, 8);
        console.log(`Query: "${query}" → ${results.length} results`);
        results.forEach(r => console.log(`  title: ${r.title}`));
        allResults.push(...results);
      } catch (e) {
        console.error(`Query failed: ${query}`, e.message);
      }
    }

    const prospects = extractProspects(allResults, searchContext);
    const { added, total, prospects: newProspects } = await mergeProspects(prospects);

    res.json({ success: true, found: prospects.length, added, total, prospects: newProspects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all prospects
app.get('/api/prospects', async (req, res) => {
  const prospects = await loadProspects();
  res.json(prospects);
});

// Update a prospect (status, notes, etc.)
app.patch('/api/prospects/:id', async (req, res) => {
  const prospects = await loadProspects();
  const idx = prospects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  prospects[idx] = { ...prospects[idx], ...req.body };
  await saveProspects(prospects);
  res.json(prospects[idx]);
});

// Clean invalid prospects
app.post('/api/cleanup', async (req, res) => {
  const prospects = await loadProspects();
  const before = prospects.length;
  const clean = prospects.filter(p => {
    if (!p.name || !p.title) return false;
    // Must pass name validation
    if (!isValidName(p.name)) return false;
    // Must have a real exec title
    if (!EXEC_TITLE_RE.test(p.title)) return false;
    return true;
  });
  await saveProspects(clean);
  res.json({ before, after: clean.length, removed: before - clean.length });
});

// Delete a prospect
app.delete('/api/prospects/:id', async (req, res) => {
  const prospects = await loadProspects();
  const filtered = prospects.filter(p => p.id !== req.params.id);
  await saveProspects(filtered);
  res.json({ success: true });
});

// Enrich a prospect
app.post('/api/prospects/:id/enrich', async (req, res) => {
  const prospects = await loadProspects();
  const idx = prospects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const prospect = prospects[idx];

  try {
    const enrichQueries = [
      `"${prospect.name}" ${prospect.company} Guatemala noticias`,
      `"${prospect.name}" entrevista OR interview CEO Guatemala`,
      `${prospect.company} Guatemala empresa website`,
    ];

    // If no LinkedIn URL yet, add a targeted search for it
    if (!prospect.linkedinUrl) {
      enrichQueries.push(`site:linkedin.com/in "${prospect.name}" Guatemala`);
    }

    const enrichResults = [];
    for (const q of enrichQueries) {
      try {
        const r = await tavilySearch(q, 5);
        enrichResults.push(...r);
      } catch (e) {
        console.error(e.message);
      }
    }

    const snippets = enrichResults
      .slice(0, 8)
      .map(r => `SOURCE: ${r.url}\n${r.title}\n${(r.content || '').slice(0, 400)}`)
      .join('\n\n---\n\n');

    let summary = 'No additional information found.';

    if (enrichResults.length > 0) {
      summary = enrichResults
        .slice(0, 5)
        .map(r => `• <a href="${r.url}" target="_blank" rel="noopener">${r.title}</a>`)
        .join('<br>');
    }

    // Save LinkedIn URL if discovered during enrichment
    if (!prospect.linkedinUrl) {
      const liResult = enrichResults.find(r => r.url.includes('linkedin.com/in/'));
      if (liResult) prospects[idx].linkedinUrl = liResult.url.split('?')[0];
    }

    prospects[idx].enrichmentSummary = summary;
    prospects[idx].enrichedAt = new Date().toISOString();
    await saveProspects(prospects);

    res.json({ success: true, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Export CSV
app.get('/api/export/csv', async (req, res) => {
  const prospects = await loadProspects();
  const headers = ['Name', 'Title', 'Company', 'Industry', 'Company Size', 'Fit Score', 'Status', 'Source URL', 'LinkedIn', 'Notes', 'Added At'];
  const rows = prospects.map(p => [
    p.name, p.title, p.company, p.industry,
    p.companySizeEstimate || '',
    p.fitScore, p.status,
    p.sourceUrl || '', p.linkedinUrl || '',
    (p.notes || '').replace(/,/g, ';'),
    p.addedAt,
  ]);

  const csv = [headers, ...rows].map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="vistage-prospects.csv"');
  res.send(csv);
});

// Stats
app.get('/api/stats', async (req, res) => {
  const prospects = await loadProspects();
  const byIndustry = {};
  const byStatus = {};
  const byFit = {};

  for (const p of prospects) {
    byIndustry[p.industry] = (byIndustry[p.industry] || 0) + 1;
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    byFit[p.fitScore] = (byFit[p.fitScore] || 0) + 1;
  }

  res.json({ total: prospects.length, byIndustry, byStatus, byFit });
});

app.listen(PORT, () => console.log(`Vistage Guatemala running on http://localhost:${PORT}`));
