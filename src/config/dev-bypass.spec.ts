import {
  assertDevBypassIsNotProduction,
  isDevBypassEnabled,
} from './dev-bypass';

describe('dev auth bypass guard rails', () => {
  describe('isDevBypassEnabled', () => {
    it('is enabled only when the flag is exactly "true" outside production', () => {
      expect(
        isDevBypassEnabled({
          AUTH_DEV_BYPASS: 'true',
          NODE_ENV: 'development',
        }),
      ).toBe(true);
      expect(
        isDevBypassEnabled({ AUTH_DEV_BYPASS: 'true', NODE_ENV: 'test' }),
      ).toBe(true);
    });

    it('is disabled in production even when the flag is set', () => {
      expect(
        isDevBypassEnabled({ AUTH_DEV_BYPASS: 'true', NODE_ENV: 'production' }),
      ).toBe(false);
    });

    it.each(['false', 'TRUE', '1', 'yes', ''])(
      'is disabled for the flag value %p',
      (value) => {
        expect(
          isDevBypassEnabled({
            AUTH_DEV_BYPASS: value,
            NODE_ENV: 'development',
          }),
        ).toBe(false);
      },
    );

    it('is disabled when the flag is absent', () => {
      expect(isDevBypassEnabled({ NODE_ENV: 'development' })).toBe(false);
    });
  });

  describe('assertDevBypassIsNotProduction', () => {
    it('throws when the bypass is requested in production', () => {
      expect(() =>
        assertDevBypassIsNotProduction({
          AUTH_DEV_BYPASS: 'true',
          NODE_ENV: 'production',
        }),
      ).toThrow(/not permitted when NODE_ENV=production/);
    });

    it('permits production without the flag', () => {
      expect(() =>
        assertDevBypassIsNotProduction({ NODE_ENV: 'production' }),
      ).not.toThrow();
    });

    it('permits the flag outside production', () => {
      expect(() =>
        assertDevBypassIsNotProduction({
          AUTH_DEV_BYPASS: 'true',
          NODE_ENV: 'development',
        }),
      ).not.toThrow();
    });
  });
});
