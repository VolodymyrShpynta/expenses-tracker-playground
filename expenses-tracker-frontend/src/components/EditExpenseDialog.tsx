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
import { useUpdateExpense, useDeleteExpense } from '../hooks/useExpenseMutations.ts';
import type { Expense } from '../types/expense.ts';

interface EditExpenseDialogProps {
  expense: Expense;
  open: boolean;
  onClose: () => void;
}

export function EditExpenseDialog({ expense, open, onClose }: EditExpenseDialogProps) {
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState((expense.amount / 100).toString());
  const [currency, setCurrency] = useState<CurrencyCode>(expense.currency as CurrencyCode);
  const [category, setCategory] = useState(expense.category);
  const [date, setDate] = useState<Dayjs>(dayjs(expense.date));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

    updateExpense.mutate(
      {
        id: expense.id,
        req: { description, amount: cents, currency, category, date: date.toISOString() },
      },
      { onSuccess: onClose },
    );
  };

  const handleDelete = () => {
    deleteExpense.mutate(expense.id, { onSuccess: onClose });
  };

  const isBusy = updateExpense.isPending || deleteExpense.isPending;
  const error = validationError
    ?? (updateExpense.error instanceof Error ? updateExpense.error.message : null)
    ?? (deleteExpense.error instanceof Error ? deleteExpense.error.message : null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { p: 1 } } }}
    >
      <DialogTitle>Edit Expense</DialogTitle>
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

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        {!confirmDelete ? (
          <Button color="error" onClick={() => setConfirmDelete(true)} disabled={isBusy}>
            Delete
          </Button>
        ) : (
          <Button color="error" variant="contained" onClick={handleDelete} disabled={isBusy}>
            {deleteExpense.isPending ? 'Deleting…' : 'Confirm delete'}
          </Button>
        )}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} disabled={isBusy}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={isBusy}>
            {updateExpense.isPending ? 'Saving…' : 'Save'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
