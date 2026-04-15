import { useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { MoneyField } from './MoneyField.tsx';
import { CategoryAutocomplete } from './CategoryAutocomplete.tsx';
import { getAllCategoryNames } from '../utils/categoryConfig.ts';
import { SUPPORTED_CURRENCIES } from '../api/exchange.ts';
import type { CurrencyCode } from '../api/exchange.ts';
import { useCreateExpense } from '../hooks/useExpenseMutations.ts';
import { useMainCurrency } from '../hooks/useCurrency.ts';

interface AddExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  defaultCategory?: string;
}

export function AddExpenseDialog({ open, onClose, defaultCategory = '' }: AddExpenseDialogProps) {
  const createExpense = useCreateExpense();
  const { mainCurrency } = useMainCurrency();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(mainCurrency);
  const [category, setCategory] = useState(defaultCategory);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSave = () => {
    setValidationError(null);

    if (!description || !amount || !category || !date) {
      setValidationError('All fields are required.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError('Amount must be a positive number.');
      return;
    }

    const cents = Math.round(parsedAmount * 100);

    createExpense.mutate(
      { description, amount: cents, currency, category, date: date.toISOString() },
      {
        onSuccess: () => {
          setDescription('');
          setAmount('');
          setCategory('');
          setDate(dayjs());
          setValidationError(null);
          onClose();
        },
      },
    );
  };

  const isBusy = createExpense.isPending;
  const error = validationError
    ?? (createExpense.error instanceof Error ? createExpense.error.message : null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { p: 1 } } }}
    >
      <DialogTitle>Add Expense</DialogTitle>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, px: 3, pb: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          fullWidth
          size="small"
        />

        <MoneyField
          value={amount}
          onChange={setAmount}
          required
          currencyCode={currency}
          currencies={SUPPORTED_CURRENCIES}
          onCurrencyChange={(code) => setCurrency(code as CurrencyCode)}
        />

        <CategoryAutocomplete
          options={getAllCategoryNames()}
          value={category || null}
          onChange={(val) => setCategory(val ?? '')}
          label="Category"
          required
          fullWidth
          size="small"
        />

        <DatePicker
          label="Date"
          value={date}
          onChange={(v) => { if (v) setDate(v); }}
          slotProps={{ textField: { required: true, fullWidth: true, size: 'small' } }}
        />
      </Box>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={isBusy}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={isBusy}>
          {createExpense.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
