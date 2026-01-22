/* MD Viewer - app.js (Edit + Save)
 * 需求符合：
 * - 預設 Preview（瀏覽模式）
 * - 按「編輯」才顯示 editor
 * - 儲存：能覆蓋就覆蓋；不能覆蓋 => 提示並另存 檔名(1).md, (2)...
 * - 編號用 localStorage 記錄（每個 baseName 各自遞增）
 * - 本機開檔：優先 File System Access API（可覆蓋），不支援則 fallback file input（只能另存）
 */

const el = (id) => document.getElementById(id);

// UI
const contentEl = el("content");
const tocEl = el("toc");
const statusEl = el("status");
const metaEl = el("meta");
const sidebarEl = el("sidebar");

const btnOpenLocal = el("btnOpenLocal");
const fileInput = el("fileInput");

const urlInput = el("urlInput");
const btnLoadUrl = el("btnLoadUrl");

const btnSample = el("btnSample");
const btnCopyLink = el("btnCopyLink");

const btnTheme = el("btnTheme");
const btnToggleToc = el("btnToggleToc");

const btnModePreview = el("btnModePreview");
const btnModeEdit = el("btnModeEdit");
const btnSave = el("btnSave");

const dropzone = el("dropzone");

const editorWrap = el("editorWrap");
const editor = el("editor");
const editorMeta = el("editorMeta");

// ---------- Theme ----------
const THEME_KEY = "mdv.theme";
function getTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}
setTheme(getTheme());
btnTheme.addEventListener("click", () => {
  const now = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(now === "dark" ? "light" : "dark");
});

// ---------- Marked config ----------
function setupMarked() {
  if (!window.marked) return;
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: true,
    mangle: false,
    highlight: function (code, lang) {
      try {
        if (window.hljs) {
          if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
          }
          return hljs.highlightAuto(code).value;
        }
      } catch (_) {}
      return code;
    },
  });
}
setupMarked();

// ---------- Status ----------
function setStatus(msg, type = "") {
  statusEl.textContent = msg || "";
  statusEl.classList.remove("ok", "err");
  if (type) statusEl.classList.add(type);
}

// ---------- State ----------
const state = {
  mode: "preview", // preview | edit
  currentText: "",
  source: "—",
  // 本機覆寫用：
  fileHandle: null,         // FileSystemFileHandle (if available)
  originalFileName: "",     // e.g. note.md
  // URL 模式：
  activeUrl: ""
};

function setMode(mode) {
  state.mode = mode;

  if (mode === "edit") {
    editorWrap.hidden = false;
    btnSave.disabled = false;

    // editor 以目前內容為準
    editor.value = state.currentText || "";
    editor.focus({ preventScroll: false });
    editorMeta.textContent = state.originalFileName
      ? `Editing: ${state.originalFileName}`
      : (state.activeUrl ? `Editing (from URL): ${state.activeUrl}` : "Editing: (unsaved)");

    setStatus("編輯模式：修改後可按「儲存」", "ok");
  } else {
    editorWrap.hidden = true;
    btnSave.disabled = true;
    setStatus("瀏覽模式", "ok");
  }
}

btnModePreview.addEventListener("click", () => setMode("preview"));
btnModeEdit.addEventListener("click", () => setMode("edit"));

// editor 即時預覽（編輯時）
let renderTimer = null;
editor.addEventListener("input", () => {
  state.currentText = editor.value;
  // debounce render
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderMarkdown(state.currentText, { source: state.source });
  }, 120);
});

// ---------- Render ----------
function renderMarkdown(mdText, meta = {}) {
  state.currentText = mdText ?? "";

  const size = state.currentText.length;
  const source = meta.source || state.source || "—";
  const when = new Date().toLocaleString();

  let html = "";
  try {
    html = window.marked ? marked.parse(state.currentText) : `<pre>${escapeHtml(state.currentText)}</pre>`;
  } catch {
    html = `<pre>${escapeHtml(state.currentText)}</pre>`;
  }

  contentEl.innerHTML = html;

  // links
  contentEl.querySelectorAll("a[href]").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });

  buildTOC();
  metaEl.textContent = `Source: ${source} • Size: ${size.toLocaleString()} chars • Rendered: ${when}`;
}

