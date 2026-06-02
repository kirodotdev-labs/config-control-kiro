/**
 * @fileoverview A text input that validates user-pasted filesystem paths
 * across Linux, macOS, and Windows formats. On Enter or blur it calls the
 * backend resolver and reports the result via onResolve. Invalid paths
 * surface as an inline error message under the field.
 */
import React, { useState, useCallback } from 'react';
import { TextField } from '@mui/material';
import { resolvePath } from '../../services/api';

/**
 * @param {object} props
 * @param {string} props.value - Current input value (controlled).
 * @param {function(string): void} props.onChange - Fired on each keystroke.
 * @param {function(object): void} [props.onResolve] - Fired with the
 *   resolution result when the user presses Enter or the field blurs.
 *   Result shape: { valid, exists, type, resolvedPath, parentPath, error }
 * @param {string} [props.placeholder]
 * @param {string} [props.label]
 * @param {string} [props.helperText] - Default helper text when no error.
 * @param {boolean} [props.fullWidth]
 * @param {string} [props.size] - MUI TextField size, defaults to 'small'.
 * @param {object} [props.sx] - Style overrides.
 * @param {object} [props.InputProps] - Forwarded to the underlying TextField.
 * @param {boolean} [props.validateOnBlur=true] - Auto-validate on blur.
 */
const PathInput = ({
  value,
  onChange,
  onResolve,
  placeholder,
  label,
  helperText,
  fullWidth = true,
  size = 'small',
  sx,
  InputProps,
  validateOnBlur = true,
  ...rest
}) => {
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);

  const validate = useCallback(async () => {
    if (!value || !value.trim()) {
      setError('');
      return;
    }
    setValidating(true);
    try {
      const result = await resolvePath(value);
      if (result.valid) {
        setError('');
      } else {
        setError(result.error || 'Invalid path');
      }
      if (onResolve) onResolve(result);
    } catch (err) {
      setError('Could not validate path');
    } finally {
      setValidating(false);
    }
  }, [value, onResolve]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validate();
    }
  };

  const handleBlur = () => {
    if (validateOnBlur) validate();
  };

  return (
    <TextField
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        if (error) setError('');
      }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      placeholder={placeholder}
      label={label}
      helperText={error || helperText || (validating ? 'Validating…' : '')}
      error={Boolean(error)}
      fullWidth={fullWidth}
      size={size}
      sx={sx}
      InputProps={InputProps}
      {...rest}
    />
  );
};

export default PathInput;
