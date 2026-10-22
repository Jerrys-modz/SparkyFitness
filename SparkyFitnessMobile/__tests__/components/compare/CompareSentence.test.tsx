import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CompareSentence from '../../../src/components/compare/CompareSentence';
import { initializeI18n } from '../../../src/localization/i18n';

jest.mock('../../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      sections,
      onSelect,
      value,
      renderTrigger,
    }: {
      title: string;
      sections: { options: { label: string; value: string }[] }[];
      onSelect: (value: string) => void;
      value: string;
      renderTrigger: (p: {
        onPress: () => void;
        selectedOption: { label: string; value: string } | undefined;
      }) => React.ReactNode;
    }) => {
      const options = sections.flatMap((s) => s.options);
      return (
        <View>
          {renderTrigger({
            onPress: () => undefined,
            selectedOption: options.find((o) => o.value === value),
          })}
          {options.map((o) => (
            <Pressable
              key={o.value}
              testID={`${title}-${o.value}`}
              onPress={() => onSelect(o.value)}
            >
              <Text>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      );
    },
  };
});

describe('CompareSentence', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows empty slots as "something"', () => {
    const { getAllByText } = render(
      <CompareSentence question={{}} onChange={jest.fn()} />
    );
    expect(getAllByText('something')).toHaveLength(2);
  });

  it('reads like the sentence for a full question', () => {
    const { getByText } = render(
      <CompareSentence
        question={{ a: 'meditated', b: 'mood', choice: 'sameDay' }}
        onChange={jest.fn()}
      />
    );
    expect(getByText('meditating')).toBeTruthy();
    expect(getByText('mood')).toBeTruthy();
    expect(getByText('the same day')).toBeTruthy();
  });

  it('announces each trigger with its current value', () => {
    const { getByLabelText } = render(
      <CompareSentence
        question={{ a: 'timeAsleep', choice: 'sameDay' }}
        onChange={jest.fn()}
      />
    );
    expect(
      getByLabelText("First thing: last night's time asleep")
    ).toBeTruthy();
    expect(getByLabelText('Second thing: something')).toBeTruthy();
    expect(getByLabelText('When: the same day')).toBeTruthy();
  });

  it('sets B when a metric is chosen for it', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CompareSentence
        question={{ a: 'timeAsleep', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    fireEvent.press(getByTestId('Second thing-energy'));
    expect(onChange).toHaveBeenCalledWith({
      a: 'timeAsleep',
      b: 'energy',
      choice: 'sameDay',
    });
  });

  it("swaps A and B when A is given B's metric", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CompareSentence
        question={{ a: 'timeAsleep', b: 'mood', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    fireEvent.press(getByTestId('First thing-mood'));
    expect(onChange).toHaveBeenCalledWith({
      a: 'mood',
      b: 'timeAsleep',
      choice: 'sameDay',
    });
  });

  it("clears a metric that isn't offered weekly when a week timing is chosen", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CompareSentence
        question={{ a: 'meditationSessions7d', b: 'mood', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    fireEvent.press(getByTestId('When-sameWeek'));
    const next = onChange.mock.calls[0][0];
    expect(next.choice).toBe('sameWeek');
    expect(next.a).toBeUndefined();
    expect(next.b).toBe('mood');
  });
});
