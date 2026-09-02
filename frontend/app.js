export const CATALOG_ENDPOINT = '/api/catalog/reference-designs';
export const TASKS_ENDPOINT = '/api/data/tasks';

const SAFE_URL_SCHEMES = new Set(['http:', 'https:']);

export function safeSourceUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl);
    return SAFE_URL_SCHEMES.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function textElement(doc, tagName, text, className) {
  const node = doc.createElement(tagName);
  node.textContent = text;
  if (className) node.setAttribute('class', className);
  return node;
}

function labelledElement(doc, tagName, label, value) {
  const node = doc.createElement(tagName);
  node.append(textElement(doc, 'strong', label), textElement(doc, 'span', ` ${value}`));
  return node;
}

async function loadTaskNames(fetchImpl, endpoint) {
  try {
    const response = await fetchImpl(endpoint);
    if (!response.ok) return new Map();
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    return new Map(items.map((task) => [task.id, task.name ?? task.id]));
  } catch {
    return new Map();
  }
}

export function buildDesignCard(doc, item, taskNames = new Map()) {
  const license = item.license ?? {};
  const intent = item.engineering_intent ?? {};
  const taskIds = Array.isArray(intent.example_task_ids) ? intent.example_task_ids : [];
  const taskLabels = taskIds.map((taskId) => taskNames.get(taskId) ?? taskId);
  const compatibility = license.compatibility ?? 'unknown';

  const card = doc.createElement('article');
  card.append(
    textElement(doc, 'p', compatibility, 'badge'),
    textElement(doc, 'h2', item.name ?? item.id ?? 'Untitled reference design'),
    textElement(doc, 'p', item.summary ?? ''),
    labelledElement(doc, 'p', 'License:', license.declared ?? 'unknown'),
    labelledElement(doc, 'p', 'Example tasks:', taskLabels.join(', ') || 'none recorded'),
  );

  if (compatibility !== 'appears-compatible') {
    card.append(
      textElement(doc, 'p', 'License review required before import or redistribution.', 'warning'),
    );
  }

  const sourceUrl = safeSourceUrl(item.source?.url);
  const sourceLine = doc.createElement('p');
  if (sourceUrl) {
    const link = textElement(doc, 'a', 'Upstream source');
    link.setAttribute('href', sourceUrl);
    link.setAttribute('rel', 'noopener noreferrer');
    sourceLine.append(link);
  } else {
    sourceLine.append(textElement(doc, 'span', 'Upstream source URL missing or unsupported scheme', 'warning'));
  }
  card.append(sourceLine);
  return card;
}

export async function renderCatalog({
  document: doc,
  fetch: fetchImpl = globalThis.fetch,
  endpoint = CATALOG_ENDPOINT,
  tasksEndpoint = TASKS_ENDPOINT,
} = {}) {
  const status = doc.getElementById('status');
  const catalog = doc.getElementById('catalog');
  try {
    const response = await fetchImpl(endpoint);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    const taskNames = await loadTaskNames(fetchImpl, tasksEndpoint);
    catalog.replaceChildren(...items.map((item) => buildDesignCard(doc, item, taskNames)));
    status.textContent = `Loaded ${items.length} reference designs from the backend API.`;
    return items.length;
  } catch (error) {
    status.textContent = `Failed to load catalog: ${error.message}`;
    throw error;
  }
}

export const pageLoad =
  typeof window !== 'undefined' && typeof window.document !== 'undefined'
    ? renderCatalog({ document: window.document }).catch(() => null)
    : null;
