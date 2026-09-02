export const CATALOG_ENDPOINT = '/api/catalog/reference-designs';

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

export function buildDesignCard(doc, item) {
  const license = item.license ?? {};
  const intent = item.engineering_intent ?? {};
  const exampleTasks = Array.isArray(intent.example_tasks) ? intent.example_tasks : [];
  const compatibility = license.compatibility ?? 'unknown';

  const card = doc.createElement('article');
  card.append(
    textElement(doc, 'p', compatibility, 'badge'),
    textElement(doc, 'h2', item.name ?? item.id ?? 'Untitled reference design'),
    textElement(doc, 'p', item.summary ?? ''),
    labelledElement(doc, 'p', 'License:', license.declared ?? 'unknown'),
    labelledElement(doc, 'p', 'Example tasks:', exampleTasks.join(', ') || 'none recorded'),
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
} = {}) {
  const status = doc.getElementById('status');
  const catalog = doc.getElementById('catalog');
  try {
    const response = await fetchImpl(endpoint);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    catalog.replaceChildren(...items.map((item) => buildDesignCard(doc, item)));
    status.textContent = `Loaded ${items.length} reference designs from the backend API.`;
    return items.length;
  } catch (error) {
    status.textContent = `Failed to load catalog: ${error.message}`;
    throw error;
  }
}

if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
  renderCatalog({ document: window.document }).catch(() => {});
}
