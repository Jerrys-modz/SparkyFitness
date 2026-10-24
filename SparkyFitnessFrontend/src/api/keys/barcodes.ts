import { foodKeys } from './meals';

// These endpoints always belong to the signed-in account, even when logging
// for a family profile. Never key them by the active diary profile alone.
// Library mutations invalidate the food family, including saved barcode matches.
export const barcodeKeys = {
  all: [...foodKeys.all, 'barcodes'] as const,
  account: (accountId?: string) => [...barcodeKeys.all, accountId] as const,
  lookup: (
    accountId: string | undefined,
    barcode: string,
    providerId?: string
  ) =>
    [...barcodeKeys.account(accountId), 'lookup', barcode, providerId] as const,
  alternatives: (accountId: string, barcode: string) =>
    [...barcodeKeys.account(accountId), 'alternatives', barcode] as const,
};
