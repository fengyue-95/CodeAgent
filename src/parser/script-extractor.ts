import { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './index';
import { getParser } from './grammars';
import { CodeEdge, CodeNode, FileRecord, Language, NodeKind, ParseResult, UnresolvedRef } from '../types';
import { sha256 } from '../utils/hash';
import { getChildByField, getNodeText, lastQualifiedSegment, namedChildren, normalizeWhitespace } from './common';

interface ContainerFrame {
  id: string;
  kind: NodeKind;
  qualifiedName?: string;
}

function qualifiedName(parent: ContainerFrame, name: string): string {
  return parent.qualifiedName ? `${parent.qualifiedName}.${name}` : name;
}

export class ScriptParser implements LanguageParser {
  constructor(private readonly language: Extract<Language, 'javascript' | 'typescript'>) {}

  supports(language: Language): boolean {
    return language === this.language;
  }

  async parse(filePath: string, content: string): Promise<ParseResult> {
    const parser = await getParser(this.language);
    const tree = parser.parse(content);
    if (!tree) {
      throw new Error(`Failed to parse ${this.language} file: ${filePath}`);
    }

    try {
      const fileRecord: FileRecord = {
        path: filePath,
        language: this.language,
        contentHash: sha256(content),
        size: Buffer.byteLength(content, 'utf8'),
        modifiedAt: Date.now(),
        indexedAt: Date.now(),
      };
      const extractor = new ScriptExtractor(filePath, content, this.language);
      const { nodes, edges, unresolvedRefs } = extractor.extract(tree.rootNode);
      return { file: fileRecord, nodes, edges, unresolvedRefs };
    } finally {
      tree.delete();
    }
  }
}

class ScriptExtractor {
  private readonly nodes: CodeNode[] = [];
  private readonly edges: CodeEdge[] = [];
  private readonly unresolvedRefs: UnresolvedRef[] = [];
  private readonly containers: ContainerFrame[] = [];
  private fileNodeId!: string;

  constructor(
    private readonly filePath: string,
    private readonly source: string,
    private readonly language: Extract<Language, 'javascript' | 'typescript'>
  ) {}

  extract(root: SyntaxNode): Pick<ParseResult, 'nodes' | 'edges' | 'unresolvedRefs'> {
    const lineCount = this.source.length === 0 ? 1 : this.source.split('\n').length;
    const fileNode = this.createFileNode(lineCount);
    this.nodes.push(fileNode);
    this.fileNodeId = fileNode.id;
    this.containers.push({ id: fileNode.id, kind: 'file', qualifiedName: fileNode.qualifiedName });
    this.visit(root);
    this.containers.pop();
    return { nodes: this.nodes, edges: this.edges, unresolvedRefs: this.unresolvedRefs };
  }

  private createFileNode(lineCount: number): CodeNode {
    return {
      id: `file:${this.filePath}`,
      kind: 'file',
      name: this.filePath.split('/').pop() ?? this.filePath,
      qualifiedName: this.filePath,
      filePath: this.filePath,
      language: this.language,
      startLine: 1,
      endLine: lineCount,
      startColumn: 0,
      endColumn: 0,
    };
  }

  private visit(node: SyntaxNode): void {
    switch (node.type) {
      case 'import_statement':
        this.extractImport(node);
        return;
      case 'export_statement':
        if (getChildByField(node, 'source')) {
          this.extractReExport(node);
          return;
        }
        break;
      case 'class_declaration':
        this.extractClass(node);
        return;
      case 'interface_declaration':
        this.extractInterface(node);
        return;
      case 'function_declaration':
        this.extractFunction(node);
        return;
      case 'method_definition':
        this.extractMethod(node);
        return;
      case 'variable_declarator':
        this.extractVariableFunction(node);
        break;
      case 'call_expression':
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
    const sourceNode = getChildByField(node, 'source');
    const importName = normalizeWhitespace(getNodeText(this.source, sourceNode)).replace(/^['"]|['"]$/g, '');
    if (!importName) {
      return;
    }

    const { importedNames, importAliases } = this.extractImportBindings(node);
    this.unresolvedRefs.push({
      fromNodeId: this.fileNodeId,
      refName: importName,
      refKind: 'import',
      filePath: this.filePath,
      language: this.language,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      metadata: {
        importText: normalizeWhitespace(getNodeText(this.source, node)),
        importedNames,
        importAliases,
      },
    });
  }

  private extractReExport(node: SyntaxNode): void {
    const sourceNode = getChildByField(node, 'source');
    const importName = normalizeWhitespace(getNodeText(this.source, sourceNode)).replace(/^['"]|['"]$/g, '');
    if (!importName) {
      return;
    }

    const { importedNames, importAliases } = this.extractExportBindings(node);
    this.unresolvedRefs.push({
      fromNodeId: this.fileNodeId,
      refName: importName,
      refKind: 'import',
      filePath: this.filePath,
      language: this.language,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      metadata: {
        importText: normalizeWhitespace(getNodeText(this.source, node)),
        importedNames,
        importAliases,
        isReExport: true,
      },
    });
  }

  private extractImportBindings(node: SyntaxNode): { importedNames: string[]; importAliases: Record<string, string> } {
    const names = new Set<string>();
    const aliases: Record<string, string> = {};
    const visitImportChild = (child: SyntaxNode): void => {
      if (child.type === 'import_specifier') {
        const nameNode = getChildByField(child, 'name');
        const aliasNode = getChildByField(child, 'alias');
        const name = getNodeText(this.source, nameNode);
        const alias = getNodeText(this.source, aliasNode);
        if (name) {
          names.add(name);
          aliases[alias || name] = name;
        }
        return;
      }

      if (child.type === 'namespace_import') {
        const aliasNode = namedChildren(child).find((nested) => nested.type === 'identifier');
        const alias = getNodeText(this.source, aliasNode);
        names.add('*');
        if (alias) {
          aliases[alias] = '*';
        }
        return;
      }

      if (child.type === 'identifier') {
        const localName = getNodeText(this.source, child);
        names.add('default');
        aliases[localName] = 'default';
      }

      for (const nested of namedChildren(child)) {
        visitImportChild(nested);
      }
    };

    const clause = namedChildren(node).find((child) => child.type === 'import_clause');
    if (clause) {
      visitImportChild(clause);
    }

    return {
      importedNames: Array.from(names).filter(Boolean),
      importAliases: aliases,
    };
  }

  private extractExportBindings(node: SyntaxNode): { importedNames: string[]; importAliases: Record<string, string> } {
    const names = new Set<string>();
    const aliases: Record<string, string> = {};
    const exportClause = namedChildren(node).find((child) => child.type === 'export_clause');

    if (!exportClause) {
      names.add('*');
      aliases['*'] = '*';
      return {
        importedNames: ['*'],
        importAliases: aliases,
      };
    }

    for (const child of namedChildren(exportClause)) {
      if (child.type !== 'export_specifier') {
        continue;
      }

      const nameNode = getChildByField(child, 'name');
      const aliasNode = getChildByField(child, 'alias');
      const name = getNodeText(this.source, nameNode);
      const alias = getNodeText(this.source, aliasNode);
      if (name) {
        names.add(name);
        aliases[alias || name] = name;
      }
    }

    return {
      importedNames: Array.from(names).filter(Boolean),
      importAliases: aliases,
    };
  }

  private extractClass(node: SyntaxNode): void {
    const nameNode = getChildByField(node, 'name');
    const name = getNodeText(this.source, nameNode);
    if (!name) {
      return;
    }

    const parent = this.currentContainer();
    const classNode = this.createNode('class', name, qualifiedName(parent, name), node);
    const heritage = namedChildren(node).find((child) => child.type === 'class_heritage');
    if (heritage) {
      for (const clause of namedChildren(heritage)) {
        const edgeKind = clause.type === 'implements_clause' ? 'implements' : 'extends';
        for (const target of this.extractTypeNames(clause)) {
          this.unresolvedRefs.push({
            fromNodeId: classNode.id,
            refName: target,
            refKind: 'inheritance',
            filePath: this.filePath,
            language: this.language,
            line: clause.startPosition.row + 1,
            column: clause.startPosition.column,
            metadata: { edgeKind },
          });
        }
      }
    }

    this.containers.push({ id: classNode.id, kind: 'class', qualifiedName: classNode.qualifiedName });
    const body = getChildByField(node, 'body');
    if (body) {
      for (const child of namedChildren(body)) {
        this.visit(child);
      }
    }
    this.containers.pop();
  }

  private extractInterface(node: SyntaxNode): void {
    const nameNode = getChildByField(node, 'name');
    const name = getNodeText(this.source, nameNode);
    if (!name) {
      return;
    }

    const parent = this.currentContainer();
    const interfaceNode = this.createNode('interface', name, qualifiedName(parent, name), node);
    const extendsNode = namedChildren(node).find((child) => child.type === 'extends_type_clause');
    if (extendsNode) {
      for (const target of this.extractTypeNames(extendsNode)) {
        this.unresolvedRefs.push({
          fromNodeId: interfaceNode.id,
          refName: target,
          refKind: 'inheritance',
          filePath: this.filePath,
          language: this.language,
          line: extendsNode.startPosition.row + 1,
          column: extendsNode.startPosition.column,
          metadata: { edgeKind: 'extends' },
        });
      }
    }
  }

  private extractFunction(node: SyntaxNode): void {
    const nameNode = getChildByField(node, 'name');
    const name = getNodeText(this.source, nameNode);
    if (!name) {
      return;
    }

    const parent = this.currentContainer();
    const functionNode = this.createNode('function', name, qualifiedName(parent, name), node, {
      signature: this.signatureForFunction(name, node),
      isExported: this.isExported(node),
    });
    this.extractTypeAnnotations(node, functionNode.id);
    this.visitFunctionBody(node, functionNode);
  }

  private extractMethod(node: SyntaxNode): void {
    const nameNode = getChildByField(node, 'name');
    const name = getNodeText(this.source, nameNode);
    if (!name) {
      return;
    }

    const parent = this.currentContainer();
    const methodNode = this.createNode('method', name, qualifiedName(parent, name), node, {
      signature: this.signatureForFunction(name, node),
      isExported: this.isExported(node),
    });
    this.extractTypeAnnotations(node, methodNode.id);
    this.visitFunctionBody(node, methodNode);
  }

  private extractVariableFunction(node: SyntaxNode): void {
    const valueNode = getChildByField(node, 'value');
    if (!valueNode || (valueNode.type !== 'arrow_function' && valueNode.type !== 'function')) {
      return;
    }

    const nameNode = getChildByField(node, 'name');
    const name = getNodeText(this.source, nameNode);
    if (!name) {
      return;
    }

    const parent = this.currentContainer();
    const functionNode = this.createNode('function', name, qualifiedName(parent, name), node, {
      signature: this.signatureForFunction(name, valueNode),
      isExported: this.isExported(node),
    });
    this.extractTypeAnnotations(valueNode, functionNode.id);
    this.visitFunctionBody(valueNode, functionNode);
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
      language: this.language,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      metadata: {
        methodName: lastQualifiedSegment(refName),
        receiver: refName.includes('.') ? refName.split('.').slice(0, -1).join('.') : undefined,
      },
    });
  }

  private visitFunctionBody(node: SyntaxNode, callableNode: CodeNode): void {
    const body = getChildByField(node, 'body') ?? namedChildren(node).find((child) => child.type === 'statement_block');
    if (!body) {
      return;
    }

    this.containers.push({ id: callableNode.id, kind: callableNode.kind, qualifiedName: callableNode.qualifiedName });
    for (const child of namedChildren(body)) {
      this.visit(child);
    }
    this.containers.pop();
  }

  private signatureForFunction(name: string, node: SyntaxNode): string {
    const parameters = getChildByField(node, 'parameters');
    const returnType = getChildByField(node, 'return_type');
    const parameterText = normalizeWhitespace(getNodeText(this.source, parameters));
    const returnText = normalizeWhitespace(getNodeText(this.source, returnType));
    return `${name}${parameterText}${returnText ? ` ${returnText}` : ''}`;
  }

  private extractTypeAnnotations(node: SyntaxNode, fromNodeId: string): void {
    if (this.language !== 'typescript') {
      return;
    }

    const visit = (current: SyntaxNode): void => {
      if (current.type === 'type_annotation' || current.type === 'return_type') {
        const relation = this.isReturnTypeAnnotation(current) ? 'returns' : 'type';
        for (const typeName of this.extractTypeNames(current)) {
          this.unresolvedRefs.push({
            fromNodeId,
            refName: typeName,
            refKind: 'type',
            filePath: this.filePath,
            language: this.language,
            line: current.startPosition.row + 1,
            column: current.startPosition.column,
            metadata: {
              relation,
            },
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

  private isReturnTypeAnnotation(node: SyntaxNode): boolean {
    if (node.type === 'return_type') {
      return true;
    }

    let current = node.parent;
    while (current) {
      if (current.type === 'method_definition' || current.type === 'function_declaration' || current.type === 'arrow_function') {
        return getChildByField(current, 'return_type')?.id === node.id;
      }

      current = current.parent;
    }

    return false;
  }

  private extractTypeNames(node: SyntaxNode): string[] {
    const names = new Set<string>();
    const visit = (current: SyntaxNode): void => {
      if (current.type === 'type_identifier' || current.type === 'identifier') {
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

  private isBuiltinTypeName(name: string): boolean {
    return new Set(['Array', 'Promise', 'Record', 'ReadonlyArray', 'boolean', 'number', 'string', 'symbol', 'unknown', 'void']).has(name);
  }

  private isExported(node: SyntaxNode): boolean {
    let current: SyntaxNode | null = node;
    while (current) {
      if (current.type === 'export_statement') {
        return true;
      }
      current = current.parent;
    }

    return false;
  }

  private currentContainer(): ContainerFrame {
    return this.containers[this.containers.length - 1]!;
  }

  private currentCallableContainer(): ContainerFrame | null {
    for (let index = this.containers.length - 1; index >= 0; index -= 1) {
      const frame = this.containers[index];
      if (frame && (frame.kind === 'function' || frame.kind === 'method' || frame.kind === 'constructor')) {
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
      language: this.language,
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
