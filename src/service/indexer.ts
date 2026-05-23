import fs from 'node:fs/promises';
import path from 'node:path';
import { LanguageParser } from '../parser';
import { ProjectScanner } from '../scanner';
import { GraphStore } from '../store/queries';
import { detectLanguage } from '../utils/language';
import { ReferenceResolver } from '../resolver';
import { EdgeKind } from '../types';

export interface IndexService {
  indexAll(root: string): Promise<void>;
  sync(root: string): Promise<void>;
}

export class CodeIndexService implements IndexService {
  private static readonly resolvedEdgeKinds: EdgeKind[] = [
    'calls',
    'imports',
    'references',
    'extends',
    'implements',
    'type_of',
    'returns',
  ];

  constructor(
    private readonly scanner: ProjectScanner,
    private readonly parsers: LanguageParser[],
    private readonly resolver: ReferenceResolver,
    private readonly store: GraphStore
  ) {}

  async indexAll(root: string): Promise<void> {
    const files = await this.scanner.scanAll(root);
    await this.indexFiles(root, files);
  }

  async sync(root: string): Promise<void> {
    const changes = await this.scanner.scanChanged(root);

    for (const deletedFile of changes.deleted) {
      this.store.deleteEdgesByFile(deletedFile);
      this.store.deleteUnresolvedRefsByFile(deletedFile);
      this.store.deleteNodesByFile(deletedFile);
      this.store.deleteFile(deletedFile);
    }

    const changedFiles = Array.from(new Set([...changes.added, ...changes.modified]));
    await this.indexFiles(root, changedFiles);
  }

  private async indexFiles(root: string, files: string[]): Promise<void> {
    for (const relativePath of files) {
      const absolutePath = path.join(root, relativePath);
      const language = detectLanguage(relativePath);
      const parser = this.parsers.find((candidate) => candidate.supports(language));
      if (!parser) {
        continue;
      }

      const content = await fs.readFile(absolutePath, 'utf8');
      const parseResult = await parser.parse(relativePath, content);
      this.store.replaceFileGraph(parseResult);
    }

    await this.rebuildResolvedEdges();
  }

  private async rebuildResolvedEdges(): Promise<void> {
    this.store.deleteEdgesByKinds(CodeIndexService.resolvedEdgeKinds);
    const unresolvedRefs = this.store.getAllUnresolvedRefs();
    const resolvedEdges = await this.resolver.resolve(unresolvedRefs);
    this.store.insertEdges(resolvedEdges);
  }
}
