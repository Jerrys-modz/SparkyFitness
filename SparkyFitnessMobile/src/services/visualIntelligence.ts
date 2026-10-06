import VisualIntelligenceModule from '../../modules/visual-intelligence';

/**
 * The photo an iOS Visual Intelligence result handed to the app, as a file URI
 * the photo flow can read, or null when there is none. Each photo is returned
 * once, so a second call finds nothing.
 */
export function takeVisualIntelligencePhoto(): { uri: string } | null {
  try {
    const path = VisualIntelligenceModule?.consumePendingImage();
    return path
      ? { uri: path.startsWith('file://') ? path : `file://${path}` }
      : null;
  } catch {
    return null;
  }
}
