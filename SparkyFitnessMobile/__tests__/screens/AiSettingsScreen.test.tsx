import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import AiSettingsScreen from '../../src/screens/AiSettingsScreen';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

let mockAvailable = true;
let mockCloudStatus = 'available';
let mockOnDeviceStatus = 'available';
jest.mock('../../src/services/onDeviceChat', () => ({
  getCloudChatStatus: () => mockCloudStatus,
  getOnDeviceStatus: () => mockOnDeviceStatus,
  askOnDeviceChat: jest.fn(),
  getDefaultChatInstructions: () => '',
  CHAT_TOOL_NAMES: ['logWater'],
}));
jest.mock('../../src/services/onDeviceLabelScan', () => ({
  isOnDeviceLabelScanAvailable: () => mockAvailable,
}));
jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: () => ({
    data: { service_name: 'OpenAI', model_name: 'gpt-x' },
    isLoading: false,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

const renderScreen = () =>
  render(
    <AiSettingsScreen
      navigation={{} as never}
      route={{ key: 'k', name: 'AiSettings' } as never}
    />
  );

describe('AiSettingsScreen', () => {
  beforeEach(() => {
    mockAvailable = true;
    mockCloudStatus = 'available';
    mockOnDeviceStatus = 'available';
    useAppPreferencesStore.setState({
      onDeviceChatModel: 'device',
      onDeviceChatToolSource: 'builtin',
      onDeviceChatServerCategories: ['food', 'exercise', 'checkin', 'goals'],
      onDeviceChatEnabled: false,
      onDeviceFoodPhotoEnabled: false,
      onDeviceLabelScanEnabled: false,
    });
  });

  it('shows the active server provider', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('ai-settings-provider').props.children).toBe(
      'OpenAI · gpt-x'
    );
  });

  it('turns the on-device options on and off', () => {
    const { getByTestId } = renderScreen();
    fireEvent(getByTestId('ai-chat-switch'), 'valueChange', true);
    fireEvent(getByTestId('ai-food-photo-switch'), 'valueChange', true);
    fireEvent(getByTestId('ai-label-scan-switch'), 'valueChange', true);
    const s = useAppPreferencesStore.getState();
    expect(s.onDeviceChatEnabled).toBe(true);
    expect(s.onDeviceFoodPhotoEnabled).toBe(true);
    expect(s.onDeviceLabelScanEnabled).toBe(true);
  });

  it('hides the toggles where Apple Intelligence is unavailable', () => {
    mockAvailable = false;
    const { queryByTestId, getByText } = renderScreen();
    expect(queryByTestId('ai-chat-switch')).toBeNull();
    expect(getByText(/Not available on this device/)).toBeTruthy();
  });

  it('picks the chat model and shows the private servers status', () => {
    const { getByText, getByTestId } = renderScreen();
    expect(getByTestId('ai-cloud-status').props.children).toContain(
      'Available'
    );
    fireEvent.press(getByText('Apple servers'));
    expect(useAppPreferencesStore.getState().onDeviceChatModel).toBe('cloud');
    fireEvent.press(getByText('Auto'));
    expect(useAppPreferencesStore.getState().onDeviceChatModel).toBe('auto');
  });

  it('hides the model choice on a system without the private servers', () => {
    mockCloudStatus = 'unsupported';
    const { queryByTestId } = renderScreen();
    expect(queryByTestId('ai-cloud-status')).toBeNull();
  });

  it('says why on-device AI is unavailable', () => {
    mockAvailable = false;
    mockOnDeviceStatus = 'modelNotReady';
    const { getByText } = renderScreen();
    expect(getByText(/still downloading/)).toBeTruthy();
  });

  it('saves the notes about the user', () => {
    const { getByTestId } = renderScreen();
    fireEvent.changeText(getByTestId('ai-about-you-input'), 'vegetarian');
    expect(useAppPreferencesStore.getState().aiUserContext).toBe('vegetarian');
  });

  it('switches chat tools to the server and picks its groups', () => {
    const { getByText, getByTestId, queryByTestId } = renderScreen();
    expect(queryByTestId('ai-tool-category-food')).toBeNull();
    fireEvent.press(getByText('From server'));
    expect(useAppPreferencesStore.getState().onDeviceChatToolSource).toBe(
      'server'
    );
    fireEvent(getByTestId('ai-tool-category-reports'), 'valueChange', true);
    expect(
      useAppPreferencesStore.getState().onDeviceChatServerCategories
    ).toContain('reports');
    fireEvent(getByTestId('ai-tool-category-food'), 'valueChange', false);
    expect(
      useAppPreferencesStore.getState().onDeviceChatServerCategories
    ).not.toContain('food');
  });
});
