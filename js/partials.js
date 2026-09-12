// Loads dialog partials into the page.
const PARTIALS = ["filter", "img", "warn", "info"];

async function loadPartials() {
  const box = $("#partials");
  for (const name of PARTIALS) {
    const res = await fetch(`/partials/${name}.html`);
    if (!res.ok) throw new Error(`Failed to load partial: ${name}`);
    box.insertAdjacentHTML("beforeend", await res.text());
  }
}
