import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import AiServiceFormScreen from '../../src/screens/AiServiceFormScreen';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
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
jest.mock('../../src/components/BottomSheetPicker', () => {
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      options,
      onSelect,
      title,
    }: {
      options: { label: string; value: string }[];
      onSelect: (v: string) => void;
      title: string;
    }) => (
      <View testID={`picker-${title}`}>
        {options.map((o) => (
          <Text key={o.value} onPress={() => onSelect(o.value)}>
            {o.label}
          </Text>
        ))}
      </View>
    ),
  };
});

const saved = {
  id: 'own',
  service_name: 'Home server',
  service_type: 'ollama',
  model_name: 'llama3',
  custom_url: 'http://box:11434',
  system_prompt: '',
  is_active: true,
  is_public: false,
  chat_tool_profile: 'core',
  reasoning_effort: 'medium',
  supports_audio_input: false,
};

const mockSave = jest.fn();
const mockDelete = jest.fn();
const mockTest = jest.fn();
let mockTestState: { data?: unknown } = {};
jest.mock('../../src/hooks/useAiServices', () => ({
  useAiServices: () => ({
    data: [saved],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useSaveAiService: () => ({ mutate: mockSave, isPending: false }),
  useDeleteAiService: () => ({ mutate: mockDelete, isPending: false }),
  useTestAiService: () => ({
    mutate: mockTest,
    reset: jest.fn(),
    isPending: false,
    isError: false,
    ...mockTestState,
  }),
}));

const navigation = { goBack: jest.fn() } as never;
const renderScreen = (serviceId?: string) =>
  render(
    <AiServiceFormScreen
      navigation={navigation}
      route={
        { key: 'k', name: 'AiServiceForm', params: { serviceId } } as never
      }
    />
  );

describe('AiServiceFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTestState = {};
  });

  it('adds a cloud service once named and given a key', () => {
    const screen = renderScreen();
    const save = screen.getByTestId('ai-service-save');
    expect(save.props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId('ai-service-name'), 'Work');
    fireEvent.changeText(screen.getByTestId('ai-service-api-key'), 'sk-1');
    fireEvent.press(screen.getByTestId('ai-service-save'));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        service_name: 'Work',
        service_type: 'openai',
        api_key: 'sk-1',
        is_active: true,
      }),
      expect.any(Object)
    );
    expect(mockSave.mock.calls[0][0]).not.toHaveProperty('id');
  });

  it('edits a saved self-hosted service and keeps the stored key', () => {
    const screen = renderScreen('own');
    expect(screen.getByTestId('ai-service-url').props.value).toBe(
      'http://box:11434'
    );
    expect(screen.getByTestId('ai-service-model').props.value).toBe('llama3');
    fireEvent.press(screen.getByTestId('ai-service-save'));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'own',
        custom_url: 'http://box:11434',
        model_name: 'llama3',
        chat_tool_profile: 'core',
        api_key: undefined,
      }),
      expect.any(Object)
    );
  });

  it('tests the connection and shows why it failed', () => {
    mockTestState = {
      data: { ok: false, category: 'timeout', detail: '<b>Gateway</b>' },
    };
    const screen = renderScreen('own');
    fireEvent.press(screen.getByTestId('ai-service-test'));
    expect(mockTest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'own', service_type: 'ollama' })
    );
    expect(screen.getByText(/did not answer in time/)).toBeTruthy();
    expect(screen.getByText('Gateway')).toBeTruthy();
  });

  it('asks before deleting', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = renderScreen('own');
    fireEvent.press(screen.getByTestId('ai-service-delete'));
    expect(alert).toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { onPress?: () => void }[];
    buttons[1].onPress?.();
    expect(mockDelete).toHaveBeenCalledWith('own', expect.any(Object));
  });
});