// TOC
function buildTOC() {
  tocEl.innerHTML = "";
  const headings = contentEl.querySelectorAll("h1, h2, h3");
  if (!headings.length) {
    tocEl.innerHTML = `<div style="color:var(--muted);font-size:12px;">（此文件沒有 H1~H3 標題）</div>`;
    return;
  }

  headings.forEach((h) => {
    if (!h.id) h.id = slugify(h.textContent || "");
  });

  const frag = document.createDocumentFragment();
  headings.forEach((h) => {
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = h.textContent || "(untitled)";

    const level = h.tagName === "H1" ? 0 : h.tagName === "H2" ? 1 : 2;
    a.style.marginLeft = `${level * 10}px`;

    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      h.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    frag.appendChild(a);
  });

  tocEl.appendChild(frag);
}

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || `h-${Math.random().toString(16).slice(2)}`;
}

// ---------- Sidebar toggle ----------
let tocOpen = true;
btnToggleToc.addEventListener("click", () => {
  tocOpen = !tocOpen;
  sidebarEl.style.display = tocOpen ? "" : "none";
});

// ---------- Local Open (best effort overwrite support) ----------
btnOpenLocal.addEventListener("click", async () => {
  // 優先用 File System Access API（可覆寫）
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Markdown",
            accept: {
              "text/markdown": [".md", ".markdown"],
              "text/plain": [".txt"]
            }
          }
        ]
      });
      const file = await handle.getFile();
      const text = await file.text();

      state.fileHandle = handle;
      state.originalFileName = file.name || "note.md";
      state.activeUrl = "";
      state.source = `local: ${state.originalFileName}`;

      renderMarkdown(text, { source: state.source });
      setMode("preview");
      setStatus(`已開啟：${state.originalFileName}（此瀏覽器可嘗試覆蓋儲存）`, "ok");
      return;
    } catch (e) {
      // 使用者取消或失敗 -> fallback file input
      // 直接走 fileInput
    }
  }

  // fallback：傳統 file input（無法覆蓋，只能另存）
  fileInput.click();
});

// file input fallback
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    setStatus("Reading local file…");
    const text = await file.text();

    state.fileHandle = null; // 沒 handle 就不能覆蓋
    state.originalFileName = file.name || "note.md";
    state.activeUrl = "";
    state.source = `local: ${state.originalFileName}`;

    renderMarkdown(text, { source: state.source });
    setMode("preview");
    setStatus(`已開啟：${state.originalFileName}（此方式無法覆蓋，只能另存）`, "ok");
  } catch (e) {
    setStatus(`Read failed: ${String(e)}`, "err");
  } finally {
    fileInput.value = "";
  }
});

// ---------- Drag & Drop ----------
["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", async (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;

  if (!/\.md$|\.markdown$/i.test(file.name) && !file.type.includes("text")) {
    setStatus("建議只拖曳 Markdown / Text 檔。", "err");
    return;
  }

  try {
    setStatus("Reading dropped file…");
    const text = await file.text();

    state.fileHandle = null; // 拖曳也拿不到 handle，不能覆蓋
    state.originalFileName = file.name || "note.md";
    state.activeUrl = "";
    state.source = `local: ${state.originalFileName}`;

    renderMarkdown(text, { source: state.source });
    setMode("preview");
    setStatus(`已開啟：${state.originalFileName}（拖曳無法覆蓋，只能另存）`, "ok");
  } catch (err) {
    setStatus(`Drop read failed: ${String(err)}`, "err");
  }
});

// ---------- Load from URL (CORS required) ----------
btnLoadUrl.addEventListener("click", async () => {
  const url = (urlInput.value || "").trim();
  if (!url) return setStatus("請貼上 MD 連結", "err");
  await loadFromUrl(url, true);
});

