export const immunizationKeys = {
  all: ['immunizations'] as const,
  list: () => [...immunizationKeys.all, 'list'] as const,
};
