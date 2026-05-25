export { FileWatcher, type WatchOptions } from './watcher';
export { detectWsl, watchDisabledReason } from './watch-policy';
export {
  DEFAULT_SYNC_HOOKS,
  installGitSyncHooks,
  isGitRepo,
  isGitSyncHookInstalled,
  removeGitSyncHooks,
  type GitHookName,
  type GitHookResult,
} from './git-hooks';
