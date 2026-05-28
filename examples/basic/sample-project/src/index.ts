/**
 * Main application entry point
 */

import { UserService } from './UserService';
import { OrderService } from './OrderService';

async function main() {
  console.log('Starting application...');

  // Initialize services
  const userService = new UserService();
  const orderService = new OrderService(userService);

  // Create a user
  const user = await userService.createUser({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'secret123',
  });

  console.log('Created user:', user);

  // Create an order
  const order = await orderService.createOrder(user.id, [
    { productId: 'prod-1', quantity: 2, price: 10.99 },
    { productId: 'prod-2', quantity: 1, price: 25.50 },
  ]);

  console.log('Created order:', order);

  // Calculate score
  const score = userService.calculateScore(100, 1.5);
  console.log('User score:', score);
}

main().catch(console.error);
