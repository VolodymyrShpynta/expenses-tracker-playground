import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';

/**
 * Collapsible section header used for "Tools" and "Settings" in the
 * sidebar. The chevron rotates with `open` to mirror the underlying
 * `<Collapse>` state.
 */
interface SectionHeaderProps {
  label: string;
  open: boolean;
  onToggle: () => void;
}

/** Collapsible section header used for "Tools" and "Settings" in the sidebar. */
export function SectionHeader({ label, open, onToggle }: SectionHeaderProps) {
  return (
    <ListItemButton
      onClick={onToggle}
      sx={{ mx: '12px', mt: '15px', mb: '4px', borderRadius: '10px', py: '6px' }}
    >
      <ListItemText
        primary={label}
        slotProps={{ primary: { variant: 'h6', color: 'text.secondary' } }}
      />
      {open
        ? <ExpandLess sx={{ color: 'text.secondary' }} />
        : <ExpandMore sx={{ color: 'text.secondary' }} />}
    </ListItemButton>
  );
}
