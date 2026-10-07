export const habitKeys = {
  all: ['habits'] as const,
  list: () => [...habitKeys.all, 'list'] as const,
  logs: (startDate: string, endDate: string) =>
    [...habitKeys.all, 'logs', startDate, endDate] as const,
};
