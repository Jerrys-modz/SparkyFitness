import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LabResultsCard from '../../src/components/labs/LabResultsCard';
import {
  useLabMarkers,
  useLatestLabValues,
} from '../../src/hooks/useLabResults';

jest.mock('../../src/components/Icon', () => 'Icon');
jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn(() => ['#000']),
}));
jest.mock('../../src/hooks/useLabResults', () => ({
  useLabMarkers: jest.fn(),
  useLatestLabValues: jest.fn(),
}));

const marker = (id: string, name: string, high: number | null) => ({
  id,
  name,
  display_name: name,
  measurement_type: 'mg/dL',
  frequency: 'All',
  is_lab: true as const,
  ref_range_low: null,
  ref_range_high: high,
});

const latest = (rows: Record<string, { value: string; entry_date: string }>) =>
  new Map(
    Object.entries(rows).map(([categoryId, row]) => [
      categoryId,
      {
        id: `e-${categoryId}`,
        category_id: categoryId,
        source: 'manual',
        ...row,
      },
    ])
  );

const navigation = { navigate: jest.fn() } as never;

describe('LabResultsCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when the user has no lab markers', () => {
    jest.mocked(useLabMarkers).mockReturnValue({ markers: [] } as never);
    jest
      .mocked(useLatestLabValues)
      .mockReturnValue({ byCategory: new Map() } as never);
    const { toJSON } = render(<LabResultsCard navigation={navigation} />);
    expect(toJSON()).toBeNull();
  });

  it('shows the newest results with status and opens the lab list', () => {
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [marker('a', 'LDL', 100), marker('b', 'HDL', null)],
    } as never);
    jest.mocked(useLatestLabValues).mockReturnValue({
      byCategory: latest({
        a: { value: '130', entry_date: '2026-09-20' },
        b: { value: '55', entry_date: '2026-09-01' },
      }),
    } as never);
    const { getByText, queryByText } = render(
      <LabResultsCard navigation={navigation} />
    );
    expect(getByText('LDL')).toBeTruthy();
    expect(getByText('130 mg/dL')).toBeTruthy();
    expect(getByText('High')).toBeTruthy();
    expect(queryByText(/outside the reference range/)).toBeTruthy();

    fireEvent.press(getByText('Lab results'));
    expect(
      (navigation as { navigate: jest.Mock }).navigate
    ).toHaveBeenCalledWith('LabResults');
  });

  it('prompts to add a result when markers exist but none has a value', () => {
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [marker('a', 'LDL', 100)],
    } as never);
    jest
      .mocked(useLatestLabValues)
      .mockReturnValue({ byCategory: new Map() } as never);
    const { getByText } = render(<LabResultsCard navigation={navigation} />);
    expect(getByText('No results yet. Tap to add one.')).toBeTruthy();
  });
});
