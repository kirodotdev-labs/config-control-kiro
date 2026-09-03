/**
 * @fileoverview Dashboard page displaying system status, setup progress, and summary counts.
 */
import React, { useState, useEffect } from 'react';
import { Box, Grid, Card, CardContent, Typography, LinearProgress, Chip, Button, Paper, Collapse, List, ListItem, ListItemText, ListItemIcon, IconButton, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useQuery, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  SmartToy,
  Storage,
  CheckCircle,
  Settings,
  Speed,
  Folder,
  Code,
  School,
  Navigation,
  FolderSpecial,
  ArrowForward,
  ExpandMore,
  ExpandLess,
  Build as ToolIcon,
  Webhook as HookIcon,
  Http as HttpIcon,
  RadioButtonChecked as ActiveIcon,
  RadioButtonUnchecked as InactiveIcon,
  Public as GlobeIcon,
  FolderSpecial as WorkspaceIcon,
  MergeType as BothIcon
} from '@mui/icons-material';
import { getSetupStatus, getSystemInfo, getKiroStatus, getDashboardCounts, getChangelog } from '../../services/api';
import LaunchDialog from '../../components/Launcher/LaunchDialog';
import PerformanceSection from '../../components/Performance/PerformanceSection';

import { useWorkspace } from '../../contexts/WorkspaceContext';

// Animated stat card component
const StatCard = ({ title, value, subtitle, icon: Icon, color, trend, valueSize = 'h3' }) => (
  <Card
    sx={{
      background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
      border: `1px solid ${color}30`,
      transition: 'all 0.3s ease',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: `0 8px 24px ${color}20`,
      },
    }}
  >
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom fontWeight={600}>
            {title}
          </Typography>
          <Typography variant={valueSize} fontWeight="bold" sx={{ color, mb: 0.5 }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: `${color}20`,
            color,
          }}
        >
          <Icon sx={{ fontSize: 32 }} />
        </Box>
      </Box>
      {trend && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
          <TrendingUp sx={{ fontSize: 16, color: 'success.main' }} />
          <Typography variant="caption" color="success.main">
            {trend}
          </Typography>
        </Box>
      )}
    </CardContent>
  </Card>
);

// Progress ring component
const ProgressRing = ({ percentage, size = 120, strokeWidth = 8 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="rainbowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9c27b0" />
            <stop offset="25%" stopColor="#d32f2f" />
            <stop offset="50%" stopColor="#0288d1" />
            <stop offset="75%" stopColor="#fbc02d" />
            <stop offset="100%" stopColor="#3f51b5" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#rainbowGradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: 'stroke-dashoffset 1s ease',
          }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          {percentage}%
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Complete
        </Typography>
      </Box>
    </Box>
  );
};

// Quick action card
const QuickActionCard = ({ title, description, icon: Icon, color, onClick }) => (
  <Card
    sx={{
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      border: '1px solid',
      borderColor: 'divider',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: 4,
        borderColor: color,
      },
    }}
    onClick={onClick}
  >
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: `${color}20`,
            color,
          }}
        >
          <Icon />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        </Box>
        <ArrowForward sx={{ color: 'text.secondary' }} />
      </Box>
    </CardContent>
  </Card>
);

