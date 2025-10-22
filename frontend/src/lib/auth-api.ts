// Authentication API Client
// Handles user authentication and account management

import { apiClient } from './api-client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface SignInResponse {
  token: string;
  user: User;
}

export interface SignUpRequest {
  email: string;
  password: string;
  name: string;
  invitationCode: string;
}

export interface SignUpResponse {
  message: string;
}

export interface WaitlistRequest {
  email: string;
  name: string;
  company?: string;
}

export interface WaitlistResponse {
  message: string;
}

/**
 * Authentication API Client
 */
export const authAPI = {
  /**
   * Sign in with email and password
   */
  async signIn(data: SignInRequest): Promise<SignInResponse> {
    const response = await apiClient.post<SignInResponse>(
      '/auth/login',
      data
    );
    return response;
  },

  /**
   * Sign up with invitation code
   */
  async signUp(data: SignUpRequest): Promise<SignUpResponse> {
    const response = await apiClient.post<SignUpResponse>(
      '/auth/signup',
      data
    );
    return response;
  },

  /**
   * Join waitlist
   */
  async joinWaitlist(data: WaitlistRequest): Promise<WaitlistResponse> {
    const response = await apiClient.post<WaitlistResponse>(
      '/auth/waitlist',
      data
    );
    return response;
  },

  /**
   * Get current user info (requires authentication)
   */
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    return response.user;
  },

  /**
   * Change password
   */
  async changePassword(data: {
    email: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(
      '/auth/change-password',
      data
    );
    return response;
  },
};
