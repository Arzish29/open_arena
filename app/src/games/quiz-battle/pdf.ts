// PDF to plain text with pdf.js, loaded only when someone uploads a PDF.
// Page markers ("[page 3]") let the quiz cite the page a question came from.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function pdfToText(file: File, maxPages = 60): Promise<string> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
    parts.push(`[page ${n}] ${text}`);
  }
  await doc.destroy();
  return parts.join('\n');
}
