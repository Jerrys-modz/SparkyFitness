import {
  describeServerCall,
  fetchServerToolDefinitions,
  isReadOnlyServerCall,
  resetServerToolCache,
  runServerChatTool,
  toNativeServerTools,
} from '../../src/services/onDeviceServerTools';
import { apiFetch } from '../../src/services/api/apiClient';
import {
  requestChatConfirm,
  useChatConfirmStore,
} from '../../src/stores/chatConfirmStore';

jest.mock('../../src/services/api/apiClient', () => ({ apiFetch: jest.fn() }));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockFetch = apiFetch as jest.Mock;

describe('server chat tools', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetServerToolCache();
    useChatConfirmStore.setState({ hosts: 0, pending: null });
  });

  it('reads without asking, and asks for anything it cannot tell is a read', () => {
    expect(isReadOnlyServerCall('sparky_get_food_diary', {})).toBe(true);
    expect(isReadOnlyServerCall('sparky_list_foods', {})).toBe(true);
    expect(
      isReadOnlyServerCall('sparky_manage_checkin', { action: 'get' })
    ).toBe(true);
    expect(
      isReadOnlyServerCall('sparky_manage_checkin', { action: 'upsert' })
    ).toBe(false);
    expect(isReadOnlyServerCall('sparky_log_food', {})).toBe(false);
    expect(isReadOnlyServerCall('sparky_generate_coaching_plan', {})).toBe(
      false
    );
  });

  it('describes a call in words the user can read', () => {
    expect(
      describeServerCall('sparky_log_food', { name: 'Eggs', note: null })
    ).toBe('log food\nname: Eggs');
  });

  it('trims long descriptions and sends the schema as a string', () => {
    const [tool] = toNativeServerTools([
      {
        name: 'sparky_x',
        description: 'a'.repeat(500),
        category: 'food',
        parameters: { type: 'object' },
      },
    ]);
    expect(tool.description.length).toBeLessThanOrEqual(280);
    expect(tool.parameters).toBe('{"type":"object"}');
  });

  it('asks the server once per category set and then reuses the answer', async () => {
    mockFetch.mockResolvedValue({ tools: [{ name: 'sparky_get_a' }] });
    await fetchServerToolDefinitions(['food', 'exercise']);
    await fetchServerToolDefinitions(['exercise', 'food']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0].endpoint).toBe(
      '/api/chat/on-device-tools?categories=exercise%2Cfood'
    );
    await fetchServerToolDefinitions(['goals']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('runs a read straight away and returns the result as text', async () => {
    mockFetch.mockResolvedValue({ result: { calories: 100 } });
    const out = await runServerChatTool(
      'sparky_get_food_diary',
      '{"date":"2026-10-03"}',
      ['food']
    );
    expect(out).toBe('{"calories":100}');
    expect(mockFetch.mock.calls[0][0]).toMatchObject({
      endpoint:
        '/api/chat/on-device-tools/sparky_get_food_diary?categories=food',
      method: 'POST',
      body: { args: { date: '2026-10-03' } },
    });
  });

  it('asks before a change, and does nothing when the user says no', async () => {
    useChatConfirmStore.getState().addHost();
    const run = runServerChatTool('sparky_log_food', '{"name":"Eggs"}', [
      'food',
    ]);
    await Promise.resolve();
    expect(useChatConfirmStore.getState().pending?.title).toBe(
      'Allow this change?'
    );
    useChatConfirmStore.getState().answer(false);
    await expect(run).resolves.toContain('declined');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('runs a change once the user allows it', async () => {
    useChatConfirmStore.getState().addHost();
    mockFetch.mockResolvedValue({ result: 'ok' });
    const run = runServerChatTool('sparky_log_food', '{"name":"Eggs"}', [
      'food',
    ]);
    await Promise.resolve();
    useChatConfirmStore.getState().answer(true);
    await expect(run).resolves.toBe('ok');
  });

  it('hands a failure back to the model as text', async () => {
    mockFetch.mockRejectedValue(new Error('Invalid arguments for x'));
    const out = await runServerChatTool('sparky_get_x', '{}', ['food']);
    expect(out).toContain('Invalid arguments for x');
  });

  it('shortens a very long result', async () => {
    mockFetch.mockResolvedValue({ result: 'x'.repeat(10_000) });
    const out = await runServerChatTool('sparky_get_x', '{}', []);
    expect(out.length).toBeLessThan(3100);
    expect(out).toContain('shortened');
  });
});

// Keeps the import used when the confirm helper is mocked out elsewhere.
void requestChatConfirm;
