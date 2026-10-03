import { z } from "zod";

/**
 * Chat tools lent to the phone's on-device model. The phone asks for the
 * definitions of a few tool categories, hands them to its model, and relays
 * each call the model makes back to the server, which runs it as the signed-in
 * user.
 */
export const onDeviceChatToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** Chat tool category the tool belongs to, when it has one. */
  category: z.string().nullable(),
  /** JSON Schema of the tool's input. */
  parameters: z.record(z.string(), z.unknown()),
});

export const onDeviceChatToolsResponseSchema = z.object({
  tools: z.array(onDeviceChatToolDefinitionSchema),
});

export const onDeviceChatToolCallRequestSchema = z.object({
  args: z.record(z.string(), z.unknown()).default({}),
});

export const onDeviceChatToolCallResponseSchema = z.object({
  result: z.unknown(),
});

export type OnDeviceChatToolDefinition = z.infer<
  typeof onDeviceChatToolDefinitionSchema
>;
export type OnDeviceChatToolsResponse = z.infer<
  typeof onDeviceChatToolsResponseSchema
>;
export type OnDeviceChatToolCallRequest = z.infer<
  typeof onDeviceChatToolCallRequestSchema
>;
export type OnDeviceChatToolCallResponse = z.infer<
  typeof onDeviceChatToolCallResponseSchema
>;
