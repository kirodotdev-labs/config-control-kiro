/**
 * @fileoverview API service layer. Provides axios instance and exported functions for all backend endpoints.
 */
import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    config.params = { ...config.params, _t: Date.now() };
    const token = window.__CCKIRO_TOKEN__;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor with retry logic
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Retry logic for network errors
    if (!originalRequest._retry && error.code === 'NETWORK_ERROR') {
      originalRequest._retry = true;
      
      // Wait 1 second before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        return await api(originalRequest);
      } catch (retryError) {
        // Retry failed, fall through to error handling
      }
    }
    
    // Standardize error format
    const standardError = {
      message: error.response?.data?.error || error.response?.data?.message || error.message || 'An error occurred',
      status: error.response?.status || 0,
      code: error.response?.data?.code || error.code || 'UNKNOWN_ERROR',
      originalError: error
    };
    
    return Promise.reject(error);
  }
);

/** @returns {Promise<Object>} System information */
export const getSystemInfo = async () => {
  const response = await api.get('/system/info');
  return response.data;
};

/** @returns {Promise<Object>} Current and latest version info */
export const checkForUpdate = async () => {
  const response = await api.get('/system/version');
  return response.data;
};

/** @returns {Promise<Object>} Kiro service status */
export const getKiroStatus = async () => {
  const response = await api.get('/kiro/status');
  return response.data;
};

/** @returns {Promise<Object>} Dashboard setup status */
export const getSetupStatus = async () => {
  const response = await api.get('/dashboard/setup-status');
  return response.data;
};

/** @type {Object} MCP configuration and tools service */
export const mcpService = {
  getAllMCPServers: async () => {
    const response = await api.get('/mcp/servers');
    return response.data;
  },
  
  getConfig: async () => {
    const response = await api.get('/mcp/config');
    return response;
  },
  
  saveConfig: async (config) => {
    const response = await api.post('/mcp/config', { 
      config
    });
    return response.data;
  },

  getTools: async () => {
    const response = await api.get('/mcp/tools');
    return response;
  },

  getAgentTools: async (mcpServers) => {
    const response = await api.post('/mcp/tools/agent', { mcpServers }, { timeout: 30000 });
    return response;
  }
};

/** @type {Object} Agent CRUD and configuration service */
export const agentService = {
  getAllAgents: async () => {
    const response = await api.get('/agents');
    return response.data;
  },

  getAllAgentNames: async () => {
    const response = await api.get('/agents/all-names');
    return response.data;
  },

  getAgent: async (name) => {
    const response = await api.get(`/agents/${name}`);
    return response.data;
  },

  createAgent: async (agentData) => {
    const response = await api.post('/agents', agentData);
    return response.data;
  },

  updateAgent: async (name, agentData) => {
    const response = await api.put(`/agents/${name}`, agentData);
    return response.data;
  },

  deleteAgent: async (name) => {
    const response = await api.delete(`/agents/${name}`);
    return response.data;
  },

  getConfig: async () => {
    const response = await api.get('/agents/config');
    return response;
  },
  
  saveConfig: async (config) => {
    const response = await api.post('/agents/config', { config });
    return response.data;
  }
};

/**
 * @param {string} scope - 'global' or workspace scope
 * @returns {Promise<Object>} Dashboard counts
 */
export const getDashboardCounts = async (scope = 'global') => {
  const response = await api.get('/dashboard/counts', { params: { scope } });
  return response.data;
};

/** @returns {Promise<Object>} Changelog entries */
export const getChangelog = async () => {
  const response = await api.get('/changelog');
  return response.data;
};

/** @type {Object} Workspace context and management service */
export const workspaceService = {
  getContext: async () => {
    const response = await api.get('/workspace/context');
    return response.data;
  },
  setContext: async (mode, path = '') => {
    const response = await api.post('/workspace/context', { mode, path });
    return response.data;
  },
  addWorkspace: async (path) => {
    const response = await api.post('/workspace/add', { path });
    return response.data;
  },
  addExistingWorkspace: async (path) => {
    const response = await api.post('/workspace/add-existing', { path });
    return response.data;
  },
  removeWorkspace: async (path) => {
    const response = await api.post('/workspace/remove', { path });
    return response.data;
  },
  listWorkspaces: async () => {
    const response = await api.get('/workspace/list');
    return response.data;
  },
  deleteWorkspace: async (path) => {
    const response = await api.post('/workspace/delete', { path });
    return response.data;
  },
  copyWorkspace: async (source, dest) => {
    const response = await api.post('/workspace/copy', { source, dest });
    return response.data;
  },
};

/** Wraps native fetch with the auth token header for code that can't use the axios instance. */
export const fetchWithAuth = (url, options = {}) => {
  const token = window.__CCKIRO_TOKEN__;
  return fetch(url, {
    ...options,
    headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
};

/**
 * Resolve and validate a user-provided path. Accepts Linux, macOS, and
 * Windows-style paths and returns whether it exists, the resolved
 * filesystem location, the parent directory, and a user-friendly error
 * message when validation fails.
 *
 * @param {string} path - Raw path string, may be in any common OS format
 * @returns {Promise<{valid: boolean, exists: boolean, type: string, resolvedPath: string, parentPath: string, error: string}>}
 */
export const resolvePath = async (path) => {
  const response = await api.post('/fileexplorer/resolve-path', { path });
  return response.data;
};

/** @returns {Promise<Object>} Kiro CLI usage summary for the given window */
export const getPerformanceSummary = async (window = '24h') => {
  const response = await api.get('/performance/summary', { params: { window } });
  return response.data;
};

/** @returns {Promise<Object>} Recent Kiro CLI assistant turns, newest first */
export const getPerformanceRecent = async (window = '24h', limit = 200) => {
  const response = await api.get('/performance/recent', { params: { window, limit } });
  return response.data;
};

/** @returns {Promise<Object>} Plan and credits snapshot via kiro-cli /usage */
export const getKiroUsage = async () => {
  const response = await api.get('/performance/kiro-usage');
  return response.data;
};

export default api;
