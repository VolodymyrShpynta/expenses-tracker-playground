import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Dialog from '@mui/material/Dialog';
import Slide from '@mui/material/Slide';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme, alpha } from '@mui/material/styles';
import CalculateIcon from '@mui/icons-material/Calculate';
import BackspaceOutlinedIcon from '@mui/icons-material/BackspaceOutlined';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { NumericFormat } from 'react-number-format';
import type { NumberFormatValues } from 'react-number-format';
import type { TransitionProps } from '@mui/material/transitions';
import { forwardRef } from 'react';

// ---------------------------------------------------------------------------
// Safe expression evaluator (no eval)
// ---------------------------------------------------------------------------

function safeEvaluate(expr: string): number | null {
  // Tokenize: numbers (with decimals) and operators
  const tokens = expr.match(/(\d+\.?\d*|[+\-×÷])/g);
  if (!tokens) return null;

  const numbers: number[] = [];
  const ops: string[] = [];

  const applyOp = () => {
    const b = numbers.pop()!;
    const a = numbers.pop()!;
    const op = ops.pop()!;
    switch (op) {
      case '+': numbers.push(a + b); break;
      case '-': numbers.push(a - b); break;
      case '×': numbers.push(a * b); break;
      case '÷': numbers.push(b !== 0 ? a / b : NaN); break;
    }
  };

  const precedence = (op: string) => (op === '×' || op === '÷' ? 2 : 1);

  for (const token of tokens) {
    if (/^\d/.test(token)) {
      numbers.push(parseFloat(token));
    } else {
      while (ops.length > 0 && precedence(ops[ops.length - 1]) >= precedence(token)) {
        applyOp();
      }
      ops.push(token);
    }
  }

  while (ops.length > 0) applyOp();

  if (numbers.length !== 1 || isNaN(numbers[0])) return null;
  return Math.round(numbers[0] * 100) / 100;
}

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
// Calculator pad
// ---------------------------------------------------------------------------

const BUTTONS = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '-'],
  ['.', '0', '⌫', '+'],
];

interface CalculatorPadProps {
  expression: string;
  onExpressionChange: (expr: string) => void;
  onConfirm: () => void;
}

