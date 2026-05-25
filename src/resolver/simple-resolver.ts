import { ReferenceResolver } from './index';
import { CodeEdge, CodeNode, EdgeKind, UnresolvedRef } from '../types';
import { GraphStore } from '../store/queries';
import { ResolveResult } from './index';
import path from 'node:path';

interface FileImportIndex {
  exactImports: Map<string, string>;
  wildcardImports: string[];
  aliases: Map<string, CodeNode[]>;
}

const JAVA_PRIMITIVE_TYPES = new Set([
  'boolean',
  'byte',
  'char',
  'double',
  'float',
  'int',
  'long',
  'short',
  'void',
]);

const JAVA_LANG_TYPES = new Set([
  'Appendable',
  'ArithmeticException',
  'Boolean',
  'Byte',
  'Character',
  'CharSequence',
  'Class',
  'ClassLoader',
  'Comparable',
  'Double',
  'Enum',
  'Exception',
  'Float',
  'IllegalArgumentException',
  'IllegalStateException',
  'Integer',
  'Iterable',
  'Long',
  'Math',
  'Number',
  'Object',
  'Override',
  'RuntimeException',
  'Short',
  'String',
  'StringBuilder',
  'StringBuffer',
  'System',
  'Thread',
  'Throwable',
  'Void',
]);

const COMMON_JAVA_TYPES = new Map<string, string>([
  ['ArrayList', 'java.util.ArrayList'],
  ['Arrays', 'java.util.Arrays'],
  ['BigDecimal', 'java.math.BigDecimal'],
  ['BigInteger', 'java.math.BigInteger'],
  ['Calendar', 'java.util.Calendar'],
  ['Collection', 'java.util.Collection'],
  ['Collections', 'java.util.Collections'],
  ['Date', 'java.util.Date'],
  ['HashMap', 'java.util.HashMap'],
  ['HashSet', 'java.util.HashSet'],
  ['LinkedHashMap', 'java.util.LinkedHashMap'],
  ['LinkedList', 'java.util.LinkedList'],
  ['List', 'java.util.List'],
  ['Map', 'java.util.Map'],
  ['Optional', 'java.util.Optional'],
  ['Set', 'java.util.Set'],
  ['UUID', 'java.util.UUID'],
]);

