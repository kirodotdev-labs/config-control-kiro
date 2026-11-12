/**
 * @fileoverview Hooks that run only for this agent. CLI 2.x object-form hooks
 * are shown read-only until the user converts them to the V3 array.
 */
import { Alert, Stack, Typography } from '@mui/material';
import { hookCount, hookList } from '../../../domain/hooks.js';
import { isV2Hooks } from '../../../domain/v2.js';
import { setField } from '../../../domain/json.js';
import { HookList } from '../../hooks/HookList';

/** @param {{spec: Object, serverNames: string[], onChange: (next: Object) => void}} props */
export function HooksSection({ spec, serverNames, onChange }) {
  if (isV2Hooks(spec.hooks)) { // 2.x: remove with V2 support
    return (
      <Alert severity="warning">
        These {hookCount(spec.hooks)} hooks use the CLI 2.x format, which this form can&apos;t edit. Use Upgrade with Kiro in
        the Kiro CLI V3 section to convert them, or edit them in the JSON on the right.
      </Alert>
    );
  }
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        To run a hook for every agent instead, add a hook file under Hooks in the navigator.
      </Typography>
      <HookList hooks={hookList(spec.hooks)} serverNames={serverNames}
        onChange={(next) => onChange(setField(spec, 'hooks', next))} />
    </Stack>
  );
}
