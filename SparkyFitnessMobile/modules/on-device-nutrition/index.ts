import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** Raw extraction returned by the Swift module; every value is as printed. */
export interface OnDeviceLabelExtraction {
  name: string;
  brand: string;
  serving_size: number | null;
  serving_unit: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  saturated_fat: number | null;
  trans_fat: number | null;
  sodium: number | null;
  sugars: number | null;
  cholesterol: number | null;
  potassium: number | null;
  calcium: number | null;
  iron: number | null;
  values_are_per_100: boolean;
  /** Text recognised on the label, to check the extraction against. */
  ocr_text?: string;
}

/** Raw meal estimate returned by the Swift module. */
export interface OnDeviceMealEstimate {
  summary: string;
  items: {
    name: string;
    grams: number;
    portion: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    confidence: string;
  }[];
}

export type OnDeviceStatus =
  | 'available'
  | 'deviceNotEligible'
  | 'appleIntelligenceNotEnabled'
  | 'modelNotReady'
  | 'unsupported';

export type OnDeviceChatModel = 'device' | 'auto' | 'cloud';

export type CloudChatStatus =
  | 'available'
  | 'quotaLimitReached'
  | 'deviceNotEligible'
  | 'systemNotReady'
  | 'unsupported';

export interface OnDeviceChatReply {
  text: string;
  /** Which model produced the reply. */
  model: 'device' | 'cloud';
}

export interface OnDeviceChatOptions {
  /** Which model answers: this phone, Apple's private servers, or both. */
  model?: OnDeviceChatModel;
  /** Standing notes about the user, added to the system prompt. */
  userContext?: string;
  /** Replaces the built-in system prompt when non-empty. */
  instructions?: string;
  /** Greedy decoding: the same input gives the same reply. */
  greedy?: boolean;
  /** Tool names to leave out of the session. */
  disabledTools?: string[];
}

export interface OnDeviceChatToolEvent {
  id: string;
  name: string;
  /** JSON object of the model's arguments. */
  args: string;
}

type OnDeviceNutritionEvents = {
  onChatTool: (event: OnDeviceChatToolEvent) => void;
};

declare class OnDeviceNutritionModuleType extends NativeModule<OnDeviceNutritionEvents> {
  /** True on iOS 27+ with Apple Intelligence enabled and the model ready. */
  isAvailable(): boolean;
  scanLabel(base64Image: string): Promise<OnDeviceLabelExtraction>;
  /** Answers the last message of `transcript`, given a plain-text diary snapshot. */
  chat?(
    transcript: string,
    context: string,
    options: OnDeviceChatOptions
  ): Promise<OnDeviceChatReply>;
  /** Whether Apple's private servers can answer chat right now. */
  cloudChatStatus?(): CloudChatStatus;
  /** The built-in chat system prompt. */
  defaultChatInstructions?(): string;
  /** Answers a pending `onChatTool` event. */
  resolveChatTool?(id: string, result: string): void;
  /** Why the on-device model can or cannot be used right now. */
  onDeviceStatus?(): OnDeviceStatus;
  estimateMeal(
    base64Images: string[],
    description: string | null,
    totalGrams: number | null,
    userContext: string | null
  ): Promise<OnDeviceMealEstimate>;
}

// iOS only; resolves to null elsewhere and in builds made before the module
// existed, so callers must tolerate null.
const OnDeviceNutritionModule: OnDeviceNutritionModuleType | null =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<OnDeviceNutritionModuleType>(
        'OnDeviceNutrition'
      )
    : null;

export default OnDeviceNutritionModule;
