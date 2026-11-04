const WIN: Record<string, string> = {
  'é': '\\351',
  'è': '\\350',
  'ê': '\\352',
  'ë': '\\353',
  'à': '\\340',
  'â': '\\342',
  'ù': '\\371',
  'û': '\\373',
  'ç': '\\347',
  'ô': '\\364',
  'î': '\\356',
  'ï': '\\357',
  'É': '\\311',
  'È': '\\310',
  'À': '\\300',
  'Ç': '\\307',
  'Ô': '\\324',
  'œ': 'oe',
  '’': "'",
  '‘': "'",
  '–': '-',
  '—': '-',
  '•': '-',
  '×': 'x',
  '≈': '~',
  '…': '...',
  '👋': '',
};

function pdfText(input: string) {
  let out = '';
  for (const ch of input) {
    if (WIN[ch]) out += WIN[ch];
    else if (ch === '\\' || ch === '(' || ch === ')') out += `\\${ch}`;
    else if (ch.charCodeAt(0) < 128) out += ch;
    else out += ' ';
  }
  return out;
}

export function makePdf(lines: string[]) {
  const commands = lines
    .map((line, index) => {
      const size = index === 0 ? 22 : index === 1 ? 14 : 12;
      const y = 790 - index * 24;
      return `BT /F1 ${size} Tf 48 ${y} Td (${pdfText(line)}) Tj ET`;
    })
    .join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${commands.length} >> stream\n${commands}\nendstream endobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return body;
}

export function downloadPdf(filename: string, lines: string[]) {
  const pdf = makePdf(lines);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
