/**
 * Tests for `contrastTextColor` — the WCAG-style luminance check that
 * picks black or white foregrounds for arbitrary brand/category colors.
 *
 * The threshold (160) is product-calibrated, not derived from a spec, so
 * these tests pin the chosen breakpoint: changing it should be an
 * intentional product decision, surfaced as a failing test.
 */
import { describe, expect, it } from 'vitest';

import { contrastTextColor } from './colorContrast';

describe('contrastTextColor', () => {
  it(`should return white for pure black`, () => {
    // Given: A maximally dark background
    const bg = '#000000';

    // When: Picking a foreground
    const fg = contrastTextColor(bg);

    // Then: White is chosen
    expect(fg).toBe('#ffffff');
  });

  it(`should return black for pure white`, () => {
    // Given: A maximally light background
    const bg = '#ffffff';

    // When: Picking a foreground
    const fg = contrastTextColor(bg);

    // Then: Black is chosen
    expect(fg).toBe('#000000');
  });

  it(`should expand 3-digit hex shorthand before computing luminance`, () => {
    // Given: A 3-digit hex equivalent to #ffffff
    const bg = '#fff';

    // When: Picking a foreground
    const fg = contrastTextColor(bg);

    // Then: Treated as white -> black foreground
    expect(fg).toBe('#000000');
  });

  it(`should accept a hex string without the leading '#'`, () => {
    // Given: A hex string that omits '#'
    const bg = '000000';

    // When: Picking a foreground
    const fg = contrastTextColor(bg);

    // Then: Still treated as black -> white foreground
    expect(fg).toBe('#ffffff');
  });

  it(`should pick black for the mid-range muted Material color #B0BEC5`, () => {
    // Given: The category-tile light grey-blue used as the calibration
    //   anchor in the doc-comment of `contrastTextColor`
    const bg = '#B0BEC5';

    // When: Picking a foreground
    const fg = contrastTextColor(bg);

    // Then: Reads as a light background -> black text
    expect(fg).toBe('#000000');
  });

  it(`should pick white for the brand primary blue (#3e4396)`, () => {
    // Given: The light-theme primary token from the brand palette
    const bg = '#3e4396';

    // When: Picking a foreground
    const fg = contrastTextColor(bg);

    // Then: Reads as a dark background -> white text
    expect(fg).toBe('#ffffff');
  });

  it(`should fall back to white when the input length is invalid`, () => {
    // Given: A hex string with an unsupported number of digits
    const bg = '#1234';

    // When: Picking a foreground
    const fg = contrastTextColor(bg);

    // Then: White is the safe default
    expect(fg).toBe('#ffffff');
  });

  it(`should fall back to white when the input contains non-hex characters`, () => {
    // Given: A 6-character string that is not valid hex
    const bg = '#zzzzzz';

    // When: Picking a foreground
    const fg = contrastTextColor(bg);

    // Then: White is the safe default
    expect(fg).toBe('#ffffff');
  });

  it(`should return white at exactly the threshold luminance`, () => {
    // Given: A grey whose luminance equals the 160 threshold
    //   (R=G=B=160 -> luminance = 0.2126*160 + 0.7152*160 + 0.0722*160 = 160)
    const bg = '#a0a0a0';

    // When: Picking a foreground
    const fg = contrastTextColor(bg);

    // Then: The threshold is strict (>), so white wins on equality
    expect(fg).toBe('#ffffff');
  });
});
