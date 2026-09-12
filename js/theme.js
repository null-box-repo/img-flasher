// Theme toggle with saved preference.
function initTheme() {
  $("#theme").onclick = () => {
    document.body.classList.toggle("light");
    $("#theme").textContent = document.body.classList.contains("light") ? "☾" : "☼";
    try { localStorage.setItem("bd-theme", document.body.classList.contains("light") ? "light" : "dark"); } catch {}
  };
  try {
    if (localStorage.getItem("bd-theme") === "light") {
      document.body.classList.add("light");
      $("#theme").textContent = "☾";
    }
  } catch {}
}
