// App entry: partials first, then init, then load.
(async () => {
  try {
    await loadPartials();
  } catch (e) {
    message("Failed to load dialogs: " + e.message, true);
    return;
  }
  initTheme();
  initModals();
  initInfo();
  initBlocks();
  initFilter();
  initExtract();
  initFlash();
  initNav();
  loadBlocks();
})();
