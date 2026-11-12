/**
 * @fileoverview The Powers page (kiro.dev/docs/powers): what a power is, the
 * powers you have installed, the powers you build yourself, Kiro's catalog,
 * and installing from the catalog, GitHub or a folder. Installing goes
 * through `kiro-cli powers install`, so Kiro registers each power itself.
 */
import { useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, Bolt, Download, GitHub, OpenInNew, Refresh, Search } from '@mui/icons-material';
import { usePowerActions, usePowers, usePowerSources, useRefreshPowers, useKiroStatus, kiroBlocker } from '../../data/useKiro';
import { useSaveFile } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import { newPowerFiles } from '../../domain/powers.js';
import { EditorFrame } from '../../ui/EditorFrame';
import { EmptyState, ErrorState, Loading } from '../../ui/States';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';
import { BrowseButton } from '../files/BrowseButton';
import { SURFACE } from '../../theme';

const AUTH = { none: 'no sign-in', oauth: 'signs in with OAuth', apiKey: 'needs an API key', awsCredentials: 'uses your AWS credentials', bearerToken: 'needs a token' };
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function PowerCard({ power, busy, blocker, onInstall, onOpen }) {
  return (
    <Stack direction="row" spacing={1.5} data-power={power.name} onClick={onOpen}
      sx={{ alignItems: 'center', p: 1.5, border: `1px solid ${SURFACE.border}`, borderRadius: 2, cursor: onOpen ? 'pointer' : 'default', '&:hover': onOpen ? { borderColor: 'primary.main' } : {} }}>
      <Avatar variant="rounded" sx={{ bgcolor: 'primary.dark', width: 32, height: 32 }}><Bolt fontSize="small" /></Avatar>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25 }}>
          <Typography variant="subtitle2" noWrap>{power.displayName || power.name}</Typography>
          {power.installed && <Chip size="small" color="success" variant="outlined" label="installed" />}
          {power.tier && <Chip size="small" variant="outlined" label={power.tier} />}
          {power.category && <Chip size="small" variant="outlined" label={power.category} />}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap title={power.description}>
          {[power.description || power.name, power.author && `by ${power.author}`, AUTH[power.authType]].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      {power.repository && (
        <Tooltip title="View source">
          <Button size="small" href={power.repository} target="_blank" rel="noopener noreferrer" sx={{ minWidth: 0 }} onClick={(e) => e.stopPropagation()}><OpenInNew fontSize="small" /></Button>
        </Tooltip>
      )}
      {!power.installed && (
        <Tooltip title={blocker}>
          <span><Button size="small" variant="outlined" startIcon={<Download />} disabled={!!blocker || busy} onClick={(e) => { e.stopPropagation(); onInstall(power.name); }}>Install</Button></span>
        </Tooltip>
      )}
    </Stack>
  );
}

