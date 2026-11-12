/**
 * @fileoverview Opens a native terminal running a kiro-cli command.
 */
import { useMutation } from '@tanstack/react-query';
import { launcherApi } from '../services/api';

/** mutate({ directory, command }) */
export const useLaunch = () =>
  useMutation({ mutationFn: ({ directory, command }) => launcherApi.launch(directory, command) });
