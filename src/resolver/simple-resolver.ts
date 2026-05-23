import { ReferenceResolver } from './index';
import { CodeEdge, CodeNode, EdgeKind, UnresolvedRef } from '../types';
import { GraphStore } from '../store/queries';

function pickEdgeKind(ref: UnresolvedRef): EdgeKind {
  if (ref.refKind === 'import') {
    return 'imports';
  }

  if (ref.refKind === 'call') {
    return 'calls';
  }

  if (ref.refKind === 'inheritance') {
    const edgeKind = ref.metadata?.edgeKind;
    if (edgeKind === 'extends' || edgeKind === 'implements') {
      return edgeKind;
    }
  }

  if (ref.refKind === 'type' && ref.metadata?.relation === 'returns') {
    return 'returns';
  }

  if (ref.refKind === 'type') {
    return 'type_of';
  }

  return 'references';
}

function uniqueById(nodes: CodeNode[]): CodeNode[] {
  const seen = new Set<string>();
  const results: CodeNode[] = [];

  for (const node of nodes) {
    if (seen.has(node.id)) {
      continue;
    }

    seen.add(node.id);
    results.push(node);
  }

  return results;
}

export class SimpleResolver implements ReferenceResolver {
  constructor(private readonly store: GraphStore) {}

  async resolve(unresolvedRefs: UnresolvedRef[]): Promise<CodeEdge[]> {
    const edges: CodeEdge[] = [];

    for (const unresolvedRef of unresolvedRefs) {
      const sourceNode = this.store.getNodeById(unresolvedRef.fromNodeId);
      if (!sourceNode) {
        continue;
      }

      const targets = this.findTargets(sourceNode, unresolvedRef);
      const edgeKind = pickEdgeKind(unresolvedRef);

      for (const target of targets) {
        edges.push({
          source: sourceNode.id,
          target: target.id,
          kind: edgeKind,
          line: unresolvedRef.line,
          column: unresolvedRef.column,
          metadata: {
            refName: unresolvedRef.refName,
            refKind: unresolvedRef.refKind,
          },
        });
      }
    }

    return edges;
  }

  private findTargets(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    if (unresolvedRef.refKind === 'call') {
      const receiverTargets = this.findCallTargetsByReceiver(sourceNode, unresolvedRef);
      if (receiverTargets.length > 0) {
        return receiverTargets;
      }
    }

    const exactQualified = this.store.getNodesByQualifiedName(unresolvedRef.refName);
    if (exactQualified.length > 0) {
      return exactQualified;
    }

    const simpleName = this.extractSimpleName(unresolvedRef.refName);
    const sameFileMatches = this.store
      .getNodesByFile(sourceNode.filePath)
      .filter((node) => node.name === simpleName && node.id !== sourceNode.id);

    if (sameFileMatches.length > 0) {
      return uniqueById(sameFileMatches);
    }

    const nameMatches = this.store
      .getNodesByName(simpleName)
      .filter((node) => node.id !== sourceNode.id);

    if (unresolvedRef.refKind === 'call') {
      return uniqueById(nameMatches.filter((node) => node.kind === 'method' || node.kind === 'constructor'));
    }

    if (unresolvedRef.refKind === 'inheritance') {
      return uniqueById(nameMatches.filter((node) => node.kind === 'class' || node.kind === 'interface' || node.kind === 'enum'));
    }

    return uniqueById(nameMatches);
  }

  private findCallTargetsByReceiver(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    const receiver = this.getMetadataString(unresolvedRef.metadata?.receiver);
    const methodName = this.getMetadataString(unresolvedRef.metadata?.methodName) ?? this.extractSimpleName(unresolvedRef.refName);
    if (!receiver || receiver === 'this' || receiver === 'super') {
      return this.findMethodsOnCurrentType(sourceNode, methodName);
    }

    const receiverType = this.findReceiverType(sourceNode, receiver, unresolvedRef.line);
    if (!receiverType) {
      return [];
    }

    return this.findMethodsOnType(receiverType, methodName);
  }

