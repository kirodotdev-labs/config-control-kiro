/**
 * @fileoverview Main application layout with responsive sidebar navigation and theme toggle.
 */
import React, { useState, useEffect } from 'react';
import {
  AppBar, Box, CssBaseline, Drawer, IconButton, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Toolbar, Typography, useTheme, useMediaQuery,
  Switch, FormControlLabel, Tooltip, Button
} from '@mui/material';
import {
  Menu as MenuIcon, SmartToy as AgentsIcon, Storage as MCPIcon,
  ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  LightMode as LightModeIcon, DarkMode as DarkModeIcon,
  Navigation as SteeringIcon, School as SkillsIcon,
  NewReleases as ChangelogIcon, FolderSpecial as WorkspacesIcon, Public as GlobalIcon
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { FEATURES } from '../../config/features';
import { checkForUpdate } from '../../services/api';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import UnsavedChangesDialog from '../common/UnsavedChangesDialog';

const MultiColorDashboardIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24">
    <rect x="3" y="3" width="8" height="8" rx="1" fill="#1976d2" />
    <rect x="13" y="3" width="8" height="8" rx="1" fill="#2e7d32" />
    <rect x="3" y="13" width="8" height="8" rx="1" fill="#ed6c02" />
    <rect x="13" y="13" width="8" height="8" rx="1" fill="#d32f2f" />
  </svg>
);

const drawerWidthExpanded = 240;
const drawerWidthCollapsed = 64;

const allMenuItems = [
  { text: 'Dashboard', icon: <MultiColorDashboardIcon />, path: '/', color: '#1976d2' },
  { text: 'Workspaces', icon: <WorkspacesIcon />, path: '/workspaces', color: '#00897b' },
  { text: 'Agents', icon: <AgentsIcon />, path: '/agents', feature: 'AGENTS', color: '#9c27b0' },
  { text: 'MCP', icon: <MCPIcon />, path: '/mcp', feature: 'MCP', color: '#d32f2f' },
  { text: 'Steering', icon: <SteeringIcon />, path: '/steering', color: '#0288d1' },
  { text: 'Skills', icon: <SkillsIcon />, path: '/skills', color: '#fbc02d' },
  { text: 'Changelog', icon: <ChangelogIcon />, path: '/changelog', color: '#7c3aed' },
];

const menuItems = allMenuItems.filter(item => !item.feature || FEATURES[item.feature]);

