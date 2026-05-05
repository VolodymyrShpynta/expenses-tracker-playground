/**
 * AddExpenseDialog — calculator-style dialog for creating or editing an expense.
 *
 * Modes:
 *   - Create (default): empty state, submits via `useCreateExpense`.
 *   - Edit (when `expense` is provided): state is seeded from the expense, the
 *     calculator starts with the existing amount, submissions go through
 *     `useUpdateExpense`, and a small Delete button (with confirm) is shown.
 *
 * Layout (top → bottom):
 *   1. Two header tiles: Date (opens a calendar popover) and Category (opens a picker).
 *   2. A centered amount display showing `{currency} {expression}` where `expression`
 *      is a human-readable calculator string like `"2 + 3 × 4"`.
 *   3. A free-form description TextField.
 *   4. An {@link AmountKeypad} (5×4 grid). Dual-purpose `=`/`OK` button:
 *        - `=`  when the expression still contains operators → evaluates in place.
 *        - `OK` when only a number remains → submits the expense.
 *   5. A small footer showing the currently selected date (plus a Delete button in edit mode).
 *
 * State split:
 *   - `useExpenseForm` owns everything except calculator UI: editable
 *     fields, validation, mutations, and `resetAndClose`.
 *   - {@link useCalculator} (used through `useExpenseForm`) owns the
 *     amount expression (token-based reducer).
 *
 * Responsive behavior:
 *   - Mobile (xs): bottom-sheet with slide-up transition, tightened paddings/gaps.
 *   - Desktop (sm+): regular centered dialog; physical keyboard is bound to the keypad.
 *
 * Validation: category is required and the evaluated amount must be > 0.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';
import { CurrencyPickerDialog } from './CurrencyPickerDialog';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import { useCategoryLookup } from '../hooks/useCategoryLookup';
import { AmountKeypad } from './amount-keypad/AmountKeypad';
import { SlideUp } from './transitions/SlideUp';
import { ExpenseHeaderTiles } from './add-expense/ExpenseHeaderTiles';
import { AmountDisplay } from './add-expense/AmountDisplay';
import { ExpenseDialogFooter } from './add-expense/ExpenseDialogFooter';
import { ExpenseDatePicker } from './add-expense/ExpenseDatePicker';
import { useExpenseForm } from './add-expense/useExpenseForm';
import { FIELD_LIMITS } from '../utils/fieldLimits';
import type { Expense } from '../types/expense';

interface AddExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the dialog with an existing expense; switches to edit/delete mode. */
  expense?: Expense;
  /** Category id pre-selected in create mode. Ignored when `expense` is provided. */
  defaultCategoryId?: string;
}

export function AddExpenseDialog({
  open,
  onClose,
  expense,
  defaultCategoryId = '',
}: AddExpenseDialogProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const categoryLookup = useCategoryLookup();

  const form = useExpenseForm({ expense, defaultCategoryId, categoryLookup, onClose });

  const dateTileRef = useRef<HTMLDivElement | null>(null);
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  const handleEquals = () => {
    if (form.calculator.hasOperator) {
      form.calculator.dispatch({ type: 'evaluate' });
    } else {
      form.save();
    }
  };

  const resolvedCategory = form.categoryId
    ? categoryLookup.resolve(form.categoryId)
    : null;
  const categoryDisplayName = resolvedCategory?.name ?? '';
  const categoryColor = resolvedCategory?.color ?? theme.palette.secondary.main;
  const accountColor = theme.palette.primary.main;
  const opColor = theme.palette.success.main;
  const isSameDay = form.date.isSame(dayjs(), 'day');
  const dateValue = isSameDay ? translate('common.today') : form.date.format('MMM D');
  const fullDateLabel = `${isSameDay ? `${translate('common.today')}, ` : ''}${form.date.format('MMM D, YYYY')}`;

  const dialogContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 0.75, sm: 1.25 },
        p: { xs: 1, sm: 2 },
        width: { xs: '100%', sm: 420 },
        maxWidth: '100%',
      }}
    >
      <ExpenseHeaderTiles
        dateTileRef={dateTileRef}
        dateLabel={translate('expenseDialog.date')}
        dateValue={dateValue}
        dateColor={accountColor}
        onOpenDate={(el) => setDateAnchor(el)}
        categoryLabel={translate('expenseDialog.category')}
        categoryValue={categoryDisplayName || translate('expenseDialog.pickCategory')}
        categoryColor={categoryColor}
        onOpenCategory={() => setCategoryPickerOpen(true)}
      />

      {form.error && <Alert severity="error" sx={{ py: 0 }}>{form.error}</Alert>}

      <AmountDisplay
        label={translate('expenseDialog.expense')}
        currency={form.currency}
        expression={form.calculator.expression}
        color={opColor}
      />

      <TextField
        placeholder={translate('expenseDialog.description')}
        value={form.description}
        onChange={(e) => form.setDescription(e.target.value)}
        fullWidth
        size="small"
        slotProps={{
          htmlInput: {
            maxLength: FIELD_LIMITS.EXPENSE_DESCRIPTION_MAX,
            style: { textAlign: 'center', fontStyle: 'italic' },
          },
        }}
      />

      <AmountKeypad
        currency={form.currency}
        hasOperator={form.calculator.hasOperator}
        canEquals={form.calculator.expression.length > 0}
        disabled={form.isPending}
        bindKeyboard={open && !isMobile}
        dispatch={form.calculator.dispatch}
        onEquals={handleEquals}
        onOpenDate={() => setDateAnchor(dateTileRef.current)}
        onOpenCurrency={() => setCurrencyPickerOpen(true)}
      />

      <ExpenseDialogFooter
        dateLabel={fullDateLabel}
        showDelete={form.isEdit}
        confirmDelete={form.confirmDelete}
        pending={form.isPending}
        deletePending={form.deletePending}
        onRequestDelete={() => form.setConfirmDelete(true)}
        onConfirmDelete={form.remove}
      />
    </Box>
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={form.resetAndClose}
        maxWidth="xs"
        slots={isMobile ? { transition: SlideUp } : undefined}
        slotProps={{
          paper: {
            sx: {
              // Mobile: full width, no side margins. Combined with `alignItems: flex-end`
              // and maxHeight, this leaves ~32px of tappable backdrop at the top.
              // Desktop: regular centered card with standard spacing.
              m: { xs: 0, sm: 2 },
              width: { xs: '100%', sm: 'auto' },
              maxHeight: 'calc(100% - 32px)',
              borderRadius: { xs: '16px 16px 0 0', sm: 2 },
              // Allow scroll when viewport is short, but hide the scrollbar.
              overflowY: 'auto',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            },
          },
        }}
        sx={{ '& .MuiDialog-container': { alignItems: { xs: 'flex-end', sm: 'center' } } }}
      >
        {dialogContent}
      </Dialog>

      <ExpenseDatePicker
        open={Boolean(dateAnchor)}
        isMobile={isMobile}
        anchorEl={dateAnchor}
        value={form.date}
        onChange={form.setDate}
        onClose={() => setDateAnchor(null)}
      />

      <CategoryPickerDialog
        open={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        selected={form.categoryId}
        onSelect={(id) => {
          form.setCategoryId(id);
          setCategoryPickerOpen(false);
        }}
      />

      <CurrencyPickerDialog
        open={currencyPickerOpen}
        onClose={() => setCurrencyPickerOpen(false)}
        value={form.currency}
        onChange={form.setCurrency}
      />
    </>
  );
}
