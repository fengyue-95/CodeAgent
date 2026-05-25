import fs from 'node:fs';
import path from 'node:path';
import { isSupportedSourceFile } from '../utils/language';
import { watchDisabledReason } from './watch-policy';

export interface WatchOptions<TSyncResult extends { changedFiles: number } = { changedFiles: number }> {
  debounceMs?: number;
  onSyncComplete?: (result: TSyncResult & { durationMs: number }) => void;
  onSyncError?: (error: Error) => void;
  onEvent?: (filePath: string) => void;
}

export class FileWatcher<TSyncResult extends { changedFiles: number } = { changedFiles: number }> {
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges = false;
  private syncing = false;
  private stopped = false;

  private readonly debounceMs: number;

  constructor(
    private readonly projectRoot: string,
    private readonly syncFn: () => Promise<TSyncResult>,
    private readonly options: WatchOptions<TSyncResult> = {}
  ) {
    this.debounceMs = options.debounceMs ?? 1500;
  }

  start(): boolean {
    const disabledReason = watchDisabledReason(this.projectRoot);
    if (disabledReason) {
      this.options.onSyncError?.(new Error(`watch disabled: ${disabledReason}`));
      return false;
    }

    this.stopped = false;

    try {
      this.watcher = fs.watch(this.projectRoot, { recursive: true }, (_eventType, filename) => {
        if (!filename || this.stopped) {
          return;
        }

        const relativePath = filename.toString().replace(/\\/g, '/');
        if (this.shouldIgnore(relativePath)) {
          return;
        }

        this.options.onEvent?.(relativePath);
        this.pendingChanges = true;
        this.scheduleSync();
      });

      this.watcher.on('error', (error) => {
        this.options.onSyncError?.(error);
      });

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onSyncError?.(err);
      return false;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.watcher?.close();
    this.watcher = null;
    this.pendingChanges = false;
  }

  isActive(): boolean {
    return this.watcher !== null && !this.stopped;
  }

  private shouldIgnore(relativePath: string): boolean {
    if (
      relativePath === '.code-agent' ||
      relativePath.startsWith('.code-agent/') ||
      relativePath === '.git' ||
      relativePath.startsWith('.git/')
    ) {
      return true;
    }

    return !isSupportedSourceFile(path.join(this.projectRoot, relativePath));
  }

  private scheduleSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  private async flush(): Promise<void> {
    if (this.syncing || this.stopped) {
      return;
    }

    this.pendingChanges = false;
    this.syncing = true;
    const startedAt = Date.now();

    try {
      const result = await this.syncFn();
      this.options.onSyncComplete?.({
        ...result,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onSyncError?.(err);
    } finally {
      this.syncing = false;
      if (this.pendingChanges && !this.stopped) {
        this.scheduleSync();
      }
    }
  }
}
