export const PROJECT_FILE_IGNORE_GLOBS = [
  '!/.code-agent/**',
  '!/.git/**',
  '!node_modules/**',
  '!target/**',
  '!dist/**',
  '!coverage/**',
];

export function projectFilesCommand(): string {
  const globs = PROJECT_FILE_IGNORE_GLOBS.map((glob) => `-g '${glob}'`).join(' ');
  return `rg --files ${globs}`;
}

export function parseProjectFilesOutput(output: string): string[] {
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function scoreFiles(files: string[], query: string, limit = 20): string[] {
  return files
    .map((file) => ({ file, score: fuzzyScore(file, query) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.file.length - right.file.length)
    .slice(0, limit)
    .map((item) => item.file);
}

export interface ActiveFileReferenceQuery {
  prefix: string;
  query: string;
}

export interface FileReferenceSuggestions {
  query: string;
  suggestions: string[];
}

export interface SelectedFileReferenceInput {
  line: string;
  shouldSubmit: boolean;
}

export function formatFileSuggestionLine(
  query: string,
  suggestions: string[],
  selectedIndex: number,
  maxWidth = 100
): string {
  const width = Math.max(24, maxWidth);
  const label = query ? `@ matches "${query}": ` : '@ matches: ';
  if (suggestions.length === 0) {
    return truncateDisplay(`${label}no files`, width);
  }

  const items = suggestions.slice(0, 4).map((file, index) => {
    const marker = index === selectedIndex ? '>' : ' ';
    return `${marker}${index + 1} ${compactPath(file, 36)}`;
  });
  const extra = suggestions.length > items.length ? `  +${suggestions.length - items.length}` : '';
  return truncateDisplay(`${label}${items.join('  ')}${extra}`, width);
}

export function formatFileSuggestionRows(
  query: string,
  suggestions: string[],
  selectedIndex: number,
  maxWidth = 100,
  maxRows = 8
): string[] {
  const width = Math.max(24, maxWidth);
  const header = truncateDisplay(query ? `@ matches "${query}"` : '@ matches', width);
  if (suggestions.length === 0) {
    return [header, truncateDisplay('  no files', width)];
  }

  const rows = suggestions.slice(0, maxRows).map((file, index) => {
    const selected = index === selectedIndex;
    const marker = selected ? '>' : ' ';
    const indexText = String(index + 1);
    const prefix = `${marker} ${indexText} `;
    return `${prefix}${compactPath(file, width - prefix.length)}`;
  });

  return [header, ...rows];
}

export function activeFileReferenceQuery(line: string): ActiveFileReferenceQuery | null {
  const at = /@([^@\s]*)$/.exec(line);
  if (!at) {
    return null;
  }

  const prefix = at[1] ?? '';
  return {
    prefix,
    query: prefix.startsWith('file:') ? prefix.slice('file:'.length) : prefix,
  };
}

export function suggestFileReferences(line: string, files: string[], limit = 8): FileReferenceSuggestions | null {
  const active = activeFileReferenceQuery(line);
  if (!active) {
    return null;
  }

  return {
    query: active.query,
    suggestions: scoreFiles(files, active.query, limit),
  };
}

export function completeFileReferenceLine(line: string, files: string[], limit = 30): string[] {
  const active = activeFileReferenceQuery(line);
  if (!active) {
    return [];
  }

  const completions = scoreFiles(files, active.query, limit)
    .map((file) => `${line.slice(0, line.length - active.prefix.length)}${active.prefix.startsWith('file:') ? `file:${file}` : file}`);

  return completions.length > 1 ? [line, ...completions] : completions;
}

export function moveFileReferenceSelection(currentIndex: number, delta: number, count: number): number {
  if (count <= 0) {
    return 0;
  }

  return ((currentIndex + delta) % count + count) % count;
}

export function applySelectedFileReference(line: string, filePath: string): string {
  const active = activeFileReferenceQuery(line);
  if (!active) {
    return line;
  }

  const replacement = active.prefix.startsWith('file:') ? `file:${filePath}` : filePath;
  return `${line.slice(0, line.length - active.prefix.length)}${replacement}`;
}

export function prepareSelectedFileReferenceInput(
  line: string,
  filePath: string,
  shouldSubmit: boolean
): SelectedFileReferenceInput {
  return {
    line: applySelectedFileReference(line, filePath),
    shouldSubmit,
  };
}

function fuzzyScore(value: string, query: string): number {
  if (!query) {
    return 1;
  }

  const lowerValue = value.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerValue.includes(lowerQuery)) {
    return 1000 - lowerValue.indexOf(lowerQuery);
  }

  let score = 0;
  let valueIndex = 0;
  for (const char of lowerQuery) {
    const found = lowerValue.indexOf(char, valueIndex);
    if (found < 0) {
      return 0;
    }

    score += Math.max(1, 20 - (found - valueIndex));
    valueIndex = found + 1;
  }

  return score;
}

function compactPath(filePath: string, maxLength: number): string {
  if (filePath.length <= maxLength) {
    return filePath;
  }

  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1] ?? filePath;
  const compact = `.../${fileName}`;
  if (compact.length <= maxLength) {
    return compact;
  }

  return `...${fileName.slice(-(maxLength - 3))}`;
}

function truncateDisplay(value: string, maxWidth: number): string {
  return value.length > maxWidth ? `${value.slice(0, maxWidth - 3)}...` : value;
}
