import sharp from 'sharp';
import { getDocumentProxy } from 'unpdf';
import chatRepository from '../models/chatRepository.js';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type DispatchErrorCategory,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import { resolveAiNetworkPolicy } from '../utils/outboundUrlPolicy.js';

/**
 * Reads a PDF or a photo with the user's AI provider and hands back the JSON
 * the model returned. Nothing is stored. The lab report and immunization
 * record scans share this; each brings its own prompt and shapes the JSON.
 */

// 'no_ai_configured', 'unreadable_pdf' and 'document_too_large' are the
// categories this service mints itself; every dispatch failure passes its
// category through unchanged for the route's HTTP-status map.
export type DocumentScanErrorCategory =
  | DispatchErrorCategory
  | 'no_ai_configured'
  | 'unreadable_pdf'
  | 'document_too_large';

export type DocumentJsonResult =
  | { success: true; json: unknown }
  | {
      success: false;
      category: DocumentScanErrorCategory;
      error: string;
    };

export interface DocumentScanOptions {
  base64Document: string;
  mimeType: string;
  userId: string;
  actorIsAdmin?: boolean;
  /** What to ask for. A PDF's text is appended after `textHeading`. */
  prompt: string;
  /** Heading put before a PDF's text, such as "Lab report text:". */
  textHeading: string;
  /** What the document is called in error text, such as "report". */
  noun: string;
  /** What the person should keep when sending fewer pages, such as "results". */
  items: string;
  /** Names the scan in the warn/error log line, such as "Lab report scan". */
  logLabel: string;
}

const PDF_MIME = 'application/pdf';
// Base64 length cap: about 15 MB of PDF.
const MAX_PDF_BASE64_CHARS = 20_000_000;
// A readable lab report is a few thousand characters; below this the PDF is
// almost certainly a scan with no text layer.
const MIN_PDF_TEXT_CHARS = 80;
// What fits in one prompt. Text past it is never cut off silently: the results
// further down would be missing from the review with nothing to say so, so a
// longer document is refused and the person sends just the pages with results.
const MAX_PDF_TEXT_CHARS = 60_000;
// Text is read from the PDF as a stream and the read stops here, before the
// whole document's text exists. A PDF stream can expand about a thousandfold,
// so a small file can hold hundreds of millions of characters. This is on the
// raw text, before whitespace is collapsed, and is twice the prompt limit so
// ordinary layout whitespace never trips it.
const MAX_RAW_PDF_TEXT_CHARS = MAX_PDF_TEXT_CHARS * 2;
// A lab report is a handful of pages. The text is read page by page on the
// server's only thread, so a PDF that declares thousands of pages is refused
// before any page is read, however small the file is.
export const MAX_PDF_PAGES = 30;

// The photo types the food-photo route accepts, less HEIC and HEIF: those go
// through a separate converter that decodes the whole image before it can be
// bounded, and sharp cannot read their headers to check the size first. The
// phone app sends JPEG, and anything else can be saved as one.
// A photo is base64-decoded and fully decoded and resized before the AI call,
// so each bound limits what one request can make the server allocate.
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MAX_IMAGE_BASE64_CHARS = 8 * 1024 * 1024;
// A small file can declare enormous dimensions and decode to hundreds of
// megabytes, so the declared size is read from the header (no decoding) first.
// 50 megapixels covers any phone camera's full-resolution photo.
export const MAX_IMAGE_PIXELS = 50_000_000;

type ImageHeaderCheck = 'ok' | 'too_many_pixels' | 'unreadable';

/**
 * Reads the declared size from the image header, without decoding it. A file
 * whose header cannot be read is refused rather than passed on: nothing past
 * this point can bound it, and a photo with no readable header is not one.
 */
async function checkImageHeader(base64: string): Promise<ImageHeaderCheck> {
  try {
    const { width, height } = await sharp(Buffer.from(base64, 'base64'), {
      limitInputPixels: false,
    }).metadata();
    if (!width || !height) return 'unreadable';
    return width * height > MAX_IMAGE_PIXELS ? 'too_many_pixels' : 'ok';
  } catch {
    return 'unreadable';
  }
}

type PdfTextResult =
  | { kind: 'text'; text: string }
  | { kind: 'too_many_pages' }
  | { kind: 'too_much_text' }
  | { kind: 'unreadable' };

interface TextChunk {
  items: Array<{ str?: unknown; hasEOL?: boolean }>;
}

