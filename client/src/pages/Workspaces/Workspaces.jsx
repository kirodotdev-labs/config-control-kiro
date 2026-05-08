/**
 * @fileoverview Workspaces management page — create, copy, move, delete workspaces.
 */
import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControlLabel, Checkbox, CircularProgress, Alert, Divider
} from '@mui/material';
import {
  Add, FolderOpen, Public, ContentCopy, Delete,
  RemoveCircleOutline, SwapHoriz, Star
} from '@mui/icons-material';
import { useQuery, useQueryClient } from 'react-query';
import { workspaceService } from '../../services/api';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import UniversalPathBrowser from '../../components/common/UniversalPathBrowser';
import { useNotification } from '../../hooks/useNotification';
import NotificationSnackbar from '../../components/common/NotificationSnackbar';

export default function Workspaces() {
  const queryClient = useQueryClient();
  const { refresh: refreshWorkspace } = useWorkspace();
  const { notification, showNotification, hideNotification } = useNotification();

  const [createDialog, setCreateDialog] = useState(false);
  const [addDialog, setAddDialog] = useState(false);
  const [copyDialog, setCopyDialog] = useState(null);
  const [importDialog, setImportDialog] = useState(false);
  const [importSource, setImportSource] = useState('');
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [removeDialog, setRemoveDialog] = useState(null);

  const [targetPath, setTargetPath] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [switchAfter, setSwitchAfter] = useState(true);
  const [loading, setLoading] = useState(false);

  const { data, isLoading, refetch } = useQuery('workspace-list', workspaceService.listWorkspaces, {
    refetchOnWindowFocus: false
  });

  const workspaces = data?.workspaces || [];
  const currentMode = data?.mode || 'global';

  const refresh = () => { refetch(); queryClient.invalidateQueries('workspace-context'); refreshWorkspace(); };

  // Create new workspace
  const handleCreate = async () => {
    if (!targetPath) return;
    setLoading(true);
    try {
      const fullPath = newFolderName ? `${targetPath}/${newFolderName}` : targetPath;
      await workspaceService.addWorkspace(fullPath);
      if (switchAfter) await workspaceService.setContext('workspace', fullPath);
      showNotification(`Workspace created at ${fullPath}`, 'success');
      refresh();
      setCreateDialog(false);
      setTargetPath(''); setNewFolderName('');
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to create workspace', 'error');
    }
    setLoading(false);
  };

  // Add existing workspace
  const handleAdd = async () => {
    if (!targetPath) return;
    setLoading(true);
    try {
      let path = targetPath;
      if (path.endsWith('/.kiro') || path.endsWith('\\.kiro')) {
        path = path.replace(/[/\\]\.kiro$/, '');
      }
      await workspaceService.addExistingWorkspace(path);
      if (switchAfter) await workspaceService.setContext('workspace', path);
      showNotification(`Workspace added: ${path}`, 'success');
      refresh();
      setAddDialog(false);
      setTargetPath('');
    } catch (err) {
      showNotification(err.response?.data?.message || 'No .kiro workspace found at this location. Use Create New instead.', 'error');
    }
    setLoading(false);
  };

  // Copy workspace
  const handleCopy = async () => {
    if (!copyDialog || !targetPath) return;
    setLoading(true);
    try {
      await workspaceService.copyWorkspace(copyDialog.path, targetPath);
      await workspaceService.addWorkspace(targetPath);
      showNotification(`Workspace copied to ${targetPath}`, 'success');
      refresh();
      setCopyDialog(null);
      setTargetPath('');
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to copy workspace', 'error');
    }
    setLoading(false);
  };

  // Import workspace from any location
  const handleImport = async () => {
    if (!importSource || !targetPath) return;
    setLoading(true);
    try {
      // Auto-correct: if user selected .kiro directly, use parent as source
      let source = importSource;
      if (source.endsWith('/.kiro') || source.endsWith('\\.kiro')) {
        source = source.replace(/[/\\]\.kiro$/, '');
      }
      await workspaceService.copyWorkspace(source, targetPath);
      await workspaceService.addWorkspace(targetPath);
      if (switchAfter) await workspaceService.setContext('workspace', targetPath);
      showNotification(`Workspace imported to ${targetPath}`, 'success');
      refresh();
      setImportDialog(false);
      setImportSource('');
      setTargetPath('');
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to import workspace', 'error');
    }
    setLoading(false);
  };

  // Delete workspace
  const handleDelete = async () => {
    if (!deleteDialog) return;
    const path = deleteDialog.path;
    setLoading(true);
    setDeleteDialog(null);
    try {
      await workspaceService.deleteWorkspace(path);
      showNotification(`Workspace deleted: ${path}`, 'success');
    } catch (err) {
      // Even if delete API fails, try removing from list
      try { await workspaceService.removeWorkspace(path); } catch (_) {}
      showNotification(`Removed workspace: ${path}`, 'success');
    }
    refresh();
    setLoading(false);
  };

  // Remove from list
  const handleRemove = async () => {
    if (!removeDialog) return;
    const path = removeDialog.path;
    setLoading(true);
    setRemoveDialog(null);
    try {
      await workspaceService.removeWorkspace(path);
    } catch (_) {}
    showNotification(`Removed from list: ${path}`, 'success');
    refresh();
    setLoading(false);
  };

  // Switch to workspace
  const handleSwitch = async (path) => {
    try {
      await workspaceService.setContext('workspace', path);
      showNotification(`Switched to ${path}`, 'success');
      refresh();
    } catch (err) {
      showNotification('Failed to switch workspace', 'error');
    }
  };

  // Switch to global
  const handleGlobal = async () => {
    try {
      await workspaceService.setContext('global', '');
      showNotification('Switched to global mode', 'success');
      refresh();
    } catch (err) {
      console.error('Switch to global failed:', err);
      showNotification(err.response?.data?.message || 'Failed to switch to global', 'error');
    }
  };

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Workspaces</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage your Kiro workspace configurations
      </Typography>

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Card sx={{ flex: 1, minWidth: 200, cursor: 'pointer', '&:hover': { boxShadow: 3 } }} onClick={() => { setCreateDialog(true); setTargetPath(''); setNewFolderName(''); setSwitchAfter(true); }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Add color="primary" />
            <Box>
              <Typography variant="subtitle2">Create New</Typography>
              <Typography variant="caption" color="text.secondary">Create a new project folder with a .kiro workspace inside it.</Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1, minWidth: 200, cursor: 'pointer', '&:hover': { boxShadow: 3 } }} onClick={() => { setAddDialog(true); setTargetPath(''); setSwitchAfter(true); }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <FolderOpen color="primary" />
            <Box>
              <Typography variant="subtitle2">Add Existing</Typography>
              <Typography variant="caption" color="text.secondary">Select a project folder that already has a .kiro directory.</Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1, minWidth: 200, cursor: 'pointer', '&:hover': { boxShadow: 3 } }} onClick={() => { setImportDialog(true); setImportSource(''); setTargetPath(''); setSwitchAfter(true); }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <ContentCopy color="primary" />
            <Box>
              <Typography variant="subtitle2">Import</Typography>
              <Typography variant="caption" color="text.secondary">Copy a .kiro from anywhere into a project folder.</Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1, minWidth: 200, cursor: 'pointer', '&:hover': { boxShadow: 3 }, ...(currentMode === 'global' ? { bgcolor: 'primary.main' } : {}) }} onClick={handleGlobal}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Public sx={{ color: currentMode === 'global' ? '#fff' : 'primary.main' }} />
            <Box>
              <Typography variant="subtitle2" sx={{ color: currentMode === 'global' ? '#fff' : 'inherit' }}>
                {currentMode === 'global' ? 'Global Mode (Active)' : 'Switch to Global'}
              </Typography>
              <Typography variant="caption" sx={{ color: currentMode === 'global' ? 'rgba(255,255,255,0.7)' : 'text.secondary' }}>Use shared configuration at ~/.kiro</Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Action descriptions */}
      <Box sx={{ mb: 3, px: 1 }}>
        <Typography variant="caption" color="text.secondary" display="block">• <strong>Copy</strong> — Duplicate this workspace .kiro to another project folder</Typography>
        <Typography variant="caption" color="text.secondary" display="block">• <strong>Delete</strong> — Permanently remove the .kiro directory and all its contents</Typography>
        <Typography variant="caption" color="text.secondary" display="block">• <strong>Remove</strong> — Remove from this list only, files are kept</Typography>
      </Box>

      {/* Workspace list */}
      {workspaces.length === 0 ? (
        <Alert severity="info">No workspaces added yet. Create a new workspace or add an existing project folder.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {workspaces.map((ws) => (
            <Card key={ws.path} sx={{ border: ws.active ? 2 : 1, borderColor: ws.active ? 'primary.main' : 'divider' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      {ws.active && <Star sx={{ fontSize: 18, color: 'primary.main' }} />}
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>{ws.name}</Typography>
                      {ws.active && <Chip label="Active" size="small" color="primary" sx={{ height: 20, fontSize: 11 }} />}
                      {!ws.exists && <Chip label=".kiro not found" size="small" color="warning" sx={{ height: 20, fontSize: 11 }} />}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', mb: 1.5 }}>{ws.path}</Typography>

                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                      <Typography variant="caption" color="text.secondary">Agents: {ws.agents}</Typography>
                      <Typography variant="caption" color="text.secondary">MCP: {ws.mcp}</Typography>
                      <Typography variant="caption" color="text.secondary">Steering: {ws.steering}</Typography>
                      <Typography variant="caption" color="text.secondary">Skills: {ws.skills}</Typography>
                    </Box>
                  </Box>

                  {/* Activate button top-right */}
                  {ws.active ? (
                    <Button size="small" variant="contained" color="success" sx={{ fontWeight: 700, minWidth: 80 }}>Active</Button>
                  ) : (
                    <Button size="small" variant="outlined" onClick={() => handleSwitch(ws.path)} sx={{ minWidth: 80 }}>Activate</Button>
                  )}
                </Box>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button size="small" startIcon={<ContentCopy />} variant="outlined" onClick={() => { setCopyDialog(ws); setTargetPath(''); }}>Copy</Button>
                  <Button size="small" startIcon={<Delete />} variant="outlined" color="error" onClick={() => setDeleteDialog(ws)}>Delete</Button>
                  <Button size="small" startIcon={<RemoveCircleOutline />} variant="outlined" onClick={() => setRemoveDialog(ws)}>Remove</Button>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Workspace</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select an existing project folder to add a .kiro workspace, or specify a new folder name to create both.
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Project folder</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" fullWidth value={targetPath} onChange={(e) => setTargetPath(e.target.value)} placeholder="/home/user/my-project" />
              <UniversalPathBrowser label="Browse" onSelect={(uri) => setTargetPath(uri.replace('file://', ''))} buttonProps={{ variant: 'outlined', size: 'small' }} />
            </Box>
          </Box>
          <TextField size="small" fullWidth label="Or create a new folder (optional)" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="my-new-project" sx={{ mb: 2 }} helperText="Leave empty to create .kiro in the selected folder above" />
          {targetPath && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {newFolderName ? (
                <>
                  This creates:<br />
                  <strong>{targetPath}/{newFolderName}/</strong><br />
                  <strong>{targetPath}/{newFolderName}/.kiro/</strong>
                </>
              ) : (
                <>
                  This creates:<br />
                  <strong>{targetPath}/.kiro/</strong>
                </>
              )}
            </Alert>
          )}
          {targetPath && !newFolderName && workspaces.some(w => w.path === targetPath) && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              ⚠️ A .kiro workspace already exists at <strong>{targetPath}</strong>. Creating will overwrite it.
            </Alert>
          )}
          <FormControlLabel control={<Checkbox checked={switchAfter} onChange={(e) => setSwitchAfter(e.target.checked)} size="small" />} label="Switch to this workspace after creating" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained" disabled={!targetPath || loading}>
            {loading ? <CircularProgress size={20} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Existing Dialog */}
      <Dialog open={addDialog} onClose={() => setAddDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Existing Workspace</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select a project folder that has an existing .kiro directory.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
            <TextField size="small" fullWidth value={targetPath} onChange={(e) => setTargetPath(e.target.value)} placeholder="/home/user/my-project" />
            <UniversalPathBrowser label="Browse" onSelect={(uri) => setTargetPath(uri.replace('file://', ''))} buttonProps={{ variant: 'outlined', size: 'small' }} />
          </Box>
          {targetPath && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Workspace path: <strong>{targetPath}</strong>
              {(targetPath.endsWith('/.kiro') || targetPath.endsWith('\\.kiro')) && (
                <><br />⚠️ Detected .kiro directory — will use parent: <strong>{targetPath.replace(/[/\\]\.kiro$/, '')}</strong></>
              )}
            </Alert>
          )}
          <FormControlLabel control={<Checkbox checked={switchAfter} onChange={(e) => setSwitchAfter(e.target.checked)} size="small" />} label="Switch to this workspace after adding" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialog(false)}>Cancel</Button>
          <Button onClick={handleAdd} variant="contained" disabled={!targetPath || loading}>
            {loading ? <CircularProgress size={20} /> : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Copy Dialog */}
      <Dialog open={!!copyDialog} onClose={() => setCopyDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Copy Workspace</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            From: <strong>{copyDialog?.path}</strong>
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Select the destination project folder. The .kiro directory and all its contents will be copied there.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
            <TextField size="small" fullWidth value={targetPath} onChange={(e) => setTargetPath(e.target.value)} placeholder="Destination project folder" />
            <UniversalPathBrowser label="Browse" onSelect={(uri) => setTargetPath(uri.replace('file://', ''))} buttonProps={{ variant: 'outlined', size: 'small' }} />
          </Box>
          {targetPath && (
            <Alert severity="info" sx={{ mb: 2 }}>
              To: <strong>{targetPath}/.kiro</strong><br />
              The copied workspace will be added to your workspaces list.
            </Alert>
          )}
          {targetPath && workspaces.some(w => w.path === targetPath) && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              ⚠️ A .kiro workspace already exists at <strong>{targetPath}</strong>. Copying will overwrite it.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyDialog(null)}>Cancel</Button>
          <Button onClick={handleCopy} variant="contained" disabled={!targetPath || loading}>
            {loading ? <CircularProgress size={20} /> : 'Copy'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialog} onClose={() => setImportDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Workspace</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select a project folder containing a .kiro workspace to import from, then choose where to import it to.
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Source (project folder with .kiro)</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" fullWidth value={importSource} onChange={(e) => setImportSource(e.target.value)} placeholder="/path/to/source/project" />
              <UniversalPathBrowser label="Browse" onSelect={(uri) => setImportSource(uri.replace('file://', ''))} buttonProps={{ variant: 'outlined', size: 'small' }} />
            </Box>
          </Box>
          {importSource && (importSource.endsWith('/.kiro') || importSource.endsWith('\\.kiro')) && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Detected .kiro directory — will use parent: <strong>{importSource.replace(/[/\\]\.kiro$/, '')}</strong>
            </Alert>
          )}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Destination (project folder to import into)</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" fullWidth value={targetPath} onChange={(e) => setTargetPath(e.target.value)} placeholder="/path/to/destination/project" />
              <UniversalPathBrowser label="Browse" onSelect={(uri) => setTargetPath(uri.replace('file://', ''))} buttonProps={{ variant: 'outlined', size: 'small' }} />
            </Box>
          </Box>
          {importSource && targetPath && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Copy .kiro from <strong>{importSource.replace(/[/\\]\.kiro$/, '')}</strong> to <strong>{targetPath}/.kiro</strong><br />
              The imported workspace will be added to your list.
            </Alert>
          )}
          {targetPath && workspaces.some(w => w.path === targetPath) && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              ⚠️ A workspace already exists at <strong>{targetPath}</strong>. Importing will overwrite it.
            </Alert>
          )}
          <FormControlLabel control={<Checkbox checked={switchAfter} onChange={(e) => setSwitchAfter(e.target.checked)} size="small" />} label="Switch to this workspace after importing" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialog(false)}>Cancel</Button>
          <Button onClick={handleImport} variant="contained" disabled={!importSource || !targetPath || loading}>
            {loading ? <CircularProgress size={20} /> : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Workspace</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            Path: <strong>{deleteDialog?.path}/.kiro</strong>
          </Alert>
          <Typography variant="body2">
            This permanently deletes all agents, MCP configs, steering files, and skills in this workspace.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Dialog */}
      <Dialog open={!!removeDialog} onClose={() => setRemoveDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Remove from List</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Path: <strong>{removeDialog?.path}</strong>
          </Alert>
          <Typography variant="body2">
            Remove this workspace from your list. The .kiro directory and all files will be kept — only the tracking is removed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveDialog(null)}>Cancel</Button>
          <Button onClick={handleRemove} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>

      <NotificationSnackbar notification={notification} onClose={hideNotification} />
    </Box>
  );
}
