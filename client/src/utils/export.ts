// CSV export helpers (Excel-compatible)
// Usage:
//   exportToCsv('filename.csv', [ { key: 'id', label: 'ID' } ], rows)
// Adds UTF-8 BOM for proper Excel opening and escapes delimiters/quotes/newlines.

export type CsvColumn = { key: string; label: string };

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let cell = String(value);
  // Prevent Excel from converting long numeric identifiers to scientific notation.
  // For example: 190812738792309 -> 1.90813E+14
  // Export as a text formula so Excel preserves it as-is.
  const isLongDigits = /^\d{12,}$/.test(cell);
  const hasLeadingZero = /^0\d+$/.test(cell);
  if (isLongDigits || hasLeadingZero) {
    cell = `="${cell}"`;
  }
  // Normalize newlines
  cell = cell.replace(/\r\n|\r|\n/g, '\n');
  // Escape quotes by doubling them
  if (cell.includes('"')) cell = cell.replace(/"/g, '""');
  const mustQuote = /[",\n;]/.test(cell);
  return mustQuote ? `"${cell}"` : cell;
}

export function exportToCsv(filename: string, columns: CsvColumn[], rows: Record<string, any>[]) {
  const header = columns.map(c => escapeCell(c.label)).join(';'); // Using ';' for French locale Excel
  const body = rows.map(row => columns.map(c => escapeCell(row[c.key])).join(';')).join('\n');
  const csv = `${header}\n${body}`;
  // Prepend BOM for Excel UTF-8 detection
  const blob = new Blob(["\uFEFF", csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportArrayToCsv(filename: string, headerLabels: string[], rows: (string | number)[][]) {
  const header = headerLabels.map(l => escapeCell(l)).join(';');
  const body = rows.map(r => r.map(v => escapeCell(v)).join(';')).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob(["\uFEFF", csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
