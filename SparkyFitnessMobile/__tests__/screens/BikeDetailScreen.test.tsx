import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type {
  BikeComponentResponse,
  BikeDetailResponse,
} from '@workspace/shared';
import BikeDetailScreen from '../../src/screens/BikeDetailScreen';
import { useBike, useBikeComponentMutations } from '../../src/hooks/useBikes';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useBikes', () => ({
  useBike: jest.fn(),
  useBikeComponentMutations: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

const mockReplace = jest.fn();
const mockRetire = jest.fn();
const navigate = jest.fn();

const component = (
  overrides: Partial<BikeComponentResponse>
): BikeComponentResponse =>
  ({
    id: 'c1',
    bike_id: 'b1',
    component_type: 'chain',
    name: 'Chain',
    installed_on: '2026-03-01',
    expected_life_km: 4000,
    expected_life_hours: null,
    status: 'active',
    retired_on: null,
    distance_km: 3500,
    hours: 120,
    wear_percent: 87.5,
    wear_state: 'due_soon',
    ...overrides,
  }) as BikeComponentResponse;

const bike = (components: BikeComponentResponse[]) =>
  ({
    id: 'b1',
    name: 'Road',
    brand: 'Canyon',
    model: 'Endurace',
    status: 'active',
    total_distance_km: 5000,
    total_moving_time_seconds: 7200,
    ride_count: 3,
    components,
  }) as BikeDetailResponse;

const renderScreen = () =>
  render(
    <BikeDetailScreen
      {...({
        navigation: { navigate },
        route: { params: { bikeId: 'b1' } },
      } as unknown as RootStackScreenProps<'BikeDetail'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  (useBikeComponentMutations as jest.Mock).mockReturnValue({
    replaceMutation: { mutate: mockReplace, isPending: false },
    retireMutation: { mutate: mockRetire, isPending: false },
  });
});

const mockBike = (b: BikeDetailResponse) =>
  (useBike as jest.Mock).mockReturnValue({
    bike: b,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });

describe('BikeDetailScreen', () => {
  it('shows wear, the due state and keeps retired parts as history', () => {
    mockBike(
      bike([
        component({}),
        component({
          id: 'c0',
          name: 'Old chain',
          status: 'retired',
          retired_on: '2026-02-01',
          installed_on: '2025-01-01',
          wear_state: 'due_now',
        }),
      ])
    );
    renderScreen();
    expect(screen.getByText('88% worn')).toBeTruthy();
    expect(screen.getByText('Due soon')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText(/Old chain/)).toBeTruthy();
    // The retired part offers no replace or retire action.
    expect(screen.getAllByText('Replace')).toHaveLength(1);
  });

  it('replaces a part only after confirming, dated today', () => {
    mockBike(bike([component({})]));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen();
    fireEvent.press(screen.getByText('Replace'));
    const buttons = alert.mock.calls[0][2] ?? [];
    expect(mockReplace).not.toHaveBeenCalled();
    buttons.find((b) => b.text === 'Replace')?.onPress?.();
    expect(mockReplace).toHaveBeenCalledWith({
      id: 'c1',
      data: { replaced_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    });
  });

  it('retires a part after confirming', () => {
    mockBike(bike([component({})]));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen();
    fireEvent.press(screen.getByText('Retire'));
    alert.mock.calls[0][2]?.find((b) => b.text === 'Retire')?.onPress?.();
    expect(mockRetire).toHaveBeenCalledWith({
      id: 'c1',
      data: { retired_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    });
  });

  it('opens the component form to add or edit a part', () => {
    mockBike(bike([component({})]));
    renderScreen();
    fireEvent.press(screen.getByText('Add component'));
    expect(navigate).toHaveBeenCalledWith('BikeComponentForm', {
      bikeId: 'b1',
    });
    fireEvent.press(screen.getByLabelText('Chain'));
    expect(navigate).toHaveBeenCalledWith('BikeComponentForm', {
      bikeId: 'b1',
      componentId: 'c1',
    });
  });
});