async function loadFromUrl(url, updateHash = false) {
  try {
    setStatus("Fetching URL…");
    const res = await fetch(url, { method: "GET", mode: "cors", cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    state.fileHandle = null; // URL 來源沒覆蓋概念
    state.originalFileName = "";
    state.activeUrl = url;
    state.source = `url: ${url}`;
    if (updateHash) setActiveUrl(url);

    renderMarkdown(text, { source: state.source });
    setMode("preview");
    setStatus("URL 載入成功（儲存會走另存序號）", "ok");
  } catch (e) {
    setStatus(`載入失敗：${String(e)}（可能是 CORS 限制，需要 proxy）`, "err");
  }
}

// ---------- Sample ----------
btnSample.addEventListener("click", () => {
  const sample = `# MD Viewer（示範）

預設是 **瀏覽模式**，按「編輯」才可修改。

## 儲存規則
- 能覆蓋就覆蓋（支援 File System Access API 的桌機瀏覽器）
- 不能覆蓋：提示後另存 \`檔名(1).md\`、\`檔名(2).md\`…

## Code
\`\`\`js
console.log("hello markdown");
\`\`\`

> 科技感 UI + RWD
`;
  state.fileHandle = null;
  state.originalFileName = "sample.md";
  state.activeUrl = "";
  state.source = "sample";

  renderMarkdown(sample, { source: state.source });
  setMode("preview");
  setStatus("已載入示範", "ok");
});

// ---------- Share link (URL mode only) ----------
btnCopyLink.addEventListener("click", async () => {
  const url = state.activeUrl || getActiveUrl();
  if (!url) {
    setStatus("目前不是 URL 模式，無法產生可分享的來源連結。", "err");
    return;
  }
  const share = location.href;
  try {
    await navigator.clipboard.writeText(share);
    setStatus("已複製分享連結 ✓", "ok");
  } catch {
    prompt("複製這個連結：", share);
  }
});

// ---------- Save ----------
btnSave.addEventListener("click", async () => {
  // 優先嘗試覆蓋
  const canTryOverwrite = !!state.fileHandle;

  if (canTryOverwrite) {
    try {
      await overwriteToHandle(state.fileHandle, state.currentText);
      setStatus(`已覆蓋儲存：${state.originalFileName}`, "ok");
      renderMarkdown(state.currentText, { source: `local: ${state.originalFileName}` });
      setMode("preview");
      return;
    } catch (e) {
      // 覆蓋失敗 -> 依規則：提示後另存 (n)
      setStatus(`無法覆蓋（${String(e)}），將改用另存序號。`, "err");
      // continue to saveAsNumbered
    }
  } else {
    setStatus("此來源無法覆蓋（瀏覽器限制/URL/拖曳/傳統開檔），將改用另存序號。", "err");
  }

  // 另存序號
  const suggested = nextNumberedName(state.originalFileName || "note.md");
  downloadTextAsFile(state.currentText, suggested);
  setStatus(`已另存：${suggested}`, "ok");
  // 另存後不強制切回 preview，你的需求沒要求，我這裡幫你切回 preview 讓使用流程像「存檔完成」
  renderMarkdown(state.currentText, { source: `saved-as: ${suggested}` });
  setMode("preview");
});

async function overwriteToHandle(handle, text) {
  // 需要使用者授權；若權限不足會 throw
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

// ---------- Numbered filename: name(1).md, name(2).md... ----------
function splitNameAndExt(fileName) {
  const name = (fileName || "note.md").trim();
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { base: name, ext: ".md" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

function normalizeBase(base) {
  // 把已經有的 (n) 去掉，避免變成 note(1)(2)
  // e.g. "note(3)" -> "note"
  return base.replace(/\(\d+\)$/, "").trim();
}

function counterKey(base) {
  return `mdv.counter:${base}`;
}

function nextNumberedName(originalName) {
  const { base, ext } = splitNameAndExt(originalName || "note.md");
  const cleanBase = normalizeBase(base);

  const key = counterKey(cleanBase);
  let n = parseInt(localStorage.getItem(key) || "0", 10);
  if (!Number.isFinite(n) || n < 0) n = 0;
  n += 1;
  localStorage.setItem(key, String(n));

  return `${cleanBase}(${n})${ext || ".md"}`;
}

function downloadTextAsFile(text, filename) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Hash routing for URL ----------
function setActiveUrl(url) {
  if (!url) {
    history.replaceState(null, "", location.pathname + location.search);
    return;
  }
  const encoded = encodeURIComponent(url);
  history.replaceState(null, "", `#${encoded}`);
}
function getActiveUrl() {
  const hash = location.hash?.slice(1) || "";
  if (!hash) return "";
  const [encodedUrl] = hash.split("::");
  try { return decodeURIComponent(encodedUrl); } catch { return ""; }
}

// ---------- On load ----------
window.addEventListener("load", async () => {
  const url = getActiveUrl();
  if (url) {
    urlInput.value = url;
    await loadFromUrl(url, false);
  } else {
    btnSample.click();
  }
});
window.addEventListener("hashchange", async () => {
  const url = getActiveUrl();
  if (url) {
    urlInput.value = url;
    await loadFromUrl(url, false);
  }
});

// default mode = preview
setMode("preview");
