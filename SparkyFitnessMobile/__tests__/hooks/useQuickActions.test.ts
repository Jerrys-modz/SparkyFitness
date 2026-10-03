import { waitFor } from '@testing-library/react-native';
import { runQuickAction } from '../../src/hooks/useQuickActions';
import {
  changeWaterIntake,
  fetchWaterContainers,
} from '../../src/services/api/measurementsApi';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';

jest.mock('expo-quick-actions', () => ({
  setItems: jest.fn(),
  addListener: jest.fn(),
  initial: undefined,
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/services/api/measurementsApi', () => ({
  changeWaterIntake: jest.fn(),
  fetchWaterContainers: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));

describe('runQuickAction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the scanner, search and fasting screens', () => {
    runQuickAction('scan-food');
    runQuickAction('search-food');
    runQuickAction('fasting');
    expect(navigationRef.navigate).toHaveBeenNthCalledWith(1, 'FoodScan');
    expect(navigationRef.navigate).toHaveBeenNthCalledWith(2, 'FoodSearch');
    expect(navigationRef.navigate).toHaveBeenNthCalledWith(3, 'FastingDetail');
  });

  it('logs one drink of the primary container', async () => {
    (fetchWaterContainers as jest.Mock).mockResolvedValue([
      { id: 1, is_primary: false },
      { id: 2, is_primary: true },
    ]);
    runQuickAction('log-water');
    await waitFor(() =>
      expect(changeWaterIntake).toHaveBeenCalledWith(
        expect.objectContaining({ changeDrinks: 1, containerId: 2 })
      )
    );
  });

  it('ignores unknown actions', () => {
    runQuickAction('nope');
    expect(navigationRef.navigate).not.toHaveBeenCalled();
  });
});
