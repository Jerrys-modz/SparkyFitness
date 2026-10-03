import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import ChatConfirmCard from '../../../src/components/chat/ChatConfirmCard';
import {
  requestChatConfirm,
  useChatConfirmStore,
} from '../../../src/stores/chatConfirmStore';

describe('ChatConfirmCard', () => {
  beforeEach(() => {
    useChatConfirmStore.setState({ hosts: 0, pending: null });
  });

  it('shows the question in the chat and sends the answer back', async () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <ChatConfirmCard />
    );
    expect(queryByTestId('chat-confirm-card')).toBeNull();

    let answer!: Promise<boolean>;
    act(() => {
      answer = requestChatConfirm({
        title: 'Log this food?',
        message: '2 × Egg',
        confirmText: 'Log it',
      });
    });
    expect(getByText('Log this food?')).toBeTruthy();
    expect(getByText('2 × Egg')).toBeTruthy();

    fireEvent.press(getByTestId('chat-confirm-ok'));
    await expect(answer).resolves.toBe(true);
    expect(queryByTestId('chat-confirm-card')).toBeNull();
  });

  it('answers no on Cancel', async () => {
    const { getByTestId } = render(<ChatConfirmCard />);
    let answer!: Promise<boolean>;
    act(() => {
      answer = requestChatConfirm({
        title: 'Delete?',
        message: 'Eggs',
        confirmText: 'Delete',
      });
    });
    fireEvent.press(getByTestId('chat-confirm-cancel'));
    await expect(answer).resolves.toBe(false);
  });
});
