import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AiServicesSection from '../../src/components/AiServicesSection';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

jest.mock('../../src/components/BottomSheetPicker', () => {
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      value,
      options,
      onSelect,
      title,
    }: {
      value: string;
      options: { label: string; value: string }[];
      onSelect: (v: string) => void;
      title: string;
    }) => (
      <View testID={`picker-${title}`}>
        <Text testID={`picker-value-${title}`}>{value}</Text>
        {options.map((o) => (
          <Text key={o.value} onPress={() => onSelect(o.value)}>
            {o.label}
          </Text>
        ))}
      </View>
    ),
  };
});

const own = {
  id: 'own',
  service_name: 'My key',
  service_type: 'anthropic',
  model_name: 'claude-sonnet-5',
  custom_url: null,
  system_prompt: 'Short answers',
  is_active: true,
  is_public: false,
  chat_tool_profile: 'full',
  reasoning_effort: 'medium',
  supports_audio_input: false,
};
const global = {
  ...own,
  id: 'global',
  service_name: 'Server AI',
  service_type: 'openai',
  model_name: 'gpt-4o',
  is_public: true,
};

let mockAllowed = true;
let mockServices: unknown[] = [own, global];
const mockSetActive = jest.fn();
const mockSave = jest.fn();
jest.mock('../../src/hooks/useUserAiConfigAllowed', () => ({
  useUserAiConfigAllowed: () => ({ data: mockAllowed }),
}));
jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: () => ({ data: { id: 'global' } }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: { active_ai_service_id: null },
  }),
}));
jest.mock('../../src/hooks/useAiServices', () => ({
  useAiServices: () => ({
    data: mockServices,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useSetActiveAiService: () => ({ mutate: mockSetActive }),
  useSaveAiService: () => ({ mutate: mockSave, isPending: false }),
}));

const ACTIVE = 'Used for chat and AI features';

describe('AiServicesSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAllowed = true;
    mockServices = [own, global];
  });

  it('shows the service in use and switches it', () => {
    const onAdd = jest.fn();
    const screen = render(
      <AiServicesSection onAdd={onAdd} onEdit={jest.fn()} />
    );
    // Nothing saved, so the server's answer (the admin's service) is in use.
    expect(screen.getByTestId(`picker-value-${ACTIVE}`).props.children).toBe(
      'global'
    );
    fireEvent.press(screen.getAllByText('My key')[0]);
    expect(mockSetActive).toHaveBeenCalledWith(
      { active_ai_service_id: 'own' },
      expect.any(Object)
    );
    fireEvent.press(screen.getByTestId('ai-service-add'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('turns an own service off without losing its settings', () => {
    const screen = render(
      <AiServicesSection onAdd={jest.fn()} onEdit={jest.fn()} />
    );
    fireEvent(
      screen.getByTestId('ai-service-switch-own'),
      'valueChange',
      false
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'own',
        is_active: false,
        model_name: 'claude-sonnet-5',
        system_prompt: 'Short answers',
      }),
      expect.any(Object)
    );
  });

  it('opens an own service for editing but not an admin one', () => {
    const onEdit = jest.fn();
    const screen = render(
      <AiServicesSection onAdd={jest.fn()} onEdit={onEdit} />
    );
    fireEvent.press(screen.getByTestId('ai-service-row-own'));
    expect(onEdit).toHaveBeenCalledWith('own');
    expect(screen.getByTestId('ai-service-shared-global')).toBeTruthy();
  });

  it('hides adding when the admin manages AI services', () => {
    mockAllowed = false;
    mockServices = [global];
    const screen = render(
      <AiServicesSection onAdd={jest.fn()} onEdit={jest.fn()} />
    );
    expect(screen.queryByTestId('ai-service-add')).toBeNull();
    expect(screen.getByText(/Your admin manages the AI services/)).toBeTruthy();
  });
});
