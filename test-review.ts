// Test file with intentional code issues for Review Agent to find

import * as db from './fake-db';

// ❌ SQL Injection vulnerability
export async function getUserByEmail(email: string) {
  const query = `SELECT * FROM users WHERE email = '${email}'`;
  return db.query(query);
}

// ❌ N+1 Query problem
export async function getUsersWithPosts(userIds: number[]) {
  const users = await db.query('SELECT * FROM users WHERE id IN (?)', [userIds]);

  for (const user of users) {
    const posts = await db.query('SELECT * FROM posts WHERE user_id = ?', [user.id]);
    user.posts = posts;
  }

  return users;
}

// ❌ Missing error handling
export async function fetchUserData(userId: string) {
  const response = await fetch(`https://api.example.com/users/${userId}`);
  return response.json();
}

// ❌ Memory leak - event listener not removed
export function setupEventListener(element: HTMLElement) {
  const handler = () => console.log('clicked');
  element.addEventListener('click', handler);
  // Missing cleanup!
}

// ❌ Complex function (too long, high complexity)
export function processUserRegistration(data: any) {
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

  const email = data.email.toLowerCase().trim();
  const name = data.name.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email');
  }

  const hashedPassword = hashPassword(data.password);

  const user = {
    email,
    name,
    password: hashedPassword,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  db.insert('users', user);

  sendWelcomeEmail(email, name);

  logUserRegistration(user);

  return user;
}

// ❌ Magic numbers
export function calculatePrice(quantity: number) {
  return quantity * 19.99 * 0.85 + 5.99;
}

// ❌ Poor naming
export function calc(a: number, b: number) {
  return a * b + 100;
}

// ✅ Good practice - proper error handling
export async function fetchUserSafely(userId: string) {
  try {
    const response = await fetch(`https://api.example.com/users/${userId}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user', { userId, error });
    throw new UserFetchError(`Could not fetch user ${userId}`, { cause: error });
  }
}

// Fake implementations
function hashPassword(password: string): string {
  return 'hashed_' + password;
}

function sendWelcomeEmail(email: string, name: string): void {
  console.log(`Sending welcome email to ${email}`);
}

function logUserRegistration(user: any): void {
  console.log('User registered:', user);
}

class UserFetchError extends Error {
  constructor(message: string, options?: { cause?: Error }) {
    super(message);
    this.name = 'UserFetchError';
  }
}
