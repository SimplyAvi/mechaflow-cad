// Frontend-to-backend smoke proof. Loads the frontend module the running server
// actually serves, executes its real fetch-and-render path against the live API,
// and asserts the rendered nodes came from the backend response.
//
// Usage: node tests/frontend_smoke.mjs <base-url>

import assert from 'node:assert/strict';

const baseUrl = (process.argv[2] ?? process.env.MECHAFLOW_BASE_URL ?? '').replace(/\/$/, '');
assert.ok(baseUrl, 'usage: node tests/frontend_smoke.mjs <base-url>');

function createElement(tagName) {
  return {
    tagName,
    children: [],
    attributes: {},
    ownText: '',
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return name in this.attributes ? this.attributes[name] : null;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    appendChild(node) {
      this.children.push(node);
      return node;
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    set textContent(value) {
      this.ownText = String(value);
      this.children = [];
    },
    get textContent() {
      return this.children.length
        ? this.children.map((child) => child.textContent).join('')
        : this.ownText;
    },
  };
}

function createDocument() {
  const byId = { status: createElement('section'), catalog: createElement('section') };
  return {
    byId,
    createElement,
    getElementById(id) {
      return byId[id] ?? null;
    },
  };
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

const pageResponse = await fetch(`${baseUrl}/`);
assert.equal(pageResponse.status, 200, 'server must serve the frontend page');
const html = await pageResponse.text();
assert.match(html, /<script[^>]+src="app\.js"/, 'page must load the frontend module');

const moduleResponse = await fetch(`${baseUrl}/app.js`);
assert.equal(moduleResponse.status, 200, 'server must serve the frontend module');
assert.match(
  moduleResponse.headers.get('content-type') ?? '',
  /javascript/,
  'frontend module must be served as JavaScript',
);
const moduleSource = await moduleResponse.text();
const frontend = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource, 'utf-8').toString('base64')}`
);

const apiItems = (await (await fetch(`${baseUrl}${frontend.CATALOG_ENDPOINT}`)).json()).items;
assert.ok(apiItems.length > 0, 'backend must return catalog items');

const doc = createDocument();
const rendered = await frontend.renderCatalog({
  document: doc,
  endpoint: `${baseUrl}${frontend.CATALOG_ENDPOINT}`,
});

assert.equal(rendered, apiItems.length, 'frontend must render every item the backend returned');
const cards = doc.byId.catalog.children;
assert.equal(cards.length, apiItems.length, 'one card per backend item');
assert.equal(
  doc.byId.status.textContent,
  `Loaded ${apiItems.length} reference designs from the backend API.`,
);
for (const [index, item] of apiItems.entries()) {
  const cardText = cards[index].textContent;
  assert.ok(cardText.includes(item.name), `card ${index} must show the backend name`);
  assert.ok(
    cardText.includes(item.license.compatibility),
    `card ${index} must show the backend license compatibility`,
  );
  const link = descendants(cards[index]).find((node) => node.tagName === 'a');
  assert.equal(link.getAttribute('href'), item.source.url, `card ${index} must link upstream`);
}

const hostileItems = [
  {
    id: 'hostile',
    name: '<img src=x onerror=alert(1)>',
    summary: 'hostile summary',
    license: { declared: 'MIT', compatibility: 'appears-compatible' },
    engineering_intent: { example_tasks: ['t1'] },
    source: { url: 'javascript:alert(1)' },
  },
];
const hostileDoc = createDocument();
await frontend.renderCatalog({
  document: hostileDoc,
  endpoint: '/stub',
  fetch: async () => ({ ok: true, status: 200, json: async () => ({ items: hostileItems }) }),
});
const hostileCard = hostileDoc.byId.catalog.children[0];
const hostileHeading = descendants(hostileCard).find((node) => node.tagName === 'h2');
assert.equal(hostileHeading.ownText, hostileItems[0].name, 'names must be set as text, not markup');
assert.equal(
  descendants(hostileCard).find((node) => node.tagName === 'a'),
  undefined,
  'non-http(s) source URLs must not become links',
);
assert.equal(frontend.safeSourceUrl('javascript:alert(1)'), null);
assert.equal(frontend.safeSourceUrl('https://example.com/x'), 'https://example.com/x');

const missingFieldsDoc = createDocument();
await frontend.renderCatalog({
  document: missingFieldsDoc,
  endpoint: '/stub',
  fetch: async () => ({
    ok: true,
    status: 200,
    json: async () => ({ items: [{ id: 'partial', name: 'Partial entry' }] }),
  }),
});
assert.equal(
  missingFieldsDoc.byId.catalog.children.length,
  1,
  'an incomplete entry must still render instead of blanking the catalog',
);

console.log('Frontend-to-backend smoke test passed');
