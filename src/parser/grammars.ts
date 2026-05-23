import path from 'node:path';
import { Parser, Language as WasmLanguage } from 'web-tree-sitter';
import { Language } from '../types';

const WASM_GRAMMARS: Partial<Record<Language, string>> = {
  java: 'tree-sitter-java.wasm',
};

const languageCache = new Map<Language, WasmLanguage>();
const parserCache = new Map<Language, Parser>();

let initialized = false;

export async function initGrammars(): Promise<void> {
  if (initialized) {
    return;
  }

  await Parser.init();
  initialized = true;
}

export async function ensureGrammar(language: Language): Promise<void> {
  await initGrammars();

  if (languageCache.has(language)) {
    return;
  }

  const wasmFile = WASM_GRAMMARS[language];
  if (!wasmFile) {
    throw new Error(`No tree-sitter grammar configured for language: ${language}`);
  }

  const wasmPath = require.resolve(path.join('tree-sitter-wasms', 'out', wasmFile));
  const wasmLanguage = await WasmLanguage.load(wasmPath);
  languageCache.set(language, wasmLanguage);
}

export async function getParser(language: Language): Promise<Parser> {
  await ensureGrammar(language);

  const cached = parserCache.get(language);
  if (cached) {
    return cached;
  }

  const wasmLanguage = languageCache.get(language);
  if (!wasmLanguage) {
    throw new Error(`Grammar is not loaded for language: ${language}`);
  }

  const parser = new Parser();
  parser.setLanguage(wasmLanguage);
  parserCache.set(language, parser);
  return parser;
}
