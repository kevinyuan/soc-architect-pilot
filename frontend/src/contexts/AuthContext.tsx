'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, User } from '@/lib/auth-api';

interface SignUpData {
  email: string;
  password: string;
  name: string;
  invitationCode: string;
}

interface WaitlistData {
  email: string;
  name: string;
  company?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: SignUpData) => Promise<void>;
  signOut: () => Promise<void>;
  joinWaitlist: (data: WaitlistData) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  joinWaitlist: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check if user is authenticated
      const token = localStorage.getItem('auth_token');
      if (token) {
        // TODO: Validate token with backend
        // For now, just check if token exists
        const userData = localStorage.getItem('user_data');
        if (userData) {
          setUser(JSON.parse(userData));
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const data = await authAPI.signIn({ email, password });

      // Store token and user data
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_data', JSON.stringify(data.user));
      localStorage.setItem('currentUser', data.user.email); // For backward compatibility

      setUser(data.user);
    } catch (error: any) {
      console.error('Sign in error:', error);

      // APIClientError already has user-friendly messages
      // Just re-throw to let the UI handle it
      throw error;
    }
  };

  const signUp = async (data: SignUpData) => {
    try {
      await authAPI.signUp(data);
      // Don't auto-login, redirect to login page
      return;
    } catch (error: any) {
      console.error('Sign up error:', error);

      // APIClientError already has user-friendly messages
      // Just re-throw to let the UI handle it
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // Clear local storage
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      localStorage.removeItem('currentUser');
      
      setUser(null);
      router.push('/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const joinWaitlist = async (data: WaitlistData) => {
    try {
      await authAPI.joinWaitlist(data);
      return;
    } catch (error: any) {
      console.error('Waitlist error:', error);

      // APIClientError already has user-friendly messages
      // Just re-throw to let the UI handle it
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, joinWaitlist }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
