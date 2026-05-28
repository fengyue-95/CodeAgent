/**
 * User Service
 *
 * Handles user-related operations including CRUD operations,
 * authentication, and user validation.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
}

export class UserService {
  private users: Map<string, User> = new Map();

  /**
   * Get user by ID
   */
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<User> {
    const user: User = {
      id: this.generateId(),
      name: data.name,
      email: data.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.set(user.id, user);
    return user;
  }

  /**
   * Update user information
   */
  async updateUser(id: string, data: Partial<CreateUserData>): Promise<User> {
    const user = await this.getUser(id);
    if (!user) {
      throw new Error('User not found');
    }

    if (data.name) user.name = data.name;
    if (data.email) user.email = data.email;
    user.updatedAt = new Date();

    this.users.set(id, user);
    return user;
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
  }

  /**
   * Calculate user score
   */
  calculateScore(base: number, multiplier: number): number {
    return multiply(base, multiplier);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(7);
  }
}

/**
 * Helper function to multiply two numbers
 */
function multiply(a: number, b: number): number {
  return a * b;
}
