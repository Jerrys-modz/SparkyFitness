import { printFuelingPlan } from '@/utils/fuelingPrint';

const data = {
  title: 'Fueling plan',
  summary: '60 g/h: take 25 g every 25 min',
  detail: '<b>Gel</b>, 8 portions over 3:00.',
  headers: { time: 'Time', amount: 'Take', total: 'Carbs so far' },
  rows: [
    {
      time: '0:25',
      amount: '25 g <img src=x onerror=alert(1)>',
      total: '25 g',
    },
    { time: '0:50', amount: '25 g Gel', total: '50 g' },
  ],
  disclaimer: 'Not medical advice.',
};

const fakeWindow = () => ({
  document: document.implementation.createHTMLDocument('print'),
  focus: jest.fn(),
  print: jest.fn(),
});

describe('printFuelingPlan', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes the plan as a table and prints it', () => {
    const win = fakeWindow();
    jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window);

    expect(printFuelingPlan(data)).toBe(true);

    const rows = win.document.querySelectorAll('tr');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toBe('TimeTakeCarbs so far');
    expect(rows[2]?.textContent).toBe('0:5025 g Gel50 g');
    expect(win.document.title).toBe('Fueling plan');
    expect(win.print).toHaveBeenCalledTimes(1);
  });

  it('keeps names as text, never markup', () => {
    const win = fakeWindow();
    jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window);

    printFuelingPlan(data);

    expect(win.document.querySelector('img')).toBeNull();
    expect(win.document.querySelector('b')).toBeNull();
    expect(win.document.body.textContent).toContain('<b>Gel</b>');
  });

  it('returns false when the window is blocked', () => {
    jest.spyOn(window, 'open').mockReturnValue(null);
    expect(printFuelingPlan(data)).toBe(false);
  });
});
