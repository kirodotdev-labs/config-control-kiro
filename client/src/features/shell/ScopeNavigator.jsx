/**
 * @fileoverview The left navigator: Global and each Workspace, the active one
 * expanded to its configuration surfaces. Selecting a scope switches Kiro's
 * active scope; selecting a surface opens its editor. Both ask before
 * discarding unsaved edits.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Collapse, IconButton, Tooltip, Typography } from '@mui/material';
import { Add, ChevronLeft, ChevronRight, Close, FolderSpecial, Home, Public, UnfoldLess, WarningAmber } from '@mui/icons-material';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useConfirmLeave } from '../../contexts/UnsavedChangesContext';
import { useConfirm } from '../../ui/ConfirmProvider';
import { ACCENT, SURFACE } from '../../theme';
import { NavRow } from './NavRow';
import { SurfaceTree } from './SurfaceTree';
import { AddWorkspaceDialog } from './AddWorkspaceDialog';
import { RelationLines } from './RelationLines';
import { NAV_DEFAULT, NavResizer, useNavWidth } from './NavResizer';
import { otherId } from './OtherRows';
import { useSurfaces, useSystemInfo } from '../../data/useSystem';
import { useRelations } from '../../data/useRelations';
import { relationView } from '../../domain/relations.js';

// Both scopes share one surfaces cache, so the scope being left closes at once
// instead of animating out while showing the new scope's surfaces.
const COLLAPSE = { enter: 200, exit: 0 };

/**
 * @param {Object} props
 * @param {Object|null} props.selected the selected node ({id, kind, …}).
 * @param {(node: Object|null) => void} props.onSelect called after any unsaved edits were confirmed away.
 * @param {(group: Object) => void} props.onNewAgent "+" on the Agents group.
 * @param {(group: Object) => void} props.onCreate "+" on any other group that can hold new files.
 */
