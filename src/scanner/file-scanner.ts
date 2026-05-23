import fs from 'node:fs/promises';
import path from 'node:path';
import { ProjectScanner, ScanChanges } from './index';
import { isSupportedSourceFile } from '../utils/language';

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.idea',
  '.gradle',
  '.mvn',
  '.npm-cache',
  'build',
  'dist',
  'node_modules',
  'out',
  'target',
]);

async function walkDirectory(root: string, currentDir: string, results: string[]): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await walkDirectory(root, absolutePath, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!isSupportedSourceFile(absolutePath)) {
      continue;
    }

    results.push(path.relative(root, absolutePath).replace(/\\/g, '/'));
  }
}

function parseGitStatusPorcelain(output: string): ScanChanges {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line || line.length < 4) {
      continue;
    }

    const status = line.slice(0, 2);
    const filePath = line.slice(3).replace(/\\/g, '/');

    if (!isSupportedSourceFile(filePath)) {
      continue;
    }

    if (status === '??') {
      added.push(filePath);
      continue;
    }

    if (status.includes('D')) {
      deleted.push(filePath);
      continue;
    }

    modified.push(filePath);
  }

  return { added, modified, deleted };
}

export class FileSystemScanner implements ProjectScanner {
  async scanAll(root: string): Promise<string[]> {
    const results: string[] = [];
    await walkDirectory(root, root, results);
    results.sort();
    return results;
  }

  async scanChanged(root: string): Promise<ScanChanges> {
    try {
      const { execFile } = await import('node:child_process');
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          'git',
          ['status', '--porcelain', '--no-renames'],
          { cwd: root, timeout: 10000, maxBuffer: 10 * 1024 * 1024 },
          (error, stdout) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(stdout);
          }
        );
      });

      return parseGitStatusPorcelain(output);
    } catch {
      const files = await this.scanAll(root);
      return {
        added: files,
        modified: [],
        deleted: [],
      };
    }
  }
}