const EXTERNAL_QUALIFIED_PREFIXES = [
  'cn.',
  'ch.',
  'com.alibaba.',
  'com.fasterxml.',
  'com.google.',
  'com.ly.flight.',
  'com.ly.spat.',
  'com.ly.sof.',
  'com.ly.tcbase.',
  'com.ly.travel.mdsoil.account.integration.',
  'com.ly.travel.mdsoil.common.',
  'com.ly.travel.mdsoil.order.',
  'com.ly.travel.mdsoil.pms.',
  'com.ly.travel.mdsoil.query.',
  'io.',
  'jakarta.',
  'java.',
  'javax.',
  'lombok.',
  'net.',
  'okhttp3.',
  'org.',
  'sun.',
];

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
  private readonly externalNodeIds = new Set<string>();
  private importIndexByFile = new Map<string, FileImportIndex>();

  constructor(private readonly store: GraphStore) {}

  async resolve(unresolvedRefs: UnresolvedRef[]): Promise<CodeEdge[]> {
    const result = await this.resolveDetailed(unresolvedRefs);
    return result.edges;
  }

  async resolveDetailed(unresolvedRefs: UnresolvedRef[]): Promise<ResolveResult> {
    this.externalNodeIds.clear();
    this.importIndexByFile = this.buildImportIndex(unresolvedRefs);
    const edges: CodeEdge[] = [];
    const nodes: CodeNode[] = [];
    const resolvedRefs: UnresolvedRef[] = [];

    for (const unresolvedRef of unresolvedRefs) {
      const sourceNode = this.store.getNodeById(unresolvedRef.fromNodeId);
      if (!sourceNode) {
        continue;
      }

      const targets = this.findTargets(sourceNode, unresolvedRef);
      const edgeKind = pickEdgeKind(unresolvedRef);
      const finalTargets = targets.length > 0
        ? targets
        : this.createExternalTargets(sourceNode, unresolvedRef);

      if (finalTargets.length > 0) {
        resolvedRefs.push(unresolvedRef);
      }

      for (const target of finalTargets) {
        if (target.metadata?.external === true && !this.externalNodeIds.has(target.id)) {
          this.externalNodeIds.add(target.id);
          nodes.push(target);
        }

        edges.push({
          source: sourceNode.id,
          target: target.id,
          kind: edgeKind,
          line: unresolvedRef.line,
          column: unresolvedRef.column,
          metadata: {
            refName: unresolvedRef.refName,
            refKind: unresolvedRef.refKind,
            external: target.metadata?.external === true || undefined,
          },
        });
      }
    }

    return {
      edges,
      nodes,
      resolvedRefs,
    };
  }

  private findTargets(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    if (unresolvedRef.refKind === 'import') {
      const importTargets = this.findImportTargets(sourceNode, unresolvedRef);
      if (importTargets.length > 0) {
        return importTargets;
      }
    }

    if (unresolvedRef.refKind === 'call') {
      const aliasTargets = this.findCallTargetsByImportAlias(sourceNode, unresolvedRef);
      if (aliasTargets.length > 0) {
        return aliasTargets;
      }

      const wildcardTargets = this.findTargetsByWildcardImport(sourceNode, this.extractSimpleName(unresolvedRef.refName), [
        'function',
        'method',
        'constructor',
        'class',
      ]);
      if (wildcardTargets.length > 0) {
        return wildcardTargets;
      }

      const receiverTargets = this.findCallTargetsByReceiver(sourceNode, unresolvedRef);
      if (receiverTargets.length > 0) {
        return receiverTargets;
      }
    }

    if (unresolvedRef.refKind === 'type' || unresolvedRef.refKind === 'inheritance') {
      const aliasTargets = this.findTypeTargetsByImportAlias(sourceNode, unresolvedRef);
      if (aliasTargets.length > 0) {
        return aliasTargets;
      }

      const wildcardTargets = this.findTargetsByWildcardImport(
        sourceNode,
        this.normalizeTypeReference(unresolvedRef.refName),
        ['class', 'interface', 'enum']
      );
      if (wildcardTargets.length > 0) {
        return wildcardTargets;
      }
    }

    const normalizedRefName = this.normalizeRefNameForLookup(unresolvedRef);
    const exactQualified = this.store.getNodesByQualifiedName(normalizedRefName);
    if (exactQualified.length > 0) {
      return exactQualified;
    }

    const simpleName = this.extractSimpleName(normalizedRefName);
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
      return uniqueById(nameMatches.filter((node) =>
        node.kind === 'function' ||
        node.kind === 'method' ||
        node.kind === 'constructor' ||
        node.kind === 'class'
      ));
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

  private findCallTargetsByImportAlias(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    const aliasName = unresolvedRef.refName.split('.')[0];
    if (!aliasName) {
      return [];
    }

    const importIndex = this.importIndexByFile.get(sourceNode.filePath);
    const aliasTargets = importIndex?.aliases.get(aliasName) ?? [];
    if (aliasTargets.length === 0) {
      return [];
    }

    if (!unresolvedRef.refName.includes('.')) {
      return aliasTargets;
    }

    const methodName = this.getMetadataString(unresolvedRef.metadata?.methodName) ?? this.extractSimpleName(unresolvedRef.refName);
    const methods: CodeNode[] = [];
    for (const target of aliasTargets) {
      if (target.kind === 'class' || target.kind === 'interface' || target.kind === 'enum') {
        methods.push(...this.findMethodsOnType(target.qualifiedName ?? target.name, methodName));
      }
    }

    return uniqueById(methods);
  }

  private findTypeTargetsByImportAlias(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    const typeName = this.normalizeTypeReference(unresolvedRef.refName);
    const importIndex = this.importIndexByFile.get(sourceNode.filePath);
    return importIndex?.aliases.get(typeName) ?? [];
  }

  private findTargetsByWildcardImport(sourceNode: CodeNode, name: string, kinds: CodeNode['kind'][]): CodeNode[] {
    const importIndex = this.importIndexByFile.get(sourceNode.filePath);
    const wildcardTargets = importIndex?.aliases.get('*') ?? [];
    if (wildcardTargets.length === 0) {
      return [];
    }

    const matched: CodeNode[] = [];
    for (const target of wildcardTargets) {
      if (target.kind === 'file') {
        matched.push(
          ...this.store
            .getNodesByFile(target.filePath)
            .filter((node) => node.name === name && kinds.includes(node.kind))
        );
      } else if (target.name === name && kinds.includes(target.kind)) {
        matched.push(target);
      }
    }

    return uniqueById(matched);
  }


  private findImportTargets(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    if (sourceNode.language === 'javascript' || sourceNode.language === 'typescript') {
      return this.findScriptImportTargets(sourceNode, unresolvedRef);
    }

    if (sourceNode.language === 'python') {
      return this.findPythonImportTargets(unresolvedRef);
    }

    return [];
  }

  private findScriptImportTargets(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    if (!unresolvedRef.refName.startsWith('.')) {
      return [];
    }

    const candidates = this.scriptImportFileCandidates(sourceNode.filePath, unresolvedRef.refName);
    return this.findImportedNodesByFiles(candidates, unresolvedRef);
  }

  private findPythonImportTargets(unresolvedRef: UnresolvedRef): CodeNode[] {
    const moduleName = this.getMetadataString(unresolvedRef.metadata?.moduleName) ??
      unresolvedRef.refName.split('.').slice(0, -1).join('.');
    if (!moduleName) {
      return [];
    }

    const candidates = this.pythonModuleFileCandidates(moduleName);
    return this.findImportedNodesByFiles(candidates, unresolvedRef);
  }

  private findImportedNodesByFiles(fileCandidates: string[], unresolvedRef: UnresolvedRef): CodeNode[] {
    for (const filePath of fileCandidates) {
      const fileNode = this.store.getNodeById(`file:${filePath}`);
      if (!fileNode) {
        continue;
      }

      const importedNames = this.getMetadataStringArray(unresolvedRef.metadata?.importedNames);
      if (importedNames.length === 0 || importedNames.includes('*')) {
        return [fileNode];
      }

      const fileNodes = this.store.getNodesByFile(filePath);
      const namedTargets = fileNodes.filter((node) =>
        importedNames.includes(node.name) &&
        node.kind !== 'file' &&
        node.kind !== 'module'
      );
      const reExportTargets = this.findReExportedNodes(filePath, importedNames);

      return namedTargets.length > 0 || reExportTargets.length > 0
        ? uniqueById([...namedTargets, ...reExportTargets])
        : [fileNode];
    }

    return [];
  }

  private findReExportedNodes(filePath: string, importedNames: string[]): CodeNode[] {
    const refs = this.store.getUnresolvedRefsByFile(filePath).filter((ref) =>
      ref.refKind === 'import' &&
      ref.metadata?.isReExport === true
    );
    const targets: CodeNode[] = [];

    for (const ref of refs) {
      const aliases = this.getMetadataRecord(ref.metadata?.importAliases);
      const targetNames = importedNames.includes('*')
        ? this.getMetadataStringArray(ref.metadata?.importedNames)
        : importedNames
          .map((name) => aliases[name] ?? name)
          .filter(Boolean);
      if (targetNames.length === 0) {
        continue;
      }

      const sourceNode = this.store.getNodeById(ref.fromNodeId);
      if (!sourceNode) {
        continue;
      }

      targets.push(
        ...this.findImportTargets(sourceNode, {
          ...ref,
          metadata: {
            ...ref.metadata,
            importedNames: targetNames,
          },
        })
      );
    }

    return uniqueById(targets);
  }

  private scriptImportFileCandidates(fromFilePath: string, importPath: string): string[] {
    const fromDir = path.posix.dirname(fromFilePath.replace(/\\/g, '/'));
    const rawPath = path.posix.normalize(path.posix.join(fromDir, importPath));
    const extensions = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs'];
    const candidates = extensions.map((extension) => `${rawPath}${extension}`);

    return [
      ...candidates,
      ...['index.ts', 'index.tsx', 'index.js', 'index.mjs', 'index.cjs'].map((fileName) =>
        path.posix.join(rawPath, fileName)
      ),
    ];
  }

  private pythonModuleFileCandidates(moduleName: string): string[] {
    const modulePath = moduleName.replace(/\./g, '/');
    return [
      `${modulePath}.py`,
      path.posix.join(modulePath, '__init__.py'),
    ];
  }

  private createExternalTargets(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    if (unresolvedRef.refKind === 'call') {
      return this.createExternalCallTargets(sourceNode, unresolvedRef);
    }

    if (unresolvedRef.refKind === 'import') {
      return this.createExternalImportTargets(unresolvedRef);
    }

    if (unresolvedRef.refKind === 'type' || unresolvedRef.refKind === 'inheritance') {
      return this.createExternalTypeTargets(sourceNode, unresolvedRef);
    }

    return [];
  }

  private createExternalCallTargets(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    const methodName = this.getMetadataString(unresolvedRef.metadata?.methodName) ?? this.extractSimpleName(unresolvedRef.refName);
    const receiver = this.getMetadataString(unresolvedRef.metadata?.receiver);
    const receiverType = receiver && receiver !== 'this' && receiver !== 'super'
      ? this.findReceiverType(sourceNode, receiver, unresolvedRef.line)
      : null;
    const ownerType = this.findOwnerType(sourceNode);
    const targetName = receiverType
      ? `${this.normalizeExternalType(receiverType)}.${methodName}`
      : receiver
        ? unresolvedRef.refName
        : sourceNode.language !== 'java'
          ? methodName
          : ownerType?.qualifiedName
          ? `${ownerType.qualifiedName}.${methodName}`
          : methodName;

    return [
      this.createExternalMethodNode(targetName, methodName, unresolvedRef, {
        receiver: receiver ?? undefined,
        receiverType: receiverType ?? undefined,
      }),
    ];
  }

  private createExternalImportTargets(unresolvedRef: UnresolvedRef): CodeNode[] {
    const importName = this.normalizeQualifiedName(unresolvedRef.refName);
    if (!importName || !this.isExternalQualifiedName(importName)) {
      return [];
    }

    const isWildcard = unresolvedRef.metadata?.isWildcard === true;
    return [
      this.createExternalNode({
        qualifiedName: importName,
        name: this.extractSimpleName(importName),
        nodeKind: isWildcard || this.looksLikePackageName(importName) ? 'module' : 'class',
        externalKind: isWildcard ? 'package-import' : 'import',
        unresolvedRef,
      }),
    ];
  }

  private createExternalTypeTargets(sourceNode: CodeNode, unresolvedRef: UnresolvedRef): CodeNode[] {
    const resolvedType = this.resolveExternalTypeName(sourceNode.filePath, unresolvedRef.refName);
    if (!resolvedType) {
      return [];
    }

    return [
      this.createExternalNode({
        qualifiedName: resolvedType.qualifiedName,
        name: resolvedType.name,
        nodeKind: 'class',
        externalKind: resolvedType.externalKind,
        unresolvedRef,
      }),
    ];
  }

  private createExternalMethodNode(
    qualifiedName: string,
    methodName: string,
    unresolvedRef: UnresolvedRef,
    metadata: Record<string, unknown>
  ): CodeNode {
    const id = `external:method:${qualifiedName}`;
    return {
      id,
      kind: 'method',
      name: methodName,
      qualifiedName,
      filePath: '<external>',
      language: unresolvedRef.language,
      startLine: 0,
      endLine: 0,
      startColumn: 0,
      endColumn: 0,
      isExported: true,
      metadata: {
        external: true,
        refName: unresolvedRef.refName,
        refKind: unresolvedRef.refKind,
        ...metadata,
      },
    };
  }

  private createExternalNode(input: {
    qualifiedName: string;
    name: string;
    nodeKind: CodeNode['kind'];
    externalKind: string;
    unresolvedRef: UnresolvedRef;
  }): CodeNode {
    const id = `external:${input.nodeKind}:${input.qualifiedName}`;
    return {
      id,
      kind: input.nodeKind,
      name: input.name,
      qualifiedName: input.qualifiedName,
      filePath: '<external>',
      language: input.unresolvedRef.language,
      startLine: 0,
      endLine: 0,
      startColumn: 0,
      endColumn: 0,
      isExported: true,
      metadata: {
        external: true,
        externalKind: input.externalKind,
        refName: input.unresolvedRef.refName,
        refKind: input.unresolvedRef.refKind,
      },
    };
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

  private normalizeExternalType(typeName: string): string {
    return typeName.replace(/<.*?>/g, '').replace(/\[\]$/g, '').trim();
  }

  private normalizeRefNameForLookup(ref: UnresolvedRef): string {
    if (ref.refKind === 'type' || ref.refKind === 'inheritance') {
      return this.normalizeTypeReference(ref.refName);
    }

    return ref.refName;
  }

  private buildImportIndex(unresolvedRefs: UnresolvedRef[]): Map<string, FileImportIndex> {
    const index = new Map<string, FileImportIndex>();

    for (const ref of unresolvedRefs) {
      if (ref.refKind !== 'import') {
        continue;
      }

      const importName = this.normalizeQualifiedName(ref.refName);
      if (!importName) {
        continue;
      }

      const fileIndex = index.get(ref.filePath) ?? {
        exactImports: new Map<string, string>(),
        wildcardImports: [],
        aliases: new Map<string, CodeNode[]>(),
      };

      if (ref.metadata?.isWildcard === true) {
        fileIndex.wildcardImports.push(importName);
      } else {
        fileIndex.exactImports.set(this.extractSimpleName(importName), importName);
      }

      const sourceNode = this.store.getNodeById(ref.fromNodeId);
      const aliasTargets = sourceNode ? this.findImportTargets(sourceNode, ref) : [];
      const aliases = this.getMetadataRecord(ref.metadata?.importAliases);
      for (const [aliasName, importedName] of Object.entries(aliases)) {
        const directTargets = importedName === '*'
          ? aliasTargets
          : aliasTargets.filter((node) =>
            node.name === importedName ||
            node.name === aliasName ||
            node.metadata?.default === true
          );
        const targets = directTargets.length > 0 ? directTargets : aliasTargets;
        if (targets.length > 0) {
          fileIndex.aliases.set(aliasName, uniqueById(targets));
        }
      }

      index.set(ref.filePath, fileIndex);
    }

    return index;
  }

  private resolveExternalTypeName(
    filePath: string,
    refName: string
  ): { qualifiedName: string; name: string; externalKind: string } | null {
    const rawTypeName = this.normalizeTypeReference(refName);
    if (!rawTypeName) {
      return null;
    }

    if (JAVA_PRIMITIVE_TYPES.has(rawTypeName)) {
      return {
        qualifiedName: rawTypeName,
        name: rawTypeName,
        externalKind: 'java-primitive',
      };
    }

    if (this.isExternalQualifiedName(rawTypeName)) {
      return {
        qualifiedName: rawTypeName,
        name: this.extractSimpleName(rawTypeName),
        externalKind: 'external-type',
      };
    }

    const importIndex = this.importIndexByFile.get(filePath);
    const importedType = importIndex?.exactImports.get(rawTypeName);
    if (importedType && this.isExternalQualifiedName(importedType)) {
      return {
        qualifiedName: importedType,
        name: rawTypeName,
        externalKind: 'imported-type',
      };
    }

    if (JAVA_LANG_TYPES.has(rawTypeName)) {
      return {
        qualifiedName: `java.lang.${rawTypeName}`,
        name: rawTypeName,
        externalKind: 'java-lang',
      };
    }

    const commonJavaType = COMMON_JAVA_TYPES.get(rawTypeName);
    if (commonJavaType) {
      return {
        qualifiedName: commonJavaType,
        name: rawTypeName,
        externalKind: 'java-common',
      };
    }

    const wildcardMatch = importIndex?.wildcardImports
      .map((packageName) => `${packageName}.${rawTypeName}`)
      .find((qualifiedName) => this.isExternalQualifiedName(qualifiedName));
    if (wildcardMatch) {
      return {
        qualifiedName: wildcardMatch,
        name: rawTypeName,
        externalKind: 'wildcard-imported-type',
      };
    }

    return null;
  }

  private normalizeTypeReference(refName: string): string {
    const normalized = refName
      .replace(/<.*>/g, '')
      .replace(/\[\]/g, '')
      .replace(/\.\.\.$/, '')
      .replace(/^\? extends\s+/, '')
      .replace(/^\? super\s+/, '')
      .trim();
    const genericStart = normalized.indexOf('<');

    return genericStart >= 0
      ? normalized.slice(0, genericStart).trim()
      : normalized;
  }

  private normalizeQualifiedName(value: string): string {
    return value.replace(/\.\*$/, '').trim();
  }

  private isExternalQualifiedName(value: string): boolean {
    return EXTERNAL_QUALIFIED_PREFIXES.some((prefix) => value.startsWith(prefix));
  }

  private looksLikePackageName(value: string): boolean {
    const lastSegment = this.extractSimpleName(value);
    return lastSegment === lastSegment.toLowerCase();
  }

  private getMetadataString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private getMetadataStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
  }

  private getMetadataRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const entries = Object.entries(value).filter((entry): entry is [string, string] =>
      typeof entry[0] === 'string' && typeof entry[1] === 'string'
    );
    return Object.fromEntries(entries);
  }
}
