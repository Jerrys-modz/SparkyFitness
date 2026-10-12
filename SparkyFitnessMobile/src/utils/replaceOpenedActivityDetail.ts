import {
  StackActions,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import type { ExerciseActivityQueryItem } from '@workspace/shared';

interface NavigatorLike {
  getParent: () => NavigatorLike | undefined;
  getState: () =>
    | { index: number; routes: readonly { name: string; params?: object }[] }
    | undefined;
  dispatch: NavigationProp<ParamListBase>['dispatch'];
}

/**
 * Swaps the basic activity screen the diary opened for `openedId` for the
 * cardio stats screen, once the route lookup has found a track. Does nothing
 * when the person has already moved on.
 *
 * The screen lives on the root stack, which is not always the diary's direct
 * parent: with the native iOS tab bar the diary sits in its own tab stack
 * under the tab navigator. So this walks up until it finds the navigator
 * showing that screen.
 */
export function replaceOpenedActivityDetail(
  from: NavigatorLike,
  openedId: string,
  params: { session: ExerciseActivityQueryItem; distanceUnit: 'km' | 'miles' }
): boolean {
  for (let nav = from.getParent(); nav; nav = nav.getParent()) {
    const state = nav.getState();
    const current = state?.routes[state.index];
    if (current?.name !== 'ActivityDetail') continue;
    const opened = current.params as { session?: { id?: string } } | undefined;
    if (opened?.session?.id !== openedId) return false;
    nav.dispatch(StackActions.replace('CardioSession', params));
    return true;
  }
  return false;
}
