import { randomUUID } from 'crypto';
import { asSchema } from 'ai';
import {
  CHAT_TOOL_CATEGORY_SLUGS,
  normalizeChatToolCategories,
  type ChatToolCategorySlug,
  type OnDeviceChatToolDefinition,
} from '@workspace/shared';
import { buildChatToolSurface, resolveCategories } from '../ai/tools/index.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/** Thrown for a request the caller can fix; carries the HTTP status. */
export class OnDeviceToolError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'OnDeviceToolError';
    this.status = status;
  }
}

type SurfaceTool = {
  description?: string;
  inputSchema?: unknown;
  execute?: (input: unknown, options: unknown) => unknown;
};

const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {} } as const;

async function loadSurface(userId: string) {
  const tz = await loadUserTimezone(userId);
  return buildChatToolSurface(userId, tz);
}

/** Tool names the chosen categories expose, with each name's category. */
function namesForCategories(
  toolNamesByCategory: Record<ChatToolCategorySlug, string[]>,
  categories: readonly string[] | undefined
): Map<string, ChatToolCategorySlug> {
  // No valid selection falls back to the core set: the phone's model has a
  // small window, so "everything" is never the default here.
  const selected = resolveCategories(
    'core',
    normalizeChatToolCategories(categories) ?? []
  );
  const names = new Map<string, ChatToolCategorySlug>();
  for (const slug of CHAT_TOOL_CATEGORY_SLUGS) {
    if (!selected.has(slug)) continue;
    for (const name of toolNamesByCategory[slug] ?? []) names.set(name, slug);
  }
  return names;
}

function jsonSchemaOf(tool: SurfaceTool): Record<string, unknown> {
  if (!tool.inputSchema) return { ...EMPTY_OBJECT_SCHEMA };
  try {
    const schema = asSchema(tool.inputSchema as never).jsonSchema as Record<
      string,
      unknown
    >;
    return schema && typeof schema === 'object'
      ? schema
      : { ...EMPTY_OBJECT_SCHEMA };
  } catch {
    return { ...EMPTY_OBJECT_SCHEMA };
  }
}

/** Definitions of the chat tools in the given categories (core by default). */
export async function listOnDeviceChatTools(
  userId: string,
  categories?: readonly string[]
): Promise<OnDeviceChatToolDefinition[]> {
  const surface = await loadSurface(userId);
  const names = namesForCategories(surface.toolNamesByCategory, categories);
  const definitions: OnDeviceChatToolDefinition[] = [];
  for (const [name, category] of names) {
    const tool = surface.tools[name] as SurfaceTool | undefined;
    if (!tool) continue;
    definitions.push({
      name,
      description: tool.description ?? '',
      category,
      parameters: jsonSchemaOf(tool),
    });
  }
  return definitions;
}

/**
 * Runs one chat tool as `userId`. Only tools in the requested categories can
 * be called, so a phone cannot reach past the set the user switched on.
 */
export async function runOnDeviceChatTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
  categories?: readonly string[]
): Promise<unknown> {
  const surface = await loadSurface(userId);
  const allowed = namesForCategories(surface.toolNamesByCategory, categories);
  const tool = surface.tools[name] as SurfaceTool | undefined;
  if (!tool || !allowed.has(name) || typeof tool.execute !== 'function') {
    throw new OnDeviceToolError(404, `Unknown tool ${name}.`);
  }
  let input: unknown = args;
  if (tool.inputSchema) {
    const schema = asSchema(tool.inputSchema as never);
    if (typeof schema.validate === 'function') {
      const checked = await schema.validate(args);
      if (!checked.success) {
        throw new OnDeviceToolError(
          400,
          `Invalid arguments for ${name}: ${checked.error.message}`
        );
      }
      input = checked.value;
    }
  }
  const output = await tool.execute(input, {
    toolCallId: randomUUID(),
    messages: [],
  });
  // A tool may stream; the last value is its result.
  if (
    output &&
    typeof output === 'object' &&
    Symbol.asyncIterator in (output as object)
  ) {
    let last: unknown;
    for await (const part of output as AsyncIterable<unknown>) last = part;
    return last;
  }
  return output;
}
