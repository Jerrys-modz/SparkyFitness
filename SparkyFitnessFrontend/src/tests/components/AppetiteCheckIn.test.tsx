import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AppetiteCheckIn from '@/pages/CheckIn/AppetiteCheckIn';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === 'string' ? defaultValue : _key,
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC' }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

let mockCategories: { id: string; name: string }[] = [];
let mockExisting: { category_id: string; value: string }[] = [];
const mockSave = jest.fn();
const mockAddCategory = jest.fn();
jest.mock('@/hooks/CheckIn/useCheckIn', () => ({
  useCustomCategories: () => ({ data: mockCategories }),
  useExistingCustomMeasurements: () => ({ data: mockExisting }),
  useSaveCustomMeasurementMutation: () => ({
    mutateAsync: mockSave,
    isPending: false,
  }),
}));
jest.mock('@/hooks/Settings/useCustomCategories', () => ({
  useAddCategoryMutation: () => ({
    mutateAsync: mockAddCategory,
    isPending: false,
  }),
}));

beforeEach(() => {
  mockCategories = [];
  mockExisting = [];
  mockSave.mockReset().mockResolvedValue({});
  mockAddCategory.mockReset();
});

describe('AppetiteCheckIn', () => {
  it('asks hunger, cravings and fullness, without energy', () => {
    render(<AppetiteCheckIn variant="appetite" selectedDate="2026-11-10" />);
    expect(screen.getByText('Hunger & fullness')).toBeInTheDocument();
    expect(screen.getByText('Hunger')).toBeInTheDocument();
    expect(screen.getByText('Cravings')).toBeInTheDocument();
    expect(screen.getByText('Fullness')).toBeInTheDocument();
    expect(screen.queryByText('Energy')).not.toBeInTheDocument();
  });

  it('adds energy in the GLP-1 check-in and calls cravings food noise', () => {
    render(<AppetiteCheckIn variant="glp1" selectedDate="2026-11-10" />);
    expect(screen.getByText('GLP-1 daily check-in')).toBeInTheDocument();
    expect(screen.getByText('Food noise')).toBeInTheDocument();
    expect(screen.getByText('Energy')).toBeInTheDocument();
  });

  it('shows the saved scores of the day', () => {
    mockCategories = [{ id: 'c-h', name: 'GLP Hunger' }];
    mockExisting = [{ category_id: 'c-h', value: '8' }];
    render(<AppetiteCheckIn variant="appetite" selectedDate="2026-11-10" />);
    expect(screen.getAllByText('8').length).toBeGreaterThan(0);
  });

  it('saves into the GLP-1 categories, creating missing ones once', async () => {
    mockCategories = [{ id: 'c-h', name: 'GLP Hunger' }];
    mockAddCategory
      .mockResolvedValueOnce({ id: 'c-n' })
      .mockResolvedValueOnce({ id: 'c-f' });
    render(<AppetiteCheckIn variant="appetite" selectedDate="2026-11-10" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(3));
    expect(mockAddCategory.mock.calls.map(([body]) => body.name)).toEqual([
      'GLP Food Noise',
      'GLP Fullness',
    ]);
    expect(mockAddCategory.mock.calls[0][0]).toMatchObject({
      display_name: 'Cravings',
      frequency: 'Daily',
      data_type: 'numeric',
    });
    expect(mockSave.mock.calls.map(([body]) => body.category_id)).toEqual([
      'c-h',
      'c-n',
      'c-f',
    ]);
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      value: '5',
      entry_date: '2026-11-10',
    });
  });

  it('reuses a category it created when a save is retried', async () => {
    mockAddCategory.mockResolvedValueOnce({ id: 'c-h' });
    mockSave.mockRejectedValueOnce(new Error('offline'));
    render(<AppetiteCheckIn variant="appetite" selectedDate="2026-11-10" />);
    const save = screen.getByRole('button', { name: 'Save check-in' });
    fireEvent.click(save);
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    mockAddCategory
      .mockResolvedValueOnce({ id: 'c-n' })
      .mockResolvedValueOnce({ id: 'c-f' });
    fireEvent.click(save);
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(4));
    expect(
      mockAddCategory.mock.calls.filter(([body]) => body.name === 'GLP Hunger')
    ).toHaveLength(1);
  });
});
