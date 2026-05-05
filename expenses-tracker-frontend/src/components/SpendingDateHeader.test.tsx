import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../i18n/locale', () => ({
  // Lock locale so the rendered amount string is deterministic.
  getLocale: () => 'en-US',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

vi.mock('../hooks/useDateRange', () => ({
  useDateRange: () => ({
    dateRange: { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) },
    setDateRange: vi.fn(),
    preset: 'month' as const,
    setPreset: vi.fn(),
  }),
}));

// DateRangeSelector pulls in MUI date pickers; replace with a noop so the
// component test stays focused on SpendingDateHeader's own logic.
vi.mock('./DateRangeSelector', () => ({
  DateRangeSelector: () => <div data-testid="date-range-selector" />,
}));

const { SpendingDateHeader } = await import('./SpendingDateHeader');

describe('SpendingDateHeader', () => {
  it('renders the localized total spending with currency prefix', () => {
    render(<SpendingDateHeader totalSpending={501276} currency="USD" />);

    expect(screen.getByText('expenses.totalSpending')).toBeInTheDocument();
    expect(screen.getByText('USD 5,012.76')).toBeInTheDocument();
  });

  it('embeds the date range selector', () => {
    render(<SpendingDateHeader totalSpending={0} currency="EUR" />);

    expect(screen.getByTestId('date-range-selector')).toBeInTheDocument();
    expect(screen.getByText('EUR 0.00')).toBeInTheDocument();
  });
});
