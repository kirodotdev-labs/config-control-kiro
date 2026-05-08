/**
 * @fileoverview Custom React hook for form validation with JSON parsing support.
 */
import { useState, useCallback } from 'react';

export const useFormValidation = (initialValue = '') => {
  const [value, setValue] = useState(initialValue);
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const validateJSON = useCallback((jsonString) => {
    try {
      const parsed = JSON.parse(jsonString);
      setIsValid(true);
      setErrorMessage('');
      return { isValid: true, parsed, error: null };
    } catch (error) {
      setIsValid(false);
      setErrorMessage(error.message);
      return { isValid: false, parsed: null, error: error.message };
    }
  }, []);

  const handleChange = useCallback((newValue) => {
    setValue(newValue);
    validateJSON(newValue);
  }, [validateJSON]);

  const reset = useCallback(() => {
    setValue(initialValue);
    setIsValid(true);
    setErrorMessage('');
  }, [initialValue]);

  return {
    value,
    setValue,
    isValid,
    errorMessage,
    handleChange,
    validateJSON,
    reset
  };
};

export default useFormValidation;
