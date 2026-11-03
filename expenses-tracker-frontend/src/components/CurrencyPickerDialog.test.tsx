import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const { CurrencyPickerDialog } = await import('./CurrencyPickerDialog');

describe('CurrencyPickerDialog', () => {
  it.each([
    { search: 'ars', code: 'ARS', name: 'Argentine Peso' },
    { search: 'argentine', code: 'ARS', name: 'Argentine Peso' },
    { search: 'eur', code: 'EUR', name: 'Euro' },
  ])('finds and selects $code when searching for "$search"', async ({ search, code, name }) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClose = vi.fn();

    render(
      <CurrencyPickerDialog
        open
        value="USD"
        onChange={onChange}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('button', { name: `${code} ${name}` })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), search);
    await user.click(screen.getByRole('button', { name: `${code} ${name}` }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(code);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
