// ─── Audit log ───────────────────────────────────────────────────────────────
// In-memory rotating log of extraction events. Useful for:
//   - Compliance (who did what when)
//   - Debugging in production
//   - Aggregate stats (cost, usage)
//
// For real production: replace with structured logger writing to DB/file.

const MAX_ENTRIES = 1000;

class AuditLog {
  constructor() {
    this.entries = [];
    this.totals = {
      extractions: 0,
      pages_processed: 0,
      total_cost_usd: 0,
      total_fields_extracted: 0,
      errors: 0,
      since: new Date().toISOString(),
    };
  }

  log(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift(); // FIFO eviction
    }

    // Update aggregates
    if (event.type === "extraction_completed") {
      this.totals.extractions++;
      this.totals.pages_processed += event.pages_processed || 0;
      this.totals.total_cost_usd += event.cost_usd || 0;
      this.totals.total_fields_extracted += event.fields_count || 0;
    }
    if (event.type === "extraction_failed") {
      this.totals.errors++;
    }
  }

  recent(limit = 50) {
    return this.entries.slice(-limit).reverse();
  }

  stats() {
    return {
      ...this.totals,
      total_cost_usd: Number(this.totals.total_cost_usd.toFixed(6)),
      entries_in_log: this.entries.length,
      max_entries: MAX_ENTRIES,
    };
  }
}

export const auditLog = new AuditLog();
