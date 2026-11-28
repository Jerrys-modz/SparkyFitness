/** The base64 payload of a file, without the `data:...;base64,` prefix. */
export const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const text = String(reader.result);
      resolve(text.slice(text.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });

/** A scanned document (a lab report, a vaccine record) is read only if it is a PDF or a JPEG, PNG or WebP photo. */
export const DOCUMENT_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp';

/** The server's own PDF limit is 20M base64 characters; stay inside it. */
export const DOCUMENT_MAX_FILE_BYTES = 14 * 1024 * 1024;

/**
 * The server reads a photo of at most 8 MiB of base64 text, which is 6 MiB of
 * file. A larger photo is refused before it is sent.
 */
export const DOCUMENT_MAX_PHOTO_BYTES = 6 * 1024 * 1024;

const PHOTO_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * The document's type: what the browser says, else from the file name, since a
 * browser can leave `File.type` empty.
 */
export const documentMimeType = (file: File): string => {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'pdf') return 'application/pdf';
  return PHOTO_TYPES_BY_EXTENSION[extension] ?? '';
};
