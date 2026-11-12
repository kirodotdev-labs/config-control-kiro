/**
 * @fileoverview The view for a Kiro CLI V3 feature you use inside a chat
 * (Memory): what it does here, how to start it, the
 * settings that switch it on, a terminal to try it and the guide. Memory also
 * lists what Kiro remembers.
 */
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { OpenInNew, Psychology } from '@mui/icons-material';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useScopeSettings } from '../../data/useSettings';
import { describeValue, GLOBAL_ONLY } from '../../domain/settings.js';
import { EditorFrame } from '../../ui/EditorFrame';
import { SURFACE } from '../../theme';
import { TerminalButton } from '../launcher/TerminalButton';
import { MemoryList } from '../memory/MemoryList';
import { MemoryAccess } from '../memory/MemoryAccess';

const DOCS = 'https://kiro.dev/docs';

/**
 * Source: kiro.dev/docs/memory.
 */
const FEATURES = {
  memory: {
    icon: <Psychology />, title: 'Memory', docs: `${DOCS}/memory/`,
    global: 'What Kiro has learned about how you work and about your repositories, kept between chats. Global memories are used in every workspace; a repository memory only there.',
    workspace: 'Kiro uses your Global memories here, plus the ones for this repository. Kiro keeps all of them in your Kiro home.',
    how: 'Add one here with New memory, or tell Kiro in a V3 chat ("remember we use Conventional Commits"), or let it learn with automatic updates. Edit and Delete are on each memory here; in a chat, /memories → list does the same. Kiro recalls a memory when a request matches its description. Memory needs the V3 engine and read & write access to change memories.',
    settings: [], // set in the Memory view itself (MemoryAccess)
  },
};

/** The value in effect and where it comes from. */
function effective(setting, settings, isWorkspace) {
  if (isWorkspace && !GLOBAL_ONLY.has(setting.key) && settings.workspace && setting.key in settings.workspace) return { value: settings.workspace[setting.key], from: 'Workspace' };
  if (settings.global && setting.key in settings.global) return { value: settings.global[setting.key], from: 'Global' };
  return { value: setting.fallback, from: '' };
}

/**
 * @param {Object} props
 * @param {'memory'} props.kind
 * @param {string} props.path
 * @param {() => void} props.onOpenSettings open this scope's Settings.
 */
export function FeatureView({ kind, path, onOpenSettings }) {
  const f = FEATURES[kind];
  const { isWorkspaceMode } = useWorkspace();
  const settings = useScopeSettings();
  const userOnly = f.settings.some((s) => GLOBAL_ONLY.has(s.key));
  return (
    <EditorFrame icon={f.icon} title={f.title} path={path}
      actions={(
        <>
          <Button endIcon={<OpenInNew />} href={f.docs} target="_blank" rel="noopener noreferrer">Guide</Button>
          <TerminalButton title={`Try ${f.title} in Kiro CLI V3`} />
        </>
      )}>
      <Box sx={{ overflow: 'auto', p: 3 }}>
        <Stack spacing={2} sx={{ maxWidth: 760 }}>
          <Typography variant="body1">{isWorkspaceMode ? f.workspace : f.global}</Typography>
          {kind === 'memory' && <MemoryAccess />}
          {kind === 'memory' && <MemoryList />}
          <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}` }}>
            <Typography variant="overline" color="text.secondary">How to use it</Typography>
            <Typography variant="body2">{f.how}</Typography>
          </Box>
          {f.settings.length > 0 && (
            <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}` }}>
              <Typography variant="overline" color="text.secondary">Settings</Typography>
              {f.settings.map((s) => {
                const e = effective(s, settings, isWorkspaceMode);
                return (
                  <Stack key={s.key} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5 }} data-setting={s.key}>
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>{s.label} <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>({s.key})</Box></Typography>
                    <Chip size="small" variant="outlined" label={settings.ready ? describeValue(e.value) : '…'} />
                    {e.from && <Typography variant="caption" color="text.secondary">{e.from}</Typography>}
                  </Stack>
                );
              })}
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
                {(!isWorkspaceMode || !userOnly) && <Button size="small" onClick={onOpenSettings}>Change in Settings</Button>}
                {isWorkspaceMode && userOnly && (
                  <Typography variant="caption" color="text.secondary">These are user settings: set them in Global Settings. A Workspace value has no effect.</Typography>
                )}
              </Stack>
            </Box>
          )}
        </Stack>
      </Box>
    </EditorFrame>
  );
}
