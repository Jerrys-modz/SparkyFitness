import { apiFetch } from './api/apiClient';
import { addLog } from './LogService';
import { requestChatConfirm } from '../stores/chatConfirmStore';

/** One tool the server lends to the on-device model. */
export interface ServerToolDefinition {
  name: string;
  description: string;
  category: string | null;
  /** JSON Schema of the tool's input. */
  parameters: Record<string, unknown>;
}

/** What goes to the native module: the schema as a JSON string. */
export interface NativeServerTool {
  name: string;
  description: string;
  parameters: string;
}

/** The categories the server treats as core, switched on by default. */
export const DEFAULT_SERVER_TOOL_CATEGORIES = [
  'food',
  'exercise',
  'checkin',
  'goals',
];

export const SERVER_TOOL_CATEGORIES = [
  'food',
  'exercise',
  'checkin',
  'goals',
  'reports',
  'coaching',
  'vision',
  'profile',
  'medications',
] as const;

/** Prefix that tells the tool bridge a call belongs to the server. */
export const SERVER_TOOL_PREFIX = 'server:';

const MAX_DESCRIPTION_CHARS = 280;
const MAX_RESULT_CHARS = 3000;
const CACHE_MS = 10 * 60 * 1000;

let cache: { key: string; at: number; tools: ServerToolDefinition[] } | null =
  null;

const categoriesKey = (categories: readonly string[]): string =>
  [...categories].sort().join(',');

export function resetServerToolCache(): void {
  cache = null;
}

export async function fetchServerToolDefinitions(
  categories: readonly string[]
): Promise<ServerToolDefinition[]> {
  const key = categoriesKey(categories);
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) {
    return cache.tools;
  }
  const query = key ? `?categories=${encodeURIComponent(key)}` : '';
  const response = await apiFetch<{ tools: ServerToolDefinition[] }>({
    endpoint: `/api/chat/on-device-tools${query}`,
    serviceName: 'Chat API',
    operation: 'fetch on-device chat tools',
  });
  const tools = response?.tools ?? [];
  cache = { key, at: Date.now(), tools };
  return tools;
}

/** The definitions as the native module wants them, descriptions trimmed. */
export function toNativeServerTools(
  tools: readonly ServerToolDefinition[]
): NativeServerTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description:
      tool.description.length > MAX_DESCRIPTION_CHARS
        ? `${tool.description.slice(0, MAX_DESCRIPTION_CHARS - 1)}…`
        : tool.description,
    parameters: JSON.stringify(tool.parameters),
  }));
}

const READ_ACTION =
  /^(get|list|search|find|view|read|show|summary|summar|history|stats|check|lookup|query|analy[sz]e|detect)/i;
const READ_TOOL = /^sparky_(get|list|search|analy[sz]e|detect|check)_/i;

/**
 * Whether a server tool call only reads. Reads run without asking; anything
 * else, including a tool we cannot classify, asks first.
 */
export function isReadOnlyServerCall(
  name: string,
  args: Record<string, unknown>
): boolean {
  if (READ_TOOL.test(name)) return true;
  const action = args.action;
  return typeof action === 'string' && READ_ACTION.test(action);
}

const readable = (name: string): string =>
  name.replace(/^sparky_/, '').replace(/_/g, ' ');

export function describeServerCall(
  name: string,
  args: Record<string, unknown>
): string {
  const detail = Object.entries(args)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`
    )
    .join(', ');
  const text = detail.length > 240 ? `${detail.slice(0, 239)}…` : detail;
  return text ? `${readable(name)}\n${text}` : readable(name);
}

function clip(text: string): string {
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}… (shortened)`
    : text;
}

/**
 * Runs a server tool the on-device model asked for, after asking the user
 * when it could change something. `argsJson` is the model's arguments.
 */
export async function runServerChatTool(
  name: string,
  argsJson: string,
  categories: readonly string[]
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(argsJson || '{}') as unknown;
    if (parsed && typeof parsed === 'object') {
      args = parsed as Record<string, unknown>;
    }
  } catch {
    return 'The arguments were not valid JSON.';
  }
  if (!isReadOnlyServerCall(name, args)) {
    const ok = await requestChatConfirm({
      title: 'Allow this change?',
      message: describeServerCall(name, args),
      confirmText: 'Allow',
    });
    if (!ok) return 'The user declined, so nothing was changed.';
  }
  try {
    const key = categoriesKey(categories);
    const query = key ? `?categories=${encodeURIComponent(key)}` : '';
    const response = await apiFetch<{ result: unknown }>({
      endpoint: `/api/chat/on-device-tools/${encodeURIComponent(name)}${query}`,
      serviceName: 'Chat API',
      operation: 'run on-device chat tool',
      method: 'POST',
      body: { args },
    });
    const result = response?.result;
    return clip(
      typeof result === 'string' ? result : JSON.stringify(result ?? null)
    );
  } catch (error) {
    addLog(`Server chat tool ${name} failed: ${error}`, 'ERROR');
    return `That did not work: ${error instanceof Error ? error.message : 'unknown error'}.`;
  }
}
