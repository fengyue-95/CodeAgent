import { CodeEdge, UnresolvedRef } from '../types';

export interface ReferenceResolver {
  resolve(unresolvedRefs: UnresolvedRef[]): Promise<CodeEdge[]>;
}

export { SimpleResolver } from './simple-resolver';
