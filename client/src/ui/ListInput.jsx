/**
 * @fileoverview Edits a list of strings as chips: type and press Enter to add,
 * pick from suggestions, or delete a chip. Order is kept.
 */
import { Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {string[]} props.value
 * @param {(next: string[]) => void} props.onChange
 * @param {string[]} [props.options] suggestions.
 * @param {string} [props.placeholder]
 * @param {string} [props.helperText]
 * @param {(item: string) => string} [props.getLabel] chip label for an item.
 * @param {(option: string) => string} [props.describe] a line shown under a suggestion.
 * @param {Object} [props.sx] styles for the field.
 */
export function ListInput({ label, value, onChange, options = [], placeholder, helperText, getLabel, describe, sx }) {
  return (
    <Autocomplete
      multiple freeSolo autoSelect size="small" sx={sx}
      options={options.filter((o) => !value.includes(o))}
      value={value}
      onChange={(_, next) => onChange([...new Set(next.map((v) => String(v).trim()).filter(Boolean))])}
      renderValue={(items, getItemProps) => items.map((item, index) => {
        const { key, ...rest } = getItemProps({ index });
        return <Chip key={key} size="small" label={getLabel ? getLabel(item) : item} {...rest} />;
      })}
      renderOption={describe ? ({ key, ...props }, option) => (
        <li key={key} {...props}>
          <Box>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{getLabel ? getLabel(option) : option}</Typography>
            {describe(option) && <Typography variant="caption" color="text.secondary">{describe(option)}</Typography>}
          </Box>
        </li>
      ) : undefined}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={value.length ? '' : placeholder} helperText={helperText} />
      )}
    />
  );
}
