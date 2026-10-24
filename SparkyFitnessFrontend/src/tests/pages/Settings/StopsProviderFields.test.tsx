import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ProviderSpecificFields } from '@/pages/Settings/ProviderSpecificFields';
import type { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { STOPS_PROVIDER_TYPE } from '@workspace/shared';
import { validateProvider } from '@/utils/settings';

function Harness({
  initial,
  onChange,
}: {
  initial: Partial<ExternalDataProvider>;
  onChange: (p: Partial<ExternalDataProvider>) => void;
}) {
  const [provider, setProvider] = useState(initial);
  return (
    <ProviderSpecificFields
      provider={provider}
      setProvider={(update) => {
        setProvider((prev) => {
          const next = typeof update === 'function' ? update(prev) : update;
          onChange(next);
          return next;
        });
      }}
      fullSyncOnConnect={false}
      setFullSyncOnConnect={() => {}}
      onCopy={() => {}}
    />
  );
}

describe('Overpass stops provider fields', () => {
  const base: Partial<ExternalDataProvider> = {
    provider_type: STOPS_PROVIDER_TYPE,
    base_url: '',
  };

  it('leaves the URL empty, with a placeholder, and has no API key field', () => {
    render(<Harness initial={base} onChange={() => {}} />);
    const url = screen.getByLabelText('Overpass API URL') as HTMLInputElement;
    expect(url.value).toBe('');
    expect(url.placeholder).toContain('your-overpass-server');
    expect(screen.queryByLabelText(/API key/)).toBeNull();
    expect(screen.queryByLabelText('App URL')).toBeNull();
  });

  it('says what is sent, and that the public instance is for light use', () => {
    render(<Harness initial={base} onChange={() => {}} />);
    expect(
      screen.getByText(/is sent to this server, which can see it/)
    ).toBeTruthy();
    expect(screen.getByText(/for light, personal use only/)).toBeTruthy();
    expect(screen.getByText(/10,000 requests and 1 GB/)).toBeTruthy();
    expect(screen.getByText(/host your own Overpass server/)).toBeTruthy();
  });

  it('lets the person type a URL', () => {
    const onChange = jest.fn();
    render(<Harness initial={base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Overpass API URL'), {
      target: { value: 'https://overpass.example.org/api/interpreter' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        base_url: 'https://overpass.example.org/api/interpreter',
      })
    );
  });

  it('needs a URL but no key to save', () => {
    expect(
      validateProvider({
        provider_name: 'Stops',
        provider_type: STOPS_PROVIDER_TYPE,
        base_url: 'https://overpass.example.org/api/interpreter',
      })
    ).toBeNull();
    expect(
      validateProvider({
        provider_name: 'Stops',
        provider_type: STOPS_PROVIDER_TYPE,
      })
    ).toBe('Please provide base_url for overpass');
  });
});