  private findMethodsOnCurrentType(sourceNode: CodeNode, methodName: string): CodeNode[] {
    const ownerType = this.findOwnerType(sourceNode);
    if (!ownerType?.qualifiedName) {
      return [];
    }

    return this.findMethodsOnType(ownerType.qualifiedName, methodName);
  }

  private findMethodsOnType(typeName: string, methodName: string): CodeNode[] {
    const typeSimpleName = this.extractSimpleName(typeName);
    const candidateTypes = [
      ...this.store.getNodesByQualifiedName(typeName),
      ...this.store.getNodesByName(typeSimpleName),
    ].filter((node) => node.kind === 'class' || node.kind === 'interface' || node.kind === 'enum');

    const methods: CodeNode[] = [];
    for (const candidateType of uniqueById(candidateTypes)) {
      const prefix = candidateType.qualifiedName ? `${candidateType.qualifiedName}.` : '';
      const fileNodes = this.store.getNodesByFile(candidateType.filePath);
      methods.push(
        ...fileNodes.filter((node) =>
          (node.kind === 'method' || node.kind === 'constructor') &&
          node.name === methodName &&
          (!prefix || node.qualifiedName?.startsWith(prefix))
        )
      );
    }

    return uniqueById(methods);
  }

  private findReceiverType(sourceNode: CodeNode, receiver: string, referenceLine?: number): string | null {
    const receiverParts = receiver.split('.').filter(Boolean);
    const receiverName = receiverParts[receiverParts.length - 1] ?? receiver;
    const fileNodes = this.store.getNodesByFile(sourceNode.filePath);
    const ownerType = this.findOwnerType(sourceNode);
    const sourceRangeMatches = fileNodes.filter((node) =>
      node.name === receiverName &&
      (node.kind === 'field' || node.kind === 'variable') &&
      this.nodeIsVisibleFromSource(node, sourceNode, ownerType, referenceLine)
    );

    const bestMatch = sourceRangeMatches.sort((left, right) => {
      const leftLineDistance = Math.abs(sourceNode.startLine - left.startLine);
      const rightLineDistance = Math.abs(sourceNode.startLine - right.startLine);
      return leftLineDistance - rightLineDistance;
    })[0];

    return this.getMetadataString(bestMatch?.metadata?.type) ?? null;
  }

  private findOwnerType(sourceNode: CodeNode): CodeNode | null {
    if (!sourceNode.qualifiedName) {
      return null;
    }

    const fileNodes = this.store.getNodesByFile(sourceNode.filePath);
    const containers = fileNodes.filter((node) =>
      (node.kind === 'class' || node.kind === 'interface' || node.kind === 'enum') &&
      node.startLine <= sourceNode.startLine &&
      node.endLine >= sourceNode.endLine
    );

    containers.sort((left, right) => {
      const leftSpan = left.endLine - left.startLine;
      const rightSpan = right.endLine - right.startLine;
      return leftSpan - rightSpan;
    });

    return containers[0] ?? null;
  }

  private nodeIsVisibleFromSource(
    node: CodeNode,
    sourceNode: CodeNode,
    ownerType: CodeNode | null,
    referenceLine?: number
  ): boolean {
    if (node.kind === 'field') {
      if (!ownerType?.qualifiedName || !node.qualifiedName) {
        return false;
      }

      return node.qualifiedName.startsWith(`${ownerType.qualifiedName}.`);
    }

    const variableKind = this.getMetadataString(node.metadata?.variableKind);
    if (variableKind === 'parameter') {
      return node.qualifiedName?.startsWith(`${sourceNode.qualifiedName}.`) ?? false;
    }

    if (variableKind === 'local') {
      return Boolean(
        node.qualifiedName?.startsWith(`${sourceNode.qualifiedName}.`) &&
        node.startLine <= (referenceLine ?? sourceNode.endLine)
      );
    }

    return false;
  }

  private extractSimpleName(refName: string): string {
    const methodName = refName.split('.').pop() ?? refName;
    return methodName.replace(/<.*?>/g, '');
  }

  private getMetadataString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
