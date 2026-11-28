import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ImmunizationResponse } from '@workspace/shared';
import * as immunizationApi from '@/api/Immunizations/immunizationsApi';
import Immunizations from '@/pages/Immunizations/Immunizations';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/Immunizations/immunizationsApi');
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC' }),
}));

const api = jest.mocked(immunizationApi);

const record = (
  over: Partial<ImmunizationResponse> = {}
): ImmunizationResponse => ({
  id: 'i1',
  user_id: 'u1',
  vaccine_name: 'Influenza (flu)',
  vaccine_code: null,
  administered_on: '2020-10-01',
  dose_number: null,
  lot_number: null,
  administered_by: 'Walgreens',
  site: null,
  next_due_on: null,
  notes: null,
  source: 'manual',
  created_at: '2020-10-01T10:00:00.000Z',
  updated_at: '2020-10-01T10:00:00.000Z',
  ...over,
});

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<Immunizations />, { wrapper: Wrapper });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Immunizations page', () => {
  it('shows the empty state', async () => {
    api.listImmunizations.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No immunizations yet/)).toBeInTheDocument();
  });

  it('shows a load failure instead of an empty list', async () => {
    api.listImmunizations.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(
      await screen.findByText('Could not load your immunizations.')
    ).toBeInTheDocument();
  });

  it('lists records and marks one past its next-due date as overdue', async () => {
    api.listImmunizations.mockResolvedValue([
      record({ next_due_on: '2021-10-01' }),
      record({ id: 'i2', vaccine_name: 'Tdap', dose_number: 2 }),
    ]);
    renderPage();
    expect(await screen.findByText('Influenza (flu)')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Tdap · Dose 2')).toBeInTheDocument();
  });

  it('adds a record from the dialog', async () => {
    api.listImmunizations.mockResolvedValue([]);
    api.createImmunization.mockResolvedValue(record());
    renderPage();
    await screen.findByText(/No immunizations yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Add immunization' }));
    fireEvent.change(screen.getByLabelText('Vaccine'), {
      target: { value: 'Tdap' },
    });
    fireEvent.change(screen.getByLabelText('Date given'), {
      target: { value: '2020-05-04' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.createImmunization).toHaveBeenCalled());
    expect(api.createImmunization.mock.calls[0]?.[0]).toMatchObject({
      vaccine_name: 'Tdap',
      administered_on: '2020-05-04',
      next_due_on: null,
    });
    expect(api.createImmunization.mock.calls[0]?.[0]).not.toHaveProperty(
      'source'
    );
  });

  it('refuses a next-due date before the date given', async () => {
    api.listImmunizations.mockResolvedValue([]);
    renderPage();
    await screen.findByText(/No immunizations yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Add immunization' }));
    fireEvent.change(screen.getByLabelText('Vaccine'), {
      target: { value: 'Tdap' },
    });
    fireEvent.change(screen.getByLabelText('Date given'), {
      target: { value: '2020-05-04' },
    });
    fireEvent.change(screen.getByLabelText('Next due (optional)'), {
      target: { value: '2020-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'cannot be before the date given'
    );
    expect(api.createImmunization).not.toHaveBeenCalled();
  });

  it('deletes a record after confirming', async () => {
    api.listImmunizations.mockResolvedValue([record()]);
    api.deleteImmunization.mockResolvedValue();
    renderPage();
    await screen.findByText('Influenza (flu)');
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete immunization' })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(api.deleteImmunization.mock.calls[0]?.[0]).toBe('i1')
    );
  });

  it('lets a saved record dated ahead be edited without changing its date', async () => {
    api.listImmunizations.mockResolvedValue([
      record({ administered_on: '2999-01-01', notes: null }),
    ]);
    api.updateImmunization.mockResolvedValue(record());
    renderPage();
    await screen.findByText('Influenza (flu)');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateImmunization).toHaveBeenCalled());
    expect(api.updateImmunization.mock.calls[0]?.[1]).toMatchObject({
      administered_on: '2999-01-01',
    });
  });

  it('still refuses a future date typed into a new record', async () => {
    api.listImmunizations.mockResolvedValue([]);
    renderPage();
    await screen.findByText(/No immunizations yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Add immunization' }));
    fireEvent.change(screen.getByLabelText('Vaccine'), {
      target: { value: 'Tdap' },
    });
    fireEvent.change(screen.getByLabelText('Date given'), {
      target: { value: '2999-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'cannot be in the future'
    );
    expect(api.createImmunization).not.toHaveBeenCalled();
  });
});
