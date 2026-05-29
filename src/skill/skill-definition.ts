export interface SkillFrontmatter {
  name: string;
  description: string;
  trigger?: 'user-invocable' | 'auto';
  tools?: string[];
  agent?: string;
  model?: string;
}

export interface SkillDefinition {
  name: string;
  path: string;
  frontmatter: SkillFrontmatter;
  content: string;
  references: Map<string, string>;
}

export interface SkillMetadata {
  name: string;
  version: string;
  description: string;
  author?: {
    name: string;
    email?: string;
    url?: string;
  };
  repository?: {
    type: string;
    url: string;
  };
  keywords?: string[];
  license?: string;
  dependencies?: {
    skills?: string[];
    mcpServers?: string[];
    tools?: string[];
  };
  minCodeAgentVersion?: string;
}

export interface InstallInfo {
  source: string;
  type: 'git' | 'local' | 'marketplace';
  version?: string;
  commit?: string;
  installedAt: string;
  updatedAt?: string;
  dev: boolean;
}
