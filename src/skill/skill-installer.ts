import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, symlinkSync, lstatSync } from 'fs';
import { join, resolve, basename } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import { SkillMetadata, InstallInfo, SkillFrontmatter } from './skill-definition';
import { SkillLoader } from './skill-loader';

export interface InstallOptions {
  source?: string;
  version?: string;
  force?: boolean;
  dev?: boolean;
  registry?: string;
}

interface ParsedSource {
  type: 'git' | 'local' | 'marketplace';
  url?: string;
  path?: string;
  name: string;
  version?: string;
}

export class SkillInstaller {
  private skillsDir: string;
  private cacheDir: string;
  private loader: SkillLoader;

  constructor() {
    const baseDir = join(homedir(), '.code-agent');
    this.skillsDir = join(baseDir, 'skills');
    this.cacheDir = join(baseDir, 'cache', 'skills');
    this.loader = new SkillLoader(this.skillsDir);

    // 确保目录存在
    this.ensureDir(this.skillsDir);
    this.ensureDir(this.cacheDir);
  }

  /**
   * 安装 skill
   */
  async install(source: string, options: InstallOptions = {}): Promise<void> {
    const parsed = this.parseSource(source);

    switch (parsed.type) {
      case 'git':
        return this.installFromGit(parsed, options);
      case 'local':
        return this.installFromLocal(parsed, options);
      case 'marketplace':
        return this.installFromMarketplace(parsed, options);
      default:
        throw new Error(`Unknown source type: ${parsed.type}`);
    }
  }

  /**
   * 从 Git 安装
   */
  private async installFromGit(
    parsed: ParsedSource,
    options: InstallOptions
  ): Promise<void> {
    console.log(`Installing skill from ${parsed.url}...`);

    // 1. Clone 到缓存目录
    const cacheDir = join(this.cacheDir, parsed.name);
    if (existsSync(cacheDir) && !options.force) {
      console.log('Updating existing repository...');
      await this.gitPull(cacheDir);
    } else {
      if (existsSync(cacheDir)) {
        await this.removeDirectory(cacheDir);
      }
      await this.gitClone(parsed.url!, cacheDir, parsed.version);
    }

    // 2. 验证 skill
    await this.validateSkill(cacheDir);

    // 3. 读取元数据
    const metadata = await this.readMetadata(cacheDir);

    // 4. 检查依赖
    await this.checkDependencies(metadata);

    // 5. 复制到 skills 目录
    const targetDir = join(this.skillsDir, metadata.name);
    if (existsSync(targetDir) && !options.force) {
      throw new Error(
        `Skill ${metadata.name} already exists. Use --force to overwrite.`
      );
    }

    if (existsSync(targetDir)) {
      await this.removeDirectory(targetDir);
    }

    await this.copyDirectory(cacheDir, targetDir);

    // 6. 获取 commit hash
    const commit = await this.getCommitHash(cacheDir);

    // 7. 保存安装信息
    await this.saveInstallInfo(targetDir, {
      source: parsed.url!,
      type: 'git',
      version: parsed.version,
      commit,
      installedAt: new Date().toISOString(),
      dev: false,
    });

    console.log(`✓ Skill ${metadata.name} installed successfully`);
  }

  /**
   * 从本地安装
   */
  private async installFromLocal(
    parsed: ParsedSource,
    options: InstallOptions
  ): Promise<void> {
    const sourcePath = resolve(parsed.path!);

    if (!existsSync(sourcePath)) {
      throw new Error(`Path not found: ${sourcePath}`);
    }

    // 验证 skill
    await this.validateSkill(sourcePath);

    // 读取元数据
    const metadata = await this.readMetadata(sourcePath);

    const targetDir = join(this.skillsDir, metadata.name);

    if (options.dev) {
      // 开发模式：创建符号链接
      if (existsSync(targetDir)) {
        const stats = lstatSync(targetDir);
        if (stats.isSymbolicLink()) {
          unlinkSync(targetDir);
        } else {
          await this.removeDirectory(targetDir);
        }
      }
      symlinkSync(sourcePath, targetDir);
      console.log(`✓ Skill ${metadata.name} linked in dev mode`);
    } else {
      // 生产模式：复制文件
      if (existsSync(targetDir) && !options.force) {
        throw new Error(
          `Skill ${metadata.name} already exists. Use --force to overwrite.`
        );
      }
      if (existsSync(targetDir)) {
        await this.removeDirectory(targetDir);
      }
      await this.copyDirectory(sourcePath, targetDir);
      console.log(`✓ Skill ${metadata.name} installed from local path`);
    }

    // 保存安装信息
    await this.saveInstallInfo(targetDir, {
      source: sourcePath,
      type: 'local',
      installedAt: new Date().toISOString(),
      dev: options.dev ?? false,
    });
  }

