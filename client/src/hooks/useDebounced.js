/**
 * @fileoverview Returns value once it has stopped changing for delay ms.
 */
import { useEffect, useState } from 'react';

export default function useDebounced(value, delay = 500) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}
