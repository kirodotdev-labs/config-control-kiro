/**
 * @fileoverview Unified API Mutation Hook - Standardized API calls with error handling
 * @llm-purpose Wraps React Query mutations with automatic error handling and notifications
 * @dependencies useNotification hook, React Query useMutation
 * @patterns Pass mutation function + options, get automatic error handling
 * @usage const mutation = useApiMutation(apiFunction, { successMessage: 'Done!' });
 */

import { useMutation, useQueryClient } from 'react-query';
import { useNotification } from './useNotification';

export const useApiMutation = (mutationFn, options = {}) => {
  const { showNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation(mutationFn, {
    onError: (error) => {
      // Handle standardized error format
      const message = error.message || 'Operation failed';
      showNotification(message, 'error');
      options.onError?.(error);
    },
    onSuccess: (data, variables, context) => {
      if (options.successMessage) {
        const message = typeof options.successMessage === 'function' 
          ? options.successMessage(data, variables) 
          : options.successMessage;
        showNotification(message, 'success');
      }
      if (options.invalidateQueries) {
        queryClient.invalidateQueries(options.invalidateQueries);
      }
      options.onSuccess?.(data, variables, context);
    },
    retry: (failureCount, error) => {
      // Don't retry client errors (4xx)
      if (error.status >= 400 && error.status < 500) {
        return false;
      }
      // Retry up to 2 times for server errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options
  });
};

export default useApiMutation;
