/* MD Viewer - app.js (Optimized)
 * ✅ Code block copy button (position controlled by CSS)
 * ✅ Mobile drawer sidebar
 * ✅ Merge "open local" (overwrite picker if possible; else file input)
 * ✅ Recent opened list (device localStorage)
 * ✅ Themes: dark / light / eye
 * ✅ Default preview, click to edit
 * ✅ Save: overwrite if possible else numbered Save As
 */

const el = (id) => document.getElementById(id);

// UI
const contentEl = el("content");
const tocEl = el("toc");
const statusEl = el("status");
const metaEl = el("meta");

const sidebarEl = el("sidebar");
const overlayEl = el("overlay");
const btnSidebar = el("btnSidebar");

const btnOpenLocal = el("btnOpenLocal");
const fileInput = el("fileInput");

const urlInput = el("urlInput");
const btnLoadUrl = el("btnLoadUrl");

const btnSample = el("btnSample");
const btnCopyLink = el("btnCopyLink");
const btnClearRecent = el("btnClearRecent");

const btnTheme = el("btnTheme");
const btnModePreview = el("btnModePreview");
const btnModeEdit = el("btnModeEdit");
const btnSave = el("btnSave");

const dropzone = el("dropzone");

const editorWrap = el("editorWrap");
const editor = el("editor");
const editorMeta = el("editorMeta");

const recentListEl = el("recentList");

// ---------- Theme ----------
const THEME_KEY = "mdv.theme";
const THEMES = ["dark", "light", "eye"];

function getTheme() {
  const v = localStorage.getItem(THEME_KEY) || "dark";
  return THEMES.includes(v) ? v : "dark";
}
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  setStatus(`Theme: ${theme}`, "ok");
}
setTheme(getTheme());

btnTheme.addEventListener("click", () => {
  const now = getTheme();
  const idx = THEMES.indexOf(now);
  const next = THEMES[(idx + 1) % THEMES.length];
  setTheme(next);
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

// ---------- Sidebar (mobile drawer) ----------
function openSidebar() {
  sidebarEl.classList.add("open");
  overlayEl.hidden = false;
}
function closeSidebar() {
  sidebarEl.classList.remove("open");
  overlayEl.hidden = true;
}
btnSidebar?.addEventListener("click", () => {
  if (sidebarEl.classList.contains("open")) closeSidebar();
  else openSidebar();
});
overlayEl.addEventListener("click", closeSidebar);

// ---------- State ----------
const state = {
  mode: "preview",
  currentText: "",
  source: "—",
  fileHandle: null,
  originalFileName: "",
  activeUrl: "",
  cacheKey: ""
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

    setStatus("編輯模式：修改後按「儲存」", "ok");
  } else {
    editorWrap.hidden = true;
    btnSave.disabled = true;
    setStatus("瀏覽模式", "ok");
  }
}
btnModePreview.addEventListener("click", () => setMode("preview"));
btnModeEdit.addEventListener("click", () => setMode("edit"));

// Editor live preview
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

  contentEl.querySelectorAll("a[href]").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });

  buildTOC();
  injectCopyButtons();

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
      closeSidebar();
    });

    frag.appendChild(a);
  });

  tocEl.appendChild(frag);
}

// Copy buttons (position is CSS)
function injectCopyButtons() {
  contentEl.querySelectorAll(".copybtn").forEach((b) => b.remove());

  const blocks = contentEl.querySelectorAll("pre > code");
  blocks.forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (!pre) return;

    const btn = document.createElement("button");
    btn.className = "copybtn";
    btn.type = "button";
    btn.textContent = "Copy";

    btn.addEventListener("click", async () => {
      const text = codeEl.innerText || codeEl.textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied ✓";
        setTimeout(() => (btn.textContent = "Copy"), 900);
      } catch {
        prompt("複製以下內容：", text);
      }
    });

    pre.appendChild(btn);
  });
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

// ---------- Open Local (merged) ----------
btnOpenLocal.addEventListener("click", async () => {
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
      state.cacheKey = "";
      state.source = `local: ${state.originalFileName}`;

      renderMarkdown(text, { source: state.source });
      setMode("preview");

      addRecent({
        type: "local",
        title: state.originalFileName,
        subtitle: "Local (snapshot saved on this device)",
        content: text
      });

      setStatus(`已開啟：${state.originalFileName}（可嘗試覆蓋儲存）`, "ok");
      closeSidebar();
      return;
    } catch (e) {
      // fall back
    }
  }
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    setStatus("Reading local file…");
    const text = await file.text();

    state.fileHandle = null;
    state.originalFileName = file.name || "note.md";
    state.activeUrl = "";
    state.cacheKey = "";
    state.source = `local: ${state.originalFileName}`;

    renderMarkdown(text, { source: state.source });
    setMode("preview");

    addRecent({
      type: "local",
      title: state.originalFileName,
      subtitle: "Local (snapshot saved on this device)",
      content: text
    });

    setStatus(`已開啟：${state.originalFileName}（此方式無法覆蓋，只能另存）`, "ok");
    closeSidebar();
  } catch (e) {
    setStatus(`Read failed: ${String(e)}`, "err");
  } finally {
    fileInput.value = "";
