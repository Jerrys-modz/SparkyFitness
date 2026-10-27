import { fireEvent, render, screen } from '@testing-library/react';
import FuelingPlanner from '@/pages/Exercises/FuelingPlanner';

describe('FuelingPlanner', () => {
  it('plans a 3 hour moderate run with the intermediate cap', () => {
    render(<FuelingPlanner />);
    expect(screen.getByTestId('fueling-result').textContent).toContain(
      '60 g/h: take 25 g every 25 min'
    );
    expect(screen.getByText(/About 180 g of carbohydrate/)).toBeTruthy();
  });

  it('suggests no fueling under an hour', () => {
    render(<FuelingPlanner />);
    fireEvent.change(screen.getByLabelText('Hours'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '45' },
    });
    expect(screen.getByTestId('fueling-none')).toBeTruthy();
    expect(screen.queryByTestId('fueling-result')).toBeNull();
  });

  it('uses the carbs and portion the person types', () => {
    render(<FuelingPlanner />);
    fireEvent.change(screen.getByLabelText('Your carbs (g/h)'), {
      target: { value: '80' },
    });
    fireEvent.change(screen.getByLabelText('Portion (g)'), {
      target: { value: '40' },
    });
    expect(screen.getByTestId('fueling-result').textContent).toContain(
      '80 g/h: take 40 g every 30 min'
    );
    expect(
      screen.getByText(/usual range for this duration is 60 to 90 g\/h/)
    ).toBeTruthy();
  });

  it('lists the reminder times', () => {
    render(<FuelingPlanner />);
    expect(screen.getByText('0:25: 25 g')).toBeTruthy();
    expect(screen.getByText('2:30: 25 g')).toBeTruthy();
  });
});
