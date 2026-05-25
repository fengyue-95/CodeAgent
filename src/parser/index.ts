import { Language, ParseResult } from '../types';

export interface LanguageParser {
  supports(language: Language): boolean;
  parse(filePath: string, content: string): Promise<ParseResult>;
}

export { JavaParser } from './java-extractor';
export { ScriptParser } from './script-extractor';
export { PythonParser } from './python-extractor';
export { getParser, initGrammars, ensureGrammar } from './grammars';
