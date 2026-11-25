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

export interface ExcelSheetData {
  name: string;
  headers: string[];
  rows: (string | number)[][];
  /** Plages de cellules à fusionner au format Excel, ex: ['A1:A2', 'B1:B2', 'C1:C2', 'D1:F1', 'G1:G2'] */
  merges?: string[];
}

function escapeXml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colIndexToLetter(index: number): string {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildStoreZip(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data = file.data;
    const crc = crc32(data);

    // Local file header (30 bytes + name + data)
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // compression: STORE (0)
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x21, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    // Central directory header (46 bytes + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // STORE
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((acc, p) => acc + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of localParts) {
    out.set(p, pos);
    pos += p.length;
  }
  for (const p of centralParts) {
    out.set(p, pos);
    pos += p.length;
  }
  out.set(eocd, pos);
  return out;
}

/**
 * Exporte un classeur Excel (.xlsx) contenant plusieurs onglets (feuilles).
 */
export function exportMultiSheetXlsx(filename: string, sheets: ExcelSheetData[]) {
  const encoder = new TextEncoder();

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, idx) => `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n  ')}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const sanitizeSheetName = (raw: string, index: number) => {
    const cleaned = raw.replace(/[:\\/?*\[\]]/g, ' ').trim();
    return (cleaned || `Feuille ${index + 1}`).slice(0, 31);
  };

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((s, idx) => `<sheet name="${escapeXml(sanitizeSheetName(s.name, idx))}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`).join('\n    ')}
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, idx) => `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`).join('\n  ')}
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;

  const files: { path: string; data: Uint8Array }[] = [
    { path: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { path: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { path: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { path: 'xl/styles.xml', data: encoder.encode(stylesXml) },
  ];

  sheets.forEach((sheet, idx) => {
    const allRows: (string | number)[][] = [sheet.headers, ...sheet.rows];
    const colCount = Math.max(sheet.headers.length, ...sheet.rows.map(r => r.length), 1);
    const colWidths: number[] = new Array(colCount).fill(12);

    allRows.forEach(r => {
      r.forEach((cellVal, cIdx) => {
        const len = String(cellVal ?? '').length;
        if (len + 4 > colWidths[cIdx]) {
          colWidths[cIdx] = Math.min(len + 4, 45);
        }
      });
    });

    const colsXml = `<cols>${colWidths.map((w, cIdx) => `<col min="${cIdx + 1}" max="${cIdx + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;

    const rowsXml = allRows
      .map((row, rIdx) => {
        const rowNum = rIdx + 1;
        const firstCellStr = typeof row[0] === 'string' ? row[0].trim().toLowerCase() : '';
        const isSectionHeader =
          firstCellStr.length > 0 &&
          row.slice(1).every((c) => c === '' || c === null || c === undefined);
        const isSubHeader =
          rIdx === 1 &&
          firstCellStr === '' &&
          row.some((c) => typeof c === 'string' && c.trim().length > 0);
        const isHeaderOrTotal =
          rIdx === 0 ||
          isSubHeader ||
          firstCellStr.startsWith('total') ||
          firstCellStr.startsWith('contentieux') ||
          isSectionHeader;
        const styleAttr = isHeaderOrTotal ? ' s="1"' : ' s="0"';

        const cellsXml = row
          .map((cellVal, cIdx) => {
            const cellRef = `${colIndexToLetter(cIdx)}${rowNum}`;
            if (typeof cellVal === 'number' && Number.isFinite(cellVal)) {
              return `<c r="${cellRef}"${styleAttr}><v>${cellVal}</v></c>`;
            }
            const str = String(cellVal ?? '');
            return `<c r="${cellRef}" t="inlineStr"${styleAttr}><is><t>${escapeXml(str)}</t></is></c>`;
          })
          .join('');
        return `<row r="${rowNum}">${cellsXml}</row>`;
      })
      .join('\n    ');

    const mergesXml =
      sheet.merges && sheet.merges.length > 0
        ? `\n  <mergeCells count="${sheet.merges.length}">${sheet.merges
            .map((ref) => `<mergeCell ref="${escapeXml(ref)}"/>`)
            .join('')}</mergeCells>`
        : '';

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>
    ${rowsXml}
  </sheetData>${mergesXml}
</worksheet>`;

    files.push({
      path: `xl/worksheets/sheet${idx + 1}.xml`,
      data: encoder.encode(sheetXml),
    });
  });

  const zipBytes = buildStoreZip(files);
  const blob = new Blob([zipBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanName = filename.replace(/\.(csv|xlsx|xls)$/i, '');
  a.download = `${cleanName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
