import { type SubmitEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import { useCreateExpense } from '../hooks/useExpenseMutations.ts';

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
  const createExpense = useCreateExpense();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError(null);

    if (!description || !amount || !category || !date) {
      setValidationError('All fields are required.');
      return;
    }

    const cents = Math.round(parseFloat(amount) * 100);
    if (isNaN(cents) || cents <= 0) {
      setValidationError('Amount must be a positive number.');
      return;
    }

    createExpense.mutate(
      {
        description,
        amount: cents,
        category,
        date: new Date(date).toISOString(),
      },
      { onSuccess: () => void navigate('/') },
    );
  };

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

            <TextField
              label="Amount"
              type="number"
              slotProps={{
                htmlInput: { step: '0.01', min: '0.01' },
              }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              helperText="Enter amount in dollars (e.g. 50.00)"
              required
              fullWidth
            />

            <TextField
              label="Category"
              select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              fullWidth
            >
              {CATEGORIES.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {cat}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Date"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              fullWidth
              slotProps={{
                inputLabel: { shrink: true },
              }}
            />

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button variant="outlined" onClick={() => void navigate(-1)}>
                Cancel
              </Button>
              <Button variant="contained" type="submit" disabled={createExpense.isPending}>
                {createExpense.isPending ? 'Saving…' : 'Save'}
              </Button>
            </Box>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