  /**
   * 从 Marketplace 安装
   */
  private async installFromMarketplace(
    parsed: ParsedSource,
    options: InstallOptions
  ): Promise<void> {
    const registry = options.registry ?? 'https://skills.codeagent.dev';

    console.log(`Fetching skill ${parsed.name} from marketplace...`);

    // 查询 marketplace API
    const response = await fetch(`${registry}/api/skills/${parsed.name}`);
    if (!response.ok) {
      throw new Error(`Skill not found in marketplace: ${parsed.name}`);
    }

    const skillInfo = (await response.json()) as any;

    // 从 git 仓库安装
    return this.installFromGit(
      {
        type: 'git',
        url: skillInfo.repository.url,
        name: parsed.name,
        version: options.version ?? skillInfo.version,
      },
      options
    );
  }

  /**
   * 卸载 skill
   */
  async uninstall(name: string): Promise<void> {
    const skillDir = join(this.skillsDir, name);

    if (!existsSync(skillDir)) {
      throw new Error(`Skill not found: ${name}`);
    }

    // 检查依赖
    const dependents = await this.checkDependents(name);
    if (dependents.length > 0) {
      console.warn(
        `Warning: The following skills depend on ${name}:`
      );
      for (const dep of dependents) {
        console.warn(`  - ${dep}`);
      }
      console.log('');
    }

    // 检查是否是符号链接
    const stats = lstatSync(skillDir);
    if (stats.isSymbolicLink()) {
      unlinkSync(skillDir);
    } else {
      await this.removeDirectory(skillDir);
    }

    console.log(`✓ Skill ${name} uninstalled`);
  }

  /**
   * 更新 skill
   */
  async update(name: string): Promise<void> {
    const skillDir = join(this.skillsDir, name);
    const installInfo = await this.getInstallInfo(skillDir);

    if (!installInfo) {
      throw new Error(`Skill ${name} not found or not installed from git`);
    }

    if (installInfo.type !== 'git') {
      throw new Error(`Skill ${name} was not installed from git, cannot update`);
    }

    if (installInfo.dev) {
      console.log(`Skill ${name} is in dev mode, skipping update`);
      return;
    }

    console.log(`Updating skill ${name}...`);

    // 重新安装
    await this.install(installInfo.source, { force: true });

    console.log(`✓ Skill ${name} updated`);
  }

  /**
   * 列出已安装的 skills
   */
  async list(): Promise<
    Array<{
      name: string;
      version: string;
      source: string;
      installedAt: string;
      dev: boolean;
    }>
  > {
    const skills: Array<any> = [];

    if (!existsSync(this.skillsDir)) {
      return skills;
    }

    const entries = readdirSync(this.skillsDir);

    for (const entry of entries) {
      const skillDir = join(this.skillsDir, entry);
      const stats = lstatSync(skillDir);

      if (stats.isDirectory() || stats.isSymbolicLink()) {
        try {
          const metadata = await this.readMetadata(skillDir);
          const installInfo = await this.getInstallInfo(skillDir);

          skills.push({
            name: metadata.name,
            version: metadata.version,
            source: installInfo?.source ?? 'local',
            installedAt: installInfo?.installedAt ?? 'unknown',
            dev: stats.isSymbolicLink(),
          });
        } catch (error) {
          console.error(`Failed to read skill ${entry}:`, error);
        }
      }
    }

    return skills;
  }

  /**
   * 解析安装源
   */
  private parseSource(source: string): ParsedSource {
    // github:username/repo[@version]
    if (source.startsWith('github:')) {
      const match = source.match(/^github:([^@]+)(?:@(.+))?$/);
      if (!match) throw new Error(`Invalid GitHub source: ${source}`);
      const [, repo, version] = match;
      return {
        type: 'git',
        url: `https://github.com/${repo}.git`,
        name: repo.split('/')[1],
        version,
      };
    }

    // gitlab:username/repo[@version]
    if (source.startsWith('gitlab:')) {
      const match = source.match(/^gitlab:([^@]+)(?:@(.+))?$/);
      if (!match) throw new Error(`Invalid GitLab source: ${source}`);
      const [, repo, version] = match;
      return {
        type: 'git',
        url: `https://gitlab.com/${repo}.git`,
        name: repo.split('/')[1],
        version,
      };
    }

    // https://github.com/username/repo.git
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const name = source.split('/').pop()?.replace('.git', '') ?? 'unknown';
      return {
        type: 'git',
        url: source,
        name,
      };
    }

    // ./local/path or /absolute/path
    if (
      source.startsWith('./') ||
      source.startsWith('/') ||
      source.startsWith('~')
    ) {
      const name = basename(source);
      return {
        type: 'local',
        path: source,
        name,
      };
    }

