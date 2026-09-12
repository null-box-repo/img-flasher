// Flash screen: image assignment, warning and flashing.
function flashTargets() {
  return state.blocks.filter(b =>
    (b.partname && b.partname !== "-") || (b.type === "disk" && b.isRemovable));
}

function renderFlash() {
  const rows = flashTargets();
  const box = $("#flRows");
  Object.keys(state.flashImgs).forEach(n => { if (!rows.some(b => b.name === n)) delete state.flashImgs[n]; });
  $("#flCount").textContent = Object.keys(state.flashImgs).length + " ready";
  $("#flBtn").disabled = Object.keys(state.flashImgs).length === 0;
  if (!rows.length) {
    box.innerHTML = `<tr class="empty-format"><td colspan="12">No partitions or removable disks found.</td></tr>`;
    return;
  }
  box.innerHTML = rows.map(b => {
    const img = state.flashImgs[b.name] || "";
    return `
    <tr data-name="${b.name}">
      <td><button class="edit-img ${img ? "has-img" : ""}" data-name="${b.name}" aria-label="Set image for ${b.name}" title="Set image">✎</button></td>
      <td class="c-name"><a href="#" class="blk-link" data-name="${b.name}">${b.name}</a></td>
      <td class="c-type-${b.type}">${b.type}</td>
      <td><span class="dev-path">${b.path}</span>${img ? `<br><span class="img-path" title="${img}">${img}</span>` : ""}</td>
      <td>${b.partname}</td>
      <td>${b.parent}</td>
      <td>${b.sectors}</td>
      <td>${b.bytes}</td>
      <td>${b.size}</td>
      <td>${b.majmin}</td>
      <td class="${b.readOnly ? "c-ro1" : ""}">${b.ro}</td>
      <td>${b.removable}</td>
    </tr>`;
  }).join("");
  box.querySelectorAll(".edit-img").forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    openImgDialog(btn.dataset.name);
  });
  box.querySelectorAll(".blk-link").forEach(a => a.onclick = e => {
    e.preventDefault();
    openInfo(a.dataset.name);
  });
}

function flMsg(text, error = false) {
  $("#flMessage").innerHTML = `<div class="notice">${error ? "ERROR / " : "OK / "}${text}</div>`;
}

let imgTarget = null;

function openImgDialog(name) {
  imgTarget = name;
  const b = state.blocks.find(x => x.name === name);
  $("#imgTitle").textContent = `Image for ${name}${b && b.partname !== "-" ? ` (${b.partname})` : ""}`;
  $("#imgPath").value = state.flashImgs[name] || "";
  imgErr("");
  $("#imgModal").classList.remove("hidden");
  lockScroll();
  setTimeout(() => $("#imgPath").focus(), 50);
}

function closeImgDialog() {
  if ($("#imgModal").classList.contains("hidden")) return;
  $("#imgModal").classList.add("hidden");
  unlockScroll();
  imgTarget = null;
}

function imgErr(t) {
  $("#imgError").textContent = t || "";
  $("#imgError").classList.toggle("hidden", !t);
}

let warnTimer = null;

function openWarn(names) {
  $("#warnTargets").innerHTML = names.map(n => `<div>${n} ← ${state.flashImgs[n]}</div>`).join("");
  const btn = $("#warnAgree");
  let s = 10;
  btn.disabled = true;
  btn.textContent = `موافق (${s})`;
  btn.onclick = () => { closeWarn(); runFlash(names); };
  $("#warnModal").classList.remove("hidden");
  lockScroll();
  clearInterval(warnTimer);
  warnTimer = setInterval(() => {
    s--;
    if (s <= 0) {
      clearInterval(warnTimer);
      warnTimer = null;
      btn.disabled = false;
      btn.textContent = "موافق";
    } else {
      btn.textContent = `موافق (${s})`;
    }
  }, 1000);
}

function closeWarn() {
  if (warnTimer) { clearInterval(warnTimer); warnTimer = null; }
  if ($("#warnModal").classList.contains("hidden")) return;
  $("#warnModal").classList.add("hidden");
  unlockScroll();
}

async function runFlash(names) {
  $("#flBtn").disabled = true;
  showProgress("flProg", true);
  let done = 0;
  for (const n of names) {
    try {
      await api("/api/flash", { method: "POST", body: JSON.stringify({ input: state.flashImgs[n], partition: n }) });
      flMsg(`${n} flashed from ${state.flashImgs[n]}`);
    } catch (e) {
      flMsg(`${n}: ${e.message}`, true);
    }
    done++;
    setProgress("flBar", "flPct", done, names.length);
  }
  $("#flBtn").disabled = false;
}

function initFlash() {
  $("#imgClose").onclick = closeImgDialog;
  $("#imgModal").addEventListener("click", e => { if (e.target.id === "imgModal") closeImgDialog(); });
  $("#imgSet").onclick = async () => {
    if (!imgTarget) return;
    const p = $("#imgPath").value.trim();
    if (!p) { delete state.flashImgs[imgTarget]; closeImgDialog(); renderFlash(); return; }
    if (!p.startsWith("/")) return imgErr("Path must be absolute (e.g. /sdcard/Download/boot.img).");
    imgErr("");
    $("#imgSet").disabled = true;
    try {
      const r = await api("/api/check-file?path=" + encodeURIComponent(p));
      if (!r.exists) return imgErr("File not found: " + p);
    } catch (e) {
      return imgErr(e.message);
    } finally {
      $("#imgSet").disabled = false;
    }
    state.flashImgs[imgTarget] = p;
    closeImgDialog();
    renderFlash();
  };
  $("#imgClear").onclick = () => {
    if (imgTarget) delete state.flashImgs[imgTarget];
    closeImgDialog();
    renderFlash();
  };
  $("#warnCancel").onclick = closeWarn;
  $("#warnClose").onclick = closeWarn;
  $("#warnModal").addEventListener("click", e => { if (e.target.id === "warnModal") closeWarn(); });
  $("#flBtn").onclick = () => {
    const names = Object.keys(state.flashImgs);
    if (!names.length) return flMsg("Set an image (✎) on at least one row first.", true);
    openWarn(names);
  };
}