/** Collapses whitespace but keeps line breaks, as unpdf's merged text does. */
const normalizeMergedText = (pages: string[]): string =>
  pages
    .join('\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

async function readPdfText(base64: string): Promise<PdfTextResult> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(
      new Uint8Array(Buffer.from(base64, 'base64')),
      {
        // Only text is wanted, so no large image is ever decoded.
        maxImageSize: 1_000_000,
      }
    );
    if (pdf.numPages > MAX_PDF_PAGES) return { kind: 'too_many_pages' };

    // Page by page and chunk by chunk, so the read can stop at the budget
    // instead of building the whole document's text first.
    const pages: string[] = [];
    let total = 0;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const reader = page.streamTextContent().getReader();
      let pageText = '';
      try {
        for (;;) {
          const { done, value } = (await reader.read()) as {
            done: boolean;
            value?: TextChunk;
          };
          if (done) break;
          for (const item of value?.items ?? []) {
            if (typeof item.str !== 'string') continue;
            const piece = item.str + (item.hasEOL ? '\n' : '');
            total += piece.length;
            if (total > MAX_RAW_PDF_TEXT_CHARS) {
              return { kind: 'too_much_text' };
            }
            pageText += piece;
          }
        }
      } finally {
        // pdf.js's stream refuses a cancel with no reason, and throws rather
        // than rejects, so the call is guarded as well as given one.
        try {
          await reader.cancel(new Error('PDF text budget reached'));
        } catch {
          // Nothing left to stop.
        }
        page.cleanup();
      }
      pages.push(pageText);
    }

    const text = normalizeMergedText(pages).trim();
    return text.length > MAX_PDF_TEXT_CHARS
      ? { kind: 'too_much_text' }
      : { kind: 'text', text };
  } catch {
    return { kind: 'unreadable' };
  } finally {
    await pdf?.loadingTask.destroy().catch(() => undefined);
  }
}

export async function extractDocumentJson({
  base64Document,
  mimeType,
  userId,
  actorIsAdmin = false,
  prompt: basePrompt,
  textHeading,
  noun,
  items,
  logLabel,
}: DocumentScanOptions): Promise<DocumentJsonResult> {
  const isPdf = mimeType.trim().toLowerCase() === PDF_MIME;

  const imageMimeType = mimeType.trim().toLowerCase();
  if (!isPdf) {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(imageMimeType)) {
      return {
        success: false,
        category: 'unsupported_media',
        error: `Send a PDF, or a JPEG, PNG or WebP photo of the ${noun}`,
      };
    }
    if (base64Document.length > MAX_IMAGE_BASE64_CHARS) {
      return {
        success: false,
        category: 'image_too_large',
        error: 'This photo is too large to read',
      };
    }
    const header = await checkImageHeader(base64Document);
    if (header === 'too_many_pixels') {
      return {
        success: false,
        category: 'image_too_large',
        error: 'This photo has too many pixels to read. Use a smaller photo.',
      };
    }
    if (header === 'unreadable') {
      return {
        success: false,
        category: 'unsupported_media',
        error: 'This file could not be read as a photo',
      };
    }
  }

  let prompt = basePrompt;
  if (isPdf) {
    if (base64Document.length > MAX_PDF_BASE64_CHARS) {
      return {
        success: false,
        category: 'document_too_large',
        error: 'This PDF is too large to read',
      };
    }
    // The providers take images, not PDFs, so a PDF's text layer is read here
    // and sent as text. The document itself is never stored.
    const read = await readPdfText(base64Document);
    if (read.kind === 'too_many_pages') {
      return {
        success: false,
        category: 'document_too_large',
        error: `This PDF has more than ${MAX_PDF_PAGES} pages. Send just the pages with ${items}.`,
      };
    }
    if (read.kind === 'unreadable') {
      return {
        success: false,
        category: 'unreadable_pdf',
        error: 'This PDF could not be opened',
      };
    }
    if (read.kind === 'too_much_text') {
      return {
        success: false,
        category: 'document_too_large',
        error: `This PDF has more text than can be read at once. Send just the pages with ${items}.`,
      };
    }
    const { text } = read;
    if (text.length < MIN_PDF_TEXT_CHARS) {
      return {
        success: false,
        category: 'unreadable_pdf',
        error: `This PDF has no readable text. Take a photo or screenshot of the ${noun} instead.`,
      };
    }
    prompt = `${basePrompt}\n\n${textHeading}\n${text}`;
  }

  const setting = isPdf
    ? await chatRepository.getActiveAiServiceSetting(userId)
    : await chatRepository.getActiveVisionAiServiceSetting(userId);
  if (!setting) {
    return {
      success: false,
      category: 'no_ai_configured',
      error: 'No AI service configured',
    };
  }
  const aiService = await chatRepository.getAiServiceSettingForBackend(
    setting.id,
    userId
  );
  if (!aiService) {
    return {
      success: false,
      category: 'no_ai_configured',
      error: 'No AI service configured',
    };
  }

  const provider: ProviderConfig = {
    service_type: aiService.service_type,
    api_key: aiService.api_key ?? undefined,
    model_name: aiService.model_name ?? undefined,
    custom_url: aiService.custom_url ?? undefined,
  };

  const result = await dispatchAiRequest({
    provider,
    networkPolicy: await resolveAiNetworkPolicy(aiService, actorIsAdmin),
    prompt,
    ...(isPdf
      ? {}
      : { images: [{ base64: base64Document, mimeType: imageMimeType }] }),
    parseJson: true,
  });

  if (!result.ok) {
    // Only the category and provider are logged. The detail is built from the
    // provider's response, which can quote the request (the report is health
    // data) and is free text, so it never reaches the log. The caller still
    // gets it in the error, for the person who sent the report.
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `${logLabel}: ${provider.service_type} failed for user ${userId} (${result.category})`
    );
    return { success: false, category: result.category, error: result.detail };
  }

  return { success: true, json: result.json };
}
