import * as Notifications from 'expo-notifications';

import {
  cancelImmunizationReminders,
  scheduleImmunizationReminders,
} from '../../src/services/immunizationReminderService';
import {
  IMMUNIZATION_REMINDER_KIND,
  type ImmunizationReminderPlanItem,
} from '../../src/utils/immunizationReminders';

const mockSchedule =
  Notifications.scheduleNotificationAsync as jest.MockedFunction<
    typeof Notifications.scheduleNotificationAsync
  >;
const mockCancel =
  Notifications.cancelScheduledNotificationAsync as jest.MockedFunction<
    typeof Notifications.cancelScheduledNotificationAsync
  >;
const mockGetAllScheduled =
  Notifications.getAllScheduledNotificationsAsync as jest.MockedFunction<
    typeof Notifications.getAllScheduledNotificationsAsync
  >;

const item = (
  over: Partial<ImmunizationReminderPlanItem> = {}
): ImmunizationReminderPlanItem => ({
  identifier: 'immunization_a_due',
  recordId: 'a',
  vaccineName: 'Tdap',
  when: 'due',
  day: '2026-12-20',
  ...over,
});

describe('immunization reminder service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllScheduled.mockResolvedValue([]);
  });

  it('cancels only vaccine reminders', async () => {
    mockGetAllScheduled.mockResolvedValue([
      {
        identifier: 'immunization_a_due',
        content: { data: { kind: IMMUNIZATION_REMINDER_KIND } },
      },
      { identifier: 'oral_care_0', content: { data: { kind: 'oral-care' } } },
    ] as never);
    await cancelImmunizationReminders();
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith('immunization_a_due');
  });

  it('schedules a date notification at 9:00 that names the vaccine', async () => {
    await scheduleImmunizationReminders(
      [
        item(),
        item({
          identifier: 'immunization_a_ahead',
          when: 'ahead',
          day: '2026-12-13',
        }),
      ],
      new Date(2026, 10, 28, 12, 0)
    );
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    const first = mockSchedule.mock.calls[0][0];
    expect(first.identifier).toBe('immunization_a_due');
    expect(first.content.body).toBe('Tdap is due today.');
    expect(first.content.data).toEqual({
      kind: IMMUNIZATION_REMINDER_KIND,
      recordId: 'a',
    });
    const trigger = first.trigger as { date: Date; channelId: string };
    expect(trigger.date.getHours()).toBe(9);
    expect(trigger.channelId).toBe('immunizations');
    expect(mockSchedule.mock.calls[1][0].content.body).toBe(
      'Tdap is due in a week.'
    );
  });

  it('skips a reminder whose moment has already passed', async () => {
    await scheduleImmunizationReminders(
      [item({ day: '2026-11-28' })],
      new Date(2026, 10, 28, 12, 0)
    );
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('keeps going when one reminder fails to schedule', async () => {
    mockSchedule.mockRejectedValueOnce(new Error('boom'));
    await scheduleImmunizationReminders(
      [item(), item({ identifier: 'immunization_b_due', recordId: 'b' })],
      new Date(2026, 10, 28, 12, 0)
    );
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });
});