/** Downloads a power folder from GitHub and installs it. */
function GitHubDialog({ open, onClose, onInstall, busy }) {
  const [url, setUrl] = useState('');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Install a power from GitHub</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          The URL of one power&apos;s folder in a public repository (a repository can hold several). The folder needs a plugin.json or POWER.md.
        </Typography>
        <TextField autoFocus size="small" label="Folder URL" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo/tree/main/my-power" onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) onInstall(url.trim()); }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!url.trim() || busy} onClick={() => onInstall(url.trim())}>{busy ? 'Installing…' : 'Install'}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Creates a new power folder in power-sources from the docs' layout. */
function NewPowerDialog({ open, dir, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const save = useSaveFile();
  const notify = useNotify();
  const n = name.trim();
  const error = n && !KEBAB.test(n) ? 'kebab-case: lowercase letters, numbers and hyphens' : '';
  const submit = async () => {
    try {
      const files = newPowerFiles(n, author.trim());
      for (const [rel, content] of Object.entries(files)) await save.mutateAsync({ path: `${dir}/${n}/${rel}`, content, createOnly: true });
      setName(''); onCreated(`${dir}/${n}`);
    } catch (e) { notify(errorMessage(e), 'error'); }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New power</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Starts the folder the docs describe: plugin.json, mcp.json and one skill, in {dir}. Fill it in, then Install.
        </Typography>
        <TextField autoFocus size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} error={!!error} helperText={error || 'e.g. team-api'} />
        <TextField size="small" label="Author" value={author} onChange={(e) => setAuthor(e.target.value)} helperText="You or your team" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!n || !!error || save.isPending} onClick={submit}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * @param {Object} props
 * @param {string} props.path
 * @param {(node: Object) => void} props.onOpenNode open an installed power or one of your power folders.
 */
export function PowersView({ path, onOpenNode }) {
  const powers = usePowers();
  const sources = usePowerSources();
  const refresh = useRefreshPowers();
  const { install, installGitHub } = usePowerActions();
  const { data: status } = useKiroStatus();
  const confirm = useConfirm();
  const notify = useNotify();
  const [query, setQuery] = useState('');
  const [gitHub, setGitHub] = useState(false);
  const [creating, setCreating] = useState(false);
  const blocker = kiroBlocker(status, 'powers');
  const busy = install.isPending || installGitHub.isPending;
  const warn = 'A power can add skills, scripts and MCP servers that run on your computer with your access. Review its source first if you don\'t know it.';

  const onInstall = async (target) => {
    if (!await confirm({ title: `Install ${target}?`, confirmLabel: 'Install', body: warn })) return;
    install.mutate(target, { onSuccess: () => notify('Installed. New Kiro chats can use it.', 'success'), onError: (e) => notify(errorMessage(e), 'error') });
  };
  const onGitHub = async (url) => {
    if (!await confirm({ title: 'Install this power?', confirmLabel: 'Install', body: `${url}\n\n${warn}` })) return;
    installGitHub.mutate(url, { onSuccess: () => { setGitHub(false); notify('Installed. New Kiro chats can use it.', 'success'); }, onError: (e) => notify(errorMessage(e), 'error') });
  };
  const openInstalled = (p) => onOpenNode({ kind: 'power', id: `power:${p.name}`, name: p.name });
  const openSource = (dir) => { const name = dir.split(/[\\/]/).pop(); onOpenNode({ kind: 'powersource', id: `powersource:${name}`, name, path: dir }); };

  if (powers.isLoading) return <Loading />;
  if (powers.isError) return <ErrorState message={errorMessage(powers.error)} onRetry={powers.refetch} />;
  const { installed, catalog } = powers.data;
  const installedNames = new Set(installed.map((p) => p.name));
  const q = query.trim().toLowerCase();
  const available = catalog.filter((p) => !p.installed && (!q || `${p.name} ${p.displayName} ${p.description} ${p.category}`.toLowerCase().includes(q)));
  const mine = sources.data?.powers || [];

  return (
    <EditorFrame icon={<Bolt />} title="Powers" path={path}
      actions={(
        <>
          <Button startIcon={<Refresh />} disabled={refresh.isPending} onClick={() => refresh.mutate()}>{refresh.isPending ? 'Refreshing…' : 'Refresh catalog'}</Button>
          <Button endIcon={<OpenInNew />} href="https://kiro.dev/docs/powers/" target="_blank" rel="noopener noreferrer">Guide</Button>
        </>
      )}>
      <Box sx={{ overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body1">
          A power bundles an integration&apos;s MCP tools with the skills and guidance to use them. Kiro loads it only when your request mentions one
          of its keywords, so a power costs no context until it&apos;s needed. Installed powers reach Kiro&apos;s default agent, and custom agents with
          &quot;Include installed Powers&quot; on.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Use one:</strong> install it from the catalog, GitHub or a folder, then open it and press Terminal to try it.{' '}
          <strong>Build your own:</strong> New power, or Make your own copy of an installed one, then Install.
        </Typography>
        {blocker && <Alert severity="warning">{blocker}</Alert>}
        {powers.data.unreadable && (
          <Alert severity="warning">
            Kiro&apos;s {powers.data.unreadable} isn&apos;t in a shape this app knows, so this list may be incomplete. In a V3 chat, /powers lists them.
          </Alert>
        )}
        {busy && <Alert severity="info">Kiro is installing the power. This can take a minute.</Alert>}

        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Typography variant="overline" sx={{ flexGrow: 1 }}>Installed ({installed.length})</Typography>
          <Button size="small" startIcon={<GitHub />} disabled={!!blocker || busy} onClick={() => setGitHub(true)}>Install from GitHub</Button>
          <BrowseButton mode="directory" label="Install from a folder…" title="Choose a power's folder" onPick={onInstall} />
        </Stack>
        {installed.length ? <Stack spacing={1} data-section="installed">{installed.map((p) => <PowerCard key={p.name} power={p} onOpen={() => openInstalled(p)} />)}</Stack>
          : <Typography variant="body2" color="text.secondary">No powers installed yet. Install one from the catalog below.</Typography>}

        <Stack direction="row" sx={{ alignItems: 'center', mt: 1 }}>
          <Typography variant="overline" sx={{ flexGrow: 1 }}>Your powers ({mine.length})</Typography>
          <Button size="small" variant="contained" startIcon={<Add />} onClick={() => setCreating(true)} disabled={!sources.data}>New power</Button>
        </Stack>
        <Stack spacing={1} data-section="mine">
          {mine.map((d) => (
            <Stack key={d.dir} direction="row" spacing={1} data-source={d.manifest.name} onClick={() => openSource(d.dir)}
              sx={{ alignItems: 'center', p: 1.25, border: `1px solid ${SURFACE.border}`, borderRadius: 2, cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}>
              <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>{d.manifest.name || d.dir.split(/[\\/]/).pop()}</Typography>
              {installedNames.has(d.manifest.name) && <Chip size="small" color="success" variant="outlined" label="installed" />}
              {d.problems.length > 0 && <Chip size="small" color="warning" variant="outlined" label={`${d.problems.length} to fix`} />}
              <Typography variant="caption" color="text.secondary" noWrap sx={{ flexGrow: 1 }}>{d.manifest.description}</Typography>
            </Stack>
          ))}
          {!mine.length && <Typography variant="body2" color="text.secondary">Powers you build yourself. New power starts one from the docs&apos; layout; Install hands it to Kiro.</Typography>}
        </Stack>

        <Typography variant="overline" sx={{ mt: 1 }}>Catalog</Typography>
        <Typography variant="caption" color="text.secondary" data-testid="catalog-date">
          {powers.data.catalogSource === 'live'
            ? `Kiro's published catalog: ${catalog.length} powers${powers.data.catalogUpdated ? `, updated ${new Date(powers.data.catalogUpdated).toLocaleDateString()}` : ''}. Checked again every hour, or with Refresh catalog.`
            : `Kiro's saved copy of its catalog${powers.data.catalogUpdated ? `, from ${new Date(powers.data.catalogUpdated).toLocaleDateString()}` : ''}: ${catalog.length} powers.`}
        </Typography>
        {powers.data.catalogProblem && (
          <Alert severity="warning" action={<Button color="inherit" onClick={() => refresh.mutate()}>Try again</Button>}>
            {powers.data.catalogSource === 'live' ? 'Showing the catalog from an earlier download' : "Showing Kiro's saved copy, which may be out of date"}: {powers.data.catalogProblem}.
          </Alert>
        )}
        <TextField size="small" placeholder="Search by name, what it does or category" value={query} onChange={(e) => setQuery(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />
        {available.length ? <Stack spacing={1} data-section="catalog">{available.map((p) => <PowerCard key={p.name} power={p} busy={busy} blocker={blocker} onInstall={onInstall} />)}</Stack> : (
          <EmptyState title={catalog.length ? 'No matching powers' : 'The catalog isn\'t downloaded yet'}
            body={catalog.length ? '' : "Kiro's catalog couldn't be downloaded and Kiro has no saved copy. Try Refresh catalog, or install a power from a folder."} />
        )}
      </Box>
      <GitHubDialog open={gitHub} onClose={() => setGitHub(false)} onInstall={onGitHub} busy={installGitHub.isPending} />
      {sources.data && <NewPowerDialog open={creating} dir={sources.data.dir} onClose={() => setCreating(false)} onCreated={(dir) => { setCreating(false); openSource(dir); }} />}
    </EditorFrame>
  );
}