function Layout({ children, darkMode, setDarkMode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { getGuard } = useUnsavedChanges();
  const { isWorkspaceMode } = useWorkspace();
  const [pendingPath, setPendingPath] = useState(null);
  const [versionInfo, setVersionInfo] = useState({ current: '', latest: '', updateAvailable: false, releaseURL: '' });

  useEffect(() => {
    checkForUpdate().then(setVersionInfo).catch(() => {});
  }, []);

  const getPageInfo = () => {
    const currentPage = menuItems.find(item => item.path === location.pathname);
    const pageName = currentPage?.text || 'Dashboard';
    let description = '';
    if (location.pathname === '/' || location.pathname === '') {
      description = 'Configuration view, global, workspace or both status, feature adoption, and setup progress across agents, MCP servers, steering, and skills';
    } else if (location.pathname === '/mcp') {
      description = 'Configure, test, and manage Model Context Protocol servers';
    } else if (location.pathname === '/agents') {
      description = 'Configure, test, and manage Kiro CLI custom agents for specialized workflows';
    } else if (location.pathname === '/steering') {
      description = 'Create, edit, import and organize steering files';
    } else if (location.pathname === '/skills') {
      description = 'Create, edit, import and organize agent skills';
    } else if (location.pathname === '/changelog') {
      description = 'Kiro CLI release history and patch notes';
    } else if (location.pathname === '/workspaces') {
      description = 'Create, copy, move, and manage workspace configurations';
    }
    return { pageName, description };
  };

  const { pageName, description } = getPageInfo();
  const drawerWidth = expanded ? drawerWidthExpanded : drawerWidthCollapsed;

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleExpandToggle = () => setExpanded(!expanded);

  const handleMenuItemClick = (item) => {
    if (!item.path || item.path === location.pathname) return;
    const guard = getGuard();
    if (guard && guard.isDirty) {
      setPendingPath(item.path);
      return;
    }
    navigate(item.path);
    if (isMobile) setMobileOpen(false);
  };

  const handleDialogSave = async () => {
    const guard = getGuard();
    if (guard) await guard.save();
    const path = pendingPath;
    setPendingPath(null);
    navigate(path);
  };

  const handleDialogDiscard = () => {
    const path = pendingPath;
    setPendingPath(null);
    navigate(path);
  };

  const handleDialogCancel = () => {
    setPendingPath(null);
  };

  const kiroPurple = '#7B61FF';
  const kiroMagenta = '#E91E8C';

  const drawer = (
    <div>
      <Toolbar sx={{ justifyContent: 'center', minHeight: 'auto !important', pt: 2, pb: 1 }}>
        {!expanded ? (
          <Typography sx={{ color: kiroPurple, fontWeight: 800, fontSize: '1rem' }}>CC</Typography>
        ) : (
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontFamily: 'Poppins', color: kiroPurple, fontWeight: 300, fontSize: '0.95rem', lineHeight: 1.3 }}>Config Control</Typography>
            <Typography sx={{ fontFamily: 'Poppins', color: kiroPurple, fontWeight: 300, fontSize: '0.7rem', lineHeight: 1.2 }}>for</Typography>
            <Typography sx={{ fontFamily: 'Nunito', color: kiroPurple, fontWeight: 800, fontSize: '1.5rem', letterSpacing: 4, lineHeight: 1.3 }}>KIRO</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.7rem', mt: 0.5 }}>
              {versionInfo.current ? `v${versionInfo.current}` : ''}
            </Typography>
            <Button
              size="small"
              disabled={!versionInfo.updateAvailable}
              onClick={() => versionInfo.releaseURL && window.open(versionInfo.releaseURL, '_blank')}
              sx={{
                mt: 0.5, fontSize: '0.65rem', textTransform: 'none', px: 1.5, py: 0.25, borderRadius: 2, minWidth: 'auto',
                bgcolor: versionInfo.updateAvailable ? kiroMagenta : 'action.disabledBackground',
                color: versionInfo.updateAvailable ? '#fff' : 'text.disabled',
                '&:hover': { bgcolor: versionInfo.updateAvailable ? '#C4187A' : undefined },
                '&.Mui-disabled': { color: 'text.disabled' }
              }}
            >
              {versionInfo.updateAvailable ? 'Update Available' : 'Up to Date'}
            </Button>
          </Box>
        )}
      </Toolbar>

      {expanded && (
        <Box sx={{ px: 2, py: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                  icon={<LightModeIcon sx={{ fontSize: 22, color: '#ffa726' }} />}
                  checkedIcon={<DarkModeIcon sx={{ fontSize: 22, color: '#90caf9' }} />}
                  sx={{ '& .MuiSwitch-switchBase': { padding: '10px' }, '& .MuiSwitch-track': { borderRadius: 20 } }}
                />
              }
              label={darkMode ? 'Dark' : 'Light'}
              sx={{ display: 'flex', alignItems: 'center', '& .MuiFormControlLabel-label': { fontSize: '1rem', fontWeight: 500 } }}
            />
          </Box>
        </Box>
      )}

      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <Tooltip title={!expanded ? (item.text === 'Workspaces' ? (isWorkspaceMode ? 'Workspaces' : 'Global') : item.text) : ''} placement="right">
              <ListItemButton
                selected={item.path ? location.pathname === item.path : false}
                onClick={() => handleMenuItemClick(item)}
                sx={{ justifyContent: expanded ? 'initial' : 'center', px: expanded ? 2 : 1.5 }}
              >
                <ListItemIcon sx={{ minWidth: expanded ? 56 : 'auto', justifyContent: 'center' }}>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${item.color}20`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease', '&:hover': { bgcolor: `${item.color}30`, transform: 'scale(1.1)' } }}>
                    {item.text === 'Workspaces' ? (isWorkspaceMode ? <WorkspacesIcon /> : <GlobalIcon />) : item.icon}
                  </Box>
                </ListItemIcon>
                {expanded && <ListItemText primary={item.text === 'Workspaces' ? (isWorkspaceMode ? 'Workspaces' : 'Global') : item.text} />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}

        {!expanded && !isMobile && (
          <ListItem disablePadding>
            <Tooltip title={darkMode ? 'Switch to Light' : 'Switch to Dark'} placement="right">
              <ListItemButton onClick={() => setDarkMode(!darkMode)} sx={{ justifyContent: 'center', px: 1.5 }}>
                <ListItemIcon sx={{ minWidth: 'auto', justifyContent: 'center' }}>
                  {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
                </ListItemIcon>
              </ListItemButton>
            </Tooltip>
          </ListItem>
        )}

        {!isMobile && (
          <ListItem disablePadding sx={{ borderTop: '1px solid rgba(255,255,255,0.1)', mt: 1 }}>
            <Tooltip title={expanded ? 'Collapse sidebar' : 'Expand sidebar'} placement="right">
              <ListItemButton onClick={handleExpandToggle} sx={{ justifyContent: expanded ? 'initial' : 'center', px: expanded ? 2 : 1.5, backgroundColor: 'rgba(255,255,255,0.05)', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
                <ListItemIcon sx={{ minWidth: expanded ? 56 : 'auto', justifyContent: 'center' }}>
                  {expanded ? <ChevronLeftIcon /> : <ChevronRightIcon />}
                </ListItemIcon>
              </ListItemButton>
            </Tooltip>
          </ListItem>
        )}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ width: { md: `calc(100% - ${drawerWidth}px)` }, ml: { md: `${drawerWidth}px` } }}>
        <Toolbar>
          <IconButton color="inherit" aria-label="open drawer" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2, display: { md: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" noWrap component="div">{pageName}</Typography>
            {description && <Typography variant="body2" sx={{ opacity: 0.8 }}>{description}</Typography>}
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={handleDrawerToggle} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidthExpanded } }}>
          {drawer}
        </Drawer>
        <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, transition: theme.transitions.create('width', { easing: theme.transitions.easing.sharp, duration: theme.transitions.duration.enteringScreen }), overflowX: 'hidden' } }} open>
          {drawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: location.pathname === '/terminal' ? 0 : 3, width: { md: `calc(100% - ${drawerWidth}px)` }, mt: 8, height: 'calc(100vh - 64px)', overflow: location.pathname === '/terminal' ? 'hidden' : 'auto' }}>
        {children}
      </Box>

      <UnsavedChangesDialog
        open={pendingPath !== null}
        onSave={handleDialogSave}
        onDiscard={handleDialogDiscard}
        onCancel={handleDialogCancel}
      />
    </Box>
  );
}

export default Layout;
