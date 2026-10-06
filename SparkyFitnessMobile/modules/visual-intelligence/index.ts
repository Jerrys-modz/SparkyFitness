import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

declare class VisualIntelligenceModuleType extends NativeModule {
  /**
   * Absolute path of the photo an iOS Visual Intelligence result handed to the
   * app, or null when there is none or it is over ten minutes old. Each photo
   * is returned once.
   */
  consumePendingImage(): string | null;
}

// iOS only; resolves to null elsewhere and in builds made before the module
// existed, so callers must tolerate null.
const VisualIntelligenceModule: VisualIntelligenceModuleType | null =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<VisualIntelligenceModuleType>(
        'VisualIntelligence'
      )
    : null;

export default VisualIntelligenceModule;
