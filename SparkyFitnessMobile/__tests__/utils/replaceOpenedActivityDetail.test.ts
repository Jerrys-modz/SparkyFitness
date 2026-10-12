import { StackActions } from '@react-navigation/native';
import type { ExerciseActivityQueryItem } from '@workspace/shared';
import { replaceOpenedActivityDetail } from '../../src/utils/replaceOpenedActivityDetail';

type Route = { name: string; params?: object };

const navigator = (routes: Route[], parent?: ReturnType<typeof navigator>) => ({
  getParent: () => parent,
  getState: () => ({ index: routes.length - 1, routes }),
  dispatch: jest.fn(),
});

const params = {
  session: { id: 'entry-1' } as ExerciseActivityQueryItem,
  distanceUnit: 'miles' as const,
};
const opened: Route = {
  name: 'ActivityDetail',
  params: { session: { id: 'entry-1' } },
};

describe('replaceOpenedActivityDetail', () => {
  it('swaps the screen when the diary is directly under the root stack', () => {
    const root = navigator([{ name: 'Tabs' }, opened]);
    const diary = navigator([{ name: 'Diary' }], root);

    expect(replaceOpenedActivityDetail(diary, 'entry-1', params)).toBe(true);
    expect(root.dispatch).toHaveBeenCalledWith(
      StackActions.replace('CardioSession', params)
    );
  });

  it('finds the root stack through the native tab bar', () => {
    // Diary screen -> its tab stack -> tab navigator -> root stack.
    const root = navigator([{ name: 'Tabs' }, opened]);
    const tabs = navigator([{ name: 'Diary' }], root);
    const diaryStack = navigator([{ name: 'DiaryRoot' }], tabs);

    expect(replaceOpenedActivityDetail(diaryStack, 'entry-1', params)).toBe(
      true
    );
    expect(root.dispatch).toHaveBeenCalledTimes(1);
    expect(tabs.dispatch).not.toHaveBeenCalled();
  });

  it('leaves another entry alone', () => {
    const root = navigator([
      { name: 'Tabs' },
      { name: 'ActivityDetail', params: { session: { id: 'entry-2' } } },
    ]);
    const diary = navigator([{ name: 'Diary' }], root);

    expect(replaceOpenedActivityDetail(diary, 'entry-1', params)).toBe(false);
    expect(root.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing once the person has left the screen', () => {
    const root = navigator([{ name: 'Tabs' }]);
    const diary = navigator([{ name: 'Diary' }], root);

    expect(replaceOpenedActivityDetail(diary, 'entry-1', params)).toBe(false);
    expect(root.dispatch).not.toHaveBeenCalled();
  });
});
