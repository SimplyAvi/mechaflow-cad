const apiBaseUrl = (window.MECHA_FLOW_CONFIG && window.MECHA_FLOW_CONFIG.apiBaseUrl) || "";

async function fetchJson(path) {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json();
}

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

async function boot() {
  try {
    const [health, metadata, designs] = await Promise.all([
      fetchJson("/health"),
      fetchJson("/api/metadata"),
      fetchJson("/api/reference-designs"),
    ]);
    setStatus(`${health.service} ${health.version} is ${health.status} at ${apiBaseUrl || "same origin"}.`, "status-ok");
    fillList("#concepts", metadata.concepts);
    fillList(
      "#reference-designs",
      designs.map((design) => `${design.name} - ${design.license}`),
    );
  } catch (error) {
    setStatus(`Could not reach backend: ${error.message}`, "status-error");
  }
}

boot();
