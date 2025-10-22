import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const router = Router();

// DynamoDB setup
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE || 'soc-pilot-users';
const INVITATIONS_TABLE = process.env.DYNAMODB_INVITATIONS_TABLE || 'soc-pilot-invitations';
const WAITLIST_TABLE = process.env.DYNAMODB_WAITLIST_TABLE || 'soc-pilot-waitlist';
const JWT_SECRET: string = process.env.JWT_SECRET;
const JWT_EXPIRATION: string = process.env.JWT_EXPIRATION || '24h';

// Helper: Generate JWT token
function generateToken(userId: string, email: string, role: string = 'user'): string {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: JWT_EXPIRATION as jwt.SignOptions['expiresIn'] });
}

// Helper: Hash password
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

// Helper: Verify password
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * POST /api/auth/signup
 * Register new user with invitation code
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name, invitationCode } = req.body;

    // Validation
    if (!email || !password || !name || !invitationCode) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email, password, name, and invitation code are required'
        }
      });
    }

    // Validate invitation code
    const inviteResult = await docClient.send(new GetCommand({
      TableName: INVITATIONS_TABLE,
      Key: { invitationCode: invitationCode.toUpperCase() }
    }));

    if (!inviteResult.Item) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INVITATION',
          message: 'Invalid invitation code'
        }
      });
    }

    if (inviteResult.Item.used) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVITATION_USED',
          message: 'This invitation code has already been used'
        }
      });
    }

    // Check if user already exists
    const existingUser = await docClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      }
    }));

    if (existingUser.Items && existingUser.Items.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'An account with this email already exists'
        }
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const userId = uuidv4();
    const now = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: {
        userId,
        email: email.toLowerCase(),
        name,
        passwordHash,
        role: 'user', // Default role: 'user' or 'admin'
        createdAt: now,
        updatedAt: now,
        invitationCode: invitationCode.toUpperCase()
      }
    }));

    // Mark invitation as used
    await docClient.send(new UpdateCommand({
      TableName: INVITATIONS_TABLE,
      Key: { invitationCode: invitationCode.toUpperCase() },
      UpdateExpression: 'SET used = :true, usedBy = :userId, usedAt = :now',
      ExpressionAttributeValues: {
        ':true': true,
        ':userId': userId,
        ':now': now
      }
    }));

    res.status(201).json({
      success: true,
      data: {
        message: 'Account created successfully. Please sign in.'
      }
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SIGNUP_ERROR',
        message: 'Failed to create account'
      }
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required'
        }
      });
    }

    // Find user by email
    const result = await docClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      }
    }));

    if (!result.Items || result.Items.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    const user = result.Items[0];

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    // Generate token
    const token = generateToken(user.userId, user.email, user.role || 'user');

    // Update last login
    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId: user.userId },
      UpdateExpression: 'SET lastLogin = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString()
      }
    }));

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.userId,
          email: user.email,
          name: user.name,
          role: user.role || 'user',
          createdAt: user.createdAt
        }
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: 'Failed to sign in'
      }
    });
  }
});

/**
 * POST /api/auth/waitlist
 * Join waitlist
 */
router.post('/waitlist', async (req: Request, res: Response) => {
  try {
    const { email, name, company } = req.body;

    // Validation
    if (!email || !name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and name are required'
        }
      });
    }

    // Check if already on waitlist
    const existing = await docClient.send(new QueryCommand({
      TableName: WAITLIST_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      }
    }));

    if (existing.Items && existing.Items.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALREADY_ON_WAITLIST',
          message: 'This email is already on the waitlist'
        }
      });
    }

    // Add to waitlist
    const waitlistId = uuidv4();
    await docClient.send(new PutCommand({
      TableName: WAITLIST_TABLE,
      Item: {
        waitlistId,
        email: email.toLowerCase(),
        name,
        company: company || null,
        createdAt: new Date().toISOString(),
        status: 'pending'
      }
    }));

    res.status(201).json({
      success: true,
      data: {
        message: 'Successfully joined the waitlist'
      }
    });
  } catch (error: any) {
    console.error('Waitlist error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WAITLIST_ERROR',
        message: 'Failed to join waitlist'
      }
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user (requires auth)
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN',
          message: 'Authentication required'
        }
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };

    // Get user
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId: decoded.userId }
    }));

    if (!result.Item) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: result.Item.userId,
          email: result.Item.email,
          name: result.Item.name,
          role: result.Item.role || 'user',
          createdAt: result.Item.createdAt
        }
      }
    });
  } catch (error: any) {
    console.error('Auth check error:', error);
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      }
    });
  }
});

/**
 * POST /api/auth/validate-email
 * Validate if an email exists in the system
 */
router.post('/validate-email', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validation
    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email is required'
        }
      });
    }

    // Check if user exists with this email
    const result = await docClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      }
    }));

    const userExists = result.Items && result.Items.length > 0;

    res.json({
      success: true,
      data: {
        exists: userExists,
        user: userExists ? {
          email: result.Items![0].email,
          name: result.Items![0].name,
          userId: result.Items![0].userId
        } : null
      }
    });
  } catch (error: any) {
    console.error('Email validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Failed to validate email'
      }
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change user password (requires authentication)
 */
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    // Validation
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email, current password, and new password are required'
        }
      });
    }

    // Password strength validation
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'WEAK_PASSWORD',
          message: 'New password must be at least 8 characters long'
        }
      });
    }

    // Get user
    const result = await docClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      }
    }));

    if (!result.Items || result.Items.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    const user = result.Items[0];

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'Current password is incorrect'
        }
      });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId: user.userId },
      UpdateExpression: 'SET passwordHash = :newHash, updatedAt = :now',
      ExpressionAttributeValues: {
        ':newHash': newPasswordHash,
        ':now': new Date().toISOString()
      }
    }));

    res.json({
      success: true,
      data: {
        message: 'Password changed successfully'
      }
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CHANGE_PASSWORD_ERROR',
        message: 'Failed to change password'
      }
    });
  }
});

export default router;
