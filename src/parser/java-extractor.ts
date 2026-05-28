import Parser from 'web-tree-sitter';
import { LanguageParser } from './index';
import { getParser } from './grammars';
import {
  CodeEdge,
  CodeNode,
  FileRecord,
  Language,
  NodeKind,
  ParseResult,
  UnresolvedRef,
} from '../types';
import { sha256 } from '../utils/hash';
import { children, getChildByField, getNodeText, lastQualifiedSegment, namedChildren, normalizeWhitespace } from './common';

type SyntaxNode = Parser.SyntaxNode;

interface ContainerFrame {
  id: string;
  kind: NodeKind;
  qualifiedName?: string;
  filePath: string;
}

interface JavaVariable {
  name: string;
  type: string;
  line: number;
  column: number;
}

function getQualifiedName(
  packageName: string | undefined,
  containerQualifiedName: string | undefined,
  name: string
): string {
  if (containerQualifiedName) {
    return `${containerQualifiedName}.${name}`;
  }

  if (packageName) {
    return `${packageName}.${name}`;
  }

  return name;
}

function extractModifiers(node: SyntaxNode, source: string): string[] {
  const modifiersNode = children(node).find((child) => child.type === 'modifiers');
  if (!modifiersNode) {
    return [];
  }

  return normalizeWhitespace(getNodeText(source, modifiersNode)).split(' ').filter(Boolean);
}

function extractDocstring(node: SyntaxNode, source: string): string | undefined {
  let current = node.previousSibling;
  while (current) {
    if (current.type === 'line_comment') {
      current = current.previousSibling;
      continue;
    }

    if (current.type === 'block_comment') {
      const text = getNodeText(source, current).trim();
      if (text.startsWith('/**')) {
        return text;
      }
    }
    break;
  }

  return undefined;
}

export class JavaParser implements LanguageParser {
  supports(language: Language): boolean {
    return language === 'java';
  }

  async parse(filePath: string, content: string): Promise<ParseResult> {
    const parser = await getParser('java');
    const tree = parser.parse(content);
    if (!tree) {
      throw new Error(`Failed to parse Java file: ${filePath}`);
    }

    try {
      const fileRecord: FileRecord = {
        path: filePath,
        language: 'java',
        contentHash: sha256(content),
        size: Buffer.byteLength(content, 'utf8'),
        modifiedAt: Date.now(),
        indexedAt: Date.now(),
      };

      const extractor = new JavaExtractor(filePath, content);
      const { nodes, edges, unresolvedRefs } = extractor.extract(tree.rootNode);

      return {
        file: fileRecord,
        nodes,
        edges,
        unresolvedRefs,
      };
    } finally {
      tree.delete();
    }
  }
}

