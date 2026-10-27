import { fireEvent, render, screen } from '@testing-library/react';
import FuelingPlanner from '@/pages/Exercises/FuelingPlanner';
import { toast } from '@/hooks/use-toast';

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC' }),
}));

const dayFromToday = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

jest.mock('@/components/FoodSearch/FoodSearchDialog', () => ({
  __esModule: true,
  default: ({ open, onFoodSelect }: any) =>
    open ? (
      <div>
        <button
          onClick={() =>
            onFoodSelect(
              { id: 'f1', name: 'SIS gel', default_variant: { carbs: 22 } },
              'food'
            )
          }
        >
          pick gel
        </button>
        <button
          onClick={() =>
            onFoodSelect(
              { id: 'f2', name: 'Water', default_variant: { carbs: 0 } },
              'food'
            )
          }
        >
          pick water
        </button>
      </div>
    ) : null,
}));

describe('FuelingPlanner', () => {
  beforeEach(() => jest.clearAllMocks());

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

  it('uses a chosen saved food for the name and portion size', () => {
    render(<FuelingPlanner />);
    fireEvent.click(screen.getByText('Choose a saved food'));
    fireEvent.click(screen.getByText('pick gel'));

    expect(
      (screen.getByLabelText('Fuel product') as HTMLInputElement).value
    ).toBe('SIS gel');
    expect(
      (screen.getByLabelText('Portion (g)') as HTMLInputElement).value
    ).toBe('22');
    expect(screen.getByTestId('fueling-result').textContent).toContain(
      'take 22 g every'
    );
    expect(screen.getByTestId('fueling-count').textContent).toContain(
      'SIS gel'
    );
  });

  it('refuses a food with no carbohydrates', () => {
    render(<FuelingPlanner />);
    fireEvent.click(screen.getByText('Choose a saved food'));
    fireEvent.click(screen.getByText('pick water'));

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'That food has no carbohydrates listed.',
      })
    );
    expect(
      (screen.getByLabelText('Fuel product') as HTMLInputElement).value
    ).toBe('');
  });

  it('counts the portions in the plan', () => {
    render(<FuelingPlanner />);
    // 3 h at 60 g/h = 180 g in 25 g portions
    expect(screen.getByTestId('fueling-count').textContent).toBe(
      'That is about 8 × Energy gel.'
    );
  });

  it('prints the schedule in a window of its own', () => {
    const printWindow = {
      document: document.implementation.createHTMLDocument('print'),
      focus: jest.fn(),
      print: jest.fn(),
    };
    const open = jest
      .spyOn(window, 'open')
      .mockReturnValue(printWindow as unknown as Window);

    render(<FuelingPlanner />);
    fireEvent.click(screen.getByText('Print schedule'));

    expect(open).toHaveBeenCalled();
    expect(printWindow.print).toHaveBeenCalledTimes(1);
    expect(printWindow.document.body.textContent).toContain(
      '60 g/h: take 25 g every 25 min'
    );
    expect(printWindow.document.body.textContent).toContain('0:25');
    open.mockRestore();
  });

  it('says so when the browser blocks the print window', () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    render(<FuelingPlanner />);
    fireEvent.click(screen.getByText('Print schedule'));

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Allow pop-ups for this site to print the plan.',
      })
    );
    open.mockRestore();
  });

  it('offers no print for a run that needs no fueling', () => {
    render(<FuelingPlanner />);
    fireEvent.change(screen.getByLabelText('Hours'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '45' },
    });
    expect(screen.queryByText('Print schedule')).toBeNull();
  });

  describe('race day', () => {
    it('shows nothing until a race day is entered', () => {
      render(<FuelingPlanner />);
      expect(screen.queryByTestId('fueling-race')).toBeNull();
    });

    it('builds up toward the race target', () => {
      render(<FuelingPlanner />);
      fireEvent.change(screen.getByLabelText('Race day (optional)'), {
        target: { value: dayFromToday(70) },
      });

      expect(screen.getByTestId('fueling-race-status').textContent).toBe(
        'If you start today, practise 35 g/h this week. The race target is 60 g/h.'
      );
      expect(screen.getByTestId('fueling-race-weeks').textContent).toContain(
        'g/h'
      );
    });

    it('warns when there is not enough time', () => {
      render(<FuelingPlanner />);
      fireEvent.change(screen.getByLabelText('Race day (optional)'), {
        target: { value: dayFromToday(10) },
      });
      expect(screen.getByTestId('fueling-race-status').textContent).toContain(
        'not enough time'
      );
    });

    it("plans the run at this week's amount", () => {
      render(<FuelingPlanner />);
      fireEvent.change(screen.getByLabelText('Race day (optional)'), {
        target: { value: dayFromToday(70) },
      });
      fireEvent.click(screen.getByText('Plan this run at 35 g/h'));

      expect(
        (screen.getByLabelText('Your carbs (g/h)') as HTMLInputElement).value
      ).toBe('35');
      // the race target stays the plan's own, not the amount just picked
      expect(screen.getByTestId('fueling-race-status').textContent).toContain(
        'race target is 60 g/h'
      );
    });
  });

  describe('drink plan', () => {
    it('shows 150 ml every 20 minutes to start with', () => {
      render(<FuelingPlanner />);
      expect(screen.getByTestId('fueling-drink-summary').textContent).toBe(
        '150 ml every 20 min, 450 ml an hour.'
      );
      expect(screen.queryByTestId('fueling-drink-warning')).toBeNull();
    });

    it('follows what is typed and warns about a lot of fluid', () => {
      render(<FuelingPlanner />);
      fireEvent.change(screen.getByLabelText('Every (min)'), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText('Each drink (ml)'), {
        target: { value: '200' },
      });
      expect(screen.getByTestId('fueling-drink-summary').textContent).toBe(
        '200 ml every 10 min, 1200 ml an hour.'
      );
      expect(screen.getByTestId('fueling-drink-warning')).toBeTruthy();
    });

    it('adds the drink plan to the printout', () => {
      const printWindow = {
        document: document.implementation.createHTMLDocument('print'),
        focus: jest.fn(),
        print: jest.fn(),
      };
      const open = jest
        .spyOn(window, 'open')
        .mockReturnValue(printWindow as unknown as Window);
      render(<FuelingPlanner />);
      fireEvent.click(screen.getByText('Print schedule'));
      expect(printWindow.document.body.textContent).toContain(
        'Drink: 150 ml every 20 min, 450 ml an hour.'
      );
      open.mockRestore();
    });
  });
});
