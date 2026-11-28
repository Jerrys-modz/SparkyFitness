import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as immunizationApi from '@/api/Immunizations/immunizationsApi';
import ImmunizationImportDialog from '@/pages/Immunizations/ImmunizationImportDialog';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/Immunizations/immunizationsApi');
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

const api = jest.mocked(immunizationApi);

const record = (over: Record<string, unknown> = {}) => ({
  vaccine_name: 'Influenza',
  administered_on: '2026-10-01',
  dose_number: null,
  lot_number: null,
  administered_by: 'Walgreens',
  site: null,
  already_recorded: false,
  ...over,
});

const renderDialog = (onOpenChange = jest.fn()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<ImmunizationImportDialog open onOpenChange={onOpenChange} />, {
    wrapper: Wrapper,
  });
  return onOpenChange;
};

const pick = (name = 'record.pdf', type = 'application/pdf') =>
  fireEvent.change(screen.getByTestId('immunization-file'), {
    target: { files: [new File(['hello'], name, { type })] },
  });

beforeEach(() => jest.clearAllMocks());

describe('ImmunizationImportDialog', () => {
  it('scans the chosen file and lists the vaccines found', async () => {
    api.scanImmunizations.mockResolvedValue({
      records: [record(), record({ vaccine_name: 'Tdap' })],
    });
    renderDialog();
    pick();
    expect(await screen.findByText('Tdap')).toBeInTheDocument();
    expect(api.scanImmunizations).toHaveBeenCalledWith(
      'aGVsbG8=',
      'application/pdf'
    );
    expect(screen.getByText('Save 2 immunizations')).toBeInTheDocument();
  });

  it('starts a vaccine already recorded that day unchecked and saves only the checked ones', async () => {
    api.scanImmunizations.mockResolvedValue({
      records: [
        record({ already_recorded: true }),
        record({ vaccine_name: 'Tdap', administered_on: '2026-05-04' }),
      ],
    });
    api.importImmunizations.mockResolvedValue({ created: 1 });
    const onOpenChange = renderDialog();
    pick();
    expect(await screen.findByText('Already recorded')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Save 1 immunization'));
    await waitFor(() => expect(api.importImmunizations).toHaveBeenCalled());
    expect(api.importImmunizations.mock.calls[0]?.[0]).toEqual({
      records: [
        {
          vaccine_name: 'Tdap',
          administered_on: '2026-05-04',
          dose_number: null,
          lot_number: null,
          administered_by: 'Walgreens',
          site: null,
        },
      ],
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows a scan failure inline and keeps the file picker', async () => {
    api.scanImmunizations.mockRejectedValue(new Error('No AI service'));
    renderDialog();
    pick();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not read that record. No AI service'
    );
    expect(screen.getByText('Choose a PDF or photo')).toBeInTheDocument();
  });

  it('refuses a photo over the size limit without reading it', async () => {
    renderDialog();
    const big = new File([new Uint8Array(7 * 1024 * 1024)], 'big.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(screen.getByTestId('immunization-file'), {
      target: { files: [big] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'too large to read'
    );
    expect(api.scanImmunizations).not.toHaveBeenCalled();
  });
});
