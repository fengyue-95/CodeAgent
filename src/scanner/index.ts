export interface ScanChanges {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface ProjectScanner {
  scanAll(root: string): Promise<string[]>;
  scanChanged(root: string): Promise<ScanChanges>;
}

export { FileSystemScanner } from './file-scanner';
