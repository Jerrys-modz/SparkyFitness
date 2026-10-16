export const bikeKeys = {
  all: ['bikes'] as const,
  lists: () => [...bikeKeys.all, 'list'] as const,
  list: (status?: string) => [...bikeKeys.lists(), status ?? 'all'] as const,
};
