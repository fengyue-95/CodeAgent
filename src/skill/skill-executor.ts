import { SkillDefinition } from './skill-definition';
import { AgentInfo } from '../agent';

export interface SkillExecutionContext {
  agent: AgentInfo;
  projectPath: string;
}

export class SkillExecutor {
  /**
   * 执行 skill
   */
  async execute(
    skill: SkillDefinition,
    args: string,
    context: SkillExecutionContext
  ): Promise<string> {
    // 构建 skill prompt
    let prompt = this.buildSkillPrompt(skill, args);

    // 注入 references
    if (skill.references.size > 0) {
      prompt = this.injectReferences(prompt, skill.references);
    }

    return prompt;
  }

  /**
   * 构建 skill prompt
   */
  private buildSkillPrompt(skill: SkillDefinition, args: string): string {
    const parts: string[] = [];

    // 添加 skill 标题
    parts.push(`# Executing Skill: ${skill.name}`);
    parts.push('');

    // 添加描述
    parts.push(`**Description**: ${skill.frontmatter.description}`);
    parts.push('');

    // 添加参数
    if (args) {
      parts.push(`**Arguments**: ${args}`);
      parts.push('');
    }

    // 添加 skill 内容
    parts.push('---');
    parts.push('');
    parts.push(skill.content);
    parts.push('');

    // 添加执行指令
    parts.push('---');
    parts.push('');
    parts.push('Please execute the above skill instructions with the provided arguments.');

    return parts.join('\n');
  }

  /**
   * 注入 references
   */
  private injectReferences(
    content: string,
    references: Map<string, string>
  ): string {
    let result = content;

    // 查找 references 引用并替换
    // 格式: [references/filename.md](references/filename.md)
    for (const [name, refContent] of references.entries()) {
      const pattern = new RegExp(
        `\\[references/${name}\\.md\\]\\(references/${name}\\.md\\)`,
        'g'
      );

      if (result.match(pattern)) {
        // 在文档末尾添加 reference 内容
        result += `\n\n## Reference: ${name}\n\n${refContent}`;
      }
    }

    return result;
  }

  /**
   * 验证 skill 参数
   */
  validateArgs(skill: SkillDefinition, args: string): boolean {
    // 基本验证：检查是否需要参数
    // 可以扩展为更复杂的参数验证
    return true;
  }
}
