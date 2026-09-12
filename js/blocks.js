// Blocks table with search, filter, sort and grouping.
function setListLoading(loading) {
  $$(".table-loading").forEach(el => el.classList.toggle("hidden", !loading));
}

async function loadBlocks() {
  try {
    setRefreshing(true);
    setListLoading(true);
    const data = await api("/api/blocks");
    state.blocks = data.blocks || [];
    state.source = data.source || "";
    renderAll();
  } catch (e) {
    message(e.message, true);
    $("#blocks").innerHTML = `<tr class="empty-format"><td colspan="11">Failed to run <code>imgf list</code>: ${e.message}</td></tr>`;
  } finally {
    setRefreshing(false);
    setListLoading(false);
  }
}

function filtered() {
  const q = ($("#q").value || "").trim().toLowerCase();
  let list = [...state.blocks];
  if (state.type !== "all") list = list.filter(b => b.type === state.type);
  if (state.roOnly) list = list.filter(b => b.readOnly);
  if (state.namedOnly) list = list.filter(b => b.partname && b.partname !== "-");
  if (state.removableOnly) list = list.filter(b => b.isRemovable);
  if (q) list = list.filter(b =>
    b.name.toLowerCase().includes(q) ||
    String(b.partname || "").toLowerCase().includes(q) ||
    String(b.path || "").toLowerCase().includes(q) ||
    String(b.parent || "").toLowerCase().includes(q));
  const by = {
    name: (a, b) => a.name.localeCompare(b.name),
    bytes_desc: (a, b) => b.bytes - a.bytes,
    bytes_asc: (a, b) => a.bytes - b.bytes,
    sectors_desc: (a, b) => b.sectors - a.sectors,
  }[state.sort] || ((a, b) => a.name.localeCompare(b.name));
  return list.sort(by);
}

function renderAll() {
  $("#heroCount").innerHTML = `${state.blocks.length}<br>blocks`;
  renderBlocks();
  renderExtract();
  renderFlash();
}

function row(b) {
  return `
  <tr>
    <td class="c-name"><a href="#" class="blk-link" data-name="${b.name}">${b.name}</a></td>
    <td class="c-type-${b.type}">${b.type}</td>
    <td>${b.path}</td>
    <td>${b.partname}</td>
    <td>${b.parent}</td>
    <td>${b.sectors}</td>
    <td>${b.bytes}</td>
    <td>${b.size}</td>
    <td>${b.majmin}</td>
    <td class="${b.readOnly ? "c-ro1" : ""}">${b.ro}</td>
    <td>${b.removable}</td>
  </tr>`;
}

function renderBlocks() {
  const list = filtered();
  $("#blockCount").textContent = list.length + " / " + state.blocks.length;
  const box = $("#blocks");
  if (!list.length) {
    box.innerHTML = `<tr class="empty-format"><td colspan="11">No matching results. Clear the search or change the filter.</td></tr>`;
    return;
  }
  if (state.group === "none") {
    box.innerHTML = list.map(row).join("");
  } else {
    const key = state.group === "type" ? "type" : "parent";
    const groups = {};
    list.forEach(b => { const k = b[key] || "-"; (groups[k] ||= []).push(b); });
    box.innerHTML = Object.keys(groups).sort().map(k =>
      `<tr class="group-row"><td colspan="11">${state.group === "type" ? "TYPE" : "PARENT"}: ${k} (${groups[k].length})</td></tr>` +
      groups[k].map(row).join("")
    ).join("");
  }
  updateFilterBadge();
  box.querySelectorAll(".blk-link").forEach(a => a.onclick = e => {
    e.preventDefault();
    openInfo(a.dataset.name);
  });
}

function updateFilterBadge() {
  const active = state.type !== "all" || state.roOnly || state.namedOnly || state.removableOnly ||
    ($("#q").value || "").trim() !== "" || state.sort !== "name" || state.group !== "none";
  $("#filterBtn").textContent = active ? "⚙ Filter •" : "⚙ Filter";
  $("#filterBtn").classList.toggle("filtered", active);
}

function openDialog() { $("#filterModal").classList.remove("hidden"); lockScroll(); }
function closeDialog() {
  if ($("#filterModal").classList.contains("hidden")) return;
  $("#filterModal").classList.add("hidden");
  unlockScroll();
}

function initBlocks() {
  $("#refreshBtn").onclick = loadBlocks;
}

function initFilter() {
  $("#filterBtn").onclick = openDialog;
  $("#dlgClose").onclick = closeDialog;
  $("#dlgDone").onclick = closeDialog;
  $("#filterModal").addEventListener("click", e => { if (e.target.id === "filterModal") closeDialog(); });
  $("#typeChips").addEventListener("click", e => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    $$("#typeChips .chip").forEach(c => c.classList.toggle("active", c === btn));
    state.type = btn.dataset.type;
    renderBlocks();
  });
  let qTimer;
  $("#q").addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(renderBlocks, 150); });
  $("#sortSel").onchange = e => { state.sort = e.target.value; renderBlocks(); };
  $("#groupSel").onchange = e => { state.group = e.target.value; renderBlocks(); };
  $("#roOnly").onchange = e => { state.roOnly = e.target.checked; renderBlocks(); };
  $("#namedOnly").onchange = e => { state.namedOnly = e.target.checked; renderBlocks(); };
  $("#removableOnly").onchange = e => { state.removableOnly = e.target.checked; renderBlocks(); };
  $("#dlgReset").onclick = () => {
    state.type = "all";
    state.sort = "name";
    state.group = "none";
    state.roOnly = false;
    state.namedOnly = false;
    state.removableOnly = false;
    $("#q").value = "";
    $("#sortSel").value = "name";
    $("#groupSel").value = "none";
    $("#roOnly").checked = false;
    $("#namedOnly").checked = false;
    $("#removableOnly").checked = false;
    $$("#typeChips .chip").forEach(c => c.classList.toggle("active", c.dataset.type === "all"));
    renderBlocks();
  };
}
