/**
 * @fileoverview One setting: its name and description, what applies when it
 * isn't set (Kiro's default, or the Global value in a Workspace), its input
 * and a reset button. In a Workspace, a Global-only setting is marked and
 * can only be reset.
 */
import { useEffect, useRef } from 'react';
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { RestartAlt } from '@mui/icons-material';
import { describeValue, GLOBAL_ONLY } from '../../domain/settings.js';
import { SettingControl } from './SettingControl';

/**
 * @param {Object} props
 * @param {Object} props.setting
 * @param {any} props.value
 * @param {any} [props.globalValue] the Global value, when editing a Workspace.
 * @param {boolean} props.isWorkspace
 * @param {string} props.error
 * @param {(next: any) => void} props.onChange
 * @param {() => void} props.onFocus highlights the key in the JSON.
 * @param {boolean} [props.active] the JSON pane shows this setting.
 * @param {number} [props.reveal] bump to scroll this row into view.
 */
export function SettingRow({ setting, value, globalValue, isWorkspace, error, onChange, onFocus, active = false, reveal = 0 }) {
  const ref = useRef(null);
  useEffect(() => { if (reveal) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [reveal]);
  const set = value !== undefined;
  const globalOnly = isWorkspace && GLOBAL_ONLY.has(setting.key);
  const inherited = isWorkspace && globalValue !== undefined;
  const defaultLabel = inherited ? `Use Global (${describeValue(globalValue)})`
    : setting.default ? `Kiro's default (${setting.default})` : "Kiro's default";
  return (
    <Stack ref={ref} direction="row" spacing={2} alignItems="flex-start" sx={{ py: 1.25, px: 1, mx: -1, borderRadius: 1, outline: active ? '2px solid' : 'none', outlineColor: 'primary.main' }} onFocusCapture={onFocus} onClickCapture={onFocus}>
      <Box sx={{ flex: '1 1 55%', minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: set ? 700 : 400, color: set ? 'primary.light' : 'text.primary' }} noWrap title={setting.key}>
            {setting.key}
          </Typography>
          {setting.restart && <Chip size="small" variant="outlined" label="after restart" title="Takes effect the next time Kiro CLI starts" />}
          {setting.engine === 'v3' && <Chip size="small" color="primary" variant="outlined" label="V3" title="Only Kiro CLI V3 chats read this setting" />}
          {setting.engine === 'v2' && <Chip size="small" variant="outlined" label="2.x only" title="Only Kiro CLI 2.x chats read this setting; V3 chats ignore it" />}
          {globalOnly && <Chip size="small" color={set ? 'warning' : 'default'} variant="outlined" label="Global only" title="Kiro reads this setting only from Global Settings" />}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{setting.description}</Typography>
        {globalOnly && set && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
            Kiro ignores this value in a Workspace. Reset it here and set it in Global Settings.
          </Typography>
        )}
      </Box>
      <Box sx={{ flex: '1 1 45%', minWidth: 180 }}>
        {globalOnly && !set
          ? <Typography variant="body2" color="text.secondary" sx={{ pt: 0.75 }}>{defaultLabel}. Set it in Global Settings.</Typography>
          : <SettingControl setting={setting} value={value} onChange={onChange} error={error} defaultLabel={defaultLabel} />}
      </Box>
      <Tooltip title={set ? `Reset to ${inherited ? 'the Global value' : "Kiro's default"}` : 'Not set in this file'}>
        <span>
          <IconButton size="small" disabled={!set} onClick={() => onChange(undefined)} aria-label={`Reset ${setting.key}`}><RestartAlt fontSize="small" /></IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
