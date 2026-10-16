import { fireEvent, screen } from '@testing-library/react';
import type { BikeResponse } from '@workspace/shared';
import { renderWithClient } from '../test-utils';
import BikeEquipment from '@/pages/Exercises/BikeEquipment';
import { useBikes } from '@/hooks/Bikes/useBikes';

const mockUpdate = jest.fn();
let mockCanWrite = true;

jest.mock('@/hooks/Bikes/useBikes', () => ({
  useBikes: jest.fn(),
  useCreateBikeMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateBikeMutation: () => ({
    mutate: mockUpdate,
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useDeleteBikeMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    distanceUnit: 'km',
    convertDistance: (value: number) => value,
  }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ hasWritePermission: () => mockCanWrite }),
}));

const bike = (overrides: Partial<BikeResponse>): BikeResponse => ({
  id: 'bike-1',
  user_id: 'user-1',
  name: 'Road',
  brand: 'Canyon',
  model: 'Endurace',
  purchase_date: null,
  purchase_price: null,
  starting_distance_km: 0,
  starting_moving_time_seconds: 0,
  status: 'active',
  is_default: false,
  retired_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  logged_distance_km: 1234.5,
  total_distance_km: 1234.5,
  logged_moving_time_seconds: 7500,
  total_moving_time_seconds: 7500,
  ride_count: 20,
  last_used_date: '2026-10-10',
  due_now_component_count: 0,
  due_soon_component_count: 0,
  ...overrides,
});

describe('BikeEquipment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = true;
  });

  it('shows the empty state', () => {
    (useBikes as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    renderWithClient(<BikeEquipment />);
    expect(screen.getByText(/No bikes yet/i)).toBeTruthy();
  });

  it('shows distance, time and due components, and retires a bike', () => {
    (useBikes as jest.Mock).mockReturnValue({
      data: [
        bike({ due_now_component_count: 1, due_soon_component_count: 2 }),
        bike({ id: 'bike-2', name: 'Old bike', status: 'retired' }),
      ],
      isLoading: false,
    });
    renderWithClient(<BikeEquipment />);

    expect(screen.getAllByText('1234.5 km').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 h 05 min').length).toBeGreaterThan(0);
    expect(screen.getByText('1 parts due now')).toBeTruthy();
    expect(screen.getByText('2 parts due soon')).toBeTruthy();
    expect(screen.getByText('Old bike')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Retire' })[0]!);
    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'bike-1',
      data: { status: 'retired' },
    });
  });

  it('hides write controls from a read-only delegate', () => {
    mockCanWrite = false;
    (useBikes as jest.Mock).mockReturnValue({
      data: [bike({})],
      isLoading: false,
    });
    renderWithClient(<BikeEquipment />);
    expect(screen.getByText('Road')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add bike' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retire' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
