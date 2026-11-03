import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LOCALE_DIRECTORY = new URL('./locales/', import.meta.url);
const LOCALE_FILES = readdirSync(LOCALE_DIRECTORY).filter((name) => name.endsWith('.json'));

describe('mobile import instructions', () => {
  it.each(LOCALE_FILES)('lists JSON as the sole import extension in %s', (filename) => {
    const locale: unknown = JSON.parse(
      readFileSync(new URL(filename, LOCALE_DIRECTORY), 'utf8'),
    );

    expect(locale).toMatchObject({
      exportImportDialog: {
        importBody: expect.stringContaining('(.json)'),
      },
    });
  });
});
