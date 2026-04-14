import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import ListItemIcon from '@mui/material/ListItemIcon';
import { getCategoryConfig } from '../utils/categoryConfig.ts';

interface CategoryAutocompleteProps {
  options: string[];
  value?: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  open?: boolean;
  autoFocus?: boolean;
  blurOnSelect?: boolean;
  onClose?: () => void;
  sx?: object;
}

export function CategoryAutocomplete({
  options,
  value,
  onChange,
  label,
  placeholder,
  required,
  fullWidth,
  size,
  open,
  autoFocus,
  blurOnSelect,
  onClose,
  sx,
}: CategoryAutocompleteProps) {
  return (
    <Autocomplete
      options={options}
      value={value ?? null}
      onChange={(_e, val) => onChange(val)}
      open={open}
      size={size}
      blurOnSelect={blurOnSelect}
      onClose={onClose}
      sx={sx}
      renderOption={(props, option) => {
        const config = getCategoryConfig(option);
        const Icon = config.icon;
        return (
          <li {...props} key={option}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Icon sx={{ color: config.color }} fontSize="small" />
            </ListItemIcon>
            {option}
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          required={required}
          fullWidth={fullWidth}
          autoFocus={autoFocus}
        />
      )}
    />
  );
}
