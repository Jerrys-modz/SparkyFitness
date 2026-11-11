import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ExtensionStorage } from '@bacons/apple-targets';
import {
  reloadWidgets,
  useCustomWidgetLayoutSync,
} from '../../src/hooks/useCustomWidgetLayoutSync';
import { addLog } from '../../src/services/LogService';
import { useWidgetLayoutStore } from '../../src/stores/widgetLayoutStore';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      extra: { iosAppGroup: 'group.test.sparkyfitness' },
    },
  },
}));

jest.mock('@bacons/apple-targets', () => {
  const mockStore = new Map<string, unknown>();
  const mockSet = jest.fn((key: string, value: unknown) => {
    mockStore.set(key, value);
  });
  const mockReload = jest.fn();
  class ExtensionStorage {
    appGroup: string;
    constructor(group: string) {
      this.appGroup = group;
    }
    set(key: string, value: unknown) {
      mockSet(key, value);
    }
    get(key: string) {
      return (mockStore.get(key) as string | undefined) ?? null;
    }
    static reloadWidget(name?: string) {
      mockReload(name);
    }
  }
  (ExtensionStorage as any).__mockSet = mockSet;
  (ExtensionStorage as any).__mockReload = mockReload;
  (ExtensionStorage as any).__mockStore = mockStore;
  return { ExtensionStorage };
});

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const setMock = (ExtensionStorage as any).__mockSet as jest.Mock;
const reloadMock = (ExtensionStorage as any).__mockReload as jest.Mock;
const store = (ExtensionStorage as any).__mockStore as Map<string, unknown>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

const layout = (id: string, name: string) => ({
  id,
  name,
  family: 'small' as const,
  style: 'ring' as const,
  metrics: [{ metric: 'protein' as const }],
  accent: 'blue' as const,
  showTitle: true,
  standByFriendly: false,
  version: 1 as const,
  updatedAt: 1,
});

const written = (): { id: string }[] =>
  JSON.parse(store.get('customWidgetLayouts') as string);

describe('useCustomWidgetLayoutSync', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    store.clear();
    useWidgetLayoutStore.setState({ layouts: [] });
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { get: () => originalOS });
  });

  it('writes every saved widget, not just the first', () => {
    useWidgetLayoutStore.setState({
      layouts: [layout('a', 'First'), layout('b', 'Second')],
    });
    renderHook(() => useCustomWidgetLayoutSync());

    expect(written().map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('writes a widget saved later, with no screen involved', () => {
    useWidgetLayoutStore.setState({ layouts: [layout('a', 'First')] });
    renderHook(() => useCustomWidgetLayoutSync());
    expect(written()).toHaveLength(1);

    act(() => {
      useWidgetLayoutStore.setState({
        layouts: [layout('a', 'First'), layout('b', 'Second')],
      });
    });

    expect(written().map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('reloads the widget when there are widgets', () => {
    useWidgetLayoutStore.setState({ layouts: [layout('a', 'First')] });
    renderHook(() => useCustomWidgetLayoutSync());

    expect(reloadMock).toHaveBeenCalledWith('customWidget');
  });

  it('writes an empty list but reloads nothing for someone who never built a widget', () => {
    renderHook(() => useCustomWidgetLayoutSync());

    expect(setMock).toHaveBeenCalledWith('customWidgetLayouts', '[]');
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('clears the widget when the last one is deleted', () => {
    useWidgetLayoutStore.setState({ layouts: [layout('a', 'First')] });
    renderHook(() => useCustomWidgetLayoutSync());
    reloadMock.mockClear();

    act(() => {
      useWidgetLayoutStore.setState({ layouts: [] });
    });

    expect(written()).toEqual([]);
    expect(reloadMock).toHaveBeenCalledWith('customWidget');
  });

  it('logs how many reached the widget', () => {
    useWidgetLayoutStore.setState({
      layouts: [layout('a', 'First'), layout('b', 'Second')],
    });
    renderHook(() => useCustomWidgetLayoutSync());

    expect(mockAddLog).toHaveBeenCalledWith(
      '[customWidget] 2 saved widget(s) written to the widget',
      'INFO'
    );
  });

  it('warns when what was stored is not what was written', () => {
    setMock.mockImplementationOnce(() => {
      // The write silently does not stick.
    });
    useWidgetLayoutStore.setState({ layouts: [layout('a', 'First')] });
    renderHook(() => useCustomWidgetLayoutSync());

    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('did not reach the widget'),
      'WARNING'
    );
  });

  it('does nothing on Android', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    useWidgetLayoutStore.setState({ layouts: [layout('a', 'First')] });
    renderHook(() => useCustomWidgetLayoutSync());

    expect(setMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  describe('reloadWidgets', () => {
    it('writes the saved widgets again and reloads every widget', () => {
      const layouts = [layout('a', 'First'), layout('b', 'Second')];

      expect(reloadWidgets(layouts)).toBe(true);

      expect(written().map((l) => l.id)).toEqual(['a', 'b']);
      // No name: every widget, not only the custom one.
      expect(reloadMock).toHaveBeenCalledWith(undefined);
      expect(mockAddLog).toHaveBeenCalledWith(
        '[customWidget] Reloading widgets: 2 saved widget(s) written to the widget',
        'INFO'
      );
    });

    it('still reloads, but reports failure, when the write does not stick', () => {
      setMock.mockImplementationOnce(() => {
        // The write silently does not stick.
      });

      expect(reloadWidgets([layout('a', 'First')])).toBe(false);
      expect(reloadMock).toHaveBeenCalledWith(undefined);
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('did not reach the widget'),
        'WARNING'
      );
    });

    it('reports failure when the storage throws', () => {
      setMock.mockImplementationOnce(() => {
        throw new Error('no app group');
      });

      expect(reloadWidgets([layout('a', 'First')])).toBe(false);
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('Failed to reload the widgets'),
        'ERROR'
      );
    });

    it('does nothing on Android', () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'android' });

      expect(reloadWidgets([layout('a', 'First')])).toBe(false);
      expect(setMock).not.toHaveBeenCalled();
      expect(reloadMock).not.toHaveBeenCalled();
    });
  });
});