    // skill-name (from marketplace)
    return {
      type: 'marketplace',
      name: source,
    };
  }

  /**
   * Git clone
   */
  private async gitClone(
    url: string,
    targetDir: string,
    version?: string
  ): Promise<void> {
    const args = ['clone'];
    if (version) {
      args.push('--branch', version);
    }
    args.push('--depth', '1'); // 浅克隆
    args.push(url, targetDir);

    await this.execCommand('git', args);
  }

  /**
   * Git pull
   */
  private async gitPull(dir: string): Promise<void> {
    await this.execCommand('git', ['pull'], { cwd: dir });
  }

  /**
   * 获取 commit hash
   */
  private async getCommitHash(dir: string): Promise<string> {
    const result = await this.execCommand('git', ['rev-parse', 'HEAD'], {
      cwd: dir,
    });
    return result.trim();
  }

  /**
   * 验证 skill
   */
  private async validateSkill(dir: string): Promise<void> {
    const skillFile = join(dir, 'SKILL.md');
    if (!existsSync(skillFile)) {
      throw new Error('Invalid skill: SKILL.md not found');
    }
  }

  /**
   * 读取元数据
   */
  private async readMetadata(dir: string): Promise<SkillMetadata> {
    // 优先读取 skill.json
    const jsonFile = join(dir, 'skill.json');
    if (existsSync(jsonFile)) {
      const content = readFileSync(jsonFile, 'utf-8');
      return JSON.parse(content);
    }

    // 从 SKILL.md frontmatter 读取
    const skillFile = join(dir, 'SKILL.md');
    const content = readFileSync(skillFile, 'utf-8');
    const frontmatter = this.parseFrontmatter(content);

    return {
      name: frontmatter.name,
      version: '1.0.0',
      description: frontmatter.description,
    };
  }

  /**
   * 解析 frontmatter
   */
  private parseFrontmatter(content: string): SkillFrontmatter {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      throw new Error('Invalid SKILL.md: frontmatter not found');
    }

    const frontmatterText = match[1];
    const frontmatter: any = {};
    const lines = frontmatterText.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
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

    return frontmatter as SkillFrontmatter;
  }

  /**
   * 检查依赖
   */
  private async checkDependencies(metadata: SkillMetadata): Promise<void> {
    if (!metadata.dependencies) return;

    // 检查依赖的 skills
    if (metadata.dependencies.skills) {
      for (const skill of metadata.dependencies.skills) {
        const skillDir = join(this.skillsDir, skill);
        if (!existsSync(skillDir)) {
          console.warn(`Warning: Required skill not found: ${skill}`);
          console.log(`  Install it with: code-agent skill install ${skill}`);
        }
      }
    }

    // 检查依赖的 MCP servers
    if (metadata.dependencies.mcpServers) {
      console.log(
        `Note: This skill requires MCP servers: ${metadata.dependencies.mcpServers.join(', ')}`
      );
    }
  }

  /**
   * 检查依赖此 skill 的其他 skills
   */
  private async checkDependents(skillName: string): Promise<string[]> {
    const dependents: string[] = [];
    const allSkills = await this.loader.loadAllSkills();

    for (const skill of allSkills) {
      try {
        const metadata = await this.readMetadata(skill.path);
        if (metadata.dependencies?.skills?.includes(skillName)) {
          dependents.push(skill.name);
        }
      } catch (error) {
        // 忽略读取错误
      }
    }

    return dependents;
  }

  /**
   * 保存安装信息
   */
  private async saveInstallInfo(
    skillDir: string,
    info: InstallInfo
  ): Promise<void> {
    const infoFile = join(skillDir, '.install-info.json');
    writeFileSync(infoFile, JSON.stringify(info, null, 2));
  }

  /**
   * 获取安装信息
   */
  private async getInstallInfo(skillDir: string): Promise<InstallInfo | null> {
    const infoFile = join(skillDir, '.install-info.json');
    if (!existsSync(infoFile)) return null;
    const content = readFileSync(infoFile, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * 执行命令
   */
  private async execCommand(
    command: string,
    args: string[],
    options: { cwd?: string } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 复制目录
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    this.ensureDir(dest);

    const entries = readdirSync(src);

    for (const entry of entries) {
      // 跳过 .git 目录
      if (entry === '.git') continue;

      const srcPath = join(src, entry);
      const destPath = join(dest, entry);
      const stats = statSync(srcPath);

      if (stats.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        const content = readFileSync(srcPath);
        writeFileSync(destPath, content);
      }
    }
  }

  /**
   * 删除目录
   */
  private async removeDirectory(dir: string): Promise<void> {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir);

    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const stats = lstatSync(entryPath);

      if (stats.isDirectory()) {
        await this.removeDirectory(entryPath);
      } else {
        unlinkSync(entryPath);
      }
    }

    // 删除目录本身
    const { rmdirSync } = require('fs');
    rmdirSync(dir);
  }

  /**
   * 确保目录存在
   */
  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
