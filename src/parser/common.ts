import Parser from 'web-tree-sitter';

type SyntaxNode = Parser.SyntaxNode;

export function getNodeText(source: string, node: SyntaxNode | null | undefined): string {
  if (!node) {
    return '';
  }

  return source.slice(node.startIndex, node.endIndex);
}

export function getChildByField(node: SyntaxNode, name: string): SyntaxNode | null {
  return node.childForFieldName(name);
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isNode(value: SyntaxNode | null): value is SyntaxNode {
  return value !== null;
}

export function namedChildren(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren.filter(isNode);
}

export function children(node: SyntaxNode): SyntaxNode[] {
  return node.children.filter(isNode);
}

export function lastQualifiedSegment(value: string): string {
  const parts = value.split('.');
  return parts[parts.length - 1] ?? value;
}
