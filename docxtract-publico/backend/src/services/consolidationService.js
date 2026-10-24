// ─── Consolidation service ──────────────────────────────────────────────────
// Merges per-page results into a single, clean document JSON ready for Excel.

// ─── Per-page dedup: same field name appearing twice in one page ────────────
function dedupFieldsInPage(fields) {
  // BUG FIX (whole page disappearing): the old dedupe collapsed BY NAME and
  // destroyed entries when the AI returned repeated fields WITHOUT an index
  // (e.g. five "Nome completo"). Now: same name + SAME value = true duplicate
  // (keep best score); same name + DIFFERENT values = distinct form blocks →
  // keep all, numbering by occurrence so the people pivot can group them.
  //
  // BUG FIX 2 (fusão de fichas na mesma página): quando a IA repete o MESMO
  // índice para fichas diferentes ("Nome (1)" duas vezes com valores
  // diferentes), o valor extra era descartado e a 2ª pessoa sumia. Agora a
  // ocorrência extra é renumerada para um índice livre, de forma CONSISTENTE
  // entre os campos (ocorrência k → mesmo índice novo em todos os grupos).
  //
  // BUG FIX 3 (valor compartilhado): em página com múltiplas fichas, um campo
  // SEM índice repetido com o MESMO valor (ex.: mesma "Cidade" nas duas
  // fichas) colapsava em um campo único sem número — e o pivot o perdia para
  // todas as pessoas. Agora ele é replicado numerado para cada ficha.
  const score = (x) =>
    (x.value && String(x.value).trim() ? 100 : 0) +
    (x.confidence || 0) * 10 +
    (x.visual_evidence ? 1 : 0);
  const groups = new Map();
  fields.forEach(f => {
    const key = (f.name || "").trim().toLowerCase();
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  });

  const TAIL_RE = /[\s_\-]*\(?(\d+)\)?\s*$/;
  const stripTail = (name) => {
    const m = name.match(TAIL_RE);
    return (m && m.index > 0) ? name.slice(0, m.index).trim() : name.trim();
  };

  // Sinal de múltiplas fichas na página: máx. entre índices numéricos usados
  // pela IA e o máx. de valores distintos de um mesmo campo sem índice.
  const usedIdx = new Set();
  fields.forEach(f => {
    const m = ((f.name || "").trim()).match(TAIL_RE);
    if (m && m.index > 0) usedIdx.add(Number(m[1]));
  });
  let personCount = usedIdx.size || 1;
  for (const group of groups.values()) {
    const name = (group[0].name || "").trim();
    const m = name.match(TAIL_RE);
    if (m && m.index > 0) continue;
    const distinctVals = new Set(
      group.map(f => (f.value ?? "").toString().trim()).filter(v => v)
    );
    if (distinctVals.size > personCount) personCount = distinctVals.size;
  }

  // Realocação de índice repetido: ocorrência k>0 → índice novo compartilhado
  // entre grupos, para o pivot reconstruir a ficha extra inteira.
  // PASSADA 1 registra TODAS as colisões antes de emitir, para que campos de
  // valor compartilhado com índice repetido (mesma "Cidade (1)" nas duas
  // fichas) também possam ser replicados para os índices realocados.
  let nextFreeIdx = (usedIdx.size ? Math.max(...usedIdx) : 0) + 1;
  const reIdx = new Map();      // `${idxOriginal}|${ocorrência}` → índice novo
  const collisionsPerIdx = new Map();  // idxOriginal → nº de ocorrências extras

  const distinctOf = (group) => {
    const byVal = new Map();
    for (const f of group) {
      const v = (f.value ?? "").toString().trim();
      const ex = byVal.get(v);
      if (!ex || score(f) > score(ex)) byVal.set(v, f);
    }
    return Array.from(byVal.values());
  };

  for (const group of groups.values()) {
    const rawName = (group[0].name || "").trim();
    const mTail = rawName.match(TAIL_RE);
    if (!(mTail && mTail.index > 0)) continue;
    const valued = distinctOf(group).filter(f => (f.value ?? "").toString().trim());
    if (valued.length <= 1) continue;
    const origIdx = mTail[1];
    for (let occ = 1; occ < valued.length; occ++) {
      const key = `${origIdx}|${occ}`;
      if (!reIdx.has(key)) reIdx.set(key, nextFreeIdx++);
    }
    const extras = valued.length - 1;
    if ((collisionsPerIdx.get(origIdx) || 0) < extras) collisionsPerIdx.set(origIdx, extras);
  }

  // PASSADA 2: emissão.
  const out = [];
  for (const group of groups.values()) {
    const distinct = distinctOf(group);
    const rawName = (group[0].name || "").trim();
    const mTail = rawName.match(TAIL_RE);
    const hasNumTail = !!(mTail && mTail.index > 0);

    if (distinct.length === 1) {
      const val = (distinct[0].value ?? "").toString().trim();
      // Valor compartilhado entre fichas (BUG FIX 3): replica numerado.
      if (!hasNumTail && val && group.length > 1 && personCount > 1) {
        const copies = Math.min(group.length, personCount);
        for (let i = 0; i < copies; i++) {
          out.push({ ...distinct[0], name: `${stripTail(rawName)} (${i + 1})` });
        }
        continue;
      }
      // Valor compartilhado com o MESMO índice repetido (ex.: "Cidade (1)"
      // duas vezes, mesmo valor) em página onde houve colisão de índice →
      // replica também para os índices realocados da colisão.
      if (hasNumTail && val && group.length > 1) {
        const origIdx = mTail[1];
        const extras = Math.min(group.length - 1, collisionsPerIdx.get(origIdx) || 0);
        out.push(distinct[0]);
        for (let occ = 1; occ <= extras; occ++) {
          const newIdx = reIdx.get(`${origIdx}|${occ}`);
          if (newIdx != null) {
            out.push({ ...distinct[0], name: `${stripTail(rawName)} (${newIdx})` });
          }
        }
        continue;
      }
      out.push(distinct[0]);
      continue;
    }

    if (hasNumTail) {
      // Só renumera colisões com MAIS DE UM valor preenchido; duplicata com
      // valor vazio é ruído → mantém apenas o melhor (comportamento antigo),
      // sem criar pessoa-fantasma a partir de checkbox repetido.
      const valued = distinct.filter(f => (f.value ?? "").toString().trim());
      if (valued.length <= 1) {
        out.push(distinct.reduce((a, b) => (score(b) > score(a) ? b : a)));
        continue;
      }
      const origIdx = mTail[1];
      valued.forEach((f, occ) => {
        if (occ === 0) { out.push(f); return; }
        const newIdx = reIdx.get(`${origIdx}|${occ}`);
        out.push({ ...f, name: `${stripTail((f.name || "").trim())} (${newIdx})` });
      });
    } else {
      distinct.forEach((f, i) => out.push({ ...f, name: `${(f.name || "").trim()} (${i + 1})` }));
    }
  }
  return out;
}

