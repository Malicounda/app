export interface ExcelSheetData {
  name: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = String(name || `Feuille_${index + 1}`)
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || `Feuille_${index + 1}`;
}

/**
 * Génère et télécharge un classeur Excel multi-onglets (.xls SpreadsheetML XML)
 * compatible nativement avec Microsoft Excel, LibreOffice Calc et Google Sheets.
 */
export function exportMultiSheetExcel(sheets: ExcelSheetData[], filenameBase: string): void {
  const worksheetsXml = sheets
    .map((sheet, idx) => {
      const safeName = escapeXml(sanitizeSheetName(sheet.name, idx));
      const headerRow = `<Row>${sheet.headers
        .map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
        .join('')}</Row>`;

      const dataRows = sheet.rows
        .map(
          (row) =>
            `<Row>${row
              .map((cell) => {
                const isNum = typeof cell === 'number' && Number.isFinite(cell);
                const type = isNum ? 'Number' : 'String';
                return `<Cell><Data ss:Type="${type}">${escapeXml(cell ?? '')}</Data></Cell>`;
              })
              .join('')}</Row>`
        )
        .join('');

      return `<Worksheet ss:Name="${safeName}"><Table>${headerRow}${dataRows}</Table></Worksheet>`;
    })
    .join('');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0B3D2E" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 ${worksheetsXml}
</Workbook>`;

  const blob = new Blob(['\uFEFF' + workbookXml], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameBase.endsWith('.xls') ? filenameBase : `${filenameBase}.xls`;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
