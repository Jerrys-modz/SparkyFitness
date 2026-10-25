import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExerciseLoadConventionField from '@/pages/Exercises/ExerciseLoadConventionField';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
}));

describe('ExerciseLoadConventionField (#3157)', () => {
  it('is not offered to an exercise that logs no weight against reps', () => {
    const { container } = render(
      <ExerciseLoadConventionField
        id="lc"
        modality="duration"
        value="total"
        onChange={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('explains the chosen option under the select', () => {
    const { rerender } = render(
      <ExerciseLoadConventionField
        id="lc"
        modality="weight_reps"
        value="total"
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Volume counting')).toBeInTheDocument();
    expect(
      screen.getByText('The logged weight is the whole load.')
    ).toBeInTheDocument();
    rerender(
      <ExerciseLoadConventionField
        id="lc"
        modality="weight_reps"
        value="per_hand"
        onChange={() => {}}
      />
    );
    expect(
      screen.getByText(
        'The logged weight is one dumbbell, so volume counts it twice.'
      )
    ).toBeInTheDocument();
  });

  it('falls back to total for a bodyweight exercise saved as per hand', () => {
    render(
      <ExerciseLoadConventionField
        id="lc"
        modality="bodyweight_reps"
        value="per_hand"
        onChange={() => {}}
      />
    );
    expect(
      screen.getByText('The logged weight is the whole load.')
    ).toBeInTheDocument();
  });

  it('offers per hand only for weight and reps', async () => {
    const { unmount } = render(
      <ExerciseLoadConventionField
        id="lc"
        modality="weight_reps"
        value="total"
        onChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    expect(
      await screen.findByRole('option', { name: 'Weight per hand' })
    ).toBeInTheDocument();
    unmount();

    render(
      <ExerciseLoadConventionField
        id="lc"
        modality="bodyweight_reps"
        value="total"
        onChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    expect(
      await screen.findByRole('option', { name: 'Reps per side' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Weight per hand' })
    ).not.toBeInTheDocument();
  });
});
