import { CodeEdge, CodeNode, UnresolvedRef } from '../types';

export interface ResolveResult {
  edges: CodeEdge[];
  resolvedRefs: UnresolvedRef[];
  nodes?: CodeNode[];
}

export interface ReferenceResolver {
  resolve(unresolvedRefs: UnresolvedRef[]): Promise<CodeEdge[]>;
  resolveDetailed?(unresolvedRefs: UnresolvedRef[]): Promise<ResolveResult>;
}

export { SimpleResolver } from './simple-resolver';