// ─── Main consolidate ───────────────────────────────────────────────────────
export function consolidateDocument(pages, options = {}) {
  const {
    documentName = "documento",
    requestId = null,
    pipeline = "extract-validate-review",
    totalCost = 0,
    providersUsed = [],
  } = options;

  // Dedup per page
  const cleanedPages = pages.map((p, idx) => ({
    ...p,
    page: p.page || idx + 1,
    fields: dedupFieldsInPage(p.fields || []),
  }));

  // Collect all unique field names across pages (in order of appearance)
  const allFieldNames = [];
  const seen = new Set();
  cleanedPages.forEach(p => {
    (p.fields || []).forEach(f => {
      const key = f.name;
      if (!seen.has(key)) {
        seen.add(key);
        allFieldNames.push(key);
      }
    });
  });

  // Flatten fields and tables with page info
  const allFields = cleanedPages.flatMap(p =>
    (p.fields || []).map(f => ({ ...f, page: p.page }))
  );
  const allTables = cleanedPages.flatMap(p =>
    (p.tables || []).map(t => ({ ...t, page: p.page }))
  );

  // Flatten people with page info (Etapa: Pessoas)
  const allPeople = cleanedPages.flatMap(p =>
    (Array.isArray(p.people) ? p.people : []).map(person => ({
      ...person,
      page: person.page || p.page,
    }))
  );

  // Collect warnings from pages + from fields
  const allWarnings = [];
  cleanedPages.forEach(p => {
    (p.warnings || []).forEach(w => {
      allWarnings.push({
        severity: typeof w === "string" && w.toLowerCase().includes("correção") ? "error" : "warning",
        src: `Pág ${p.page}`,
        msg: typeof w === "string" ? w : (w.msg || JSON.stringify(w)),
      });
    });
  });
  allFields.forEach(f => {
    (f.warnings || []).forEach(w => {
      allWarnings.push({
        severity: typeof w === "string" && w.includes("CORREÇÃO") ? "error" : "warning",
        src: `Pág ${f.page} · ${f.name}`,
        msg: typeof w === "string" ? w : (w.msg || JSON.stringify(w)),
      });
    });
  });
  // People warnings → Avisos
  allPeople.forEach(person => {
    const label = person.nome_completo || `Pessoa (pág ${person.page})`;
    (person.warnings || []).forEach(w => {
      allWarnings.push({
        severity: "warning",
        src: `Pág ${person.page} · ${label}`,
        msg: typeof w === "string" ? w : (w.msg || JSON.stringify(w)),
      });
    });
  });

  // Overall confidence — only count fields with values
  const fieldsWithValue = allFields.filter(f => f.value && String(f.value).trim());
  const overallConfidence = fieldsWithValue.length > 0
    ? fieldsWithValue.reduce((s, f) => s + (f.confidence || 0), 0) / fieldsWithValue.length
    : 0;

  // Table format (rows × columns) for frontend rendering
  const headers = ["_page", ...allFieldNames];
  const rows = cleanedPages.map(p => {
    const row = { _page: p.page };
    allFieldNames.forEach(n => {
      const f = (p.fields || []).find(x => x.name === n);
      row[n] = f ? (f.value ?? "") : "";
    });
    return row;
  });

  return {
    request_id: requestId,
    document_name: documentName,
    generated_at: new Date().toISOString(),
    total_pages: cleanedPages.length,
    pages_processed: cleanedPages.length,
    pipeline,
    providers_used: [...new Set(providersUsed)],
    cost_estimate_usd: Number(totalCost.toFixed(6)),

    // Stats for UI
    overall_confidence: Number(overallConfidence.toFixed(4)),
    fields_count: allFields.length,
    fields_with_value: fieldsWithValue.length,
    tables_count: allTables.length,
    people_count: allPeople.length,
    people_needing_review: allPeople.filter(p => p.needs_review).length,
    warnings_count: allWarnings.length,
    errors_count: allWarnings.filter(w => w.severity === "error").length,
    fields_needing_review: allFields.filter(f => f.needs_review).length,

    // Data for editing / Excel generation
    fields: allFields,
    people: allPeople,
    tables: allTables,
    warnings: allWarnings,
    rows,
    headers,
  };
}
