// Test file - functions that need test coverage

// Function 1: Simple calculation
export function calculateTotal(price: number, quantity: number, taxRate: number = 0.1): number {
  if (price < 0 || quantity < 0) {
    throw new Error('Price and quantity must be non-negative');
  }

  const subtotal = price * quantity;
  const tax = subtotal * taxRate;
  return subtotal + tax;
}

// Function 2: Async function with external dependency
export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const response = await fetch(`https://api.example.com/users/${userId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.statusText}`);
  }

  return await response.json();
}

// Function 3: Function with multiple dependencies
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private emailService: EmailService,
    private logger: Logger
  ) {}

  async createUser(userData: CreateUserData): Promise<User> {
    // Validation
    if (!userData.email || !userData.name) {
      throw new ValidationError('Email and name are required');
    }

    if (!this.isValidEmail(userData.email)) {
      throw new ValidationError('Invalid email format');
    }

    // Check if user exists
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new ConflictError('User already exists');
    }

    // Create user
    const user: User = {
      id: generateId(),
      email: userData.email,
      name: userData.name,
      createdAt: new Date(),
      isActive: true,
    };

    await this.userRepository.save(user);

    // Send welcome email
    try {
      await this.emailService.sendWelcomeEmail(user.email, user.name);
    } catch (error) {
      this.logger.error('Failed to send welcome email', { userId: user.id, error });
      // Don't fail user creation if email fails
    }

    this.logger.info('User created', { userId: user.id });

    return user;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

// Function 4: Complex conditional logic
export function calculateShippingCost(
  weight: number,
  distance: number,
  isPremium: boolean,
  isExpress: boolean
): number {
  if (weight <= 0 || distance <= 0) {
    throw new Error('Weight and distance must be positive');
  }

  let baseCost = weight * 0.5 + distance * 0.1;

  if (isPremium) {
    baseCost *= 0.8; // 20% discount for premium
  }

  if (isExpress) {
    baseCost *= 1.5; // 50% surcharge for express
  }

  // Free shipping for premium users on orders over $50
  if (isPremium && baseCost > 50) {
    return 0;
  }

  return Math.round(baseCost * 100) / 100; // Round to 2 decimals
}

// Function 5: Array processing
export function filterActiveUsers(users: User[]): User[] {
  if (!Array.isArray(users)) {
    throw new TypeError('Input must be an array');
  }

  return users.filter(user => user.isActive && !user.deletedAt);
}

// Function 6: Promise-based function with timeout
export async function fetchWithTimeout<T>(
  url: string,
  timeoutMs: number = 5000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Function 7: Event emitter pattern
export class OrderProcessor {
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  async processOrder(order: Order): Promise<void> {
    this.emit('order:started', order);

    try {
      // Validate order
      if (!order.items || order.items.length === 0) {
        throw new Error('Order must have items');
      }

      // Calculate total
      const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      // Process payment
      this.emit('order:payment', { orderId: order.id, total });

      // Simulate async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      this.emit('order:completed', { orderId: order.id, total });
    } catch (error) {
      this.emit('order:failed', { orderId: order.id, error });
      throw error;
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => callback(data));
  }
}

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  isActive: boolean;
  deletedAt?: Date;
}

export interface CreateUserData {
  email: string;
  name: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  bio?: string;
}

export interface Order {
  id: string;
  items: OrderItem[];
  userId: string;
}

export interface OrderItem {
  productId: string;
  price: number;
  quantity: number;
}

// Mock interfaces for dependencies
export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export interface EmailService {
  sendWelcomeEmail(email: string, name: string): Promise<void>;
}

export interface Logger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

// Custom errors
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// Helper
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
