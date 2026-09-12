// Modal helpers and block info dialog.
function lockScroll() { document.body.style.overflow = "hidden"; }
function unlockScroll() { document.body.style.overflow = ""; }

function openInfo(name) {
  const b = state.blocks.find(x => x.name === name);
  if (!b) return;
  $("#infoTitle").textContent = `${b.name} (${b.type})`;
  $("#infoBody").innerHTML = `
    <dl class="kv-list">
      <div><dt>NAME</dt><dd>${b.name}</dd></div>
      <div><dt>TYPE</dt><dd>${b.type}</dd></div>
      <div><dt>PATH</dt><dd>${b.path}</dd></div>
      <div><dt>PARTNAME</dt><dd>${b.partname}</dd></div>
      <div><dt>PARENT</dt><dd>${b.parent}</dd></div>
      <div><dt>SECTORS</dt><dd>${b.sectors} × 512</dd></div>
      <div><dt>BYTES</dt><dd>${b.bytes}</dd></div>
      <div><dt>SIZE</dt><dd>${b.size}</dd></div>
      <div><dt>MAJMIN</dt><dd>${b.majmin}</dd></div>
      <div><dt>RO</dt><dd>${b.ro}${b.readOnly ? " (read-only)" : " (writable)"}</dd></div>
      <div><dt>REMOVABLE</dt><dd>${b.removable}${b.isRemovable ? " (removable)" : ""}</dd></div>
    </dl>`;
  $("#infoModal").classList.remove("hidden");
  lockScroll();
}

function closeInfo() {
  if ($("#infoModal").classList.contains("hidden")) return;
  $("#infoModal").classList.add("hidden");
  unlockScroll();
}

function initInfo() {
  $("#infoClose").onclick = closeInfo;
  $("#infoDone").onclick = closeInfo;
  $("#infoModal").addEventListener("click", e => { if (e.target.id === "infoModal") closeInfo(); });
}

function initModals() {
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeDialog(); closeInfo(); closeImgDialog(); closeWarn(); }
  });
}
