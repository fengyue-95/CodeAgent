import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { SkillDefinition, SkillFrontmatter } from './skill-definition';

export class SkillLoader {
  private skillsDir: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir ?? join(homedir(), '.code-agent', 'skills');
  }

  /**
   * 扫描并加载所有 skills
   */
  async loadAllSkills(): Promise<SkillDefinition[]> {
    if (!existsSync(this.skillsDir)) {
      return [];
    }

    const skills: SkillDefinition[] = [];
    const entries = readdirSync(this.skillsDir);

    for (const entry of entries) {
      const skillPath = join(this.skillsDir, entry);
      const stats = statSync(skillPath);

      if (stats.isDirectory() || stats.isSymbolicLink()) {
        try {
          const skill = await this.loadSkill(entry);
          if (skill) {
            skills.push(skill);
          }
        } catch (error) {
          console.error(`Failed to load skill ${entry}:`, error);
        }
      }
    }

    return skills;
  }

  /**
   * 加载单个 skill
   */
  async loadSkill(name: string): Promise<SkillDefinition | null> {
    const skillPath = join(this.skillsDir, name);

    if (!existsSync(skillPath)) {
      return null;
    }

    const skillFile = join(skillPath, 'SKILL.md');
    if (!existsSync(skillFile)) {
      throw new Error(`SKILL.md not found in ${skillPath}`);
    }

    const content = readFileSync(skillFile, 'utf-8');
    const { frontmatter, content: skillContent } = this.parseSkillFile(content);

    // 加载 references
    const references = await this.loadReferences(skillPath);

    return {
      name: frontmatter.name,
      path: skillPath,
      frontmatter,
      content: skillContent,
      references,
    };
  }

  /**
   * 解析 SKILL.md
   */
  private parseSkillFile(content: string): {
    frontmatter: SkillFrontmatter;
    content: string;
  } {
    // 解析 frontmatter (YAML between --- markers)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      throw new Error('Invalid SKILL.md format: frontmatter not found');
    }

    const [, frontmatterText, skillContent] = frontmatterMatch;

    // 简单的 YAML 解析（只支持基本格式）
    const frontmatter: any = {};
    const lines = frontmatterText.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;

        // 处理数组
        if (value.startsWith('[') && value.endsWith(']')) {
          frontmatter[key] = value
            .slice(1, -1)
            .split(',')
            .map((v) => v.trim());
        } else {
          frontmatter[key] = value;
        }
      }
    }

    // 验证必需字段
    if (!frontmatter.name) {
      throw new Error('Skill name is required in frontmatter');
    }

    if (!frontmatter.description) {
      throw new Error('Skill description is required in frontmatter');
    }

    return {
      frontmatter: frontmatter as SkillFrontmatter,
      content: skillContent.trim(),
    };
  }

  /**
   * 加载 references
   */
  private async loadReferences(skillPath: string): Promise<Map<string, string>> {
    const references = new Map<string, string>();
    const referencesDir = join(skillPath, 'references');

    if (!existsSync(referencesDir)) {
      return references;
    }

    const files = readdirSync(referencesDir);

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = join(referencesDir, file);
        const content = readFileSync(filePath, 'utf-8');
        const name = file.replace('.md', '');
        references.set(name, content);
      }
    }

    return references;
  }

  /**
   * 获取 skills 目录
   */
  getSkillsDir(): string {
    return this.skillsDir;
  }
}
