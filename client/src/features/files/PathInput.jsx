/**
 * @fileoverview A text field for a filesystem path in Linux, macOS or Windows
 * form. Enter (or leaving the field) resolves it on the server; problems show
 * inline and the result is passed to onResolve.
 */
import { useState } from 'react';
import { TextField } from '@mui/material';
import { resolvePath } from '../../data/useFiles';

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(text: string) => void} props.onChange
 * @param {(result: Object) => void} [props.onResolve] receives { valid, exists, type, resolvedPath, parentPath, error }.
 * @param {string} [props.label]
 * @param {string} [props.placeholder]
 * @param {string} [props.helperText]
 * @param {React.ReactNode} [props.endAdornment]
 * @param {boolean} [props.autoFocus]
 */
export function PathInput({ value, onChange, onResolve, label, placeholder, helperText, endAdornment, autoFocus }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const validate = async () => {
    if (!value.trim()) { setError(''); return; }
    setBusy(true);
    try {
      const result = await resolvePath(value.trim());
      setError(result.valid ? '' : result.error || 'Invalid path');
      onResolve?.(result);
    } catch {
      setError('Could not check this path');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TextField
      fullWidth size="small" label={label} autoFocus={autoFocus}
      placeholder={placeholder || 'Paste a path and press Enter'}
      value={value}
      onChange={(e) => { onChange(e.target.value); if (error) setError(''); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); validate(); } }}
      onBlur={validate}
      error={!!error}
      helperText={error || (busy ? 'Checking…' : helperText)}
      slotProps={{ input: { endAdornment, sx: { fontFamily: 'monospace' } } }}
    />
  );
}
