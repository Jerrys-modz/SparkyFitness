import { beforeEach, describe, expect, it, vi } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';
import { checkDietPhaseTargetsAfterWeight } from '../services/dietPhaseService.js';

vi.mock('../models/measurementRepository');
vi.mock('../services/dietPhaseService.js', () => ({
  checkDietPhaseTargetsAfterWeight: vi.fn(async () => {}),
}));

describe('diet phase target check after a weight is saved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs after a check-in that saves a weight', async () => {
    vi.mocked(
      measurementRepository.upsertCheckInMeasurements
    ).mockResolvedValue({ id: 'c1' });
    await measurementService.upsertCheckInMeasurements(
      'owner',
      'actor',
      '2026-11-16',
      { weight: 79.5 }
    );
    expect(checkDietPhaseTargetsAfterWeight).toHaveBeenCalledWith(
      'owner',
      'actor'
    );
  });

  it('does not run for a check-in without a weight', async () => {
    vi.mocked(
      measurementRepository.upsertCheckInMeasurements
    ).mockResolvedValue({ id: 'c1' });
    await measurementService.upsertCheckInMeasurements(
      'owner',
      'owner',
      '2026-11-16',
      { neck: 38 }
    );
    expect(checkDietPhaseTargetsAfterWeight).not.toHaveBeenCalled();
  });

  it('runs after an edit that changes the weight', async () => {
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDate
    ).mockResolvedValue({ id: 'c1' });
    vi.mocked(
      measurementRepository.updateCheckInMeasurements
    ).mockResolvedValue({ id: 'c1' });
    await measurementService.updateCheckInMeasurements(
      'owner',
      'owner',
      '2026-11-16',
      { weight: 79 }
    );
    expect(checkDietPhaseTargetsAfterWeight).toHaveBeenCalledWith(
      'owner',
      'owner'
    );
  });
});
