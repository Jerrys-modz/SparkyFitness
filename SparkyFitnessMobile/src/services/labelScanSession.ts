/** Which AI read a label. */
export type LabelScanSource = 'device' | 'server';

interface LabelScanSession {
  /** The photo that was read, base64 JPEG, so the other AI can read it again. */
  base64: string;
  source: LabelScanSource;
}

// Held in memory only: the photo is large and belongs to the form it filled in.
let session: LabelScanSession | null = null;

export function rememberLabelScan(base64: string, source: LabelScanSource) {
  session = { base64, source };
}

export function getLabelScanPhoto(): string | null {
  return session?.base64 ?? null;
}
