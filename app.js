/* MD Viewer - app.js (Edit + Save)
 * - 預設 Preview
 * - 按「編輯」才可改
 * - 儲存：能覆蓋就覆蓋；不能覆蓋 => 提示並另存 檔名(1).md, (2)...
 * - 本機入口同時支援：
 *    A) 本機 MD（可覆蓋優先） -> showOpenFilePicker
 *    B) 選擇檔案（相容） -> <input type="file"> 永遠可用
 *    C) 拖曳進 dropzone
 */

const el = (id) => document.getElementById(id);

// UI
const contentEl = el("content");
const tocEl = el("toc");
const statusEl = el("status");
const metaEl = el("meta");
const sidebarEl = el("sidebar");

const btnOpenLocal = el("btnOpenLocal");
const btnChooseFile = el("btnChooseFile");
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
  fileHandle: null,         // FileSystemFileHandle (if available)
  originalFileName: "",     // e.g. note.md
  activeUrl: ""
};

function setMode(mode) {
  state.mode = mode;

  if (mode === "edit") {
    editorWrap.hidden = false;
    btnSave.disabled = false;

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

// editor 即時預覽
let renderTimer = null;
editor.addEventListener("input", () => {
  state.currentText = editor.value;
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

// ---------- Local Open: A) Overwrite-capable picker ----------
btnOpenLocal.addEventListener("click", async () => {
  // 支援 File System Access API -> 可取得 handle（才可能覆蓋）
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
      // 使用者取消或失敗 -> 不強迫 fallback
      setStatus("已取消開檔（你也可以用「選擇檔案」或拖曳）」");
      return;
    }
  }

  // 不支援 showOpenFilePicker -> 改走相容選檔
  fileInput.click();
});

// ---------- Local Open: B) Always-available file input ----------
btnChooseFile.addEventListener("click", () => {
  fileInput.click();
});

// file input
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

    state.fileHandle = null; // 拖曳拿不到 handle
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
  await loadFromUrl(url);
});

async function loadFromUrl(url) {
  try {
    setStatus("Fetching URL…");
    const res = await fetch(url, { method: "GET", mode: "cors", cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    state.fileHandle = null;
    state.originalFileName = "";
    state.activeUrl = url;
    state.source = `url: ${url}`;

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

本機來源入口同時支援：
- 拖曳進來
- 點按「本機 MD」或「選擇檔案」

預設 **瀏覽模式**，按「編輯」才可修改。

## 儲存規則
- 能覆蓋就覆蓋（支援 File System Access API 的桌機瀏覽器）
- 不能覆蓋：提示後另存 \`檔名(1).md\`、\`檔名(2).md\`…

\`\`\`js
console.log("hello markdown");
\`\`\`
`;
  state.fileHandle = null;
  state.originalFileName = "sample.md";
  state.activeUrl = "";
  state.source = "sample";

  renderMarkdown(sample, { source: state.source });
  setMode("preview");
  setStatus("已載入示範", "ok");
});

// ---------- Copy share link (URL only) ----------
btnCopyLink.addEventListener("click", async () => {
  if (!state.activeUrl) {
    setStatus("目前不是 URL 模式，無法複製可分享來源連結。", "err");
    return;
  }
  const share = `${location.origin}${location.pathname}#${encodeURIComponent(state.activeUrl)}`;
  try {
    await navigator.clipboard.writeText(share);
    setStatus("已複製分享連結 ✓", "ok");
  } catch {
    prompt("複製這個連結：", share);
  }
});

// ---------- Save ----------
btnSave.addEventListener("click", async () => {
  // 優先嘗試覆蓋（只有 showOpenFilePicker 開的檔才可能有 handle）
  if (state.fileHandle) {
    try {
      await overwriteToHandle(state.fileHandle, state.currentText);
      setStatus(`已覆蓋儲存：${state.originalFileName}`, "ok");
      renderMarkdown(state.currentText, { source: `local: ${state.originalFileName}` });
      setMode("preview");
      return;
    } catch (e) {
      setStatus(`無法覆蓋（${String(e)}），將改用另存序號。`, "err");
      // 續走另存
    }
  } else {
    setStatus("此來源無法覆蓋（拖曳/相容選檔/URL），將改用另存序號。", "err");
  }

  const suggested = nextNumberedName(state.originalFileName || "note.md");
  downloadTextAsFile(state.currentText, suggested);
  setStatus(`已另存：${suggested}`, "ok");
  renderMarkdown(state.currentText, { source: `saved-as: ${suggested}` });
  setMode("preview");
});

async function overwriteToHandle(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

// ---------- Numbered filename ----------
function splitNameAndExt(fileName) {
  const name = (fileName || "note.md").trim();
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { base: name, ext: ".md" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}
function normalizeBase(base) {
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

// ---------- Default ----------
setMode("preview");
btnSample.click();
