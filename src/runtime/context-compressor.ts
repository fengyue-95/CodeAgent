import { ProviderClient, ProviderMessage } from '../provider';
import { SessionMessageWithParts, TextSessionPart, ReasoningSessionPart, ToolSessionPart } from '../session';

export interface ContextCompressorOptions {
  maxTokens?: number;
  keepRecentCount?: number;
  enableCompression?: boolean;
  provider?: ProviderClient;
  model?: string;
  summaryMaxTokens?: number;
  onSummary?: (summary: string) => void | Promise<void>;
}

const SUMMARY_TEMPLATE = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.`;

/**
 * 上下文压缩器
 *
 * 负责管理对话历史，避免超出模型的上下文窗口限制。
 *
 * 策略：
 * 1. 保留最近 N 条消息（完整）
 * 2. 压缩早期消息为摘要
 * 3. 提取关键操作和决策
 */
export class ContextCompressor {
  private readonly maxTokens: number;
  private readonly keepRecentCount: number;
  private readonly enableCompression: boolean;
  private readonly provider?: ProviderClient;
  private readonly model?: string;
  private readonly summaryMaxTokens: number;
  private readonly onSummary?: (summary: string) => void | Promise<void>;

  constructor(options: ContextCompressorOptions = {}) {
    this.maxTokens = options.maxTokens ?? 100000;
    this.keepRecentCount = options.keepRecentCount ?? 10;
    this.enableCompression = options.enableCompression ?? true;
    this.provider = options.provider;
    this.model = options.model;
    this.summaryMaxTokens = options.summaryMaxTokens ?? 2000;
    this.onSummary = options.onSummary;
  }

  /**
   * 压缩消息历史
   *
   * @param systemPrompt - 系统提示词
   * @param timeline - 完整的消息历史
   * @returns 压缩后的消息列表
   */
  async compress(
    systemPrompt: string,
    timeline: SessionMessageWithParts[]
  ): Promise<ProviderMessage[]> {
    const messages: ProviderMessage[] = [
      { role: 'system', content: systemPrompt }
    ];

    // 如果禁用压缩，直接返回所有消息
    if (!this.enableCompression) {
      return this.addAllMessages(messages, timeline);
    }

    // 估算当前 token 使用量
    const systemTokens = this.estimateTokens(systemPrompt);
    const allMessagesTokens = this.estimateTimelineTokens(timeline);
    const totalTokens = systemTokens + allMessagesTokens;

    // 如果总 token 数在限制内，不压缩
    if (totalTokens < this.maxTokens * 0.8) {
      return this.addAllMessages(messages, timeline);
    }

    // 需要压缩：分割早期消息和最近消息
    const recentCount = Math.min(this.keepRecentCount, Math.max(0, timeline.length - 1));
    const recentMessages = recentCount > 0 ? timeline.slice(-recentCount) : [];
    const oldMessages = timeline.slice(0, timeline.length - recentCount);
    const previousSummary = this.findPreviousSummary(oldMessages);
    if (previousSummary && this.summaryWithTailFits(systemPrompt, previousSummary, recentMessages)) {
      messages.push(this.summaryMessage(previousSummary));
      return this.addAllMessages(messages, recentMessages);
    }

    // 压缩早期消息
    const summary = await this.summarizeOldMessages(oldMessages);
    if (summary) {
      messages.push(this.summaryMessage(summary));
    }

    // 添加最近消息（完整）
    return this.addAllMessages(messages, recentMessages);
  }

  /**
   * 压缩早期消息为摘要
   */
  private async summarizeOldMessages(messages: SessionMessageWithParts[]): Promise<string> {
    if (messages.length === 0) {
      return '';
    }

    if (this.provider) {
      const generated = await this.generateSummary(messages);
      if (generated) {
        await this.onSummary?.(generated);
        return generated;
      }
    }

    const sections: string[] = [];
    const keyPoints: string[] = [];
    const actions: string[] = [];
    const errors: string[] = [];

    for (const item of messages) {
      // 提取用户问题和指令
      if (item.message.role === 'user') {
        const text = this.extractText(item);
        if (text) {
          const truncated = this.truncate(text, 200);
          keyPoints.push(`- User: ${truncated}`);
        }
      }

      // 提取助手的关键回复
      if (item.message.role === 'assistant') {
        const text = this.extractText(item);
        if (text && text.length > 50) {
          const truncated = this.truncate(text, 150);
          keyPoints.push(`- Assistant: ${truncated}`);
        }
      }

      // 提取重要的工具调用
      const importantTools = ['edit', 'write', 'applyPatch', 'shell', 'task'];
      for (const part of item.parts) {
        if (part.type === 'tool' && importantTools.includes(part.tool)) {
          const inputStr = JSON.stringify(part.input);
          const truncated = this.truncate(inputStr, 100);
          actions.push(`- ${part.tool}: ${truncated}`);
        }

        // 提取错误信息
        if (part.type === 'error') {
          const truncated = this.truncate(part.message, 150);
          errors.push(`- ${truncated}`);
        }
      }
    }

    // 构建摘要
    if (keyPoints.length > 0) {
      sections.push(`### Key Points (${messages.length} messages)\n${keyPoints.slice(0, 10).join('\n')}`);
    }

    if (actions.length > 0) {
      sections.push(`### Actions Taken\n${actions.slice(0, 8).join('\n')}`);
    }

    if (errors.length > 0) {
      sections.push(`### Errors Encountered\n${errors.slice(0, 5).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  private async generateSummary(messages: SessionMessageWithParts[]): Promise<string | undefined> {
    const previousSummary = this.findPreviousSummary(messages);
    const history = this.addAllMessages([], messages);
    const prompt = this.buildSummaryPrompt(previousSummary);
    const response = await this.provider?.generate({
      model: this.model,
      temperature: 0,
      maxTokens: this.summaryMaxTokens,
      tools: [],
      toolChoice: 'none',
      messages: [
        ...history,
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    const summary = response?.choices[0]?.message.content?.trim();
    return summary || undefined;
  }

  private buildSummaryPrompt(previousSummary: string | undefined): string {
    const anchor = previousSummary
      ? [
        'Update the anchored summary below using the conversation history above.',
        'Preserve still-true details, remove stale details, and merge in the new facts.',
        '<previous-summary>',
        previousSummary,
        '</previous-summary>',
      ].join('\n')
      : 'Create a new anchored summary from the conversation history above.';
    return [anchor, SUMMARY_TEMPLATE].join('\n\n');
  }

  private findPreviousSummary(messages: SessionMessageWithParts[]): string | undefined {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const summary = messages[index]?.message.metadata?.compactionSummary;
      if (typeof summary === 'string' && summary.trim()) {
        return summary;
      }
    }
    return undefined;
  }

  private summaryMessage(summary: string): ProviderMessage {
    return {
      role: 'system',
      content: `## Previous Conversation Summary\n\n${summary}\n\n---\n\nThe following messages are the most recent conversation:`,
    };
  }

  private summaryWithTailFits(
    systemPrompt: string,
    summary: string,
    recentMessages: SessionMessageWithParts[]
  ): boolean {
    const totalTokens =
      this.estimateTokens(systemPrompt) +
      this.estimateTokens(summary) +
      this.estimateTimelineTokens(recentMessages);
    return totalTokens < this.maxTokens * 0.8;
  }

  /**
   * 提取消息中的文本内容
   */
  private extractText(item: SessionMessageWithParts): string {
    return item.parts
      .filter(p => p.type === 'text' || p.type === 'reasoning')
      .map(p => p.text)
      .join(' ')
      .trim();
  }

  /**
   * 添加所有消息到列表
   */
  private addAllMessages(
    messages: ProviderMessage[],
    timeline: SessionMessageWithParts[]
  ): ProviderMessage[] {
    for (const item of timeline) {
      const providerMessage = this.messageToProviderMessage(item);
      const hasContent = typeof providerMessage.content === 'string' && providerMessage.content.length > 0;
      const hasToolCalls = (providerMessage.toolCalls?.length ?? 0) > 0;
      if (hasContent || hasToolCalls || providerMessage.role === 'user') {
        messages.push(providerMessage);
      }

      // 添加工具结果
      for (const part of item.parts) {
        if (part.type === 'tool-result') {
          messages.push({
            role: 'tool',
            toolCallId: part.callId,
            content: part.output,
          });
        }
      }
    }
    return messages;
  }

  /**
   * 转换为 Provider 消息格式
   */
  private messageToProviderMessage(item: SessionMessageWithParts): ProviderMessage {
    const content = item.parts
      .filter((part): part is TextSessionPart | ReasoningSessionPart =>
        part.type === 'text' || part.type === 'reasoning')
      .map((part) => part.text)
      .join('\n');

    const toolCalls = item.message.role === 'assistant'
      ? item.parts
        .filter((part): part is ToolSessionPart =>
          part.type === 'tool' && part.status !== 'pending')
        .map((part) => ({
          id: part.callId,
          type: 'function' as const,
          function: {
            name: part.tool,
            arguments: JSON.stringify(part.input),
          },
        }))
      : [];

    return {
      role: item.message.role as 'user' | 'assistant',
      content: content || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * 估算文本的 token 数量
   * 简单估算：1 token ≈ 4 字符（英文）或 1.5 字符（中文）
   */
  private estimateTokens(text: string): number {
    // 检测中文字符比例
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalChars = text.length;
    const chineseRatio = totalChars > 0 ? chineseChars / totalChars : 0;

    // 根据中文比例调整估算
    if (chineseRatio > 0.5) {
      // 主要是中文
      return Math.ceil(totalChars / 1.5);
    } else {
      // 主要是英文
      return Math.ceil(totalChars / 4);
    }
  }

  /**
   * 估算整个时间线的 token 数量
   */
  private estimateTimelineTokens(timeline: SessionMessageWithParts[]): number {
    let total = 0;
    for (const item of timeline) {
      // 文本内容
      const text = this.extractText(item);
      total += this.estimateTokens(text);

      // 工具调用和结果
      for (const part of item.parts) {
        if (part.type === 'tool') {
          total += this.estimateTokens(JSON.stringify(part.input));
        }
        if (part.type === 'tool-result') {
          total += this.estimateTokens(part.output);
        }
      }
    }
    return total;
  }

  /**
   * 截断文本
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength) + '...';
  }

  /**
   * 获取压缩统计信息
   */
  getStats(
    systemPrompt: string,
    timeline: SessionMessageWithParts[]
  ): {
    totalMessages: number;
    totalTokens: number;
    systemTokens: number;
    messagesTokens: number;
    needsCompression: boolean;
    compressionRatio?: number;
  } {
    const systemTokens = this.estimateTokens(systemPrompt);
    const messagesTokens = this.estimateTimelineTokens(timeline);
    const totalTokens = systemTokens + messagesTokens;
    const needsCompression = totalTokens > this.maxTokens * 0.8;

    const stats = {
      totalMessages: timeline.length,
      totalTokens,
      systemTokens,
      messagesTokens,
      needsCompression,
    };

    if (needsCompression && timeline.length > this.keepRecentCount) {
      const recentMessages = timeline.slice(-this.keepRecentCount);
      const recentTokens = this.estimateTimelineTokens(recentMessages);
      const compressionRatio = recentTokens / messagesTokens;
      return { ...stats, compressionRatio };
    }

    return stats;
  }
}
