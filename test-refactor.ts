// Test file with code that needs refactoring

// ❌ Problem 1: Long, complex function that does too much
export function processUserRegistration(data: any) {
  // Validation
  if (!data.email) {
    throw new Error('Email required');
  }
  if (!data.password) {
    throw new Error('Password required');
  }
  if (data.password.length < 8) {
    throw new Error('Password too short');
  }
  if (!data.name) {
    throw new Error('Name required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new Error('Invalid email');
  }

  // Data transformation
  const email = data.email.toLowerCase().trim();
  const name = data.name.trim();
  const hashedPassword = hashPassword(data.password);

  // Create user object
  const user = {
    email,
    name,
    password: hashedPassword,
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    role: 'user',
  };

  // Save to database
  saveToDatabase('users', user);

  // Send welcome email
  sendEmail(email, 'Welcome!', `Hello ${name}, welcome to our platform!`);

  // Log the registration
  console.log(`User registered: ${email}`);

  return user;
}

// ❌ Problem 2: Duplicated validation logic
export function updateUserProfile(userId: string, data: any) {
  // Same validation as above - DUPLICATION!
  if (!data.email) {
    throw new Error('Email required');
  }
  if (!data.name) {
    throw new Error('Name required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new Error('Invalid email');
  }

  const email = data.email.toLowerCase().trim();
  const name = data.name.trim();

  updateDatabase('users', userId, { email, name, updatedAt: new Date() });
}

// ❌ Problem 3: Poor naming
export function calc(a: number, b: number, c: number): number {
  return a * b * 0.85 + c;
}

// ❌ Problem 4: Magic numbers
export function calculatePrice(quantity: number): number {
  return quantity * 19.99 * 0.85 + 5.99;
}

// ❌ Problem 5: Complex nested conditionals
export function getShippingCost(user: any, order: any): number {
  if (user.isPremium) {
    if (order.total > 100) {
      if (user.country === 'US') {
        return 0;
      } else {
        return 5;
      }
    } else {
      if (user.country === 'US') {
        return 3;
      } else {
        return 8;
      }
    }
  } else {
    if (order.total > 100) {
      if (user.country === 'US') {
        return 5;
      } else {
        return 10;
      }
    } else {
      if (user.country === 'US') {
        return 8;
      } else {
        return 15;
      }
    }
  }
}

// ❌ Problem 6: Code duplication in similar functions
export function formatUserName(firstName: string, lastName: string): string {
  const first = firstName.trim().toLowerCase();
  const last = lastName.trim().toLowerCase();
  return `${first.charAt(0).toUpperCase()}${first.slice(1)} ${last.charAt(0).toUpperCase()}${last.slice(1)}`;
}

export function formatProductName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function formatCategoryName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

// ❌ Problem 7: Long parameter list
export function createOrder(
  userId: string,
  productId: string,
  quantity: number,
  shippingAddress: string,
  billingAddress: string,
  paymentMethod: string,
  couponCode: string,
  giftMessage: string,
  giftWrap: boolean,
  expressShipping: boolean
) {
  // ... implementation
  return {
    userId,
    productId,
    quantity,
    shippingAddress,
    billingAddress,
    paymentMethod,
    couponCode,
    giftMessage,
    giftWrap,
    expressShipping,
  };
}

// Fake implementations
function hashPassword(password: string): string {
  return 'hashed_' + password;
}

function saveToDatabase(table: string, data: any): void {
  console.log(`Saving to ${table}:`, data);
}

function updateDatabase(table: string, id: string, data: any): void {
  console.log(`Updating ${table} ${id}:`, data);
}

function sendEmail(to: string, subject: string, body: string): void {
  console.log(`Sending email to ${to}: ${subject}`);
}

// ✅ Good example: Well-refactored function
export function authenticateUser(email: string, password: string) {
  const user = findUserByEmail(email);

  if (!user) {
    throw new AuthenticationError('User not found');
  }

  if (!verifyPassword(password, user.passwordHash)) {
    throw new AuthenticationError('Invalid password');
  }

  return user;
}

function findUserByEmail(email: string): any {
  // Implementation
  return null;
}

function verifyPassword(password: string, hash: string): boolean {
  // Implementation
  return false;
}

class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
