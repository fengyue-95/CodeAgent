/**
 * 测试项目示例
 * 用于集成测试和端到端测试
 */

export const SIMPLE_TYPESCRIPT_PROJECT = {
  'package.json': JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    dependencies: {},
  }, null, 2),

  'src/index.ts': `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function add(a: number, b: number): number {
  return a + b;
}
`,

  'src/utils/math.ts': `
export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}
`,

  'src/services/UserService.ts': `
import { multiply } from '../utils/math';

export class UserService {
  private users: Map<string, any> = new Map();

  addUser(id: string, name: string): void {
    this.users.set(id, { id, name });
  }

  getUser(id: string): any {
    return this.users.get(id);
  }

  calculateScore(base: number, multiplier: number): number {
    return multiply(base, multiplier);
  }
}
`,
};

export const SIMPLE_PYTHON_PROJECT = {
  'main.py': `
def greet(name):
    """Greet a person by name."""
    return f"Hello, {name}!"

def add(a, b):
    """Add two numbers."""
    return a + b

class Calculator:
    """A simple calculator class."""

    def multiply(self, a, b):
        """Multiply two numbers."""
        return a * b

    def divide(self, a, b):
        """Divide two numbers."""
        if b == 0:
            raise ValueError("Division by zero")
        return a / b
`,

  'utils/math.py': `
def factorial(n):
    """Calculate factorial of n."""
    if n <= 1:
        return 1
    return n * factorial(n - 1)

def fibonacci(n):
    """Calculate nth Fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
`,
};

export const SIMPLE_JAVA_PROJECT = {
  'src/main/java/com/example/Main.java': `
package com.example;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }

    public static String greet(String name) {
        return "Hello, " + name + "!";
    }
}
`,

  'src/main/java/com/example/Calculator.java': `
package com.example;

public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }

    public int multiply(int a, int b) {
        return a * b;
    }

    public double divide(int a, int b) {
        if (b == 0) {
            throw new IllegalArgumentException("Division by zero");
        }
        return (double) a / b;
    }
}
`,

  'src/main/java/com/example/service/UserService.java': `
package com.example.service;

import com.example.Calculator;
import java.util.HashMap;
import java.util.Map;

public class UserService {
    private Map<String, User> users = new HashMap<>();
    private Calculator calculator = new Calculator();

    public void addUser(String id, String name) {
        users.put(id, new User(id, name));
    }

    public User getUser(String id) {
        return users.get(id);
    }

    public int calculateScore(int base, int multiplier) {
        return calculator.multiply(base, multiplier);
    }

    static class User {
        String id;
        String name;

        User(String id, String name) {
            this.id = id;
            this.name = name;
        }
    }
}
`,
};

export const COMPLEX_PROJECT_WITH_DEPENDENCIES = {
  'package.json': JSON.stringify({
    name: 'complex-project',
    version: '1.0.0',
    dependencies: {
      'lodash': '^4.17.21',
    },
  }, null, 2),

  'src/index.ts': `
import { UserService } from './services/UserService';
import { AuthService } from './services/AuthService';

export class Application {
  private userService: UserService;
  private authService: AuthService;

  constructor() {
    this.userService = new UserService();
    this.authService = new AuthService();
  }

  async start(): Promise<void> {
    console.log('Application started');
  }
}
`,

  'src/services/UserService.ts': `
import { DatabaseService } from './DatabaseService';

export class UserService {
  private db: DatabaseService;

  constructor() {
    this.db = new DatabaseService();
  }

  async createUser(name: string, email: string): Promise<string> {
    const id = this.generateId();
    await this.db.insert('users', { id, name, email });
    return id;
  }

  async getUser(id: string): Promise<any> {
    return this.db.findById('users', id);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(7);
  }
}
`,

  'src/services/AuthService.ts': `
import { UserService } from './UserService';

export class AuthService {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  async login(email: string, password: string): Promise<string> {
    // Simplified login logic
    return 'token-' + email;
  }

  async validateToken(token: string): Promise<boolean> {
    return token.startsWith('token-');
  }
}
`,

  'src/services/DatabaseService.ts': `
export class DatabaseService {
  private data: Map<string, Map<string, any>> = new Map();

  async insert(table: string, record: any): Promise<void> {
    if (!this.data.has(table)) {
      this.data.set(table, new Map());
    }
    this.data.get(table)!.set(record.id, record);
  }

  async findById(table: string, id: string): Promise<any> {
    return this.data.get(table)?.get(id);
  }
}
`,
};