export function ScopeNavigator({ selected, onSelect, onNewAgent, onCreate }) {
  const selectedId = selected?.id;
  const treeRef = useRef(null);
  const surfaces = useSurfaces();
  // An Other row (a file outside this scope) is opened from an agent: the agent stays the
  // anchor, so its connections and the Other rows stay while the file is edited.
  const [anchor, setAnchor] = useState(null);
  useEffect(() => { if (selected && !selected.id.startsWith('other:')) setAnchor(selected); }, [selected]);
  const source = selected?.id.startsWith('other:') ? anchor : selected;
  const relations = useRelations(source);
  const view = relationView(surfaces.data?.nodes, source?.id, relations.data);
  const targets = [
    ...[...view.linked].map(([id, l]) => ({ id, inherited: l.inherited || l.unused, context: l.context, mcp: id.startsWith('mcpserver:') })),
    ...view.other.map((o, i) => ({ id: otherId(i), inherited: !!o.unused, context: o.context, mcp: o.label.startsWith('MCP server ') })),
  ];
  const ws = useWorkspace();
  const confirmLeave = useConfirmLeave();
  const confirm = useConfirm();
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useNavWidth();
  const { data: info } = useSystemInfo();
  const [adding, setAdding] = useState(false);

  // The active scope can be collapsed without switching; `collapseAll` also
  // folds every group inside it (SurfaceTree resets when the counter changes).
  const [scopeOpen, setScopeOpen] = useState(true);
  const [collapseAll, setCollapseAll] = useState(0);
  const openScope = async (path) => {
    const active = path ? ws.isWorkspaceMode && ws.activeWorkspace === path : !ws.isWorkspaceMode;
    if (active) { setScopeOpen((o) => !o); return; }
    if (!await confirmLeave()) return;
    onSelect(null);
    await (path ? ws.switchToWorkspace(path) : ws.switchToGlobal());
    setScopeOpen(true);
  };
  const foldEverything = () => { setScopeOpen(false); setCollapseAll((n) => n + 1); };
  // Home: back to how the app opens (Global, expanded, groups closed, nothing
  // selected, default width). Unsaved edits are confirmed first; cancelling changes nothing.
  const [homeKey, setHomeKey] = useState(0);
  const goHome = async () => {
    if (!await confirmLeave()) return;
    onSelect(null);
    if (ws.isWorkspaceMode) await ws.switchToGlobal();
    setScopeOpen(true);
    setWidth(NAV_DEFAULT);
    setHomeKey((n) => n + 1);
    treeRef.current?.scrollTo({ top: 0 });
  };
  const select = async (node) => {
    // Within one power or spec (its page or its files) the editor stays and keeps its edits; a click shows that file again.
    if (folderOf(node.id) && folderOf(node.id) === folderOf(selectedId)) { onSelect({ ...node }); return; }
    if (node.id !== selectedId && await confirmLeave()) onSelect(node);
  };
  const forget = async (w) => {
    if (!await confirm({ title: `Remove ${w.name} from Workspaces?`, body: 'The folder and its .kiro settings stay on disk. You can add it again at any time.', confirmLabel: 'Remove' })) return;
    if (ws.activeWorkspace === w.path && !await confirmLeave()) return;
    if (ws.activeWorkspace === w.path) onSelect(null);
    await ws.removeWorkspace(w.path);
  };
  const tree = <SurfaceTree key={homeKey} depth={1} selectedId={selectedId} onSelect={select} view={view} collapseAll={collapseAll}
    onCreate={(group) => (group.kind === 'agents' ? onNewAgent(group) : onCreate(group))} />;

  if (collapsed) {
    return (
      <Box sx={{ width: 44, flexShrink: 0, borderRight: `1px solid ${SURFACE.border}`, pt: 1, display: 'flex', justifyContent: 'center' }}>
        <Tooltip title="Show navigator" placement="right"><IconButton size="small" onClick={() => setCollapsed(false)}><ChevronRight fontSize="small" /></IconButton></Tooltip>
      </Box>
    );
  }

  return (
    <Box component="nav" sx={{ width, flexShrink: 0, borderRight: `1px solid ${SURFACE.border}`, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
      <NavResizer width={width} onWidth={setWidth} />
      <Box sx={{ px: 1, pt: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <Tooltip title="Home"><IconButton size="small" aria-label="Home" onClick={goHome}><Home fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Collapse all"><IconButton size="small" onClick={foldEverything}><UnfoldLess fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Hide navigator"><IconButton size="small" onClick={() => setCollapsed(true)}><ChevronLeft fontSize="small" /></IconButton></Tooltip>
      </Box>
      <Box role="tree" ref={treeRef} sx={{ flexGrow: 1, overflow: 'auto', px: 0.5, pb: 1, position: 'relative' }}>
        {view.active && <RelationLines containerRef={treeRef} anchorIds={[source?.id, view.selectedGroup].filter(Boolean)} targets={targets} />}
        <NavRow depth={0} expandable open={!ws.isWorkspaceMode && scopeOpen} selected={!ws.isWorkspaceMode}
          icon={<Public sx={{ fontSize: 18, color: ACCENT }} />} label="Global" sub="~/.kiro" title={info?.globalPath} onClick={() => openScope('')} />
        <Collapse in={!ws.isWorkspaceMode && scopeOpen} unmountOnExit timeout={COLLAPSE}>{tree}</Collapse>

        <Typography variant="overline" sx={{ display: 'block', px: 1.5, mt: 1.5, color: 'text.secondary' }}>Workspaces</Typography>
        {!ws.workspaces.length && (
          <Typography variant="caption" sx={{ display: 'block', px: 2, color: 'text.secondary' }}>No workspaces yet. Add a project folder below.</Typography>
        )}
        {ws.workspaces.map((w) => {
          const active = ws.isWorkspaceMode && ws.activeWorkspace === w.path;
          return (
            <Box key={w.path}>
              <NavRow depth={0} expandable={w.exists} open={active && scopeOpen} selected={active} dim={!w.exists}
                icon={w.exists ? <FolderSpecial sx={{ fontSize: 18, color: active ? ACCENT : 'text.secondary' }} />
                  : <Tooltip title="This folder was moved or deleted. Restore it, or remove it from the list."><WarningAmber sx={{ fontSize: 18 }} color="warning" /></Tooltip>}
                label={w.name} sub={w.path} title={w.path} onClick={() => w.exists && openScope(w.path)}
                action={<Tooltip title="Remove from Workspaces"><IconButton size="small" onClick={() => forget(w)}><Close sx={{ fontSize: 16 }} /></IconButton></Tooltip>}
              />
              <Collapse in={active && scopeOpen} unmountOnExit timeout={COLLAPSE}>{tree}</Collapse>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ p: 1.5, borderTop: `1px solid ${SURFACE.border}` }}>
        <Button fullWidth variant="outlined" startIcon={<Add />} onClick={() => setAdding(true)}>Add workspace</Button>
      </Box>
      <AddWorkspaceDialog open={adding} onClose={() => setAdding(false)}
        onAdded={async (path) => { setAdding(false); if (!await confirmLeave()) return; onSelect(null); await ws.switchToWorkspace(path); setScopeOpen(true); }} />
    </Box>
  );
}

/** The power or spec a navigator id belongs to (power:x, powerfile:x/…, the same for your own powers, spec:x, specfile:x/…), or ''. */
function folderOf(id) {
  const m = /^(power|powersource|spec)(?:file)?:([^/]+)/.exec(id || '');
  return m ? `${m[1]}:${m[2]}` : '';
}
