import { MAX_WIDGET_LAYOUTS } from '@workspace/shared';
import {
  newWidgetLayoutDraft,
  useWidgetLayoutStore,
} from '../../src/stores/widgetLayoutStore';

let mockIdCounter = 0;
jest.mock('../../src/utils/ids', () => ({
  newUuid: () => `id-${++mockIdCounter}`,
}));

const draft = (name: string) => ({ ...newWidgetLayoutDraft(), name });

beforeEach(() => {
  mockIdCounter = 0;
  useWidgetLayoutStore.setState({ layouts: [] });
});

describe('widgetLayoutStore', () => {
  it('adds a normalized layout and returns its id', () => {
    const id = useWidgetLayoutStore.getState().addLayout(draft('Calories'));
    expect(id).toBe('id-1');
    const [layout] = useWidgetLayoutStore.getState().layouts;
    expect(layout).toMatchObject({
      id: 'id-1',
      name: 'Calories',
      family: 'small',
      style: 'ring',
    });
    expect(layout.updatedAt).toBeGreaterThan(0);
  });

  it('updates in place, keeping the id', () => {
    const id = useWidgetLayoutStore.getState().addLayout(draft('A'))!;
    useWidgetLayoutStore.getState().updateLayout(id, {
      ...draft('B'),
      family: 'medium',
      style: 'grid',
      metrics: [{ metric: 'protein' }, { metric: 'carbs' }],
    });
    const { layouts } = useWidgetLayoutStore.getState();
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toMatchObject({ id, name: 'B', family: 'medium' });
  });

  it('ignores an update for an unknown id', () => {
    useWidgetLayoutStore.getState().updateLayout('nope', draft('X'));
    expect(useWidgetLayoutStore.getState().layouts).toEqual([]);
  });

  it('duplicates with a new id and name', () => {
    const id = useWidgetLayoutStore.getState().addLayout(draft('A'))!;
    const copyId = useWidgetLayoutStore
      .getState()
      .duplicateLayout(id, 'A copy');
    const names = useWidgetLayoutStore.getState().layouts.map((l) => l.name);
    expect(copyId).not.toBe(id);
    expect(names).toEqual(['A', 'A copy']);
  });

  it('deletes by id', () => {
    const id = useWidgetLayoutStore.getState().addLayout(draft('A'))!;
    useWidgetLayoutStore.getState().deleteLayout(id);
    expect(useWidgetLayoutStore.getState().layouts).toEqual([]);
  });

  it('refuses to add past the cap', () => {
    for (let i = 0; i < MAX_WIDGET_LAYOUTS; i++) {
      useWidgetLayoutStore.getState().addLayout(draft(`W${i}`));
    }
    expect(
      useWidgetLayoutStore.getState().addLayout(draft('extra'))
    ).toBeNull();
    expect(useWidgetLayoutStore.getState().layouts).toHaveLength(
      MAX_WIDGET_LAYOUTS
    );
  });
});
