import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import SegmentRangeSelector from '../../../src/components/segments/SegmentRangeSelector';
import { initializeI18n } from '../../../src/localization/i18n';

describe('SegmentRangeSelector', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  const setup = (range = { startM: 1000, endM: 2000 }) => {
    const onChange = jest.fn();
    const screen = render(
      <SegmentRangeSelector
        totalM={3000}
        range={range}
        onChange={onChange}
        unit="km"
      />
    );
    return { screen, onChange };
  };

  it('shows where the segment starts, ends and how long it is', () => {
    const { screen } = setup();
    expect(screen.getByTestId('segment-start-label').props.children).toBe(
      '1.00 km'
    );
    expect(screen.getByTestId('segment-end-label').props.children).toBe(
      '2.00 km'
    );
    expect(screen.getByText('Segment length 1.00 km')).toBeTruthy();
    expect(screen.getByTestId('segment-handle-start')).toBeTruthy();
    expect(screen.getByTestId('segment-handle-end')).toBeTruthy();
  });

  it('describes the selection to a screen reader', () => {
    const { screen } = setup();
    expect(
      screen.getByLabelText(/Segment from 1.00 km to 2.00 km along the line/)
    ).toBeTruthy();
  });

  it('nudges each handle by 50 m', () => {
    const { screen, onChange } = setup();
    fireEvent.press(screen.getByTestId('segment-nudge-start-forward'));
    expect(onChange).toHaveBeenLastCalledWith({ startM: 1050, endM: 2000 });
    fireEvent.press(screen.getByTestId('segment-nudge-start-back'));
    expect(onChange).toHaveBeenLastCalledWith({ startM: 950, endM: 2000 });
    fireEvent.press(screen.getByTestId('segment-nudge-end-forward'));
    expect(onChange).toHaveBeenLastCalledWith({ startM: 1000, endM: 2050 });
    fireEvent.press(screen.getByTestId('segment-nudge-end-back'));
    expect(onChange).toHaveBeenLastCalledWith({ startM: 1000, endM: 1950 });
  });

  it('will not nudge past the minimum length', () => {
    const { screen, onChange } = setup({ startM: 1000, endM: 1100 });
    fireEvent.press(screen.getByTestId('segment-nudge-end-back'));
    expect(onChange).toHaveBeenLastCalledWith({ startM: 1000, endM: 1100 });
  });

  it('has labelled nudge buttons', () => {
    const { screen } = setup();
    expect(screen.getByLabelText('Move the start earlier')).toBeTruthy();
    expect(screen.getByLabelText('Move the end later')).toBeTruthy();
  });
});
