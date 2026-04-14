import { type SubmitEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Autocomplete from '@mui/material/Autocomplete';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useCreateExpense } from '../hooks/useExpenseMutations.ts';
import { MoneyField } from '../components/MoneyField.tsx';
import { useMainCurrency } from '../hooks/useCurrency.ts';
import { SUPPORTED_CURRENCIES, convertCurrency } from '../api/exchange.ts';
import type { CurrencyCode } from '../api/exchange.ts';

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
  const [converting, setConverting] = useState(false);

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
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

    let finalAmount = parsedAmount;
    if (currency !== mainCurrency) {
      try {
        setConverting(true);
        finalAmount = await convertCurrency(parsedAmount, currency, mainCurrency);
      } catch {
        setValidationError(`Failed to convert ${currency} to ${mainCurrency}. Check your connection and try again.`);
        setConverting(false);
        return;
      } finally {
        setConverting(false);
      }
    }

    const cents = Math.round(finalAmount * 100);

    createExpense.mutate(
      {
        description,
        amount: cents,
        category,
        date: date.toISOString(),
      },
      { onSuccess: () => void navigate('/') },
    );
  };

  const isBusy = createExpense.isPending || converting;
  const error = validationError
    ?? (createExpense.error instanceof Error ? createExpense.error.message : null);

  return (
    <Box sx={{ py: 2, maxWidth: 480, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2, px: 1 }}>
        Add Expense
      </Typography>

      <Paper sx={{ p: 2 }}>
        <form onSubmit={(e) => void handleSubmit(e)}>
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
            {currency !== mainCurrency && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
                Will be converted from {currency} to {mainCurrency} on save
              </Typography>
            )}

            <Autocomplete
              options={CATEGORIES}
              value={category || null}
              onChange={(_e, newValue) => setCategory(newValue ?? '')}
              renderInput={(params) => (
                <TextField {...params} label="Category" required fullWidth />
              )}
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
                {converting ? 'Converting…' : createExpense.isPending ? 'Saving…' : 'Save'}
              </Button>
            </Box>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
