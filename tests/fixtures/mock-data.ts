/**
 * Mock 数据用于测试
 */

import { CodeNode, CodeEdge, FileRecord, UnresolvedRef } from '../../src/types';

export const mockFileRecords: FileRecord[] = [
  {
    path: 'src/index.ts',
    language: 'typescript',
    size: 1024,
    contentHash: 'abc123',
    modifiedAt: Date.now(),
    indexedAt: Date.now(),
  },
  {
    path: 'src/utils/math.ts',
    language: 'typescript',
    size: 512,
    contentHash: 'def456',
    modifiedAt: Date.now(),
    indexedAt: Date.now(),
  },
  {
    path: 'src/services/UserService.ts',
    language: 'typescript',
    size: 2048,
    contentHash: 'ghi789',
    modifiedAt: Date.now(),
    indexedAt: Date.now(),
  },
];

export const mockCodeNodes: CodeNode[] = [
  {
    id: 'node1',
    kind: 'function',
    name: 'greet',
    qualifiedName: 'greet',
    filePath: 'src/index.ts',
    language: 'typescript',
    startLine: 1,
    endLine: 3,
    startColumn: 0,
    endColumn: 1,
    signature: 'function greet(name: string): string',
    docstring: 'Greet a person by name',
  },
  {
    id: 'node2',
    kind: 'function',
    name: 'add',
    qualifiedName: 'add',
    filePath: 'src/index.ts',
    language: 'typescript',
    startLine: 5,
    endLine: 7,
    startColumn: 0,
    endColumn: 1,
    signature: 'function add(a: number, b: number): number',
    docstring: 'Add two numbers',
  },
  {
    id: 'node3',
    kind: 'function',
    name: 'multiply',
    qualifiedName: 'multiply',
    filePath: 'src/utils/math.ts',
    language: 'typescript',
    startLine: 1,
    endLine: 3,
    startColumn: 0,
    endColumn: 1,
    signature: 'function multiply(a: number, b: number): number',
    docstring: 'Multiply two numbers',
  },
  {
    id: 'node4',
    kind: 'class',
    name: 'UserService',
    qualifiedName: 'UserService',
    filePath: 'src/services/UserService.ts',
    language: 'typescript',
    startLine: 3,
    endLine: 15,
    startColumn: 0,
    endColumn: 1,
    signature: 'class UserService',
    docstring: 'User service class',
  },
  {
    id: 'node5',
    kind: 'method',
    name: 'calculateScore',
    qualifiedName: 'UserService.calculateScore',
    filePath: 'src/services/UserService.ts',
    language: 'typescript',
    startLine: 12,
    endLine: 14,
    startColumn: 2,
    endColumn: 3,
    signature: 'calculateScore(base: number, multiplier: number): number',
    docstring: 'Calculate user score',
  },
];

export const mockCodeEdges: CodeEdge[] = [
  {
    source: 'node4',
    target: 'node5',
    kind: 'contains',
  },
  {
    source: 'node5',
    target: 'node3',
    kind: 'calls',
  },
  {
    source: 'node4',
    target: 'node3',
    kind: 'imports',
  },
];

export const mockUnresolvedRefs: UnresolvedRef[] = [
  {
    fromNodeId: 'node4',
    refName: 'UnknownClass',
    refKind: 'import',
    filePath: 'src/services/UserService.ts',
    language: 'typescript',
    line: 1,
    column: 10,
  },
  {
    fromNodeId: 'node1',
    refName: 'missingFunction',
    refKind: 'call',
    filePath: 'src/index.ts',
    language: 'typescript',
    line: 10,
    column: 5,
  },
];

export const mockSessionData = {
  id: 'ses_test123',
  project_root: '/test/project',
  agent_name: 'build',
  title: 'Test Session',
  created_at: Date.now(),
  updated_at: Date.now(),
};

export const mockMessages = [
  {
    session_id: 'ses_test123',
    role: 'user',
    content: 'Hello, can you help me?',
    created_at: Date.now(),
  },
  {
    session_id: 'ses_test123',
    role: 'assistant',
    content: 'Of course! How can I help you?',
    created_at: Date.now() + 1000,
  },
];
