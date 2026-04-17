/**
 * AddExpenseDialog — calculator-style dialog for creating a new expense.
 *
 * Layout (top → bottom):
 *   1. Two header tiles: Date (opens a calendar popover) and Category (opens a picker).
 *   2. A centered amount display showing `{currency} {expression}` where `expression`
 *      is a human-readable calculator string like `"2 + 3 × 4"`.
 *   3. A free-form description TextField.
 *   4. An {@link AmountKeypad} (5×4 grid). Dual-purpose `=`/`OK` button:
 *        - `=`  when the expression still contains operators → evaluates in place.
 *        - `OK` when only a number remains → submits the expense.
 *   5. A small footer showing the currently selected date.
 *
 * State split:
 *   - Local `useState` for description, currency, category, date, validation error.
 *   - {@link useCalculator} owns the amount expression (token-based reducer).
 *   - TanStack Query `useCreateExpense` persists via `POST /api/expenses`.
 *
 * Responsive behavior:
 *   - Mobile (xs): bottom-sheet with slide-up transition, tightened paddings/gaps.
 *   - Desktop (sm+): regular centered dialog; physical keyboard is bound to the keypad.
 *
 * Validation: category is required and the evaluated amount must be > 0.
 * On success, state is reset via `resetAndClose`.
 */
import { forwardRef, useRef, useState } from 'react';
import Box from '@mui/material/Box';
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
import { getCategoryConfig } from '../utils/categoryConfig.ts';
import { AmountKeypad } from './amount-keypad/AmountKeypad.tsx';
import { useCalculator } from './amount-keypad/useCalculator.ts';
import type { CurrencyCode } from '../api/exchange.ts';
import { useCreateExpense } from '../hooks/useExpenseMutations.ts';
import { useMainCurrency } from '../hooks/useCurrency.ts';

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
  defaultCategory?: string;
}

export function AddExpenseDialog({ open, onClose, defaultCategory = '' }: AddExpenseDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const createExpense = useCreateExpense();
  const { mainCurrency } = useMainCurrency();

  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(mainCurrency);
  const [category, setCategory] = useState(defaultCategory);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [validationError, setValidationError] = useState<string | null>(null);

  const { expression, hasOperator, amount, dispatch } = useCalculator();

  const dateTileRef = useRef<HTMLDivElement | null>(null);
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  const resetAndClose = () => {
    setDescription('');
    setCategory('');
    setCurrency(mainCurrency);
    setDate(dayjs());
    setValidationError(null);
    dispatch({ type: 'reset' });
    onClose();
  };

  const handleSave = () => {
    setValidationError(null);
    if (!category) {
      setValidationError('Please pick a category.');
      return;
    }
    if (amount === null || amount <= 0) {
      setValidationError('Amount must be a positive number.');
      return;
    }

    createExpense.mutate(
      {
        description: description.trim() || category,
        amount: Math.round(amount * 100),
        currency,
        category,
        date: date.toISOString(),
      },
      { onSuccess: resetAndClose },
    );
  };

  const handleEquals = () => {
    if (hasOperator) dispatch({ type: 'evaluate' });
    else handleSave();
  };

  const error = validationError
    ?? (createExpense.error instanceof Error ? createExpense.error.message : null);

  const categoryConfig = category ? getCategoryConfig(category) : null;
  const categoryColor = categoryConfig?.color ?? theme.palette.secondary.main;
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
            label="Date"
            value={isSameDay ? 'Today' : date.format('MMM D')}
            color={accountColor}
            onClick={(el) => setDateAnchor(el)}
          />
        </Box>
        <Tile
          label="Category"
          value={category || 'Pick category'}
          color={categoryColor}
          onClick={() => setCategoryPickerOpen(true)}
        />
      </Box>

      {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}

      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: opColor, letterSpacing: 0.5 }}>
          Expense
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
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { style: { textAlign: 'center', fontStyle: 'italic' } } }}
      />

      <AmountKeypad
        currency={currency}
        hasOperator={hasOperator}
        canEquals={expression.length > 0}
        disabled={createExpense.isPending}
        bindKeyboard={open && !isMobile}
        dispatch={dispatch}
        onEquals={handleEquals}
        onOpenDate={() => setDateAnchor(dateTileRef.current)}
        onOpenCurrency={() => setCurrencyPickerOpen(true)}
      />

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        {isSameDay ? 'Today, ' : ''}
        {date.format('MMM D, YYYY')}
      </Typography>
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
        selected={category}
        onSelect={(name) => {
          setCategory(name);
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
