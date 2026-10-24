// ─── PDF helper — memory-aware, supports large PDFs ──────────────────────────
// Strategy: render each page → emit base64 → IMMEDIATELY release canvas + page.
// This keeps memory usage flat regardless of PDF size.

import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfjsPromise;
const pdfLoadingTasks = new WeakMap();

function getPdfJs() {
  if (!pdfjsPromise) {
    // Keep the PDF engine out of the initial UI bundle and reuse it per session.
    pdfjsPromise = import("pdfjs-dist/build/pdf.mjs")
      .then(pdfjsLib => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
        return pdfjsLib;
      })
      .catch(error => {
        pdfjsPromise = null;
        throw error;
      });
  }
  return pdfjsPromise;
}

// Adaptive scale ceiling. Lower = smaller files, faster, less memory.
const MAX_IMAGE_DIMENSION = 2400;
const TARGET_SCALE = 2.0;

// ─── Load PDF document ──────────────────────────────────────────────────────
export async function loadPdf(arrayBuffer) {
  const pdfjsLib = await getPdfJs();
  // disableAutoFetch + disableStream = don't pre-fetch all pages (saves memory)
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
  });
  try {
    const pdf = await loadingTask.promise;
    pdfLoadingTasks.set(pdf, loadingTask);
    return pdf;
  } catch (error) {
    try { await loadingTask.destroy(); } catch {}
    throw error;
  }
}

// ─── Destroy PDF and free memory ────────────────────────────────────────────
export async function destroyPdf(pdf) {
  if (!pdf) return;
  try { await pdf.cleanup(); } catch {}
  const loadingTask = pdfLoadingTasks.get(pdf);
  pdfLoadingTasks.delete(pdf);
  try {
    if (loadingTask) await loadingTask.destroy();
  } catch {}
}

// ─── Render one page and IMMEDIATELY release its resources ──────────────────
// This is the critical function for handling large PDFs.
export async function pdfPageToBase64(pdf, pageNum) {
  let page = null;
  let canvas = null;
  try {
    page = await pdf.getPage(pageNum);

    // Adaptive scale — keep max dimension under MAX_IMAGE_DIMENSION
    const baseVp = page.getViewport({ scale: 1.0 });
    const maxDim = Math.max(baseVp.width, baseVp.height);
    let scale = TARGET_SCALE;
    if (maxDim * scale > MAX_IMAGE_DIMENSION) {
      scale = MAX_IMAGE_DIMENSION / maxDim;
    }
    scale = Math.max(scale, 1.0);

    const vp = page.getViewport({ scale });
    canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // Convert to base64 JPEG (smaller than PNG, same OCR quality)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const base64 = dataUrl.split(",")[1];

    return base64;
  } finally {
    // ─── CRITICAL: release resources after each page ────────────────────
    // Without this, large PDFs (50+ pages) accumulate memory and crash browser.
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }
    if (page) {
      try { page.cleanup(); } catch {}
      page = null;
    }
  }
}

// ─── Camada de TEXTO (PDF digital) ──────────────────────────────────────────
// PDF "nascido digital" já traz o texto embutido. Ler essa camada é mais fiel
// (não é OCR — são os caracteres exatos), mais barato (não vai imagem no
// prompt) e mais rápido do que rasterizar a página.
// O LAYOUT é preservado: os pedaços são agrupados por linha (coordenada Y) e
// separados por espaços proporcionais ao vão horizontal, para que as COLUNAS
// (ex.: um cabeçalho "Mãe" à direita) continuem reconhecíveis pela IA.
const COL_GAP = 40;    // vão largo = mudança de coluna
const WORD_GAP = 8;    // vão pequeno = separação de palavras

export async function pdfPageToText(pdf, pageNum) {
  let page = null;
  try {
    page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const rows = new Map();
    for (const it of content.items) {
      if (it.str === undefined) continue;
      const y = Math.round(it.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], s: it.str });
    }

    const lines = [];
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {   // topo → rodapé
      const row = rows.get(y).sort((a, b) => a.x - b.x);
      let prevX = null, line = "";
      for (const g of row) {
        if (prevX !== null && g.x - prevX > COL_GAP) line += "    ";
        else if (prevX !== null && g.x - prevX > WORD_GAP) line += " ";
        line += g.s;
        prevX = g.x + g.s.length * 5;   // largura aproximada do trecho
      }
      if (line.trim()) lines.push(line);
    }
    return lines.join("\n");
  } finally {
    if (page) {
      try { page.cleanup(); } catch {}
      page = null;
    }
  }
}

// Abaixo disso a página não tem texto aproveitável (escaneada) → usar imagem.
export const MIN_PAGE_TEXT_CHARS = 80;

// PDF escaneado (foto/scan) não tem camada de texto: getTextContent volta vazio
// ou com lixo mínimo. Sondamos as primeiras páginas — se QUALQUER uma trouxer
// texto substancial, o documento é digital.
export async function pdfHasTextLayer(pdf, probePages = 3) {
  const n = Math.min(probePages, pdf.numPages);
  for (let i = 1; i <= n; i++) {
    try {
      const t = await pdfPageToText(pdf, i);
      if (t.replace(/\s/g, "").length >= MIN_PAGE_TEXT_CHARS) return true;
    } catch { /* página problemática não decide pelo documento inteiro */ }
  }
  return false;
}

// ─── Estimate memory pressure (heuristic) ───────────────────────────────────
export function estimateMemoryPressure() {
  if (typeof performance === "undefined" || !performance.memory) {
    return { available: false };
  }
  const used = performance.memory.usedJSHeapSize;
  const total = performance.memory.totalJSHeapSize;
  const limit = performance.memory.jsHeapSizeLimit;
  return {
    available: true,
    used_mb: Math.round(used / 1048576),
    total_mb: Math.round(total / 1048576),
    limit_mb: Math.round(limit / 1048576),
    usage_pct: Math.round((used / limit) * 100),
  };
}

// ─── Resize image (for big image files) ─────────────────────────────────────
export async function resizeImageIfNeeded(file) {
  if (file.size < 4 * 1024 * 1024) {
    return { base64: await fileToBase64(file), mediaType: file.type };
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (Math.max(width, height) > MAX_IMAGE_DIMENSION) {
        const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
        width *= scale;
        height *= scale;
      }
      let canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      // Release canvas
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
      resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("Falha ao carregar imagem para redimensionar"));
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
