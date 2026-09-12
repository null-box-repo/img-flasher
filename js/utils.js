// Shared state and helpers.
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = {
  blocks: [],
  source: "",
  type: "all",
  sort: "name",
  group: "none",
  roOnly: false,
  namedOnly: false,
  removableOnly: false,
  selected: new Set(),
  flashImgs: {},
};

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};

const message = (text, error = false) => {
  $("#message").innerHTML = `<div class="notice">${error ? "ERROR / " : "OK / "}${text}</div>`;
  if (!error) setTimeout(() => { $("#message").innerHTML = ""; }, 5000);
};

const setRefreshing = loading => {
  const btn = $("#refreshBtn");
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector(".button-label")?.classList.toggle("hidden", loading);
  btn.querySelector(".spinner")?.classList.toggle("hidden", !loading);
};

const setProgress = (barId, pctId, done, total) => {
  const pct = total ? Math.round(done / total * 100) : 0;
  $("#" + barId).style.width = pct + "%";
  $("#" + pctId).textContent = pct + "%";
};

const showProgress = (wrapId, show) => {
  $("#" + wrapId).classList.toggle("hidden", !show);
  if (show) setProgress(wrapId === "exProg" ? "exBar" : "flBar", wrapId === "exProg" ? "exPct" : "flPct", 0, 1);
};
