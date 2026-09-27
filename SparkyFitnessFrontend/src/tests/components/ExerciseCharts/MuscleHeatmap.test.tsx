import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MuscleHeatmap } from '@/components/ExerciseCharts/MuscleHeatmap';
import { useBodyMapSvgQuery } from '@/hooks/Exercises/useExercises';
import { useProfileQuery } from '@/hooks/Settings/useProfile';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: jest.fn(),
}));
jest.mock('@/hooks/Exercises/useExercises', () => ({
  useBodyMapSvgQuery: jest.fn(),
}));

const mockProfile = useProfileQuery as jest.Mock;
const mockSvg = useBodyMapSvgQuery as jest.Mock;

const SVG = (figure: string) =>
  `<svg viewBox="0 0 10 10" data-figure="${figure}"><path class="chest" d="M0 0h5v5z"/></svg>`;

describe('MuscleHeatmap', () => {
  beforeEach(() => {
    mockSvg.mockImplementation((figure: string) => ({ data: SVG(figure) }));
  });

  it('starts on the figure for the stored gender', () => {
    mockProfile.mockReturnValue({ data: { gender: 'female' } });
    const { container } = render(<MuscleHeatmap setsByMuscle={{ Chest: 4 }} />);
    expect(mockSvg).toHaveBeenLastCalledWith('female');
    expect(container.querySelector('svg[data-figure="female"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Female' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('switches figures without writing the profile', () => {
    mockProfile.mockReturnValue({ data: { gender: null } });
    render(<MuscleHeatmap setsByMuscle={{ Chest: 4 }} />);
    expect(mockSvg).toHaveBeenLastCalledWith('male');

    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    expect(mockSvg).toHaveBeenLastCalledWith('female');
    expect(screen.getByRole('button', { name: 'Male' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
