import path from 'node:path';
import { Language } from '../types';

const EXTENSION_LANGUAGE_MAP: Record<string, Language> = {
  '.java': 'java',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
};

export function detectLanguage(filePath: string): Language {
  const extension = path.extname(filePath).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[extension] ?? 'unknown';
}

export function isSupportedLanguage(language: Language): boolean {
  return language !== 'unknown';
}

export function isSupportedSourceFile(filePath: string): boolean {
  return isSupportedLanguage(detectLanguage(filePath));
}