function CalculatorPad({ expression, onExpressionChange, onConfirm }: CalculatorPadProps) {
  const theme = useTheme();
  const result = safeEvaluate(expression);
  const hasOperator = /[+\-×÷]/.test(expression);

  const handleButton = (key: string) => {
    if (key === '⌫') {
      onExpressionChange(expression.slice(0, -1));
    } else {
      onExpressionChange(expression + key);
    }
  };

  const handleClear = () => onExpressionChange('');

  const handleEquals = () => {
    if (result !== null) {
      onExpressionChange(String(result));
    }
  };

  return (
    <Box sx={{ p: 2, width: { xs: '100%', sm: 300 } }}>
      {/* Display */}
      <Box
        sx={{
          mb: 2,
          p: 1.5,
          borderRadius: 1,
          bgcolor: alpha(theme.palette.text.primary, 0.05),
          minHeight: 56,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', minHeight: 20 }}
        >
          {expression || '0'}
        </Typography>
        {hasOperator && result !== null && (
          <Typography variant="h6" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
            = {result}
          </Typography>
        )}
      </Box>

      {/* Button grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.75 }}>
        {BUTTONS.flat().map((key, i) => {
          const isOp = ['+', '-', '×', '÷'].includes(key);
          const isBackspace = key === '⌫';
          return (
            <ButtonBase
              key={i}
              onClick={() => handleButton(key)}
              sx={{
                height: 48,
                borderRadius: 1.5,
                fontSize: '1.1rem',
                fontWeight: 600,
                bgcolor: isOp
                  ? alpha(theme.palette.primary.main, 0.15)
                  : alpha(theme.palette.text.primary, 0.06),
                color: isOp ? 'primary.main' : 'text.primary',
                '&:hover': {
                  bgcolor: isOp
                    ? alpha(theme.palette.primary.main, 0.25)
                    : alpha(theme.palette.text.primary, 0.12),
                },
              }}
            >
              {isBackspace ? <BackspaceOutlinedIcon fontSize="small" /> : key}
            </ButtonBase>
          );
        })}
      </Box>

      {/* Bottom row: C and = / OK */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75, mt: 0.75 }}>
        <ButtonBase
          onClick={handleClear}
          sx={{
            height: 48,
            borderRadius: 1.5,
            fontSize: '1rem',
            fontWeight: 600,
            bgcolor: alpha(theme.palette.error.main, 0.12),
            color: 'error.main',
            '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.22) },
          }}
        >
          C
        </ButtonBase>
        <ButtonBase
          onClick={hasOperator && result !== null ? handleEquals : onConfirm}
          sx={{
            height: 48,
            borderRadius: 1.5,
            fontSize: '1rem',
            fontWeight: 700,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
          }}
        >
          {hasOperator && result !== null ? '=' : 'OK'}
        </ButtonBase>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// MoneyField
// ---------------------------------------------------------------------------

interface MoneyFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** ISO 4217 currency code (e.g. 'USD', 'EUR', 'UAH'). Determines the symbol shown. */
  currencyCode?: string;
  /** When provided, the currency badge becomes clickable and opens a picker. */
  currencies?: ReadonlyArray<{ code: string; name: string }>;
  /** Called when the user picks a different currency. */
  onCurrencyChange?: (code: string) => void;
}

// ---------------------------------------------------------------------------
// Currency picker popover content
// ---------------------------------------------------------------------------

interface CurrencyPickerProps {
  currencies: ReadonlyArray<{ code: string; name: string }>;
  selected: string;
  onSelect: (code: string) => void;
}

function CurrencyPicker({ currencies, selected, onSelect }: CurrencyPickerProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return currencies;
    const q = search.toLowerCase();
    return currencies.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [currencies, search]);

  return (
    <Box sx={{ width: 260 }}>
      <Box sx={{ p: 1, pb: 0 }}>
        <TextField
          placeholder="Search currency…"
          size="small"
          fullWidth
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Box>
      <List dense sx={{ maxHeight: 260, overflow: 'auto' }}>
        {filtered.map((c) => (
          <ListItemButton
            key={c.code}
            selected={c.code === selected}
            onClick={() => onSelect(c.code)}
          >
            <ListItemText
              primary={`${c.code} — ${c.name}`}
              primaryTypographyProps={{ variant: 'body2' }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

export function MoneyField({ label = 'Amount', value, onChange, required, currencyCode = 'USD', currencies, onCurrencyChange }: MoneyFieldProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [expression, setExpression] = useState('');
  const [currencyAnchor, setCurrencyAnchor] = useState<HTMLElement | null>(null);
  const currencyPickerOpen = Boolean(currencyAnchor);
  const canPickCurrency = Boolean(currencies && onCurrencyChange);

  const openCalc = useCallback((anchor?: HTMLElement) => {
    setExpression(value);
    if (anchor) setAnchorEl(anchor);
    setCalcOpen(true);
  }, [value]);

  const closeCalc = useCallback(() => {
    setCalcOpen(false);
    setAnchorEl(null);
  }, []);

  const handleConfirm = useCallback(() => {
    const result = safeEvaluate(expression);
    if (result !== null && result > 0) {
      onChange(String(result));
    }
    closeCalc();
  }, [expression, onChange, closeCalc]);

  const calcPad = (
    <CalculatorPad
      expression={expression}
      onExpressionChange={setExpression}
      onConfirm={handleConfirm}
    />
  );

  const currencyBadge = canPickCurrency ? (
    <ButtonBase
      onClick={(e) => setCurrencyAnchor(e.currentTarget)}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 1,
        px: 0.75,
        py: 0.25,
        mr: -0.5,
        color: 'text.secondary',
        '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.08) },
      }}
    >
      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1 }}>
        {currencyCode}
      </Typography>
      <ArrowDropDownIcon sx={{ fontSize: 18, ml: 0.25 }} />
    </ButtonBase>
  ) : (
    <Typography variant="body2" color="text.secondary" fontWeight={600}>
      {currencyCode}
    </Typography>
  );

  return (
    <>
      <NumericFormat
        customInput={TextField}
        label={label}
        thousandSeparator=","
        decimalScale={2}
        allowNegative={false}
        value={value}
        onValueChange={(values: NumberFormatValues) => onChange(values.value)}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start">{currencyBadge}</InputAdornment>,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={(e) => openCalc(e.currentTarget)}
                  edge="end"
                  aria-label="Open calculator"
                >
                  <CalculateIcon />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
        helperText="Enter amount or use calculator"
        required={required}
        fullWidth
      />

      {isMobile ? (
        <Dialog
          open={calcOpen}
          onClose={closeCalc}
          slots={{ transition: SlideUp }}
          slotProps={{
            paper: {
              sx: {
                position: 'fixed',
                bottom: 0,
                m: 0,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                width: '100%',
                maxWidth: 400,
              },
            },
          }}
          sx={{ '& .MuiDialog-container': { alignItems: 'flex-end' } }}
        >
          {calcPad}
        </Dialog>
      ) : (
        <Popover
          open={calcOpen}
          anchorEl={anchorEl}
          onClose={closeCalc}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {calcPad}
        </Popover>
      )}

      {canPickCurrency && (
        <Popover
          open={currencyPickerOpen}
          anchorEl={currencyAnchor}
          onClose={() => setCurrencyAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          <CurrencyPicker
            currencies={currencies!}
            selected={currencyCode}
            onSelect={(code) => {
              onCurrencyChange!(code);
              setCurrencyAnchor(null);
            }}
          />
        </Popover>
      )}
    </>
  );
}