class JavaExtractor {
  private readonly nodes: CodeNode[] = [];
  private readonly edges: CodeEdge[] = [];
  private readonly unresolvedRefs: UnresolvedRef[] = [];
  private readonly containers: ContainerFrame[] = [];
  private packageName?: string;
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
      language: 'java',
      startLine: 1,
      endLine: lineCount,
      startColumn: 0,
      endColumn: 0,
    };

    this.nodes.push(fileNode);
    this.fileNodeId = fileNode.id;
    this.containers.push({
      id: fileNode.id,
      kind: 'file',
      qualifiedName: undefined,
      filePath: this.filePath,
    });

    this.visit(root);
    this.containers.pop();

    return {
      nodes: this.nodes,
      edges: this.edges,
      unresolvedRefs: this.unresolvedRefs,
    };
  }

  private visit(node: SyntaxNode): void {
    switch (node.type) {
      case 'package_declaration':
        this.extractPackage(node);
        return;
      case 'import_declaration':
        this.extractImport(node);
        return;
      case 'class_declaration':
        this.extractTypeDeclaration(node, 'class');
        return;
      case 'interface_declaration':
        this.extractTypeDeclaration(node, 'interface');
        return;
      case 'enum_declaration':
        this.extractTypeDeclaration(node, 'enum');
        return;
      case 'field_declaration':
        this.extractField(node);
        return;
      case 'method_declaration':
        this.extractMethod(node, 'method');
        return;
      case 'constructor_declaration':
        this.extractMethod(node, 'constructor');
        return;
      case 'method_invocation':
        this.extractMethodInvocation(node);
        break;
      case 'object_creation_expression':
        this.extractObjectCreation(node);
        break;
      case 'local_variable_declaration':
        this.extractLocalVariable(node);
        return;
      default:
        break;
    }

    for (const child of namedChildren(node)) {
      this.visit(child);
    }
  }

  private extractPackage(node: SyntaxNode): void {
    const nameNode = namedChildren(node).find(
      (child) => child.type === 'scoped_identifier' || child.type === 'identifier'
    );
    if (!nameNode) {
      return;
    }

    this.packageName = normalizeWhitespace(getNodeText(this.source, nameNode));

    const moduleNode: CodeNode = {
      id: `module:${this.packageName}`,
      kind: 'module',
      name: lastQualifiedSegment(this.packageName),
      qualifiedName: this.packageName,
      filePath: this.filePath,
      language: 'java',
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      metadata: {
        moduleType: 'java-package',
      },
    };

    this.nodes.push(moduleNode);
    this.edges.push({
      source: this.fileNodeId,
      target: moduleNode.id,
      kind: 'contains',
    });
  }

  private extractImport(node: SyntaxNode): void {
    const importNode = namedChildren(node).find(
      (child) => child.type === 'scoped_identifier' || child.type === 'identifier'
    );
    if (!importNode) {
      return;
    }

    const importName = normalizeWhitespace(getNodeText(this.source, importNode));
    const importText = normalizeWhitespace(getNodeText(this.source, node));

    this.unresolvedRefs.push({
      fromNodeId: this.fileNodeId,
      refName: importName,
      refKind: 'import',
      filePath: this.filePath,
      language: 'java',
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      metadata: {
        importText,
        isWildcard: importText.includes('*'),
        isStatic: importText.includes(' static '),
      },
    });
  }

  private extractTypeDeclaration(node: SyntaxNode, kind: Extract<NodeKind, 'class' | 'interface' | 'enum'>): void {
    const nameNode = getChildByField(node, 'name') ?? namedChildren(node).find((child) => child.type === 'identifier');
    if (!nameNode) {
      return;
    }

    const name = getNodeText(this.source, nameNode);
    const parent = this.currentContainer();
    const qualifiedName = getQualifiedName(this.packageName, parent.qualifiedName, name);
    const typeNode = this.createNode(kind, name, qualifiedName, node, {
      docstring: extractDocstring(node, this.source),
      metadata: {
        modifiers: extractModifiers(node, this.source),
      },
    });

    this.containers.push({
      id: typeNode.id,
      kind: typeNode.kind,
      qualifiedName: typeNode.qualifiedName,
      filePath: typeNode.filePath,
    });

    const superclassNode = namedChildren(node).find((child) => child.type === 'superclass');
    if (superclassNode) {
      const targetText = normalizeWhitespace(getNodeText(this.source, superclassNode)).replace(/^extends\s+/, '');
      if (targetText) {
        this.unresolvedRefs.push({
          fromNodeId: typeNode.id,
          refName: targetText,
          refKind: 'inheritance',
          filePath: this.filePath,
          language: 'java',
          line: superclassNode.startPosition.row + 1,
          column: superclassNode.startPosition.column,
          metadata: {
            edgeKind: 'extends',
          },
        });
      }
    }

    const interfacesNode = namedChildren(node).find(
      (child) => child.type === 'super_interfaces' || child.type === 'extends_interfaces'
    );
    if (interfacesNode) {
      const text = normalizeWhitespace(getNodeText(this.source, interfacesNode));
      const stripped = text
        .replace(/^implements\s+/, '')
        .replace(/^extends\s+/, '');
      const candidates = stripped.split(',').map((item) => item.trim()).filter(Boolean);
      for (const candidate of candidates) {
        this.unresolvedRefs.push({
          fromNodeId: typeNode.id,
          refName: candidate,
          refKind: 'inheritance',
          filePath: this.filePath,
          language: 'java',
          line: interfacesNode.startPosition.row + 1,
          column: interfacesNode.startPosition.column,
          metadata: {
            edgeKind: 'implements',
          },
        });
      }
    }

    const bodyNode = getChildByField(node, 'body');
    if (bodyNode) {
      for (const child of namedChildren(bodyNode)) {
        this.visit(child);
      }
    }

    this.containers.pop();
  }

  private extractField(node: SyntaxNode): void {
    const typeNode = getChildByField(node, 'type');
    const typeText = normalizeWhitespace(getNodeText(this.source, typeNode));
    const declarators = namedChildren(node).filter((child) => child.type === 'variable_declarator');

    for (const declarator of declarators) {
      const nameNode = getChildByField(declarator, 'name') ?? namedChildren(declarator).find((child) => child.type === 'identifier');
      if (!nameNode) {
        continue;
      }

      const name = getNodeText(this.source, nameNode);
      const parent = this.currentContainer();
      const qualifiedName = getQualifiedName(this.packageName, parent.qualifiedName, name);
      this.createNode('field', name, qualifiedName, declarator, {
        signature: typeText ? `${typeText} ${name}` : name,
        docstring: extractDocstring(node, this.source),
        metadata: {
          modifiers: extractModifiers(node, this.source),
          type: typeText || undefined,
        },
      });

      if (typeText) {
        this.unresolvedRefs.push({
          fromNodeId: parent.id,
          refName: typeText,
          refKind: 'type',
          filePath: this.filePath,
          language: 'java',
          line: declarator.startPosition.row + 1,
          column: declarator.startPosition.column,
        });
      }
    }
  }

  private extractMethod(node: SyntaxNode, kind: Extract<NodeKind, 'method' | 'constructor'>): void {
    const nameNode = getChildByField(node, 'name') ?? namedChildren(node).find((child) => child.type === 'identifier');
    if (!nameNode) {
      return;
    }

    const name = getNodeText(this.source, nameNode);
    const parent = this.currentContainer();
    const qualifiedName = getQualifiedName(this.packageName, parent.qualifiedName, name);
    const parametersNode = getChildByField(node, 'parameters');
    const returnTypeNode = getChildByField(node, 'type');
    const parameterText = normalizeWhitespace(getNodeText(this.source, parametersNode));
    const returnTypeText = normalizeWhitespace(getNodeText(this.source, returnTypeNode));
    const signature = kind === 'constructor'
      ? `${name}${parameterText}`
      : `${returnTypeText ? `${returnTypeText} ` : ''}${name}${parameterText}`;
    const methodNode = this.createNode(kind, name, qualifiedName, node, {
      signature,
      docstring: extractDocstring(node, this.source),
      isExported: extractModifiers(node, this.source).includes('public'),
      metadata: {
        modifiers: extractModifiers(node, this.source),
        returnType: returnTypeText || undefined,
      },
    });

    if (returnTypeText) {
      this.unresolvedRefs.push({
        fromNodeId: methodNode.id,
        refName: returnTypeText,
        refKind: 'type',
        filePath: this.filePath,
        language: 'java',
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        metadata: {
          relation: 'returns',
        },
      });
    }

    if (parametersNode) {
      const parameters = this.extractParameters(parametersNode);
      for (const parameter of parameters) {
        const parameterQualifiedName = `${qualifiedName}.${parameter.name}`;
        this.createNode('variable', parameter.name, parameterQualifiedName, parametersNode, {
          signature: `${parameter.type} ${parameter.name}`,
          metadata: {
            variableKind: 'parameter',
            type: parameter.type,
          },
        });
        this.unresolvedRefs.push({
          fromNodeId: methodNode.id,
          refName: parameter.type,
          refKind: 'type',
          filePath: this.filePath,
          language: 'java',
          line: parameter.line,
          column: parameter.column,
          metadata: {
            relation: 'parameter',
          },
        });
      }
    }

    const bodyNode = getChildByField(node, 'body');
    if (bodyNode) {
      this.containers.push({
        id: methodNode.id,
        kind: methodNode.kind,
        qualifiedName: methodNode.qualifiedName,
        filePath: methodNode.filePath,
      });

      for (const child of namedChildren(bodyNode)) {
        this.visit(child);
      }

      this.containers.pop();
    }
  }

  private extractParameters(parametersNode: SyntaxNode): JavaVariable[] {
    const parameterNodes = this.collectParameterNodes(parametersNode);
    return parameterNodes
      .map((parameterNode) => {
        const typeNode = getChildByField(parameterNode, 'type');
        const nameNode = getChildByField(parameterNode, 'name') ??
          namedChildren(parameterNode).find((child) => child.type === 'identifier');
        const type = normalizeWhitespace(getNodeText(this.source, typeNode)).replace(/\s*\.\.\.$/, '');
        const name = getNodeText(this.source, nameNode);

        return {
          type,
          name,
          line: typeNode?.startPosition.row ?? parameterNode.startPosition.row + 1,
          column: typeNode?.startPosition.column ?? parameterNode.startPosition.column,
        };
      })
      .filter((parameter) => parameter.type && parameter.name);
  }

  private collectParameterNodes(node: SyntaxNode): SyntaxNode[] {
    const results: SyntaxNode[] = [];
    for (const child of namedChildren(node)) {
      if (child.type === 'formal_parameter' || child.type === 'spread_parameter') {
        results.push(child);
        continue;
      }

      results.push(...this.collectParameterNodes(child));
    }

    return results;
  }

  private extractMethodInvocation(node: SyntaxNode): void {
    const caller = this.currentCallableContainer();
    if (!caller) {
      return;
    }

    const nameNode = getChildByField(node, 'name');
    if (!nameNode) {
      return;
    }

    const objectNode = getChildByField(node, 'object');
    const methodName = getNodeText(this.source, nameNode);
    const receiverText = normalizeWhitespace(getNodeText(this.source, objectNode));
    const referenceName = receiverText ? `${receiverText}.${methodName}` : methodName;

    this.unresolvedRefs.push({
      fromNodeId: caller.id,
      refName: referenceName,
      refKind: 'call',
      filePath: this.filePath,
      language: 'java',
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      metadata: {
        methodName,
        receiver: receiverText || undefined,
      },
    });
  }

  private extractLocalVariable(node: SyntaxNode): void {
    const typeNode = getChildByField(node, 'type');
    const typeText = normalizeWhitespace(getNodeText(this.source, typeNode));
    if (!typeText) {
      return;
    }

    const declarators = namedChildren(node).filter((child) => child.type === 'variable_declarator');
    const callable = this.currentCallableContainer();
    if (!callable) {
      return;
    }

    for (const declarator of declarators) {
      const nameNode = getChildByField(declarator, 'name') ?? namedChildren(declarator).find((child) => child.type === 'identifier');
      if (!nameNode) {
        continue;
      }

      const name = getNodeText(this.source, nameNode);
      const qualifiedName = `${callable.qualifiedName ?? callable.id}.${name}`;
      this.createNode('variable', name, qualifiedName, declarator, {
        signature: `${typeText} ${name}`,
        metadata: {
          variableKind: 'local',
          type: typeText,
        },
      });

      this.unresolvedRefs.push({
        fromNodeId: callable.id,
        refName: typeText,
        refKind: 'type',
        filePath: this.filePath,
        language: 'java',
        line: declarator.startPosition.row + 1,
        column: declarator.startPosition.column,
        metadata: {
          relation: 'local',
        },
      });
    }
  }

  private extractObjectCreation(node: SyntaxNode): void {
    const caller = this.currentCallableContainer();
    if (!caller) {
      return;
    }

    const typeNode = getChildByField(node, 'type') ?? namedChildren(node).find((child) => child.type === 'type_identifier');
    if (!typeNode) {
      return;
    }

    const typeName = normalizeWhitespace(getNodeText(this.source, typeNode));
    this.unresolvedRefs.push({
      fromNodeId: caller.id,
      refName: typeName,
      refKind: 'type',
      filePath: this.filePath,
      language: 'java',
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      metadata: {
        relation: 'instantiates',
      },
    });
  }

  private currentContainer(): ContainerFrame {
    return this.containers[this.containers.length - 1]!;
  }

  private currentCallableContainer(): ContainerFrame | null {
    for (let index = this.containers.length - 1; index >= 0; index -= 1) {
      const frame = this.containers[index];
      if (!frame) {
        continue;
      }

      if (frame.kind === 'method' || frame.kind === 'constructor') {
        return frame;
      }
    }

    return null;
  }

  private createNode(
    kind: NodeKind,
    name: string,
    qualifiedName: string,
    node: SyntaxNode,
    extras: Partial<CodeNode> = {}
  ): CodeNode {
    const currentContainer = this.currentContainer();
    const createdNode: CodeNode = {
      id: `${kind}:${qualifiedName}:${node.startPosition.row + 1}:${node.startPosition.column}`,
      kind,
      name,
      qualifiedName,
      filePath: this.filePath,
      language: 'java',
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      ...extras,
    };

    this.nodes.push(createdNode);
    this.edges.push({
      source: currentContainer.id,
      target: createdNode.id,
      kind: 'contains',
    });

    return createdNode;
  }
}
