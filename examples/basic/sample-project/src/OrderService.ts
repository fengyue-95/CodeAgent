/**
 * Order Service
 *
 * Handles order-related operations.
 */

import { UserService, User } from './UserService';

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  createdAt: Date;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export class OrderService {
  private orders: Map<string, Order> = new Map();
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  /**
   * Create a new order
   */
  async createOrder(userId: string, items: OrderItem[]): Promise<Order> {
    // Verify user exists
    const user = await this.userService.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const order: Order = {
      id: this.generateId(),
      userId,
      items,
      total: this.calculateTotal(items),
      createdAt: new Date(),
    };

    this.orders.set(order.id, order);
    return order;
  }

  /**
   * Get order by ID
   */
  async getOrder(id: string): Promise<Order | null> {
    return this.orders.get(id) || null;
  }

  /**
   * Calculate order total
   */
  private calculateTotal(items: OrderItem[]): number {
    return items.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(7);
  }
}
