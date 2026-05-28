import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000; // 120 seconds for long-running commands like Maven searches

export interface WorkspaceToolArgs {
  command?: unknown;
  cwd?: unknown;
  endLine?: unknown;
  filePath?: unknown;
  glob?: unknown;
  ignoreCase?: unknown;
  limit?: unknown;
  maxBytes?: unknown;
  maxBuffer?: unknown;
  patch?: unknown;
  pattern?: unknown;
  regex?: unknown;
  startLine?: unknown;
  timeoutMs?: unknown;
}

interface CommandResult {
  command: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export async function workspaceGlob(projectRoot: string, args: WorkspaceToolArgs): Promise<unknown> {
  const pattern = assertString(args.pattern, 'pattern');
  const limit = getPositiveInteger(args.limit, DEFAULT_LIMIT, 'limit');
  const cwd = resolveWorkspacePath(projectRoot, getOptionalString(args.cwd) ?? '.');
  const result = await runCommand(['rg', '--files', '-g', pattern], cwd, {
    maxBuffer: DEFAULT_MAX_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    allowNonZero: true,
  });
  const files = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);

  return {
    projectRoot,
    cwd,
    pattern,
    files,
    totalReturned: files.length,
  };
}

export async function workspaceGrep(projectRoot: string, args: WorkspaceToolArgs): Promise<unknown> {
  const pattern = assertString(args.pattern, 'pattern');
  const limit = getPositiveInteger(args.limit, DEFAULT_LIMIT, 'limit');
  const cwd = resolveWorkspacePath(projectRoot, getOptionalString(args.cwd) ?? '.');
  const command = [
    'rg',
    '--line-number',
    '--column',
    '--no-heading',
    '--color',
    'never',
  ];

  if (args.ignoreCase === true) {
    command.push('--ignore-case');
  }

  if (args.regex === false) {
    command.push('--fixed-strings');
  }

  const glob = getOptionalString(args.glob);
  if (glob) {
    command.push('-g', glob);
  }

  command.push(pattern);

  const result = await runCommand(command, cwd, {
    maxBuffer: getPositiveInteger(args.maxBuffer, DEFAULT_MAX_BYTES, 'maxBuffer'),
    timeoutMs: getPositiveInteger(args.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs'),
    allowNonZero: true,
  });
  const matches = result.stdout
    .split('\n')
    .filter(Boolean)
    .slice(0, limit)
    .map(parseRipgrepLine);

  return {
    projectRoot,
    cwd,
    pattern,
    matches,
    totalReturned: matches.length,
    truncated: result.truncated,
  };
}

export async function workspaceReadFile(projectRoot: string, args: WorkspaceToolArgs): Promise<unknown> {
  const filePath = assertString(args.filePath, 'filePath');
  const absolutePath = resolveWorkspacePath(projectRoot, filePath);
  const startLine = getPositiveInteger(args.startLine, 1, 'startLine');
  const endLine = getPositiveInteger(args.endLine, Number.MAX_SAFE_INTEGER, 'endLine');
  const maxBytes = getPositiveInteger(args.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');

  if (endLine < startLine) {
    throw new Error('endLine must be greater than or equal to startLine');
  }

  const content = await fs.readFile(absolutePath, 'utf8');
  const lines = content.split('\n');
  const selected = lines.slice(startLine - 1, endLine);
  const text = truncate(selected.join('\n'), maxBytes);

  return {
    projectRoot,
    filePath: path.relative(projectRoot, absolutePath).replace(/\\/g, '/'),
    startLine,
    endLine: Math.min(endLine, lines.length),
    totalLines: lines.length,
    text: text.value,
    truncated: text.truncated,
  };
}

export async function workspaceApplyPatch(projectRoot: string, args: WorkspaceToolArgs): Promise<unknown> {
  const patch = assertString(args.patch, 'patch');
  assertPatchInsideWorkspace(patch);

  await runCommand(['git', 'apply', '--check', '--whitespace=nowarn', '-'], projectRoot, {
    input: patch,
    maxBuffer: DEFAULT_MAX_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  await runCommand(['git', 'apply', '--whitespace=nowarn', '-'], projectRoot, {
    input: patch,
    maxBuffer: DEFAULT_MAX_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  return {
    projectRoot,
    applied: true,
  };
}

export async function workspaceGitDiff(projectRoot: string, args: WorkspaceToolArgs): Promise<unknown> {
  const filePath = getOptionalString(args.filePath);
  const command = ['git', 'diff', '--'];
  if (filePath) {
    command.push(path.relative(projectRoot, resolveWorkspacePath(projectRoot, filePath)).replace(/\\/g, '/'));
  }

  const result = await runCommand(command, projectRoot, {
    maxBuffer: getPositiveInteger(args.maxBuffer, DEFAULT_MAX_BYTES, 'maxBuffer'),
    timeoutMs: getPositiveInteger(args.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs'),
    allowNonZero: true,
  });

  return {
    projectRoot,
    filePath: filePath ?? null,
    diff: result.stdout,
    truncated: result.truncated,
  };
}

export async function workspaceShellExec(projectRoot: string, args: WorkspaceToolArgs): Promise<unknown> {
  const commandText = assertString(args.command, 'command');
  const cwd = resolveWorkspacePath(projectRoot, getOptionalString(args.cwd) ?? '.');
  const result = await runCommand(['/bin/sh', '-lc', commandText], cwd, {
    maxBuffer: getPositiveInteger(args.maxBuffer, DEFAULT_MAX_BYTES, 'maxBuffer'),
    timeoutMs: getPositiveInteger(args.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs'),
    allowNonZero: true,
  });

  return {
    projectRoot,
    ...result,
  };
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing or invalid ${name}`);
  }

  return value;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getPositiveInteger(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${String(value)}`);
  }

  return parsed;
}

function resolveWorkspacePath(projectRoot: string, requestedPath: string): string {
  const resolved = path.resolve(projectRoot, requestedPath);
  const relative = path.relative(projectRoot, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolved;
  }

  throw new Error(`Path escapes project root: ${requestedPath}`);
}

function assertPatchInsideWorkspace(patch: string): void {
  for (const line of patch.split('\n')) {
    const filePath = parsePatchPath(line);
    if (!filePath) {
      continue;
    }

    if (
      path.isAbsolute(filePath) ||
      filePath === '.git' ||
      filePath.startsWith('.git/') ||
      filePath === '.code-agent' ||
      filePath.startsWith('.code-agent/') ||
      filePath.split('/').includes('..')
    ) {
      throw new Error(`Patch path is not allowed: ${filePath}`);
    }
  }
}

function parsePatchPath(line: string): string | null {
  if (line.startsWith('diff --git ')) {
    const parts = line.split(/\s+/);
    return stripPatchPrefix(parts[3] ?? '');
  }

  if (line.startsWith('--- ') || line.startsWith('+++ ')) {
    const value = line.slice(4).split('\t')[0]!.trim();
    if (value === '/dev/null') {
      return null;
    }

    return stripPatchPrefix(value);
  }

  return null;
}

function stripPatchPrefix(value: string): string | null {
  if (!value) {
    return null;
  }

  return value.replace(/^[ab]\//, '');
}

function parseRipgrepLine(line: string): { filePath: string; line: number | null; column: number | null; text: string } {
  const parts = line.split(':');
  const filePath = parts.shift() ?? '';
  const lineNumber = Number(parts.shift());
  const columnNumber = Number(parts.shift());

  return {
    filePath,
    line: Number.isInteger(lineNumber) ? lineNumber : null,
    column: Number.isInteger(columnNumber) ? columnNumber : null,
    text: parts.join(':'),
  };
}

async function runCommand(
  command: string[],
  cwd: string,
  options: {
    allowNonZero?: boolean;
    input?: string;
    maxBuffer: number;
    timeoutMs: number;
  }
): Promise<CommandResult> {
  const [file, ...args] = command;
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(file!, args, {
      cwd,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (!child.stdout || !child.stderr) {
      reject(new Error(`Failed to capture command output: ${command.join(' ')}`));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      if (!settled) {
        settled = true;
        reject(new Error(`Command timed out after ${options.timeoutMs}ms: ${command.join(' ')}`));
      }
    }, options.timeoutMs);

    const collect = (chunks: Buffer[], currentBytes: number, chunk: Buffer): number => {
      const nextBytes = currentBytes + chunk.length;
      if (currentBytes < options.maxBuffer) {
        chunks.push(chunk.subarray(0, Math.max(0, options.maxBuffer - currentBytes)));
      }
      if (nextBytes > options.maxBuffer) {
        truncated = true;
      }
      return nextBytes;
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes = collect(stdoutChunks, stdoutBytes, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes = collect(stderrChunks, stderrBytes, chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (settled) {
        return;
      }

      settled = true;
      const result: CommandResult = {
        command,
        cwd,
        exitCode: exitCode ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        truncated,
      };

      if (result.exitCode !== 0 && options.allowNonZero !== true) {
        reject(new Error(`Command failed (${result.exitCode}): ${command.join(' ')}\n${result.stderr}`));
        return;
      }

      resolve(result);
    });

    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    }
  });
}

function truncate(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) {
    return { value, truncated: false };
  }

  return {
    value: buffer.subarray(0, maxBytes).toString('utf8'),
    truncated: true,
  };
}
