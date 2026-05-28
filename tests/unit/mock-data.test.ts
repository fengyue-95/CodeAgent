/**
 * Mock 数据测试
 */

import { describe, it, expect } from 'vitest';
import {
  mockFileRecords,
  mockCodeNodes,
  mockCodeEdges,
  mockUnresolvedRefs,
  mockSessionData,
  mockMessages,
} from '../fixtures/mock-data';

describe('Mock Data', () => {
  describe('mockFileRecords', () => {
    it('should have valid file records', () => {
      expect(mockFileRecords).toBeDefined();
      expect(Array.isArray(mockFileRecords)).toBe(true);
      expect(mockFileRecords.length).toBeGreaterThan(0);

      const file = mockFileRecords[0];
      expect(file.path).toBeDefined();
      expect(file.language).toBeDefined();
      expect(file.contentHash).toBeDefined();
    });
  });

  describe('mockCodeNodes', () => {
    it('should have valid code nodes', () => {
      expect(mockCodeNodes).toBeDefined();
      expect(Array.isArray(mockCodeNodes)).toBe(true);
      expect(mockCodeNodes.length).toBeGreaterThan(0);

      const node = mockCodeNodes[0];
      expect(node.id).toBeDefined();
      expect(node.kind).toBeDefined();
      expect(node.name).toBeDefined();
      expect(node.filePath).toBeDefined();
    });

    it('should have different node kinds', () => {
      const kinds = new Set(mockCodeNodes.map(n => n.kind));
      expect(kinds.size).toBeGreaterThan(1);
    });
  });

  describe('mockCodeEdges', () => {
    it('should have valid edges', () => {
      expect(mockCodeEdges).toBeDefined();
      expect(Array.isArray(mockCodeEdges)).toBe(true);
      expect(mockCodeEdges.length).toBeGreaterThan(0);

      const edge = mockCodeEdges[0];
      expect(edge.source).toBeDefined();
      expect(edge.target).toBeDefined();
      expect(edge.kind).toBeDefined();
    });

    it('should reference existing nodes', () => {
      const nodeIds = new Set(mockCodeNodes.map(n => n.id));

      for (const edge of mockCodeEdges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    });
  });

  describe('mockUnresolvedRefs', () => {
    it('should have valid unresolved references', () => {
      expect(mockUnresolvedRefs).toBeDefined();
      expect(Array.isArray(mockUnresolvedRefs)).toBe(true);
      expect(mockUnresolvedRefs.length).toBeGreaterThan(0);

      const ref = mockUnresolvedRefs[0];
      expect(ref.fromNodeId).toBeDefined();
      expect(ref.refName).toBeDefined();
    });
  });

  describe('mockSessionData', () => {
    it('should have valid session data', () => {
      expect(mockSessionData).toBeDefined();
      expect(mockSessionData.id).toBeDefined();
      expect(mockSessionData.project_root).toBeDefined();
      expect(mockSessionData.agent_name).toBeDefined();
    });
  });

  describe('mockMessages', () => {
    it('should have valid messages', () => {
      expect(mockMessages).toBeDefined();
      expect(Array.isArray(mockMessages)).toBe(true);
      expect(mockMessages.length).toBeGreaterThan(0);

      const message = mockMessages[0];
      expect(message.session_id).toBeDefined();
      expect(message.role).toBeDefined();
      expect(message.content).toBeDefined();
    });
  });
});
