import { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './index';
import { getParser } from './grammars';
import { CodeEdge, CodeNode, FileRecord, NodeKind, ParseResult, UnresolvedRef } from '../types';
import { sha256 } from '../utils/hash';
import { getChildByField, getNodeText, namedChildren, normalizeWhitespace } from './common';

interface ContainerFrame {
  id: string;
  kind: NodeKind;
  qualifiedName?: string;
}

function qualifiedName(parent: ContainerFrame, name: string): string {
  return parent.qualifiedName ? `${parent.qualifiedName}.${name}` : name;
}

export class PythonParser implements LanguageParser {
  supports(language: string): boolean {
    return language === 'python';
  }

  async parse(filePath: string, content: string): Promise<ParseResult> {
    const parser = await getParser('python');
    const tree = parser.parse(content);
    if (!tree) {
      throw new Error(`Failed to parse Python file: ${filePath}`);
    }

    try {
      const fileRecord: FileRecord = {
        path: filePath,
        language: 'python',
        contentHash: sha256(content),
        size: Buffer.byteLength(content, 'utf8'),
        modifiedAt: Date.now(),
        indexedAt: Date.now(),
      };
      const extractor = new PythonExtractor(filePath, content);
      const { nodes, edges, unresolvedRefs } = extractor.extract(tree.rootNode);
      return { file: fileRecord, nodes, edges, unresolvedRefs };
    } finally {
      tree.delete();
    }
  }
}

class PythonExtractor {
  private readonly nodes: CodeNode[] = [];
  private readonly edges: CodeEdge[] = [];
  private readonly unresolvedRefs: UnresolvedRef[] = [];
  private readonly containers: ContainerFrame[] = [];
  private fileNodeId!: string;

  constructor(
    private readonly filePath: string,
    private readonly source: string
  ) {}

  extract(root: SyntaxNode): Pick<ParseResult, 'nodes' | 'edges' | 'unresolvedRefs'> {
    const lineCount = this.source.length === 0 ? 1 : this.source.split('\n').length;
    const fileNode: CodeNode = {
      id: `file:${this.filePath}`,
      kind: 'file',
      name: this.filePath.split('/').pop() ?? this.filePath,
      qualifiedName: this.filePath,
      filePath: this.filePath,
      language: 'python',
      startLine: 1,
      endLine: lineCount,
      startColumn: 0,
      endColumn: 0,
    };

    this.nodes.push(fileNode);
    this.fileNodeId = fileNode.id;
    this.containers.push({ id: fileNode.id, kind: 'file', qualifiedName: fileNode.qualifiedName });
    this.visit(root);
    this.containers.pop();
    return { nodes: this.nodes, edges: this.edges, unresolvedRefs: this.unresolvedRefs };
  }

  private visit(node: SyntaxNode): void {
    switch (node.type) {
      case 'import_statement':
      case 'import_from_statement':
        this.extractImport(node);
        return;
      case 'class_definition':
        this.extractClass(node);
        return;
      case 'function_definition':
        this.extractFunction(node);
        return;
      case 'call':
        this.extractCall(node);
        break;
      default:
        break;
    }

    for (const child of namedChildren(node)) {
      this.visit(child);
    }
  }

  private extractImport(node: SyntaxNode): void {
    const moduleNode = getChildByField(node, 'module_name');
    const isWildcard = namedChildren(node).some((child) => child.type === 'wildcard_import');
    const names = namedChildren(node)
      .filter((child) =>
        child.id !== moduleNode?.id &&
        (child.type === 'dotted_name' || child.type === 'aliased_import')
      )
      .map((child) => normalizeWhitespace(getNodeText(this.source, child)))
      .filter(Boolean);
    const moduleName = normalizeWhitespace(getNodeText(this.source, moduleNode));
    const imports = isWildcard && moduleName
      ? [{
        refName: moduleName,
        importedName: '*',
        localName: '*',
      }]
      : moduleName
      ? names.map((name) => ({
        refName: `${moduleName}.${name.split(' as ')[0]}`,
        importedName: name.split(' as ')[0].split('.').pop() ?? name,
        localName: name.split(' as ')[1] ?? name.split(' as ')[0].split('.').pop() ?? name,
      }))
      : names.map((name) => ({
        refName: name.split(' as ')[0],
        importedName: name.split(' as ')[0].split('.').pop() ?? name,
        localName: name.split(' as ')[1] ?? name.split(' as ')[0].split('.').pop() ?? name,
      }));

    for (const item of imports) {
      this.unresolvedRefs.push({
        fromNodeId: this.fileNodeId,
        refName: item.refName,
        refKind: 'import',
        filePath: this.filePath,
        language: 'python',
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        metadata: {
          importText: normalizeWhitespace(getNodeText(this.source, node)),
          importedNames: [item.importedName],
          importAliases: {
            [item.localName]: item.importedName,
          },
          moduleName: moduleName || undefined,
        },
      });
    }
  }

  private extractClass(node: SyntaxNode): void {
    const nameNode = getChildByField(node, 'name');
    const name = getNodeText(this.source, nameNode);
    if (!name) {
      return;
    }

    const parent = this.currentContainer();
    const classNode = this.createNode('class', name, qualifiedName(parent, name), node);
    const superclasses = getChildByField(node, 'superclasses');
    if (superclasses) {
      for (const child of namedChildren(superclasses)) {
        for (const refName of this.extractTypeNames(child)) {
          this.unresolvedRefs.push({
            fromNodeId: classNode.id,
            refName,
            refKind: 'inheritance',
            filePath: this.filePath,
            language: 'python',
            line: child.startPosition.row + 1,
            column: child.startPosition.column,
            metadata: { edgeKind: 'extends' },
          });
        }
      }
    }

    this.containers.push({ id: classNode.id, kind: 'class', qualifiedName: classNode.qualifiedName });
    const body = getChildByField(node, 'body');
    if (body) {
      this.extractTypeAnnotations(body, classNode.id);
      for (const child of namedChildren(body)) {
        this.visit(child);
      }
    }
    this.containers.pop();
  }

  private extractFunction(node: SyntaxNode): void {
    const nameNode = getChildByField(node, 'name');
    const name = getNodeText(this.source, nameNode);
    if (!name) {
      return;
    }

    const parent = this.currentContainer();
    const kind = parent.kind === 'class' ? 'method' : 'function';
    const functionNode = this.createNode(kind, name, qualifiedName(parent, name), node, {
      signature: this.signatureForFunction(name, node),
    });
    this.extractTypeAnnotations(node, functionNode.id);

    const body = getChildByField(node, 'body');
    if (!body) {
      return;
    }

    this.containers.push({ id: functionNode.id, kind: functionNode.kind, qualifiedName: functionNode.qualifiedName });
    for (const child of namedChildren(body)) {
      this.visit(child);
    }
    this.containers.pop();
  }

  private extractCall(node: SyntaxNode): void {
    const caller = this.currentCallableContainer();
    if (!caller) {
      return;
    }

    const functionNode = getChildByField(node, 'function');
    const refName = normalizeWhitespace(getNodeText(this.source, functionNode));
    if (!refName) {
      return;
    }

    this.unresolvedRefs.push({
      fromNodeId: caller.id,
      refName,
      refKind: 'call',
      filePath: this.filePath,
      language: 'python',
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      metadata: {
        methodName: refName.split('.').pop() ?? refName,
        receiver: refName.includes('.') ? refName.split('.').slice(0, -1).join('.') : undefined,
      },
    });
  }

  private extractTypeAnnotations(node: SyntaxNode, fromNodeId: string): void {
    const visit = (current: SyntaxNode): void => {
      if (current !== node && (current.type === 'function_definition' || current.type === 'class_definition')) {
        return;
      }

      if (current.type === 'type') {
        const relation = this.isReturnType(current) ? 'returns' : 'type';
        for (const typeName of this.extractTypeNames(current)) {
          this.unresolvedRefs.push({
            fromNodeId,
            refName: typeName,
            refKind: 'type',
            filePath: this.filePath,
            language: 'python',
            line: current.startPosition.row + 1,
            column: current.startPosition.column,
            metadata: { relation },
          });
        }
        return;
      }

      for (const child of namedChildren(current)) {
        visit(child);
      }
    };

    visit(node);
  }

  private extractTypeNames(node: SyntaxNode): string[] {
    const names = new Set<string>();
    const visit = (current: SyntaxNode): void => {
      if (current.type === 'identifier') {
        const name = getNodeText(this.source, current);
        if (name && !this.isBuiltinTypeName(name)) {
          names.add(name);
        }
        return;
      }

      for (const child of namedChildren(current)) {
        visit(child);
      }
    };

    visit(node);
    return Array.from(names);
  }

  private isReturnType(node: SyntaxNode): boolean {
    return node.parent?.type === 'function_definition' &&
      getChildByField(node.parent, 'return_type')?.id === node.id;
  }

  private isBuiltinTypeName(name: string): boolean {
    return new Set([
      'Any',
      'Callable',
      'Dict',
      'List',
      'None',
      'Optional',
      'Sequence',
      'Set',
      'Tuple',
      'Union',
      'bool',
      'bytes',
      'dict',
      'float',
      'int',
      'list',
      'object',
      'set',
      'str',
      'tuple',
    ]).has(name);
  }

  private signatureForFunction(name: string, node: SyntaxNode): string {
    const parameters = getChildByField(node, 'parameters');
    return `${name}${normalizeWhitespace(getNodeText(this.source, parameters))}`;
  }

  private currentContainer(): ContainerFrame {
    return this.containers[this.containers.length - 1]!;
  }

  private currentCallableContainer(): ContainerFrame | null {
    for (let index = this.containers.length - 1; index >= 0; index -= 1) {
      const frame = this.containers[index];
      if (frame && (frame.kind === 'function' || frame.kind === 'method')) {
        return frame;
      }
    }

    return null;
  }

  private createNode(
    kind: NodeKind,
    name: string,
    qname: string,
    node: SyntaxNode,
    extras: Partial<CodeNode> = {}
  ): CodeNode {
    const currentContainer = this.currentContainer();
    const createdNode: CodeNode = {
      id: `${kind}:${qname}:${node.startPosition.row + 1}:${node.startPosition.column}`,
      kind,
      name,
      qualifiedName: qname,
      filePath: this.filePath,
      language: 'python',
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      ...extras,
    };

    this.nodes.push(createdNode);
    this.edges.push({ source: currentContainer.id, target: createdNode.id, kind: 'contains' });
    return createdNode;
  }
}
