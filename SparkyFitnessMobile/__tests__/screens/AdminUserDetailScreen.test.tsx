import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AdminUser } from '@workspace/shared';
import AdminUserDetailScreen from '../../src/screens/AdminUserDetailScreen';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

let mockIdentity: { authenticatedUserId: string } | undefined;
const mockRun = jest.fn();
jest.mock('../../src/hooks/useAdmin', () => ({
  useSignedInIdentity: () => ({ data: mockIdentity }),
  useAdminUserAction: () => ({ run: mockRun, isPending: false }),
}));

const user: AdminUser = {
  id: 'other',
  full_name: 'Sam Example',
  email: 'sam@example.test',
  role: 'user',
  is_active: true,
  created_at: '2026-01-02T10:00:00.000Z',
  last_login_at: null,
  mfa_totp_enabled: false,
  mfa_email_enabled: false,
};

const renderScreen = (shown: AdminUser = user) =>
  render(
    <AdminUserDetailScreen
      {...({
        navigation: { goBack: jest.fn() },
        route: { params: { user: shown } },
      } as never)}
    />
  );

describe('AdminUserDetailScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIdentity = { authenticatedUserId: 'me' };
  });

  it('deactivates another user', () => {
    renderScreen();
    fireEvent(screen.getByTestId('admin-user-active'), 'valueChange', false);
    expect(mockRun).toHaveBeenCalledWith(
      { kind: 'status', userId: 'other', isActive: false },
      expect.any(Function)
    );
  });

  it('asks before deleting, and deletes only on confirm', () => {
    const alert = jest.spyOn(Alert, 'alert');
    renderScreen();
    fireEvent.press(screen.getByTestId('admin-user-delete'));
    expect(mockRun).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    buttons.find((b) => b.style === 'destructive')!.onPress!();
    expect(mockRun).toHaveBeenCalledWith(
      { kind: 'delete', userId: 'other' },
      expect.any(Function)
    );
  });

  it('never lets an admin lock themselves out', () => {
    renderScreen({ ...user, id: 'me', role: 'admin' });
    expect(screen.getByTestId('admin-user-active').props.disabled).toBe(true);
    expect(screen.getByTestId('admin-user-admin').props.disabled).toBe(true);
    expect(screen.queryByTestId('admin-user-delete')).toBeNull();
    expect(screen.getByText(/This is your own account/)).toBeTruthy();
  });

  it('waits to offer those changes until it knows who is signed in', () => {
    mockIdentity = undefined;
    renderScreen();
    expect(screen.getByTestId('admin-user-active').props.disabled).toBe(true);
    expect(screen.queryByTestId('admin-user-delete')).toBeNull();
  });
});