function Dashboard() {
  const navigate = useNavigate();
  const [expandedAgents, setExpandedAgents] = useState(false);
  const [expandedMcp, setExpandedMcp] = useState(false);
  const [expandedSetup, setExpandedSetup] = useState(false);
  const [dashView, setDashView] = useState('global');
  const { isWorkspaceMode, activeWorkspace, configPath } = useWorkspace();
  
  const queryClient = useQueryClient();
  
  // Sync dashView with workspace mode
  useEffect(() => {
    setDashView(isWorkspaceMode ? 'workspace' : 'global');
  }, [isWorkspaceMode]);

  // Refetch data when context changes
  useEffect(() => {
    queryClient.invalidateQueries('setupStatus');
    queryClient.invalidateQueries('dashboardCounts');
  }, [configPath]);
  
  const { data: setupData, isLoading: setupLoading } = useQuery(['setupStatus', configPath], getSetupStatus);
  const { data: systemInfo } = useQuery('systemInfo', getSystemInfo);
  const { data: kiroStatus } = useQuery('kiroStatus', getKiroStatus);
  const { data: dashCounts, isLoading: dashLoading } = useQuery(['dashboardCounts', dashView], () => getDashboardCounts(dashView));
  const { data: changelogData } = useQuery('changelog', getChangelog, { staleTime: 5 * 60 * 1000 });
  const [updateDialog, setUpdateDialog] = useState(false);

  const currentVersion = kiroStatus?.version?.replace('kiro-cli ', '') || '';
  const latestVersion = changelogData?.latestAvailable || '';
  const isUpToDate = !changelogData?.updateAvailable;

  const isLoading = setupLoading || dashLoading;

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
      </Box>
    );
  }

  const { progress: setupProgress = {}, counts: setupCounts = {}, setup: setupChecks = {} } = setupData || {};

  // Use dashboard-scoped data when available
  const scopedCounts = dashCounts
    ? (dashCounts.combined || dashCounts.workspace || dashCounts.global || {})
    : {};
  const counts = Object.keys(scopedCounts).length > 0 ? scopedCounts : setupCounts;
  const agents = dashCounts?.agents || [];
  const mcpServers = dashCounts?.mcpServers || [];
  const setup = dashCounts?.setup || setupChecks;
  const progress = dashCounts?.setup?.progress || setupProgress;

  // Calculate totals from counts (already calculated in backend)
  const totalHooks = counts.totalHooks || 0;
  
  return (
    <Box sx={{ p: 3 }}>

      {/* Dashboard View Toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
        <ToggleButtonGroup
          value={dashView}
          exclusive
          onChange={(e, val) => { if (val) setDashView(val); }}
          size="small"
        >
          <ToggleButton value="global" sx={{ px: 3 }}>
            <GlobeIcon sx={{ mr: 1, fontSize: 20 }} /> Global
          </ToggleButton>
          <ToggleButton value="workspace" disabled={!isWorkspaceMode} sx={{ px: 3 }}>
            <WorkspaceIcon sx={{ mr: 1, fontSize: 20 }} /> Workspace
          </ToggleButton>
          <ToggleButton value="both" disabled={!isWorkspaceMode} sx={{ px: 3 }}>
            <BothIcon sx={{ mr: 1, fontSize: 20 }} /> Both
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {dashView !== 'global' && isWorkspaceMode && (
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Chip label={activeWorkspace} size="small" variant="outlined" color="warning" />
        </Box>
      )}

      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Agents"
            value={counts.agents || 0}
            subtitle={
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {counts.totalTools || 0} tools • {counts.totalResources || 0} resources
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {counts.totalHooks || 0} hooks • {counts.steeringFiles || 0} steering files
                </Typography>
              </Box>
            }
            icon={SmartToy}
            color="#9c27b0"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="MCP Servers"
            value={counts.mcpServers || 0}
            subtitle={
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {mcpServers?.filter(s => s.enabled !== false).length || 0} enabled • {mcpServers?.filter(s => s.enabled === false).length || 0} disabled
                </Typography>
              </Box>
            }
            icon={Storage}
            color="#d32f2f"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Steering"
            value={counts.steeringFiles || 0}
            subtitle={counts.steeringFiles > 0 ? `${counts.steeringFiles} steering files` : "No steering files"}
            icon={Navigation}
            color="#0288d1"
            valueSize="h4"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Skills"
            value={counts.skillFolders || 0}
            subtitle={counts.skillFolders > 0 ? `${counts.skillFolders} active skills` : "No skills"}
            icon={School}
            color="#fbc02d"
            valueSize="h4"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Workspaces"
            value={counts.workspaces || 0}
            subtitle={counts.workspaces > 0 ? `${counts.workspaces} project workspaces` : "No workspaces — using global"}
            icon={FolderSpecial}
            color="#00897b"
            valueSize="h4"
          />
        </Grid>
      </Grid>

      {/* Setup Progress & Active Profile */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Setup Progress */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">
                  Features Utilized
                </Typography>
                <IconButton onClick={() => setExpandedSetup(!expandedSetup)} size="small">
                  {expandedSetup ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
                <ProgressRing percentage={progress.percentage || 0} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {progress.completed || 0} of {progress.total || 0} steps completed
                </Typography>
                <Chip
                  label={progress.percentage === 100 ? 'Complete' : 'In Progress'}
                  size="small"
                  color={progress.percentage === 100 ? 'success' : 'warning'}
                />
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress.percentage || 0}
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  background: '#e0e0e0',
                  '& .MuiLinearProgress-bar': {
                    background: 'linear-gradient(90deg, #9c27b0 0%, #d32f2f 25%, #0288d1 50%, #fbc02d 75%, #3f51b5 100%)',
                    borderRadius: 4,
                  }
                }}
              />
              
              <Collapse in={expandedSetup}>
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                    Feature Adoption Checklist
                  </Typography>
                  <List dense>
                    {/* Agents */}
                    <ListItem sx={{ pt: 1 }}><Typography variant="caption" fontWeight={700} color="primary">AGENTS</Typography></ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.hasAgents ? <CheckCircle color="success" /> : <SmartToy color="warning" />}</ListItemIcon>
                      <ListItemText primary="Create an Agent" secondary="Set up your first AI agent" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasDescription ? <CheckCircle color="success" /> : <Code color="warning" />}</ListItemIcon>
                      <ListItemText primary="Add Description" secondary="Describe what an agent does" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasPrompt ? <CheckCircle color="success" /> : <Code color="warning" />}</ListItemIcon>
                      <ListItemText primary="Set a Prompt" secondary="Add a system prompt to an agent" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasModel ? <CheckCircle color="success" /> : <Code color="warning" />}</ListItemIcon>
                      <ListItemText primary="Choose a Model" secondary="Set a model on an agent" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasTools ? <CheckCircle color="success" /> : <Settings color="warning" />}</ListItemIcon>
                      <ListItemText primary="Add Tools" secondary="Give an agent access to tools" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasAllowedTools ? <CheckCircle color="success" /> : <Settings color="warning" />}</ListItemIcon>
                      <ListItemText primary="Pre-approve Tools" secondary="Configure allowedTools for auto-approval" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasToolAliases ? <CheckCircle color="success" /> : <Settings color="warning" />}</ListItemIcon>
                      <ListItemText primary="Set Tool Aliases" secondary="Remap tool names to avoid collisions" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasToolsSettings ? <CheckCircle color="success" /> : <Settings color="warning" />}</ListItemIcon>
                      <ListItemText primary="Configure Tool Settings" secondary="Add toolsSettings for specific tools" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasSubagents ? <CheckCircle color="success" /> : <Settings color="warning" />}</ListItemIcon>
                      <ListItemText primary="Configure Subagents" secondary="Set up available or trusted subagents" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasWelcomeMsg ? <CheckCircle color="success" /> : <Code color="warning" />}</ListItemIcon>
                      <ListItemText primary="Add Welcome Message" secondary="Set a message shown on agent switch" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasShortcut ? <CheckCircle color="success" /> : <Code color="warning" />}</ListItemIcon>
                      <ListItemText primary="Set Keyboard Shortcut" secondary="Assign a shortcut to switch agents" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasResources ? <CheckCircle color="success" /> : <Folder color="warning" />}</ListItemIcon>
                      <ListItemText primary="Add File Resources" secondary="Give an agent access to files" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasSteering ? <CheckCircle color="success" /> : <Navigation color="warning" />}</ListItemIcon>
                      <ListItemText primary="Enable Steering on Agent" secondary="Add steering resource to an agent" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasSkillRes ? <CheckCircle color="success" /> : <School color="warning" />}</ListItemIcon>
                      <ListItemText primary="Enable Skills on Agent" secondary="Add skill resource to an agent" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasHooks ? <CheckCircle color="success" /> : <Code color="warning" />}</ListItemIcon>
                      <ListItemText primary="Add Hooks" secondary="Configure lifecycle hooks on an agent" />
                    </ListItem>

                    {/* MCP */}
                    <ListItem sx={{ pt: 1 }}><Typography variant="caption" fontWeight={700} color="primary">MCP SERVERS</Typography></ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.hasMcpServers ? <CheckCircle color="success" /> : <Storage color="warning" />}</ListItemIcon>
                      <ListItemText primary="Add MCP Server" secondary="Configure at least one MCP server" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.hasEnabledMcp ? <CheckCircle color="success" /> : <Storage color="warning" />}</ListItemIcon>
                      <ListItemText primary="Enable MCP Server" secondary="Activate at least one MCP server" />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.agentHasIncludeMcp ? <CheckCircle color="success" /> : <Storage color="warning" />}</ListItemIcon>
                      <ListItemText primary="Include MCP JSON" secondary="Enable includeMcpJson on an agent" />
                    </ListItem>

                    {/* Steering */}
                    <ListItem sx={{ pt: 1 }}><Typography variant="caption" fontWeight={700} color="primary">STEERING</Typography></ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.hasSteeringFiles ? <CheckCircle color="success" /> : <Navigation color="warning" />}</ListItemIcon>
                      <ListItemText primary="Add Steering Files" secondary="Create at least one steering file" />
                    </ListItem>

                    {/* Skills */}
                    <ListItem sx={{ pt: 1 }}><Typography variant="caption" fontWeight={700} color="primary">SKILLS</Typography></ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.hasSkills ? <CheckCircle color="success" /> : <School color="warning" />}</ListItemIcon>
                      <ListItemText primary="Add Skills" secondary="Create at least one agent skill" />
                    </ListItem>

                    {/* Workspaces */}
                    <ListItem sx={{ pt: 1 }}><Typography variant="caption" fontWeight={700} color="primary">WORKSPACES</Typography></ListItem>
                    <ListItem>
                      <ListItemIcon>{setup.hasWorkspaces ? <CheckCircle color="success" /> : <FolderSpecial color="warning" />}</ListItemIcon>
                      <ListItemText primary="Use Workspaces" secondary="Add a project workspace for per-project configuration" />
                    </ListItem>
                  </List>
                </Box>
              </Collapse>
            </CardContent>
          </Card>
        </Grid>

        {/* System Health / Status */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Health
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="Kiro CLI Status" 
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        {kiroStatus?.installed ? (
                          <>
                            <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
                            <Typography variant="caption">
                              {kiroStatus.configExists ? 'Fully Configured' : 'Needs Configuration'}
                            </Typography>
                          </>
                        ) : (
                          <>
                            <Settings sx={{ fontSize: 16, color: 'warning.main' }} />
                            <Typography variant="caption">Not Installed</Typography>
                          </>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
                {kiroStatus?.version && (
                  <ListItem>
                    <ListItemText 
                      primary="Kiro CLI Version" 
                      secondary={
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                          <Typography variant="caption">Current: <b>v{currentVersion}</b></Typography>
                          {latestVersion && (
                            <Typography variant="caption">Latest: <b>v{latestVersion}</b></Typography>
                          )}
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => setUpdateDialog(true)}
                              sx={{ fontSize: 11 }}
                            >
                              Check for Updates
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => navigate('/changelog')}
                              sx={{ fontSize: 11 }}
                            >
                              Changelog
                            </Button>
                          </Box>
                        </Box>
                      }
                    />
                  </ListItem>
                )}
                {systemInfo && (
                  <>
                    <ListItem>
                      <ListItemText 
                        primary="System" 
                        secondary={`${systemInfo.platform} ${systemInfo.arch}${systemInfo.isWSL ? ' (WSL)' : ''}`}
                      />
                    </ListItem>
                    {systemInfo.kiroPath && (
                      <ListItem>
                        <ListItemText 
                          primary="Kiro Directory" 
                          secondary={
                            <Typography 
                              variant="caption" 
                              sx={{ 
                                fontFamily: 'monospace',
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {systemInfo.kiroPath}
                            </Typography>
                          }
                        />
                      </ListItem>
                    )}
                  </>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Agent Details */}
      <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
        Details
      </Typography>
      <Grid container spacing={3}>
        {/* Agents */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1">
                  Agents ({agents.length})
                </Typography>
                <IconButton onClick={() => setExpandedAgents(!expandedAgents)} size="small">
                  {expandedAgents ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
              </Box>
              
              <Collapse in={expandedAgents}>
                {agents.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      No agents configured
                    </Typography>
                  </Box>
                ) : (
                  <List dense>
                    {agents.map((agent) => (
                      <ListItem
                        key={agent.name}
                        sx={{
                          borderRadius: 1,
                          mb: 1,
                          bgcolor: 'action.hover',
                        }}
                      >
                        <ListItemText
                          primary={
                            <Typography variant="body1" fontWeight={500}>
                              {agent.name}
                            </Typography>
                          }
                          secondary={
                            <Box sx={{ mt: 0.5 }}>
                              {agent.model && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Model: {agent.model}
                                </Typography>
                              )}
                              <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <ToolIcon sx={{ fontSize: 14 }} />
                                  <Typography variant="caption">{agent.tools || 0} tools</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Folder sx={{ fontSize: 14 }} />
                                  <Typography variant="caption">{agent.resources || 0} resources</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <HookIcon sx={{ fontSize: 14 }} />
                                  <Typography variant="caption">{agent.hooks || 0} hooks</Typography>
                                </Box>
                              </Box>
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Collapse>
            </CardContent>
          </Card>
        </Grid>

        {/* MCP Servers */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1">
                  MCP Servers ({mcpServers?.length || 0})
                </Typography>
                <IconButton onClick={() => setExpandedMcp(!expandedMcp)} size="small">
                  {expandedMcp ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
              </Box>
              
              <Collapse in={expandedMcp}>
                {!mcpServers || mcpServers.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      No MCP servers configured
                    </Typography>
                  </Box>
                ) : (
                  <List dense>
                    {mcpServers.map((server) => (
                      <ListItem
                        key={server.name}
                        sx={{
                          borderRadius: 1,
                          mb: 1,
                          bgcolor: 'action.hover',
                        }}
                      >
                        <ListItemText
                          primary={
                            <Typography variant="body1" fontWeight={500}>
                              {server.name}
                            </Typography>
                          }
                          secondary={
                            <Box sx={{ mt: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" display="block">
                                Type: {server.type || 'stdio'}
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
                                {server.enabled !== undefined && (
                                  <Chip 
                                    label={server.enabled ? "Enabled" : "Disabled"} 
                                    size="small" 
                                    color={server.enabled ? "success" : "default"}
                                    sx={{ height: 20 }}
                                  />
                                )}
                              </Box>
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Collapse>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Performance */}
      <Box sx={{ mt: 4 }}>
        <PerformanceSection />
      </Box>

      <LaunchDialog
        open={updateDialog}
        onClose={() => setUpdateDialog(false)}
        command="kiro-cli update"
        title="Update Kiro CLI"
        hideCustomDirectory={true}
      />
    </Box>
  );
}

export default Dashboard;
