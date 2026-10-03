import { Alert } from 'react-native';

import {
  requestChatConfirm,
  useChatConfirmStore,
} from '../../src/stores/chatConfirmStore';

const request = { title: 'Log?', message: 'Eggs', confirmText: 'Log it' };

describe('requestChatConfirm', () => {
  beforeEach(() => {
    useChatConfirmStore.setState({ hosts: 0, pending: null });
    jest.restoreAllMocks();
  });

  it('falls back to a system alert when no chat is open', async () => {
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    await expect(requestChatConfirm(request)).resolves.toBe(true);
  });

  it('shows a card when a chat is open and resolves with the answer', async () => {
    useChatConfirmStore.getState().addHost();
    const alert = jest.spyOn(Alert, 'alert');
    const promise = requestChatConfirm(request);
    expect(useChatConfirmStore.getState().pending?.title).toBe('Log?');
    useChatConfirmStore.getState().answer(true);
    await expect(promise).resolves.toBe(true);
    expect(alert).not.toHaveBeenCalled();
    expect(useChatConfirmStore.getState().pending).toBeNull();
  });

  it('counts a new question as a no for the unanswered one', async () => {
    useChatConfirmStore.getState().addHost();
    const first = requestChatConfirm(request);
    void requestChatConfirm({ ...request, title: 'Second' });
    await expect(first).resolves.toBe(false);
    expect(useChatConfirmStore.getState().pending?.title).toBe('Second');
  });

  it('counts closing the chat as a no', async () => {
    useChatConfirmStore.getState().addHost();
    const promise = requestChatConfirm(request);
    useChatConfirmStore.getState().removeHost();
    await expect(promise).resolves.toBe(false);
  });
});
