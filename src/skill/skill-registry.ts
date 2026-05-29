import { SkillDefinition } from './skill-definition';
import { SkillLoader } from './skill-loader';

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();
  private loader: SkillLoader;

  constructor(loader: SkillLoader) {
    this.loader = loader;
  }

  /**
   * 注册所有 skills
   */
  async registerAll(): Promise<void> {
    const skills = await this.loader.loadAllSkills();

    for (const skill of skills) {
      this.skills.set(skill.name, skill);
    }

    console.log(`Loaded ${skills.length} skills`);
  }

  /**
   * 注册单个 skill
   */
  async register(name: string): Promise<void> {
    const skill = await this.loader.loadSkill(name);

    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }

    this.skills.set(skill.name, skill);
  }

  /**
   * 注销 skill
   */
  unregister(name: string): void {
    this.skills.delete(name);
  }

  /**
   * 获取 skill
   */
  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * 列出所有 skills
   */
  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * 搜索 skills
   */
  search(query: string): SkillDefinition[] {
    const lowerQuery = query.toLowerCase();

    return this.list().filter((skill) => {
      return (
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.frontmatter.description.toLowerCase().includes(lowerQuery) ||
        skill.frontmatter.tools?.some((tool) => tool.toLowerCase().includes(lowerQuery)) ||
        skill.frontmatter.agent?.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * 热重载
   */
  async reload(): Promise<void> {
    this.skills.clear();
    await this.registerAll();
  }

  /**
   * 检查 skill 是否存在
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * 获取 skills 数量
   */
  size(): number {
    return this.skills.size;
  }
}
