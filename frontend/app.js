const runtimeConfig = window.MECHA_FLOW_CONFIG || {};
const apiBaseUrl = runtimeConfig.apiBaseUrl || "";
const catalogApiUrl = runtimeConfig.catalogApiUrl || `${apiBaseUrl}/api/catalog/reference-designs`;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

const apiUrl = (path) => `${apiBaseUrl}${path}`;

function setStatus(message, className) {
  const node = document.querySelector("#connection-status");
  node.textContent = message;
  node.className = className;
}

function fillList(selector, items) {
  const node = document.querySelector(selector);
  node.innerHTML = "";
  for (const item of items) {
    const child = document.createElement("li");
    child.textContent = item;
    node.appendChild(child);
  }
}

function designLicense(design) {
  return typeof design.license === "string" ? design.license : design.license.declared;
}

async function boot() {
  try {
    const [health, metadata, designs] = await Promise.all([
      fetchJson(apiUrl("/health")),
      fetchJson(apiUrl("/api/metadata")),
      fetchJson(apiUrl("/api/reference-designs")),
    ]);
    setStatus(`${health.service} ${health.version} is ${health.status} at ${apiBaseUrl || "same origin"}.`, "status-ok");
    fillList("#concepts", metadata.concepts);
    fillList(
      "#reference-designs",
      designs.map((design) => `${design.name} - ${designLicense(design)}`),
    );
  } catch (error) {
    setStatus(`Could not reach backend: ${error.message}`, "status-error");
  }
}

async function loadCatalog() {
  const status = document.querySelector("#catalog-status");
  try {
    const payload = await fetchJson(catalogApiUrl);
    status.textContent = `Loaded ${payload.items.length} reference designs from the catalog API.`;
    fillList(
      "#catalog-reference-designs",
      payload.items.map((item) => {
        const gate = item.handoff ? `; gate: ${item.handoff.license_gate}` : "";
        return `${item.name} - ${item.license.compatibility}${gate}`;
      }),
    );
  } catch (error) {
    status.textContent = `Catalog API not available from this server: ${error.message}`;
  }
}

boot();
loadCatalog();
