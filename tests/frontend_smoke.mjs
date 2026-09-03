// Frontend-to-backend smoke proof. Discovers the module the served page loads,
// runs it under browser-like globals so the page bootstrap itself executes, and
// asserts the rendered nodes came from the live backend API.
//
// Usage: node tests/frontend_smoke.mjs <base-url>

import assert from 'node:assert/strict';

const baseUrl = (process.argv[2] ?? process.env.MECHAFLOW_BASE_URL ?? '').replace(/\/$/, '');
assert.ok(baseUrl, 'usage: node tests/frontend_smoke.mjs <base-url>');

const originFetch = globalThis.fetch;

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

const pageElementIds = [
  'connection-status',
  'concepts',
  'reference-designs',
  'catalog-status',
  'catalog-reference-designs',
];

function createDocument(ids = pageElementIds) {
  const byId = Object.fromEntries(ids.map((id) => [id, createElement('section')]));
  return {
    byId,
    createElement,
    getElementById(id) {
      return byId[id] ?? null;
    },
  };
}

function documentFromHtml(html) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  return createDocument(ids);
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function stubFetch(items) {
  return async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({ items: String(url).includes('/data/tasks') ? [] : items }),
  });
}

const pageResponse = await originFetch(`${baseUrl}/`);
assert.equal(pageResponse.status, 200, 'server must serve the frontend page');
const html = await pageResponse.text();

const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"[^>]*>/g)];
const moduleScript = scripts.find((match) => /\btype="module"/.test(match[1]));
assert.ok(moduleScript, 'served page must load a module script');

const moduleUrl = new URL(moduleScript[2], `${baseUrl}/`).href;
const moduleResponse = await originFetch(moduleUrl);
assert.equal(moduleResponse.status, 200, `server must serve ${moduleUrl}`);
assert.match(
  moduleResponse.headers.get('content-type') ?? '',
  /javascript/,
  'frontend module must be served as JavaScript',
);
const moduleSource = await moduleResponse.text();

// Browser-like globals: the module's page bootstrap runs on import and resolves
// its relative endpoints against the page origin, exactly as a browser would.
const pageDocument = documentFromHtml(html);
const pageWindow = {
  document: pageDocument,
  location: new URL(`${baseUrl}/`),
};
for (const script of scripts.filter((match) => !/\btype="module"/.test(match[1]))) {
  const scriptUrl = new URL(script[2], `${baseUrl}/`).href;
  const scriptResponse = await originFetch(scriptUrl);
  assert.equal(scriptResponse.status, 200, `server must serve ${scriptUrl}`);
  Function('window', await scriptResponse.text())(pageWindow);
}
globalThis.document = pageDocument;
globalThis.window = pageWindow;
globalThis.fetch = (input, init) => originFetch(new URL(input, `${baseUrl}/`), init);

const frontend = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource, 'utf-8').toString('base64')}`
);

assert.notEqual(frontend.pageLoad, null, 'module must bootstrap itself when loaded by a page');
const [backendRendered, catalogRendered] = await frontend.pageLoad;

const apiItems = (await originFetch(`${baseUrl}${frontend.CATALOG_ENDPOINT}`).then((r) => r.json()))
  .items;
const apiTasks = (await originFetch(`${baseUrl}${frontend.TASKS_ENDPOINT}`).then((r) => r.json()))
  .items;
assert.ok(apiItems.length > 0, 'backend must return catalog items');

assert.ok(backendRendered > 0, 'page bootstrap must render backend reference designs');
assert.equal(catalogRendered, apiItems.length, 'page bootstrap must render every catalog item');
const cards = pageDocument.byId['catalog-reference-designs'].children;
assert.equal(cards.length, apiItems.length, 'one card per backend item');
assert.equal(
  pageDocument.byId['catalog-status'].textContent,
  `Loaded ${apiItems.length} reference designs from the catalog API.`,
);
assert.match(pageDocument.byId['connection-status'].textContent, / is ok at same origin\.$/);
assert.equal(pageDocument.byId['connection-status'].getAttribute('class'), 'status-ok');
assert.ok(pageDocument.byId.concepts.textContent.includes('reference_designs'));

const taskNames = new Map(apiTasks.map((task) => [task.id, task.name]));
for (const [index, item] of apiItems.entries()) {
  const cardText = cards[index].textContent;
  assert.ok(cardText.includes(item.name), `card ${index} must show the backend name`);
  assert.ok(
    cardText.includes(item.license.compatibility),
    `card ${index} must show the backend license compatibility`,
  );
  for (const taskId of item.engineering_intent.example_task_ids) {
    const taskName = taskNames.get(taskId);
    assert.ok(taskName, `catalog task id ${taskId} must exist in the tasks dataset`);
    assert.ok(
      cardText.includes(taskName),
      `card ${index} must resolve task ${taskId} to its seeded name`,
    );
  }

  const expectedHref = frontend.safeSourceUrl(item.source?.url);
  const link = descendants(cards[index]).find((node) => node.tagName === 'a');
  if (expectedHref === null) {
    assert.equal(link, undefined, `card ${index} must not link an unsupported source URL`);
  } else {
    assert.ok(link, `card ${index} must link upstream`);
    assert.equal(link.getAttribute('href'), expectedHref, `card ${index} must link upstream`);
  }
}

const hostileItems = [
  {
    id: 'hostile',
    name: '<img src=x onerror=alert(1)>',
    summary: 'hostile summary',
    license: { declared: 'MIT', compatibility: 'appears-compatible' },
    engineering_intent: { example_task_ids: ['grasp-object'] },
    source: { url: 'javascript:alert(1)' },
  },
];
const hostileDoc = createDocument();
await frontend.renderCatalog({
  document: hostileDoc,
  endpoint: '/stub',
  fetch: stubFetch(hostileItems),
});
const hostileCard = hostileDoc.byId['catalog-reference-designs'].children[0];
const hostileHeading = descendants(hostileCard).find((node) => node.tagName === 'strong');
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
  fetch: stubFetch([{ id: 'partial', name: 'Partial entry' }]),
});
assert.equal(
  missingFieldsDoc.byId['catalog-reference-designs'].children.length,
  1,
  'an incomplete entry must still render instead of blanking the catalog',
);

console.log('Frontend-to-backend smoke test passed');
