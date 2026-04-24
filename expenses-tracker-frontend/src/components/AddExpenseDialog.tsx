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
 *   - Local `useState` for description, currency, category, date, validation error.
 *   - {@link useCalculator} owns the amount expression (token-based reducer).
 *   - TanStack Query mutations persist changes.
 *
 * Responsive behavior:
 *   - Mobile (xs): bottom-sheet with slide-up transition, tightened paddings/gaps.
 *   - Desktop (sm+): regular centered dialog; physical keyboard is bound to the keypad.
 *
 * Validation: category is required and the evaluated amount must be > 0.
 * On success, state is reset via `resetAndClose`.
 */
import { forwardRef, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import ButtonBase from '@mui/material/ButtonBase';
import Alert from '@mui/material/Alert';
import Slide from '@mui/material/Slide';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { TransitionProps } from '@mui/material/transitions';
import { CurrencyPickerDialog } from './CurrencyPickerDialog.tsx';
import { CategoryPickerDialog } from './CategoryPickerDialog.tsx';
import { useCategoryLookup } from '../hooks/useCategoryLookup.ts';
import { AmountKeypad } from './amount-keypad/AmountKeypad.tsx';
import { useCalculator } from './amount-keypad/useCalculator.ts';
import type { CurrencyCode } from '../api/exchange.ts';
import {
  useCreateExpense,
  useDeleteExpense,
  useUpdateExpense,
} from '../hooks/useExpenseMutations.ts';
import { useMainCurrency } from '../hooks/useCurrency.ts';
import { FIELD_LIMITS } from '../utils/fieldLimits.ts';
import type { Expense } from '../types/expense.ts';

// ---------------------------------------------------------------------------
// Slide-up transition for mobile
// ---------------------------------------------------------------------------

const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// ---------------------------------------------------------------------------
// Header tile (date / category)
// ---------------------------------------------------------------------------

interface TileProps {
  label: string;
  value: string;
  color: string;
  onClick: (el: HTMLElement) => void;
}

function Tile({ label, value, color, onClick }: TileProps) {
  const theme = useTheme();
  const textColor = theme.palette.getContrastText(color);
  return (
    <ButtonBase
      onClick={(e) => onClick(e.currentTarget)}
      sx={{
        flex: 1,
        p: 2,
        borderRadius: 2,
        bgcolor: color,
        color: textColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        textAlign: 'left',
        minHeight: 84,
        transition: 'filter 150ms',
        '&:hover': { filter: 'brightness(1.05)' },
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.85, mb: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>
        {value}
      </Typography>
    </ButtonBase>
  );
}

// ---------------------------------------------------------------------------
// AddExpenseDialog
// ---------------------------------------------------------------------------

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
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const { mainCurrency } = useMainCurrency();

  const isEdit = Boolean(expense);
  const [description, setDescription] = useState(expense?.description ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(
    (expense?.currency as CurrencyCode) ?? mainCurrency,
  );
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? defaultCategoryId);
  const categoryLookup = useCategoryLookup();
  const [date, setDate] = useState<Dayjs>(expense ? dayjs(expense.date) : dayjs());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { expression, hasOperator, amount, dispatch } = useCalculator(
    expense ? expense.amount / 100 : null,
  );

  const dateTileRef = useRef<HTMLDivElement | null>(null);
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  const resetAndClose = () => {
    if (!isEdit) {
      setDescription('');
      setCategoryId('');
      setCurrency(mainCurrency);
      setDate(dayjs());
      dispatch({ type: 'reset' });
    }
    setValidationError(null);
    setConfirmDelete(false);
    onClose();
  };

  const handleSave = () => {
    setValidationError(null);
    if (!categoryId) {
      setValidationError(translate('expenseDialog.pickCategoryError'));
      return;
    }
    if (amount === null || amount <= 0) {
      setValidationError(translate('expenseDialog.positiveAmountError'));
      return;
    }

    const categoryName = categoryLookup.resolve(categoryId).name;
    const req = {
      description: description.trim() || categoryName,
      amount: Math.round(amount * 100),
      currency,
      categoryId,
      date: date.toISOString(),
    };

    if (expense) {
      updateExpense.mutate(
        { id: expense.id, req },
        { onSuccess: resetAndClose },
      );
    } else {
      createExpense.mutate(req, { onSuccess: resetAndClose });
    }
  };

  const handleDelete = () => {
    if (!expense) return;
    deleteExpense.mutate(expense.id, { onSuccess: resetAndClose });
  };

  const handleEquals = () => {
    if (hasOperator) dispatch({ type: 'evaluate' });
    else handleSave();
  };

  const isPending = createExpense.isPending || updateExpense.isPending || deleteExpense.isPending;
  const error = validationError
    ?? (createExpense.error instanceof Error ? createExpense.error.message : null)
    ?? (updateExpense.error instanceof Error ? updateExpense.error.message : null)
    ?? (deleteExpense.error instanceof Error ? deleteExpense.error.message : null);

  const resolvedCategory = categoryId ? categoryLookup.resolve(categoryId) : null;
  const categoryDisplayName = resolvedCategory?.name ?? '';
  const categoryColor = resolvedCategory?.color ?? theme.palette.secondary.main;
  const accountColor = theme.palette.primary.main;
  const opColor = theme.palette.success.main;
  const isSameDay = date.isSame(dayjs(), 'day');

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
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Box ref={dateTileRef} sx={{ flex: 1, display: 'flex' }}>
          <Tile
            label={translate('expenseDialog.date')}
            value={isSameDay ? translate('common.today') : date.format('MMM D')}
            color={accountColor}
            onClick={(el) => setDateAnchor(el)}
          />
        </Box>
        <Tile
          label={translate('expenseDialog.category')}
          value={categoryDisplayName || translate('expenseDialog.pickCategory')}
          color={categoryColor}
          onClick={() => setCategoryPickerOpen(true)}
        />
      </Box>

      {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}

      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: opColor, letterSpacing: 0.5 }}>
          {translate('expenseDialog.expense')}
        </Typography>
        <Typography
          component="div"
          sx={{
            color: opColor,
            fontSize: { xs: '1.75rem', sm: '2rem' },
            fontWeight: 400,
            lineHeight: 1.2,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: 1,
            minHeight: { xs: 36, sm: 44 },
          }}
        >
          <Box component="span" sx={{ fontSize: '1rem', fontWeight: 500, opacity: 0.9 }}>
            {currency}
          </Box>
          <Box component="span">{expression || '0'}</Box>
        </Typography>
      </Box>

      <TextField
        placeholder={translate('expenseDialog.description')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
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
        currency={currency}
        hasOperator={hasOperator}
        canEquals={expression.length > 0}
        disabled={isPending}
        bindKeyboard={open && !isMobile}
        dispatch={dispatch}
        onEquals={handleEquals}
        onOpenDate={() => setDateAnchor(dateTileRef.current)}
        onOpenCurrency={() => setCurrencyPickerOpen(true)}
      />

      {isEdit ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            minHeight: 32,
          }}
        >
          {confirmDelete ? (
            <Button
              size="small"
              color="error"
              variant="contained"
              onClick={handleDelete}
              disabled={isPending}
            >
              {deleteExpense.isPending ? translate('common.deleting') : translate('common.confirmDelete')}
            </Button>
          ) : (
            <Button
              size="small"
              color="error"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
            >
              {translate('common.delete')}
            </Button>
          )}
          <Typography variant="body2" color="text.secondary">
            {isSameDay ? `${translate('common.today')}, ` : ''}
            {date.format('MMM D, YYYY')}
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          {isSameDay ? `${translate('common.today')}, ` : ''}
          {date.format('MMM D, YYYY')}
        </Typography>
      )}
    </Box>
  );

  const datePicker = (
    <DateCalendar
      value={date}
      onChange={(v) => {
        if (v) setDate(v);
        setDateAnchor(null);
      }}
    />
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={resetAndClose}
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

      {/* Date picker: mobile uses a full-width popover anchored to the Date tile;
          desktop uses a centered Dialog stacked on top of AddExpenseDialog. */}
      {isMobile ? (
        <Popover
          open={Boolean(dateAnchor)}
          anchorEl={dateAnchor}
          onClose={() => setDateAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          slotProps={{
            paper: { sx: { width: '100vw', maxWidth: '100vw', left: '0 !important' } },
          }}
        >
          {datePicker}
        </Popover>
      ) : (
        <Dialog
          open={Boolean(dateAnchor)}
          onClose={() => setDateAnchor(null)}
          slotProps={{ paper: { sx: { width: 420, borderRadius: 2 } } }}
        >
          {datePicker}
        </Dialog>
      )}

      <CategoryPickerDialog
        open={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        selected={categoryId}
        onSelect={(id) => {
          setCategoryId(id);
          setCategoryPickerOpen(false);
        }}
      />

      <CurrencyPickerDialog
        open={currencyPickerOpen}
        onClose={() => setCurrencyPickerOpen(false)}
        value={currency}
        onChange={(code) => setCurrency(code)}
      />
    </>
  );
}
