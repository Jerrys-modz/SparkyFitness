import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { GuidedWorkoutSettings } from '@/pages/Settings/GuidedWorkoutSettings';
import {
  __resetGuidedWorkoutPreferencesForTests,
  getGuidedWorkoutPreferences,
} from '@/utils/guidedWorkoutPreferences';
import {
  installSpeechSynthesisMock,
  removeSpeechSynthesisMock,
  type SpeechSynthesisMock,
} from '@/tests/mocks/speechSynthesisMock';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

function renderSettings() {
  return render(
    <Accordion type="multiple" defaultValue={['guided-workouts']}>
      <AccordionItem value="guided-workouts">
        <GuidedWorkoutSettings />
      </AccordionItem>
    </Accordion>
  );
}

describe('GuidedWorkoutSettings', () => {
  let synth: SpeechSynthesisMock;

  beforeEach(() => {
    window.localStorage.clear();
    __resetGuidedWorkoutPreferencesForTests();
    synth = installSpeechSynthesisMock([
      { voiceURI: 'en-1', name: 'Amy', lang: 'en-GB' },
      { voiceURI: 'de-1', name: 'Anna', lang: 'de-DE' },
    ]);
  });

  afterEach(() => removeSpeechSynthesisMock());

  it('starts off, with the options hidden', () => {
    renderSettings();
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.queryByText('Speech rate')).not.toBeInTheDocument();
  });

  it('turns guided mode on and reveals voice, rate, countdown and a test', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('switch'));
    expect(getGuidedWorkoutPreferences().enabled).toBe(true);

    expect(screen.getByText('Voice')).toBeInTheDocument();
    expect(screen.getByText('Speech rate')).toBeInTheDocument();
    expect(screen.getByText('Get-ready countdown')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Test voice' }));
    expect(synth.spoken.at(-1)?.text).toBe(
      'This is how your guided workouts will sound.'
    );
  });

  it('warns when the browser cannot speak', () => {
    removeSpeechSynthesisMock();
    renderSettings();
    fireEvent.click(screen.getByRole('switch'));
    expect(
      screen.getByText(
        'This browser cannot speak. The guided view still works, without narration.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Test voice' })
    ).not.toBeInTheDocument();
  });
});
