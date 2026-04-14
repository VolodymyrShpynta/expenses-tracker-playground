import { type SubmitEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useCreateExpense } from '../hooks/useExpenseMutations.ts';
import { MoneyField } from '../components/MoneyField.tsx';
import { useMainCurrency } from '../hooks/useCurrency.ts';
import { SUPPORTED_CURRENCIES } from '../api/exchange.ts';
import type { CurrencyCode } from '../api/exchange.ts';
import { CategoryAutocomplete } from '../components/CategoryAutocomplete.tsx';

const CATEGORIES = [
  'Food',
  'Transportation',
  'Health',
  'Gifts',
  'Children',
  'Hygiene',
  'Sport',
  'Car',
  'Clothing',
  'Communication',
  'Beauty',
  'House',
  'Parents',
  'Pet',
  'Tech',
  'Charity',
  'Entertainment',
  'Utilities',
  'Education',
  'Travel',
  'Restaurant',
];

export default function AddExpensePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const createExpense = useCreateExpense();
  const { mainCurrency } = useMainCurrency();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(mainCurrency);
  const [category, setCategory] = useState(searchParams.get('category') ?? '');
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
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
      {
        description,
        amount: cents,
        currency,
        category,
        date: date.toISOString(),
      },
      { onSuccess: () => void navigate('/') },
    );
  };

  const isBusy = createExpense.isPending;
  const error = validationError
    ?? (createExpense.error instanceof Error ? createExpense.error.message : null);

  return (
    <Box sx={{ py: 2, maxWidth: 480, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2, px: 1 }}>
        Add Expense
      </Typography>

      <Paper sx={{ p: 2 }}>
        <form onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              fullWidth
            />

            <Box sx={{ display: 'flex', gap: 1 }}>
              <MoneyField
                value={amount}
                onChange={setAmount}
                required
                currencyCode={currency}
                currencies={SUPPORTED_CURRENCIES}
                onCurrencyChange={(code) => setCurrency(code as CurrencyCode)}
              />
            </Box>

            <CategoryAutocomplete
              options={CATEGORIES}
              value={category || null}
              onChange={(val) => setCategory(val ?? '')}
              label="Category"
              required
              fullWidth
            />

            <DatePicker
              label="Date"
              value={date}
              onChange={(v) => { if (v) setDate(v); }}
              slotProps={{ textField: { required: true, fullWidth: true } }}
            />

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button variant="outlined" onClick={() => void navigate(-1)}>
                Cancel
              </Button>
              <Button variant="contained" type="submit" disabled={isBusy}>
                {createExpense.isPending ? 'Saving…' : 'Save'}
              </Button>
            </Box>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
