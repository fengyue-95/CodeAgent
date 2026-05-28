// Example code that needs documentation

/**
 * User authentication service
 */
export class AuthService {
  constructor(
    private userRepository: UserRepository,
    private tokenService: TokenService,
    private logger: Logger
  ) {}

  // TODO: Add documentation
  async authenticate(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);

    if (!isValid) {
      throw new AuthenticationError('Invalid password');
    }

    const token = await this.tokenService.generateToken(user.id);

    this.logger.info('User authenticated', { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    };
  }

  // TODO: Add documentation
  async refreshToken(oldToken: string): Promise<string> {
    const userId = await this.tokenService.verifyToken(oldToken);

    if (!userId) {
      throw new AuthenticationError('Invalid token');
    }

    return await this.tokenService.generateToken(userId);
  }

  // TODO: Add documentation
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }
}

// TODO: Add documentation
export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string;
  };
  token: string;
}

// TODO: Add documentation
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// Interfaces that need documentation
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
}

interface TokenService {
  generateToken(userId: string): Promise<string>;
  verifyToken(token: string): Promise<string | null>;
}

interface Logger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
}

// Helper function that needs documentation
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Complex function that needs explanation
export async function processUserRegistration(
  userData: {
    email: string;
    password: string;
    name: string;
  },
  services: {
    userRepo: UserRepository;
    emailService: EmailService;
    logger: Logger;
  }
): Promise<User> {
  // Validation
  if (!validateEmail(userData.email)) {
    throw new ValidationError('Invalid email format');
  }

  if (userData.password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  // Check existing user
  const existing = await services.userRepo.findByEmail(userData.email);
  if (existing) {
    throw new ConflictError('User already exists');
  }

  // Create user
  const passwordHash = await bcrypt.hash(userData.password, 10);
  const user: User = {
    id: generateId(),
    email: userData.email,
    name: userData.name,
    passwordHash,
  };

  await services.userRepo.save(user);

  // Send welcome email
  try {
    await services.emailService.sendWelcomeEmail(user.email, user.name);
  } catch (error) {
    services.logger.error('Failed to send welcome email', { userId: user.id, error });
  }

  services.logger.info('User registered', { userId: user.id });

  return user;
}

interface EmailService {
  sendWelcomeEmail(email: string, name: string): Promise<void>;
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Import for bcrypt (mock)
const bcrypt = {
  compare: async (password: string, hash: string): Promise<boolean> => {
    return password === hash;
  },
  hash: async (password: string, rounds: number): Promise<string> => {
    return 'hashed_' + password;
  },
};
