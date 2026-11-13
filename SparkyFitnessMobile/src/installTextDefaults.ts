// Side-effect module: keep it the first import in index.js so the Text wrapper
// is in place before Uniwind (or any other module) captures `Text`.
import { installTextFontScaleDefaults } from './utils/textFontScaleDefaults';

// eslint-disable-next-line @typescript-eslint/no-require-imports
installTextFontScaleDefaults(require('react-native/Libraries/Text/Text'));
