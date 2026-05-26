import fs from 'node:fs/promises';
import path from 'node:path';

export interface FileEditArgs {
  filePath?: unknown;
  oldString?: unknown;
  newString?: unknown;
  replaceAll?: unknown;
}

export interface FileWriteArgs {
  filePath?: unknown;
  content?: unknown;
}

export async function editFile(projectRoot: string, args: FileEditArgs): Promise<unknown> {
  const filePath = assertString(args.filePath, 'filePath');
  const oldString = assertString(args.oldString, 'oldString');
  const newString = assertString(args.newString, 'newString');
  const replaceAll = args.replaceAll === true;

  if (oldString === newString) {
    throw new Error('oldString and newString must be different');
  }

  const absolutePath = resolveWorkspacePath(projectRoot, filePath);
  const before = await fs.readFile(absolutePath, 'utf8');
  const occurrences = countOccurrences(before, oldString);
  if (occurrences === 0) {
    throw new Error(`oldString was not found in ${filePath}`);
  }
  if (!replaceAll && occurrences > 1) {
    throw new Error(`oldString appears ${occurrences} times. Set replaceAll=true or make oldString more specific.`);
  }

  const after = replaceAll
    ? before.split(oldString).join(newString)
    : before.replace(oldString, newString);
  await fs.writeFile(absolutePath, after, 'utf8');

  return {
    filePath: relativePath(projectRoot, absolutePath),
    replacements: replaceAll ? occurrences : 1,
    bytesBefore: Buffer.byteLength(before),
    bytesAfter: Buffer.byteLength(after),
  };
}

export async function writeFile(projectRoot: string, args: FileWriteArgs): Promise<unknown> {
  const filePath = assertString(args.filePath, 'filePath');
  const content = assertStringAllowEmpty(args.content, 'content');
  const absolutePath = resolveWorkspacePath(projectRoot, filePath);
  const existed = await exists(absolutePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');

  return {
    filePath: relativePath(projectRoot, absolutePath),
    created: !existed,
    bytes: Buffer.byteLength(content),
  };
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing or invalid ${name}`);
  }

  return value;
}

function assertStringAllowEmpty(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Missing or invalid ${name}`);
  }

  return value;
}

function resolveWorkspacePath(projectRoot: string, requestedPath: string): string {
  const resolved = path.resolve(projectRoot, requestedPath);
  const relative = path.relative(projectRoot, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    if (relative === '.git' || relative.startsWith(`.git${path.sep}`)) {
      throw new Error(`Path is not allowed: ${requestedPath}`);
    }
    if (relative === '.code-agent' || relative.startsWith(`.code-agent${path.sep}`)) {
      throw new Error(`Path is not allowed: ${requestedPath}`);
    }
    return resolved;
  }

  throw new Error(`Path escapes project root: ${requestedPath}`);
}

function relativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, '/');
}

function countOccurrences(value: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const next = value.indexOf(needle, index);
    if (next === -1) {
      return count;
    }
    count += 1;
    index = next + needle.length;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
