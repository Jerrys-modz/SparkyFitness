import { saveChatMessage } from '../../../src/services/api/chatApi';
import { apiFetch } from '../../../src/services/api/apiClient';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn().mockResolvedValue(undefined),
}));

describe('saveChatMessage', () => {
  it('posts the message to the shared chat history', async () => {
    await saveChatMessage('assistant', 'Logged it.');
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/chat/save-history',
        method: 'POST',
        body: { content: 'Logged it.', messageType: 'assistant' },
      })
    );
  });
});
