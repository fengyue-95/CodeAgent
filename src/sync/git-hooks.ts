import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MARKER_BEGIN = '# >>> code-agent sync hook >>>';
const MARKER_END = '# <<< code-agent sync hook <<<';

export type GitHookName = 'post-commit' | 'post-merge' | 'post-checkout';

export const DEFAULT_SYNC_HOOKS: GitHookName[] = ['post-commit', 'post-merge', 'post-checkout'];

export interface GitHookResult {
  hooksDir: string | null;
  hooks: GitHookName[];
  skipped?: string;
}

function gitHooksDir(projectRoot: string): string | null {
  try {
    const output = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (!output) {
      return null;
    }

    return path.isAbsolute(output) ? output : path.resolve(projectRoot, output);
  } catch {
    return null;
  }
}

export function isGitRepo(projectRoot: string): boolean {
  try {
    const output = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output === 'true';
  } catch {
    return false;
  }
}

function hookBlock(): string {
  return [
    MARKER_BEGIN,
    '# Keep the CodeAgent index fresh after git operations.',
    'if command -v code-agent >/dev/null 2>&1; then',
    '  ( code-agent git sync >/dev/null 2>&1 & ) >/dev/null 2>&1',
    'fi',
    MARKER_END,
  ].join('\n');
}

function stripHookBlock(content: string): string {
  const kept: string[] = [];
  let inBlock = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === MARKER_BEGIN) {
      inBlock = true;
      continue;
    }

    if (trimmed === MARKER_END) {
      inBlock = false;
      continue;
    }

    if (!inBlock) {
      kept.push(line);
    }
  }

  return kept.join('\n');
}

function isEffectivelyEmpty(content: string): boolean {
  return content
    .split('\n')
    .map((line) => line.trim())
    .every((line) => line.length === 0 || line.startsWith('#!'));
}

function chmodExecutable(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // chmod is not available on every platform.
  }
}

export function installGitSyncHooks(
  projectRoot: string,
  hooks: GitHookName[] = DEFAULT_SYNC_HOOKS
): GitHookResult {
  const hooksDir = gitHooksDir(projectRoot);
  if (!hooksDir) {
    return { hooksDir: null, hooks: [], skipped: 'not a git repository' };
  }

  fs.mkdirSync(hooksDir, { recursive: true });
  const block = hookBlock();
  const installed: GitHookName[] = [];

  for (const hook of hooks) {
    const hookPath = path.join(hooksDir, hook);
    const current = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf8') : '';
    const base = stripHookBlock(current).replace(/\s*$/, '');
    const content = base.length > 0
      ? `${base}\n\n${block}\n`
      : `#!/bin/sh\n${block}\n`;

    fs.writeFileSync(hookPath, content);
    chmodExecutable(hookPath);
    installed.push(hook);
  }

  return { hooksDir, hooks: installed };
}

export function removeGitSyncHooks(
  projectRoot: string,
  hooks: GitHookName[] = DEFAULT_SYNC_HOOKS
): GitHookResult {
  const hooksDir = gitHooksDir(projectRoot);
  if (!hooksDir) {
    return { hooksDir: null, hooks: [], skipped: 'not a git repository' };
  }

  const removed: GitHookName[] = [];
  for (const hook of hooks) {
    const hookPath = path.join(hooksDir, hook);
    if (!fs.existsSync(hookPath)) {
      continue;
    }

    const current = fs.readFileSync(hookPath, 'utf8');
    if (!current.includes(MARKER_BEGIN)) {
      continue;
    }

    const stripped = stripHookBlock(current);
    if (isEffectivelyEmpty(stripped)) {
      fs.unlinkSync(hookPath);
    } else {
      fs.writeFileSync(hookPath, `${stripped.replace(/\s*$/, '')}\n`);
      chmodExecutable(hookPath);
    }
    removed.push(hook);
  }

  return { hooksDir, hooks: removed };
}

export function isGitSyncHookInstalled(
  projectRoot: string,
  hooks: GitHookName[] = DEFAULT_SYNC_HOOKS
): boolean {
  const hooksDir = gitHooksDir(projectRoot);
  if (!hooksDir) {
    return false;
  }

  return hooks.some((hook) => {
    const hookPath = path.join(hooksDir, hook);
    return fs.existsSync(hookPath) && fs.readFileSync(hookPath, 'utf8').includes(MARKER_BEGIN);
  });
}
