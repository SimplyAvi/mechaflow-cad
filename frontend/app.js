const runtimeConfig = window.MECHA_FLOW_CONFIG || {};

export const API_BASE_URL = runtimeConfig.apiBaseUrl || '';
export const CATALOG_ENDPOINT =
  runtimeConfig.catalogApiUrl || `${API_BASE_URL}/api/catalog/reference-designs`;
export const TASKS_ENDPOINT = runtimeConfig.tasksApiUrl || `${API_BASE_URL}/api/data/tasks`;

const SAFE_URL_SCHEMES = new Set(['http:', 'https:']);

async function fetchJson(url, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

const apiUrl = (path) => `${API_BASE_URL}${path}`;

function textElement(doc, tagName, value, className) {
  const node = doc.createElement(tagName);
  node.textContent = value;
  if (className) node.setAttribute('class', className);
  return node;
}

function labelledElement(doc, label, value) {
  const node = doc.createElement('span');
  node.append(textElement(doc, 'strong', label), textElement(doc, 'span', ` ${value}`));
  return node;
}

function fillList(doc, id, items) {
  const node = doc.getElementById(id);
  node.replaceChildren(...items.map((item) => textElement(doc, 'li', item)));
}

function designLicense(design) {
  return typeof design.license === 'string' ? design.license : design.license?.declared || 'unknown';
}

export function safeSourceUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl);
    return SAFE_URL_SCHEMES.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

async function loadTaskNames(fetchImpl, endpoint) {
  try {
    const payload = await fetchJson(endpoint, fetchImpl);
    const items = Array.isArray(payload.items) ? payload.items : [];
    return new Map(items.map((task) => [task.id, task.name || task.id]));
  } catch {
    return new Map();
  }
}

export function buildDesignListItem(doc, item, taskNames = new Map()) {
  const license = item.license || {};
  const handoff = item.handoff || {};
  const taskIds = Array.isArray(item.engineering_intent?.example_task_ids)
    ? item.engineering_intent.example_task_ids
    : [];
  const taskLabels = taskIds.map((taskId) => taskNames.get(taskId) || taskId);
  const node = doc.createElement('li');
  node.append(
    textElement(doc, 'strong', item.name || item.id || 'Untitled reference design'),
    textElement(doc, 'span', ` - ${license.compatibility || 'unknown'}`),
    labelledElement(doc, 'Tasks:', taskLabels.join(', ') || 'none recorded'),
    labelledElement(doc, 'Gate:', handoff.license_gate || 'review required'),
  );

  const sourceUrl = safeSourceUrl(item.source?.url);
  if (sourceUrl) {
    const link = textElement(doc, 'a', 'Upstream source');
    link.setAttribute('href', sourceUrl);
    link.setAttribute('rel', 'noopener noreferrer');
    node.append(link);
  }
  return node;
}

export async function renderCatalog({
  document: doc,
  fetch: fetchImpl = globalThis.fetch,
  endpoint = CATALOG_ENDPOINT,
  tasksEndpoint = TASKS_ENDPOINT,
} = {}) {
  const payload = await fetchJson(endpoint, fetchImpl);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const taskNames = await loadTaskNames(fetchImpl, tasksEndpoint);
  const catalog = doc.getElementById('catalog-reference-designs');
  catalog.replaceChildren(...items.map((item) => buildDesignListItem(doc, item, taskNames)));
  doc.getElementById('catalog-status').textContent =
    `Loaded ${items.length} reference designs from the catalog API.`;
  return items.length;
}

export async function renderBackend({ document: doc, fetch: fetchImpl = globalThis.fetch } = {}) {
  try {
    const [health, metadata, designs] = await Promise.all([
      fetchJson(apiUrl('/health'), fetchImpl),
      fetchJson(apiUrl('/api/metadata'), fetchImpl),
      fetchJson(apiUrl('/api/reference-designs'), fetchImpl),
    ]);
    const status = doc.getElementById('connection-status');
    status.textContent =
      `${health.service} ${health.version} is ${health.status} at ${API_BASE_URL || 'same origin'}.`;
    status.setAttribute('class', 'status-ok');
    fillList(doc, 'concepts', metadata.concepts);
    fillList(
      doc,
      'reference-designs',
      designs.map((design) => `${design.name} - ${designLicense(design)}`),
    );
    return designs.length;
  } catch (error) {
    const status = doc.getElementById('connection-status');
    status.textContent = `Could not reach backend: ${error.message}`;
    status.setAttribute('class', 'status-error');
    throw error;
  }
}

async function loadCatalog(doc = window.document) {
  try {
    return await renderCatalog({ document: doc });
  } catch (error) {
    doc.getElementById('catalog-status').textContent =
      `Catalog API not available from this server: ${error.message}`;
    throw error;
  }
}

export const pageLoad =
  typeof window !== 'undefined' && typeof window.document !== 'undefined'
    ? Promise.all([renderBackend({ document: window.document }), loadCatalog(window.document)])
    : null;
