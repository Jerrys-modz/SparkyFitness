import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WeeklyWeightGoalInput } from '@/components/WeeklyWeightGoalInput';

describe('WeeklyWeightGoalInput', () => {
  it('refreshes an externally loaded rate while keeping the current display unit', () => {
    const props = { onChange: jest.fn(), onValidityChange: jest.fn() };
    const { rerender } = render(
      <WeeklyWeightGoalInput {...props} value={-0.5} />
    );
    fireEvent.keyDown(
      screen.getByRole('combobox', { name: 'Weekly amount unit' }),
      { key: 'ArrowDown' }
    );
    fireEvent.click(screen.getByRole('option', { name: 'g / week' }));

    rerender(<WeeklyWeightGoalInput {...props} value={0.25} />);
    expect(screen.getByRole('textbox', { name: 'Weekly amount' })).toHaveValue(
      '250'
    );
    expect(
      screen.getByRole('combobox', { name: 'Weight goal' })
    ).toHaveTextContent('Gain weight');
  });

  it('converts kilograms to grams without changing the requested rate', () => {
    const onChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        onChange={onChange}
        onValidityChange={jest.fn()}
      />
    );
    fireEvent.keyDown(
      screen.getByRole('combobox', { name: 'Weekly amount unit' }),
      { key: 'ArrowDown' }
    );
    fireEvent.click(screen.getByRole('option', { name: 'g / week' }));
    const amount = screen.getByRole('textbox', { name: 'Weekly amount' });
    expect(amount).toHaveValue('500');
    expect(onChange).toHaveBeenLastCalledWith(-0.5);
    fireEvent.change(amount, { target: { value: '250' } });
    expect(onChange).toHaveBeenLastCalledWith(-0.25);
  });

  it('switches between loss, gain and maintenance without losing the amount', () => {
    const onChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        onChange={onChange}
        onValidityChange={jest.fn()}
      />
    );
    const direction = screen.getByRole('combobox', { name: 'Weight goal' });
    fireEvent.keyDown(direction, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Gain weight' }));
    expect(onChange).toHaveBeenLastCalledWith(0.5);
    fireEvent.keyDown(direction, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Maintain weight' }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(screen.queryByRole('textbox', { name: 'Weekly amount' })).toBeNull();
    fireEvent.keyDown(direction, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Lose weight' }));
    expect(onChange).toHaveBeenLastCalledWith(-0.5);
  });

  it('accepts a decimal comma and keeps loss signed when editing kilograms', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Weekly amount' }), {
      target: { value: '0,25' },
    });
    expect(onChange).toHaveBeenLastCalledWith(-0.25);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it('blocks empty, non-finite and excessive rates instead of saving zero', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );
    const amount = screen.getByRole('textbox', { name: 'Weekly amount' });

    for (const value of ['', 'Infinity', '2.1', '-1', '1e2']) {
      fireEvent.change(amount, { target: { value } });
      expect(onValidityChange).toHaveBeenLastCalledWith(false);
      expect(amount).toHaveAttribute('aria-invalid', 'true');
    }
    expect(onChange).not.toHaveBeenCalled();
  });
});
