// Bottom navigation and screen switching.
function setView(v) {
  document.body.classList.toggle("view-extract", v === "extract");
  document.body.classList.toggle("view-flash", v === "flash");
  $("#navBlocks")?.classList.toggle("active", v === "blocks");
  $("#navExtract")?.classList.toggle("active", v === "extract");
  $("#navFlash")?.classList.toggle("active", v === "flash");
  const target = v === "extract" ? "extractPanel" : v === "flash" ? "flashPanel" : "blocksPanel";
  document.getElementById(target).scrollIntoView({ behavior: "smooth", block: "start" });
}

function initNav() {
  $("#navBlocks").onclick = e => { e.preventDefault(); setView("blocks"); };
  $("#navExtract").onclick = e => { e.preventDefault(); setView("extract"); };
  $("#navFlash").onclick = e => { e.preventDefault(); setView("flash"); };
  $(".brand").onclick = e => { e.preventDefault(); setView("blocks"); window.scrollTo({ top: 0, behavior: "smooth" }); };
}
