/* MD Viewer - Final Stable
 * - Default preview, click edit to modify
 * - Local open: overwrite picker if available, else file input
 * - Save: overwrite if possible; otherwise numbered Save As + alert message
 * - Code blocks: NEVER wrap, horizontal scroll only + fade scroll hint
 * - Copy button (top-left) on each code block (no overlap with code)
 * - Mobile drawer sidebar
 * - Recent opened list with search (stored on device, includes content snapshot)
 * - Find in document (Ctrl/⌘+K), next/prev, ESC to close
 * - Remember scroll position per doc source
 * - Themes: dark / light / eye
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

const btnFind = el("btnFind");
const findbar = el("findbar");
const findInput = el("findInput");
const findPrev = el("findPrev");
const findNext = el("findNext");
const findClose = el("findClose");

const dropzone = el("dropzone");

const editorWrap = el("editorWrap");
const editor = el("editor");
const editorMeta = el("editorMeta");

const recentListEl = el("recentList");
const recentSearchEl = el("recentSearch");

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
  mode: "preview",          // preview | edit
  currentText: "",
  source: "—",

  // overwrite save
  fileHandle: null,
  originalFileName: "",

  // url mode
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

    setStatus("編輯模式：修改後按「儲存」", "ok");
  } else {
    editorWrap.hidden = true;
    btnSave.disabled = true;
    setStatus("瀏覽模式", "ok");
  }
}
btnModePreview.addEventListener("click", () => setMode("preview"));
btnModeEdit.addEventListener("click", () => setMode("edit"));

// editor live preview
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

  // links target blank
  contentEl.querySelectorAll("a[href]").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });

  buildTOC();
  injectCopyButtons();
  initCodeScrollHints();

  metaEl.textContent = `Source: ${source} • Size: ${size.toLocaleString()} chars • Rendered: ${when}`;

  // restore scroll after render
  setTimeout(() => restoreScroll(), 60);
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

// ---------- Copy buttons on code blocks (top-left) ----------
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

// ---------- Code scroll hint (fade shadows) ----------
function initCodeScrollHints() {
  const pres = contentEl.querySelectorAll("pre");
  pres.forEach((pre) => {
    const update = () => updatePreScrollAttrs(pre);
    update();
    pre.addEventListener("scroll", update, { passive: true });
    // Also update when window resizes (layout changes)
    window.addEventListener("resize", update, { passive: true });
  });
}

function updatePreScrollAttrs(pre) {
  const maxScrollLeft = pre.scrollWidth - pre.clientWidth;
  const left = pre.scrollLeft;
  const canScroll = maxScrollLeft > 2;

  if (!canScroll) {
    pre.dataset.scrollLeft = "false";
    pre.dataset.scrollRight = "false";
    return;
  }

  pre.dataset.scrollLeft = left > 2 ? "true" : "false";
  pre.dataset.scrollRight = left < (maxScrollLeft - 2) ? "true" : "false";
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

// ---------- Local Open (merged) ----------
btnOpenLocal.addEventListener("click", async () => {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: "Markdown",
          accept: {
            "text/markdown": [".md", ".markdown"],
            "text/plain": [".txt"]
          }
        }]
      });

      const file = await handle.getFile();
      const text = await file.text();

      state.fileHandle = handle;
      state.originalFileName = file.name || "note.md";
      state.activeUrl = "";
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
      // user cancel -> fallback to file input (no error)
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

    state.fileHandle = null;
    state.originalFileName = file.name || "note.md";
    state.activeUrl = "";
    state.source = `local: ${state.originalFileName}`;

    renderMarkdown(text, { source: state.source });
    setMode("preview");

    addRecent({
      type: "local",
      title: state.originalFileName,
      subtitle: "Local (snapshot saved on this device)",
      content: text
    });

    setStatus(`已開啟：${state.originalFileName}（拖曳無法覆蓋，只能另存）`, "ok");
    closeSidebar();
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

    addRecent({
      type: "url",
      title: url,
      subtitle: "URL (content snapshot saved)",
      content: text
    });

    closeSidebar();
  } catch (e) {
    setStatus(`載入失敗：${String(e)}（可能是 CORS 限制，需要 proxy）`, "err");
  }
}

// ---------- Sample ----------
btnSample.addEventListener("click", () => {
  const sample = `# MD Viewer（最終穩定版示範）

- 程式碼：**不換行**、只允許左右滑動（GitHub 行為）
- 程式碼左上角有 Copy（不會蓋到內容）
- 會顯示左右滑動提示陰影（可滑時才出現）
- 最近清單：裝置內保存一份快照（可搜尋）
- 文件搜尋：Ctrl/⌘ + K

## Code
\`\`\`bash
sudo systemctl restart networking && echo "done"
\`\`\`

\`\`\`js
function hello(name){
  return "Hello " + name;
}
console.log(hello("World"));
\`\`\`

> 主題：Dark / Light / Eye（護眼偏米白）
`;
  state.fileHandle = null;
  state.originalFileName = "sample.md";
  state.activeUrl = "";
  state.source = "sample";

  renderMarkdown(sample, { source: state.source });
  setMode("preview");
  setStatus("已載入示範", "ok");

  addRecent({
    type: "sample",
    title: "sample.md",
    subtitle: "Sample",
    content: sample
  });
});

// ---------- Share link (URL only) ----------
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
  // Try overwrite
  if (state.fileHandle) {
    try {
      await overwriteToHandle(state.fileHandle, state.currentText);
      setStatus(`已覆蓋儲存：${state.originalFileName}`, "ok");
      renderMarkdown(state.currentText, { source: `local: ${state.originalFileName}` });
      setMode("preview");

      addRecent({
        type: "local",
        title: state.originalFileName,
        subtitle: "Local (snapshot updated)",
        content: state.currentText
      });

      return;
    } catch (e) {
      alert(`無法覆蓋原檔（瀏覽器權限/限制）：\n${String(e)}\n\n將改用另存序號。`);
      setStatus(`無法覆蓋（${String(e)}），將改用另存序號。`, "err");
    }
  } else {
    alert("此來源無法覆蓋（拖曳/相容選檔/URL）。將另存為 檔名(1).md、(2)…");
    setStatus("此來源無法覆蓋，將改用另存序號。", "err");
  }

  // Save as numbered
  const suggested = nextNumberedName(state.originalFileName || "note.md");
  downloadTextAsFile(state.currentText, suggested);

  setStatus(`已另存：${suggested}`, "ok");
  renderMarkdown(state.currentText, { source: `saved-as: ${suggested}` });
  setMode("preview");

  addRecent({
    type: "local",
    title: suggested,
    subtitle: "Saved as numbered file",
    content: state.currentText
  });
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

// ---------- Recent list (device cache) ----------
const RECENT_KEY = "mdv.recent.v1";
const RECENT_MAX = 12;
const CACHE_PREFIX = "mdv.cache:";
const CACHE_MAX_CHARS = 180_000; // keep it safe-ish

function safeKey(s) {
  const base = String(s).slice(0, 80);
  return base.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "_");
}

function addRecent({ type, title, subtitle, content }) {
  try {
    const now = Date.now();
    const id = `${type}:${safeKey(title)}:${now}`;
    const cacheKey = `${CACHE_PREFIX}${safeKey(id)}`;

    const text = String(content || "");
    localStorage.setItem(cacheKey, text.length <= CACHE_MAX_CHARS ? text : text.slice(0, CACHE_MAX_CHARS));

    const item = { id, type, title, subtitle, ts: now, cacheKey };

    const list = getRecent();
    const filtered = list.filter(x => !(x.type === type && x.title === title));
    filtered.unshift(item);

    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, RECENT_MAX)));
    renderRecent(recentSearchEl.value.trim().toLowerCase());
  } catch {}
}

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") || []; }
  catch { return []; }
}

function removeRecent(id) {
  const list = getRecent();
  const target = list.find(x => x.id === id);
  if (target?.cacheKey) {
    try { localStorage.removeItem(target.cacheKey); } catch {}
  }
  const next = list.filter(x => x.id !== id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  renderRecent(recentSearchEl.value.trim().toLowerCase());
}

function clearRecent() {
  const list = getRecent();
  list.forEach(x => {
    try { if (x.cacheKey) localStorage.removeItem(x.cacheKey); } catch {}
  });
  localStorage.removeItem(RECENT_KEY);
  renderRecent("");
}

btnClearRecent.addEventListener("click", () => {
  clearRecent();
  setStatus("已清除最近清單", "ok");
});

recentSearchEl.addEventListener("input", () => {
  renderRecent(recentSearchEl.value.trim().toLowerCase());
});

function renderRecent(filter = "") {
  const list = getRecent();
  recentListEl.innerHTML = "";

  const filtered = list.filter(item => {
    if (!filter) return true;
    return String(item.title || "").toLowerCase().includes(filter) ||
           String(item.subtitle || "").toLowerCase().includes(filter) ||
           String(item.type || "").toLowerCase().includes(filter);
  });

  if (!filtered.length) {
    recentListEl.innerHTML = `<div class="hint">（沒有符合的項目）</div>`;
    return;
  }

  filtered.forEach((item) => {
    const wrap = document.createElement("div");
    wrap.className = "recentItem";

    const main = document.createElement("div");
    main.className = "recentMain";

    const title = document.createElement("div");
    title.className = "recentTitle";
    title.textContent = item.title;

    const sub = document.createElement("div");
    sub.className = "recentSub";
    const d = new Date(item.ts);
    sub.textContent = `${item.type.toUpperCase()} • ${d.toLocaleString()} • ${item.subtitle || ""}`;

    main.appendChild(title);
    main.appendChild(sub);

    const btns = document.createElement("div");
    btns.className = "recentBtns";

    const openBtn = document.createElement("button");
    openBtn.className = "smallbtn";
    openBtn.textContent = "開啟";
    openBtn.addEventListener("click", () => openRecent(item));

    const delBtn = document.createElement("button");
    delBtn.className = "smallbtn";
    delBtn.textContent = "刪除";
    delBtn.addEventListener("click", () => removeRecent(item.id));

    btns.appendChild(openBtn);
    btns.appendChild(delBtn);

    wrap.appendChild(main);
    wrap.appendChild(btns);
    recentListEl.appendChild(wrap);
  });
}

function openRecent(item) {
  let text = "";
  try { text = localStorage.getItem(item.cacheKey || "") || ""; } catch {}
  if (!text) {
    setStatus("此項目快照不存在或已被清除。", "err");
    return;
  }

  // Open snapshot (cannot restore overwrite handle)
  state.fileHandle = null;
  state.originalFileName = item.type === "local" || item.type === "sample" ? item.title : "";
  state.activeUrl = item.type === "url" ? item.title : "";
  state.source = `recent: ${item.title}`;

  if (item.type === "url") urlInput.value = item.title;

  renderMarkdown(text, { source: state.source });
  setMode("preview");
  setStatus("已從最近清單開啟（快照）", "ok");
  closeSidebar();
}

// ---------- Find in document ----------
let findHits = [];
let findIndex = -1;
let findKeyword = "";

function openFindBar() {
  findbar.hidden = false;
  findInput.focus({ preventScroll: true });
  findInput.select();
}
function closeFindBar() {
  findbar.hidden = true;
  findKeyword = "";
  findHits = [];
  findIndex = -1;
  // re-render to remove highlights (stable)
  renderMarkdown(state.currentText, { source: state.source });
}

btnFind.addEventListener("click", () => {
  if (findbar.hidden) openFindBar();
  else closeFindBar();
});
findClose.addEventListener("click", closeFindBar);

document.addEventListener("keydown", (e) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const mod = isMac ? e.metaKey : e.ctrlKey;

  // Ctrl/⌘+K open find
  if (mod && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (findbar.hidden) openFindBar();
    else closeFindBar();
  }

  // ESC closes find
  if (e.key === "Escape" && !findbar.hidden) {
    e.preventDefault();
    closeFindBar();
  }

  // Enter next/prev when find input focused
  if (!findbar.hidden && document.activeElement === findInput) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) gotoPrevHit();
      else gotoNextHit();
    }
  }
});

findInput.addEventListener("input", () => {
  findKeyword = findInput.value.trim();
  applyFind(findKeyword);
});

findNext.addEventListener("click", gotoNextHit);
findPrev.addEventListener("click", gotoPrevHit);

function applyFind(keyword) {
  // remove highlights by re-render
  if (!keyword) {
    renderMarkdown(state.currentText, { source: state.source });
    findHits = [];
    findIndex = -1;
    return;
  }

  // Render once, then inject <mark> safely by highlighting in DOM text nodes
  renderMarkdown(state.currentText, { source: state.source });

  const marks = highlightTextNodes(contentEl, keyword);
  findHits = marks;
  findIndex = marks.length ? 0 : -1;

  if (findHits.length) {
    scrollToHit(findIndex);
    setStatus(`搜尋：找到 ${findHits.length} 筆`, "ok");
  } else {
    setStatus("搜尋：沒有結果", "err");
  }
}

function gotoNextHit() {
  if (!findHits.length) return;
  findIndex = (findIndex + 1) % findHits.length;
  scrollToHit(findIndex);
}
function gotoPrevHit() {
  if (!findHits.length) return;
  findIndex = (findIndex - 1 + findHits.length) % findHits.length;
  scrollToHit(findIndex);
}

function scrollToHit(idx) {
  const el = findHits[idx];
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* Highlight keyword in text nodes only (avoid breaking code blocks/buttons) */
function highlightTextNodes(root, keyword) {
  const marks = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;

      // Skip inside code/pre/script/style/buttons
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest("pre, code, script, style, button, textarea, input")) return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const re = new RegExp(escapeRegExp(keyword), "gi");
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    if (!re.test(text)) return;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    re.lastIndex = 0;

    let m;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;

      if (start > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));

      const mark = document.createElement("mark");
      mark.textContent = text.slice(start, end);
      frag.appendChild(mark);
      marks.push(mark);

      lastIndex = end;
    }

    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));

    textNode.parentNode.replaceChild(frag, textNode);
  });

  return marks;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- Remember scroll position ----------
const SCROLL_KEY = "mdv.scroll.";

function scrollKeyForSource() {
  return SCROLL_KEY + (state.source || "unknown");
}

function saveScroll() {
  try {
    localStorage.setItem(scrollKeyForSource(), String(contentEl.scrollTop || 0));
  } catch {}
}

function restoreScroll() {
  try {
    const v = localStorage.getItem(scrollKeyForSource());
    if (v !== null) contentEl.scrollTop = parseInt(v, 10) || 0;
  } catch {}
}

let scrollRaf = null;
contentEl.addEventListener("scroll", () => {
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(saveScroll);
}, { passive: true });

// ---------- Boot ----------
function boot() {
  setMode("preview");
  renderRecent("");
  btnSample.click();
}
boot();