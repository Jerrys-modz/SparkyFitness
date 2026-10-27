export interface FuelingPrintRow {
  time: string;
  amount: string;
  total: string;
}

export interface FuelingPrintData {
  title: string;
  summary: string;
  detail: string;
  headers: { time: string; amount: string; total: string };
  rows: FuelingPrintRow[];
  disclaimer: string;
}

const PRINT_STYLES = `
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  p { margin: 0.25rem 0; }
  table { border-collapse: collapse; margin: 1rem 0; width: 100%; max-width: 32rem; }
  th, td { border: 1px solid #999; padding: 0.4rem 0.75rem; text-align: left; font-variant-numeric: tabular-nums; }
  th { background: #eee; }
  .note { color: #555; font-size: 0.85rem; margin-top: 1.5rem; }
`;

const appendText = (
  doc: Document,
  parent: HTMLElement,
  tag: string,
  text: string,
  className?: string
): HTMLElement => {
  const element = doc.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
};

/**
 * Opens a small page with only the fueling schedule and prints it, so the rest
 * of the Exercises page stays out of the printout. Everything goes in as text
 * nodes, so a product name cannot add markup. Returns false when the browser
 * blocked the new window.
 */
export function printFuelingPlan(data: FuelingPrintData): boolean {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  const doc = printWindow.document;
  doc.title = data.title;
  const style = doc.createElement('style');
  style.textContent = PRINT_STYLES;
  doc.head.appendChild(style);

  const body = doc.body;
  appendText(doc, body, 'h1', data.title);
  appendText(doc, body, 'p', data.summary);
  appendText(doc, body, 'p', data.detail);

  const table = doc.createElement('table');
  const headRow = doc.createElement('tr');
  for (const header of [
    data.headers.time,
    data.headers.amount,
    data.headers.total,
  ]) {
    appendText(doc, headRow, 'th', header);
  }
  table.appendChild(headRow);
  for (const row of data.rows) {
    const tr = doc.createElement('tr');
    appendText(doc, tr, 'td', row.time);
    appendText(doc, tr, 'td', row.amount);
    appendText(doc, tr, 'td', row.total);
    table.appendChild(tr);
  }
  body.appendChild(table);
  appendText(doc, body, 'p', data.disclaimer, 'note');

  printWindow.focus();
  printWindow.print();
  return true;
}
