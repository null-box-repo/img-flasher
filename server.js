// img flasher API server.
const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const port = Number(process.env.PORT || 3000);

const BIN = path.join(__dirname, "imgf");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function parseListOutput(text) {
  const lines = String(text || "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const start = /^NAME\s+TYPE\s+/i.test(lines[0]) ? 1 : 0;
  const blocks = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(/\s+/);
    if (cols.length < 11) continue;
    const [name, type, devpath, partname, parent, sectors, bytes, size, majmin, ro, removable] = cols;
    blocks.push({
      name,
      type,
      path: devpath,
      partname,
      parent,
      sectors: Number(sectors) || 0,
      bytes: Number(bytes) || 0,
      size,
      majmin,
      ro,
      removable,
      readOnly: ro === "1",
      isRemovable: removable === "1",
    });
  }
  return blocks;
}

function runList() {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, ["list"], { timeout: 15000 });
    let out = "", err = "";
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `imgf list exited with code ${code}`));
      resolve(out);
    });
  });
}

async function getBlocks() {
  const raw = await runList();
  const blocks = parseListOutput(raw);
  return { blocks, raw, source: "imgf list", mocked: false };
}

const validName = (s) => /^[A-Za-z0-9_.\-]+$/.test(String(s || ""));

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > 1024 * 1024) { reject(new Error("Body too large.")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(new Error("Invalid JSON body.")); }
    });
    req.on("error", reject);
  });
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.normalize(path.join(__dirname, rel));
  if (!file.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error("not a file");
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found." }));
  }
}

function runBin(args, res, onOk) {
  const child = spawn(BIN, args);
  let err = "";
  child.stderr.on("data", d => err += d);
  child.on("error", (e) => sendJson(res, 500, { error: String(e.message || e) }));
  child.on("close", (code) => {
    if (code === 0) return sendJson(res, 200, { ok: true, message: onOk });
    sendJson(res, 500, { error: err.trim() || `${BIN} ${args[0]} failed (exit ${code}).` });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/api/blocks") {
      const { blocks, raw, source, mocked } = await getBlocks();
      return sendJson(res, 200, { blocks, raw, count: blocks.length, source, mocked, updatedAt: new Date().toISOString() });
    }

    const blockMatch = pathname.match(/^\/api\/block\/([^/]+)$/);
    if (req.method === "GET" && blockMatch) {
      const name = decodeURIComponent(blockMatch[1]);
      if (!validName(name)) return sendJson(res, 400, { error: "Invalid block name." });
      const { blocks, source, mocked } = await getBlocks();
      const b = blocks.find(x => x.name === name);
      if (!b) return sendJson(res, 404, { error: "Block not found." });
      return sendJson(res, 200, { block: b, source, mocked });
    }

    if (req.method === "GET" && pathname === "/api/check-file") {
      const p = String(url.searchParams.get("path") || "");
      if (!p.startsWith("/")) return sendJson(res, 400, { error: "Path must be absolute." });
      try {
        await fsp.access(p, fs.constants.R_OK);
        return sendJson(res, 200, { exists: true, path: p });
      } catch {
        return sendJson(res, 200, { exists: false, path: p });
      }
    }

    if (req.method === "POST" && pathname === "/api/extract") {
      const { partition, output } = await readBody(req);
      if (!validName(partition)) return sendJson(res, 400, { error: "Invalid partition name (allowed: letters/numbers/._-)." });
      if (!output || typeof output !== "string" || !output.startsWith("/")) return sendJson(res, 400, { error: "Output path must be absolute (e.g. /sdcard/Download/boot.img)." });
      return runBin(["extract", partition, output], res, `Extracted ${partition} to ${output}`);
    }

    if (req.method === "POST" && pathname === "/api/flash") {
      const { input, partition } = await readBody(req);
      if (!validName(partition)) return sendJson(res, 400, { error: "Invalid partition name." });
      if (!input || typeof input !== "string" || !input.startsWith("/")) return sendJson(res, 400, { error: "Input file must be an absolute path." });
      return runBin(["flash", input, partition], res, `Flashed ${input} to ${partition}`);
    }

    if (req.method === "GET") return serveStatic(req, res, pathname);

    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Method not allowed." }));
  } catch (e) {
    sendJson(res, 500, { error: String(e.message || e) });
  }
});

server.listen(port, () => console.log(`img flasher listening on port ${port}`));
