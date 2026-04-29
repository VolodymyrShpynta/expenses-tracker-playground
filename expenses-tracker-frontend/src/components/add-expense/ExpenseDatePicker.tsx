import Dialog from '@mui/material/Dialog';
import Popover from '@mui/material/Popover';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import type { Dayjs } from 'dayjs';

/**
 * Date-picker overlay used by AddExpenseDialog. Mobile uses a full-width
 * popover anchored to the Date tile; desktop uses a centered Dialog
 * stacked on top of the parent dialog. Selecting a date auto-closes the
 * overlay — no separate confirm step.
 */
interface ExpenseDatePickerProps {
  open: boolean;
  isMobile: boolean;
  anchorEl: HTMLElement | null;
  value: Dayjs;
  onChange: (next: Dayjs) => void;
  onClose: () => void;
}

/**
 * Date picker overlay used by AddExpenseDialog. Mobile uses a full-width
 * popover anchored to the Date tile; desktop uses a centered Dialog
 * stacked on top of the parent dialog.
 */
export function ExpenseDatePicker({
  open,
  isMobile,
  anchorEl,
  value,
  onChange,
  onClose,
}: ExpenseDatePickerProps) {
  const calendar = (
    <DateCalendar
      value={value}
      onChange={(v) => {
        if (v) onChange(v);
        onClose();
      }}
    />
  );

  if (isMobile) {
    return (
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: { sx: { width: '100vw', maxWidth: '100vw', left: '0 !important' } },
        }}
      >
        {calendar}
      </Popover>
    );
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 420, borderRadius: 2 } } }}
    >
      {calendar}
    </Dialog>
  );
}
