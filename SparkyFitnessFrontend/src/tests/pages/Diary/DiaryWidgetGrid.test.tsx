import { render } from '@testing-library/react';
import DiaryWidgetGrid from '@/pages/Diary/DiaryWidgetGrid';

const mockWidgetGrid = jest.fn((_props: { defaultHidden?: string[] }) => null);
jest.mock('@/components/widgets/WidgetGrid', () => ({
  __esModule: true,
  default: (props: { defaultHidden?: string[] }) => mockWidgetGrid(props),
}));

describe('DiaryWidgetGrid', () => {
  it('keeps the weight progress widget hidden until it is turned on', () => {
    render(<DiaryWidgetGrid widgets={[]} />);
    expect(mockWidgetGrid).toHaveBeenCalledWith(
      expect.objectContaining({ defaultHidden: ['weightProgress'] })
    );
  });
});
