import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import {
  attachWeatherToExerciseEntry,
  fetchWeatherAt,
  weatherCodeToCondition,
} from '../services/weatherService.js';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    getExerciseEntryById: vi.fn(),
    updateExerciseEntryTelemetryOnly: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);
const getEntry = vi.mocked(exerciseEntryRepository.getExerciseEntryById);
const updateTelemetry = vi.mocked(
  exerciseEntryRepository.updateExerciseEntryTelemetryOnly
);

const NOW = new Date('2026-10-15T12:00:00Z');
const START = '2026-10-15T07:25:10.000Z';

const hourlyBody = {
  hourly: {
    time: ['2026-10-15T06:00', '2026-10-15T07:00', '2026-10-15T08:00'],
    temperature_2m: [8.1, 9.4, 10.2],
    relative_humidity_2m: [90, 86, 80],
    wind_speed_10m: [2.1, 3.3, 3.9],
    weather_code: [3, 61, 2],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SPARKY_FITNESS_WEATHER_ENABLED = 'true';
  mockedGet.mockResolvedValue({ data: hourlyBody });
  getEntry.mockResolvedValue({ id: 'entry-1', weather_temp_celsius: null });
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.SPARKY_FITNESS_WEATHER_ENABLED;
});

describe('weatherCodeToCondition', () => {
  it('names known codes and returns null for unknown ones', () => {
    expect(weatherCodeToCondition(61)).toBe('Light rain');
    expect(weatherCodeToCondition(95)).toBe('Thunderstorm');
    expect(weatherCodeToCondition(1234)).toBeNull();
    expect(weatherCodeToCondition(null)).toBeNull();
  });
});

describe('fetchWeatherAt', () => {
  it('picks the hour the activity started in', async () => {
    const weather = await fetchWeatherAt(51.5012, -0.1234, new Date(START));
    expect(weather).toEqual({
      weather_temp_celsius: 9.4,
      weather_condition: 'Light rain',
      weather_wind_speed_mps: 3.3,
      weather_humidity_percentage: 86,
    });
  });

  it('rounds the coordinates before they leave the server', async () => {
    await fetchWeatherAt(51.5012, -0.1234, new Date(START));
    const [, config] = mockedGet.mock.calls[0]!;
    expect(config?.params).toMatchObject({
      latitude: '51.50',
      longitude: '-0.12',
      start_date: '2026-10-15',
      end_date: '2026-10-15',
      wind_speed_unit: 'ms',
    });
  });

  it('uses the forecast service for a recent activity and the archive for an old one', async () => {
    await fetchWeatherAt(51.5, -0.12, new Date(START));
    expect(mockedGet.mock.calls[0]![0]).toContain(
      'api.open-meteo.com/v1/forecast'
    );

    await fetchWeatherAt(51.5, -0.12, new Date('2026-09-01T07:25:00Z'));
    expect(mockedGet.mock.calls[1]![0]).toContain('archive-api.open-meteo.com');
  });

  it('returns null when the hour is missing, the body is unexpected or the call fails', async () => {
    expect(
      await fetchWeatherAt(51.5, -0.12, new Date('2026-10-15T20:00:00Z'))
    ).toBeNull();

    mockedGet.mockResolvedValueOnce({ data: { nope: true } });
    expect(await fetchWeatherAt(51.5, -0.12, new Date(START))).toBeNull();

    mockedGet.mockRejectedValueOnce(new Error('timeout'));
    expect(await fetchWeatherAt(51.5, -0.12, new Date(START))).toBeNull();
  });
});

describe('attachWeatherToExerciseEntry', () => {
  const start = { lat: 51.5, lon: -0.12, t: START };

  it('stores the weather on an entry that has none', async () => {
    await attachWeatherToExerciseEntry('user-1', 'entry-1', start);
    expect(updateTelemetry).toHaveBeenCalledWith('entry-1', 'user-1', {
      weather_temp_celsius: 9.4,
      weather_condition: 'Light rain',
      weather_wind_speed_mps: 3.3,
      weather_humidity_percentage: 86,
    });
  });

  it('does nothing unless the operator turned it on', async () => {
    delete process.env.SPARKY_FITNESS_WEATHER_ENABLED;
    await attachWeatherToExerciseEntry('user-1', 'entry-1', start);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(updateTelemetry).not.toHaveBeenCalled();
  });

  it('keeps weather a provider already supplied', async () => {
    getEntry.mockResolvedValue({
      id: 'entry-1',
      weather_condition: 'Sunny',
    });
    await attachWeatherToExerciseEntry('user-1', 'entry-1', start);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(updateTelemetry).not.toHaveBeenCalled();
  });

  it.each([
    ['a placeholder fix at 0,0', { lat: 0, lon: 0, t: START }],
    ['an impossible latitude', { lat: 95, lon: 10, t: START }],
    [
      'a start time in the future',
      { lat: 51.5, lon: -0.12, t: '2026-10-16T09:00:00Z' },
    ],
    ['an unreadable start time', { lat: 51.5, lon: -0.12, t: 'not a date' }],
  ])('skips %s', async (_label, bad) => {
    await attachWeatherToExerciseEntry('user-1', 'entry-1', bad);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('never throws when the database or the lookup fails', async () => {
    getEntry.mockRejectedValueOnce(new Error('db down'));
    await expect(
      attachWeatherToExerciseEntry('user-1', 'entry-1', start)
    ).resolves.toBeUndefined();

    updateTelemetry.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      attachWeatherToExerciseEntry('user-1', 'entry-1', start)
    ).resolves.toBeUndefined();
  });
});
