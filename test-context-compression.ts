/**
 * 测试上下文压缩功能
 */

import { ContextCompressor } from './src/runtime/context-compressor';
import { SessionMessageWithParts } from './src/session';

// 创建模拟消息
function createMockMessage(role: 'user' | 'assistant', text: string, index: number): SessionMessageWithParts {
  return {
    message: {
      id: `msg_${index}`,
      sessionId: 'test_session',
      role,
      createdAt: Date.now() + index * 1000,
    },
    parts: [
      {
        id: `part_${index}`,
        sessionId: 'test_session',
        messageId: `msg_${index}`,
        type: 'text',
        text,
        createdAt: Date.now() + index * 1000,
        updatedAt: Date.now() + index * 1000,
      },
    ],
  };
}

// 测试 1: 少量消息（不压缩）
console.log('=== 测试 1: 少量消息（不压缩）===');
const compressor1 = new ContextCompressor({
  maxTokens: 100000,
  keepRecentCount: 10,
  enableCompression: true,
});

const fewMessages: SessionMessageWithParts[] = [
  createMockMessage('user', '你好，请帮我分析代码', 1),
  createMockMessage('assistant', '好的，我来帮你分析', 2),
  createMockMessage('user', '查看 src/user/service.ts', 3),
  createMockMessage('assistant', '我已经查看了文件，发现了一些问题...', 4),
];

const systemPrompt1 = 'You are a helpful coding assistant.';
const result1 = await compressor1.compress(systemPrompt1, fewMessages);
const stats1 = compressor1.getStats(systemPrompt1, fewMessages);

console.log('消息数量:', fewMessages.length);
console.log('压缩后消息数量:', result1.length);
console.log('统计信息:', stats1);
console.log('需要压缩:', stats1.needsCompression ? '是' : '否');
console.log('');

// 测试 2: 大量消息（需要压缩）
console.log('=== 测试 2: 大量消息（需要压缩）===');
const compressor2 = new ContextCompressor({
  maxTokens: 100000,
  keepRecentCount: 5,
  enableCompression: true,
});

const manyMessages: SessionMessageWithParts[] = [];
for (let i = 0; i < 20; i++) {
  manyMessages.push(
    createMockMessage('user', `这是第 ${i + 1} 个用户问题，内容是关于代码分析的...`.repeat(10), i * 2 + 1)
  );
  manyMessages.push(
    createMockMessage('assistant', `这是第 ${i + 1} 个助手回复，我已经分析了代码...`.repeat(10), i * 2 + 2)
  );
}

const systemPrompt2 = 'You are a helpful coding assistant.';
const result2 = await compressor2.compress(systemPrompt2, manyMessages);
const stats2 = compressor2.getStats(systemPrompt2, manyMessages);

console.log('原始消息数量:', manyMessages.length);
console.log('压缩后消息数量:', result2.length);
console.log('统计信息:', stats2);
console.log('需要压缩:', stats2.needsCompression ? '是' : '否');
console.log('压缩比例:', stats2.compressionRatio ? `${(stats2.compressionRatio * 100).toFixed(1)}%` : 'N/A');
console.log('');

// 测试 3: 检查压缩后的消息结构
console.log('=== 测试 3: 压缩后的消息结构 ===');
console.log('第一条消息（system）:', result2[0]?.role);
console.log('第二条消息（summary）:', result2[1]?.role, '- 包含摘要:', result2[1]?.content?.toString().includes('Previous Conversation Summary'));
console.log('最近消息数量:', result2.length - 2); // 减去 system 和 summary
console.log('');

// 测试 4: 禁用压缩
console.log('=== 测试 4: 禁用压缩 ===');
const compressor3 = new ContextCompressor({
  maxTokens: 100000,
  keepRecentCount: 5,
  enableCompression: false,
});

const result3 = await compressor3.compress(systemPrompt2, manyMessages);
console.log('原始消息数量:', manyMessages.length);
console.log('禁用压缩后消息数量:', result3.length);
console.log('是否包含所有消息:', result3.length === manyMessages.length + 1); // +1 for system
console.log('');

// 测试 5: Token 估算
console.log('=== 测试 5: Token 估算 ===');
const englishText = 'This is a test message with English text.';
const chineseText = '这是一个包含中文文本的测试消息。';
const mixedText = 'This is mixed 这是混合的 text 文本.';

console.log('英文文本:', englishText);
console.log('估算 tokens:', Math.ceil(englishText.length / 4));
console.log('');
console.log('中文文本:', chineseText);
console.log('估算 tokens:', Math.ceil(chineseText.length / 1.5));
console.log('');
console.log('混合文本:', mixedText);
console.log('');

console.log('✅ 所有测试完成！');
