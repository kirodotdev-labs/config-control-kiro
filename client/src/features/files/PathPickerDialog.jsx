/**
 * @fileoverview Browse the filesystem and choose a file or a folder. The
 * address bar accepts any pasted path; Home, Up and double-click navigate.
 */
import { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip, Typography,
} from '@mui/material';
import { ArrowUpward, Computer, Folder, Home, InsertDriveFile } from '@mui/icons-material';
import { useSystemInfo } from '../../data/useSystem';
import { useDirectory, resolvePath } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import { Loading, ErrorState } from '../../ui/States';
import { PathInput } from './PathInput';
import { parentOf, extensionOf } from './paths';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(path: string) => void} props.onPick absolute path of the choice.
 * @param {'file'|'directory'} [props.mode]
 * @param {string[]} [props.extensions] allowed file extensions (file mode).
 * @param {string} [props.initialPath]
 * @param {string} [props.title]
 */
export function PathPickerDialog({ open, onClose, onPick, mode = 'file', extensions = [], initialPath = '', title }) {
  const [dir, setDir] = useState('');
  const [address, setAddress] = useState('');
  const [selected, setSelected] = useState(null);
  const listing = useDirectory(open ? dir : '');
  const { data: info } = useSystemInfo();

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    const seed = initialPath.trim();
    if (!seed) { setDir('~'); return; }
    resolvePath(seed)
      .then((r) => setDir(r.valid && r.exists ? (r.type === 'directory' ? r.resolvedPath : r.parentPath) : '~'))
      .catch(() => setDir('~'));
  }, [open, initialPath]);

  const current = listing.data?.path || dir;
  useEffect(() => { setAddress(current); }, [current]);

  const go = (path) => { setSelected(null); setDir(path); };
  const fileAllowed = (name) => mode === 'file' && (!extensions.length || extensions.includes(extensionOf(name)));
  const choice = selected?.path || (mode === 'directory' ? current : '');

  const pick = (path) => { onPick(path); onClose(); };
  const onAddress = (r) => {
    if (!r.valid || !r.exists) return;
    if (r.type === 'directory') go(r.resolvedPath);
    else { go(r.parentPath); setSelected({ path: r.resolvedPath }); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { height: '72vh' } } }}>
      <DialogTitle>{title || (mode === 'directory' ? 'Choose a folder' : 'Choose a file')}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", px: 2, pt: 1.5 }}>
          <Tooltip title="Home"><IconButton onClick={() => go('~')}><Home /></IconButton></Tooltip>
          {info?.isWSL && (
            <Tooltip title="Windows users folder (C:\\Users)"><IconButton onClick={() => go('/mnt/c/Users')}><Computer /></IconButton></Tooltip>
          )}
          <Tooltip title="Up"><IconButton onClick={() => go(parentOf(current))}><ArrowUpward /></IconButton></Tooltip>
          <PathInput value={address} onChange={setAddress} onResolve={onAddress} helperText=" " />
        </Stack>
        <Box sx={{ flexGrow: 1, overflow: 'auto', px: 1 }}>
          {listing.isLoading && <Loading />}
          {listing.isError && <ErrorState message={errorMessage(listing.error)} onRetry={listing.refetch} />}
          {listing.data && (
            <List dense>
              {listing.data.folders.map((f) => (
                <ListItemButton key={f.path} selected={selected?.path === f.path}
                  onClick={() => (mode === 'directory' ? setSelected(f) : go(f.path))} onDoubleClick={() => go(f.path)}>
                  <ListItemIcon><Folder color="primary" /></ListItemIcon>
                  <ListItemText primary={f.name} />
                </ListItemButton>
              ))}
              {listing.data.files.map((f) => (
                <ListItemButton key={f.path} disabled={!fileAllowed(f.name)} selected={selected?.path === f.path}
                  onClick={() => setSelected(f)} onDoubleClick={() => pick(f.path)}>
                  <ListItemIcon><InsertDriveFile /></ListItemIcon>
                  <ListItemText primary={f.name} />
                </ListItemButton>
              ))}
              {!listing.data.folders.length && !listing.data.files.length && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>This folder is empty.</Typography>
              )}
            </List>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flexGrow: 1, px: 1, fontFamily: 'monospace' }}>
          {choice}
        </Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!choice} onClick={() => pick(choice)}>Choose</Button>
      </DialogActions>
    </Dialog>
  );
}
