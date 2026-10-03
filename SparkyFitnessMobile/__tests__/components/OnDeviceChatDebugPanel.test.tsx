import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import OnDeviceChatDebugPanel from '../../src/components/OnDeviceChatDebugPanel';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { useOnDeviceChatDebugStore } from '../../src/stores/onDeviceChatDebugStore';
import { askOnDeviceChat } from '../../src/services/onDeviceChat';

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: { setString: jest.fn() },
}));
jest.mock('../../src/services/onDeviceChat', () => ({
  askOnDeviceChat: jest.fn(),
  getDefaultChatInstructions: () => 'BUILT-IN PROMPT',
  CHAT_TOOL_NAMES: ['logWater', 'logFood'],
}));

describe('OnDeviceChatDebugPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppPreferencesStore.setState({
      onDeviceChatSystemPrompt: '',
      onDeviceChatDisabledTools: [],
      onDeviceChatGreedy: false,
      onDeviceChatDebug: false,
    });
    useOnDeviceChatDebugStore.getState().clear();
  });

  it('turns a tool off and back on', () => {
    const { getByTestId } = render(<OnDeviceChatDebugPanel />);
    fireEvent(getByTestId('chat-debug-tool-logWater'), 'valueChange', false);
    expect(useAppPreferencesStore.getState().onDeviceChatDisabledTools).toEqual(
      ['logWater']
    );
    fireEvent(getByTestId('chat-debug-tool-logWater'), 'valueChange', true);
    expect(useAppPreferencesStore.getState().onDeviceChatDisabledTools).toEqual(
      []
    );
  });

  it('loads and resets the system prompt', () => {
    const { getByTestId } = render(<OnDeviceChatDebugPanel />);
    fireEvent.press(getByTestId('chat-debug-load-default'));
    expect(useAppPreferencesStore.getState().onDeviceChatSystemPrompt).toBe(
      'BUILT-IN PROMPT'
    );
    fireEvent.press(getByTestId('chat-debug-reset-prompt'));
    expect(useAppPreferencesStore.getState().onDeviceChatSystemPrompt).toBe('');
  });

  it('runs a test message and shows the reply', async () => {
    (askOnDeviceChat as jest.Mock).mockResolvedValue('Hello there');
    const { getByTestId, findByTestId } = render(<OnDeviceChatDebugPanel />);
    fireEvent.changeText(getByTestId('chat-debug-test-input'), 'hi');
    fireEvent.press(getByTestId('chat-debug-run'));
    const reply = await findByTestId('chat-debug-test-reply');
    expect(reply.props.children).toBe('Hello there');
    expect(askOnDeviceChat).toHaveBeenCalledWith([
      { role: 'user', text: 'hi' },
    ]);
  });

  it('shows and clears the recorded trace', async () => {
    useOnDeviceChatDebugStore.getState().add('tool', 'logWater({}) -> ok');
    const { getByTestId, queryByTestId } = render(<OnDeviceChatDebugPanel />);
    expect(getByTestId('chat-debug-trace').props.children).toContain(
      'TOOL logWater'
    );
    fireEvent.press(getByTestId('chat-debug-clear'));
    await waitFor(() => expect(queryByTestId('chat-debug-trace')).toBeNull());
  });
});
