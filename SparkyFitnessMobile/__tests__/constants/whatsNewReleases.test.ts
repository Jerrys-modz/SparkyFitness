import i18n, { initializeI18n } from '../../src/localization/i18n';
import { getWhatsNewReleases } from '../../src/constants/whatsNewReleases';
import packageJson from '../../package.json';

const parseVersion = (version: string): number[] =>
  version.split('.').map((part) => Number(part));

const compareVersions = (a: string, b: string): number => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

describe("What's New release notes", () => {
  beforeAll(async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  const releases = () => getWhatsNewReleases(i18n.t);

  it('has an entry for the current app version', () => {
    const latest = releases()[0];
    expect(latest).toBeDefined();
    expect(
      compareVersions(latest.version, packageJson.version)
    ).toBeGreaterThanOrEqual(0);
  });

  it('lists releases newest first with valid versions and dates', () => {
    const list = releases();
    list.forEach((release) => {
      expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(release.date))).toBe(false);
    });
    for (let i = 1; i < list.length; i += 1) {
      expect(
        compareVersions(list[i - 1].version, list[i].version)
      ).toBeGreaterThan(0);
    }
  });

  it('renders readable English for every title, heading and bullet', () => {
    releases().forEach((release) => {
      const strings = [
        release.title,
        ...release.groups.flatMap((group) => [group.heading, ...group.bullets]),
      ];
      expect(release.groups.length).toBeGreaterThan(0);
      strings.forEach((text) => {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toContain('whatsNewPage.');
      });
      release.groups.forEach((group) => {
        expect(group.bullets.length).toBeGreaterThan(0);
      });
    });
  });
});
