import { describe, expect, it } from 'vitest';
import {
  extractTextPayloads,
  extractFitResources,
  detectCorosToolError,
  isCorosNoDataText,
  parseSportRecords,
} from '../integrations/coros/corosMcpText.js';

const MOCK_SPORT_RECORDS_RESULT = {
  content: [
    {
      type: 'text',
      text: 'Sport Records — 2024-12-01 to 2024-12-31 (1 records)\n========================\n\n1. Indoor Run — 2024-12-21\n   Location: Indoor Run\n   Time Window: startTimestamp=1734814685 | endTimestamp=1734816535\n   Duration: 30:16 | Distance: 3.74 km\n   Average Pace: 8:05 /km | Avg HR: 134 bpm | Calories: 300 kcal\n   LabelId: 480644884506640590 | SportType: 101',
    },
  ],
  isError: false,
};

const MOCK_FIT_FILE_RESULT = {
  content: [
    {
      type: 'text',
      text: 'Returned raw FIT file(s).',
    },
    {
      type: 'resource',
      resource: {
        uri: 'coros://activity-fit-files/480644884506640590.fit',
        mimeType: 'application/octet-stream',
        _meta: {
          labelId: '480644884506640590',
          sportType: 101,
          fileName: '480644884506640590.fit',
          fileType: 4,
        },
        blob: Buffer.from('mock-fit-data').toString('base64'),
      },
      annotations: {
        audience: ['assistant'],
        priority: 1,
      },
    },
  ],
  isError: false,
};

describe('corosMcpText parser', () => {
  it('parses report markdown and json tool responses', () => {
    const payloads = extractTextPayloads(MOCK_SPORT_RECORDS_RESULT);
    expect(payloads).toBeDefined();
    expect(payloads.length).toBeGreaterThan(0);
  });

  it('detects no data and tool errors', () => {
    expect(isCorosNoDataText('No data found for this period.')).toBe(true);
    expect(isCorosNoDataText('null')).toBe(true);
    expect(isCorosNoDataText('Some real data')).toBe(false);

    expect(detectCorosToolError('Error: token expired')).not.toBeNull();
    expect(detectCorosToolError('Success response')).toBeNull();
  });

  it('extracts sport records from list response', () => {
    const payloads = extractTextPayloads(MOCK_SPORT_RECORDS_RESULT);
    expect(payloads.length).toBeGreaterThan(0);
    const reportText = payloads[0].kind === 'report' ? payloads[0].text : '';
    const { records } = parseSportRecords(reportText);
    expect(records.length).toBe(1);
    expect(records[0].labelId).toBe('480644884506640590');
    expect(records[0].sportType).toBe(101);
  });

  it('extracts FIT file resources from embedded data', () => {
    const resources = extractFitResources(MOCK_FIT_FILE_RESULT);
    expect(resources.length).toBeGreaterThan(0);
    expect(resources[0].data).toBeInstanceOf(Buffer);
    expect(resources[0].data.length).toBeGreaterThan(0);
  });
});
