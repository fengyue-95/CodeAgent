import { describe, expect, it } from 'vitest';
import {
  formatTaskToolResultForConsole,
  parseTaskToolOutput,
} from '../../src/utils/tool-output';

describe('tool output formatting', () => {
  it('extracts subagent task output from JSON tool results', () => {
    const output = JSON.stringify({
      description: 'Review recharge flow',
      status: 'completed',
      sessionId: 'ses_123',
      steps: 4,
      output: 'Plan result line 1\nPlan result line 2',
    });

    expect(parseTaskToolOutput(output)).toEqual({
      description: 'Review recharge flow',
      status: 'completed',
      sessionId: 'ses_123',
      steps: 4,
      output: 'Plan result line 1\nPlan result line 2',
    });
  });

  it('includes the subagent output body in console summaries', () => {
    const output = JSON.stringify({
      description: 'Plan recharge service',
      status: 'completed',
      steps: 6,
      output: 'Create skeleton first.\nThen fill methods in chunks.',
    });

    expect(formatTaskToolResultForConsole(output)).toBe(
      '✓ task completed; steps: 6\nCreate skeleton first.\nThen fill methods in chunks.'
    );
  });
});
