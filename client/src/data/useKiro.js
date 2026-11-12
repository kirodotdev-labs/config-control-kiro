/**
 * @fileoverview The user's kiro-cli: connection status, the models their
 * account can use, and the settings kiro-cli knows. Status is re-checked
 * when the window regains focus, so signing in elsewhere is picked up.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kiroApi, powersApi } from '../services/api';
import { keys } from './keys';

/** { level: ok|degraded|down, installed, version, signedIn, account, reachable, features, problem, notes } */
export const useKiroStatus = () =>
  useQuery({ queryKey: keys.kiroStatus, queryFn: () => kiroApi.status(), staleTime: 30 * 1000, refetchOnWindowFocus: true });

/** Re-checks status and models now (after installing, signing in or reconnecting). */
export function useRefreshKiro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => kiroApi.status(true),
    onSuccess: async (status) => {
      qc.setQueryData(keys.kiroStatus, status);
      qc.setQueryData(keys.models, await kiroApi.models(true));
      return qc.invalidateQueries({ queryKey: keys.settingsCatalog });
    },
  });
}

/** Models for the signed-in account: { models, default, problem? }. */
export const useModels = () =>
  useQuery({ queryKey: keys.models, queryFn: () => kiroApi.models(), staleTime: 10 * 60 * 1000 });

/** Settings kiro-cli supports: { settings: [{key, description, type}], problem? }. */
/** Agents that ship with kiro-cli: { agents: [{name, description, default}], default, problem? }. */
export const useBuiltinAgents = (enabled = true) =>
  useQuery({ queryKey: keys.builtinAgents, queryFn: kiroApi.builtinAgents, staleTime: Infinity, enabled });

/** Kiro's estimate of this month's plan usage (account-wide), from /usage. */
export const usePlan = (enabled = true) =>
  useQuery({ queryKey: keys.plan, queryFn: () => kiroApi.plan(false), enabled, staleTime: 5 * 60000, refetchOnWindowFocus: false });

/** Asks Kiro again now. */
export function useRefreshPlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => kiroApi.plan(true), onSuccess: (d) => qc.setQueryData(keys.plan, d) });
}

export const useSettingsCatalog = () =>
  useQuery({ queryKey: keys.settingsCatalog, queryFn: kiroApi.settings, staleTime: Infinity });

/**
 * Why a kiro-cli-backed action can't run now, or '' when it can.
 * @param {Object|undefined} status from useKiroStatus.
 * @param {'chat'|'upgrade'|'powers'|'sessions'} need
 */
export function kiroBlocker(status, need) {
  if (!status) return 'Checking Kiro CLI…';
  if (!status.installed) return 'Kiro CLI isn\'t installed. Install it from kiro.dev/downloads.';
  if (need === 'chat' && !status.features?.v3) return 'This Kiro CLI can\'t start V3 chats. Update it with kiro-cli update.';
  if (need === 'powers' && !status.features?.powers) return 'Managing Powers from this app needs a newer Kiro CLI. Update it with kiro-cli update.';
  if (need === 'powers' && !status.signedIn) return 'Sign in to Kiro first: run kiro-cli login in a terminal, then press Refresh.';
  // 2.x: Kiro's upgrade of 2.x agent configs.
  if (need === 'upgrade' && !status.features?.agentUpgrade) return 'Upgrading agents from this app needs a newer Kiro CLI. Update it with kiro-cli update.';
  return '';
}

/**
 * Installed powers and Kiro's catalog: { installed, catalog, catalogSource, catalogUpdated, catalogProblem }.
 * The catalog is Kiro's published one (the server keeps it an hour), else Kiro's saved copy.
 */
export const usePowers = () => useQuery({ queryKey: keys.powers, queryFn: () => powersApi.list(), staleTime: 0 });

/** Downloads Kiro's catalog again now. */
export function useRefreshPowers() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => powersApi.list(true), onSuccess: (data) => qc.setQueryData(keys.powers, data) });
}

/** Install or uninstall through kiro-cli; the list is replaced with Kiro's new state. */
export function usePowerActions() {
  const qc = useQueryClient();
  const done = (res) => {
    qc.setQueryData(keys.powers, res.powers);
    qc.invalidateQueries({ queryKey: ['power'] });
    qc.invalidateQueries({ queryKey: ['surfaces'] }); // the tree lists installed powers
  };
  const install = useMutation({ mutationFn: powersApi.install, onSuccess: done });
  return {
    install,
    installGitHub: useMutation({ mutationFn: powersApi.installGitHub, onSuccess: done }),
    uninstall: useMutation({ mutationFn: powersApi.uninstall, onSuccess: done }),
    /** Uninstalls name, then installs target (the catalog name or a folder): one refresh, after both. */
    reinstall: useMutation({
      mutationFn: async ({ name, target }) => { await powersApi.uninstall(name); return powersApi.install(target); },
      onSuccess: done,
    }),
  };
}

/** Your own power folders in ~/.kiro/power-sources. */
export const usePowerSources = () => useQuery({ queryKey: keys.powerSources, queryFn: powersApi.sources, staleTime: 0 });

/** What is inside one installed power. */
export const useInstalledPower = (name) =>
  useQuery({ queryKey: keys.power(name), queryFn: () => powersApi.installed(name), enabled: !!name, staleTime: 0, retry: false });

/** What is inside a power folder you keep yourself (re-read when its files change). */
export const usePowerSource = (path) =>
  useQuery({ queryKey: keys.powerSource(path), queryFn: () => powersApi.source(path), enabled: !!path, staleTime: 0, retry: false });
