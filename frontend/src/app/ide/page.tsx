'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { WebCoderLayout } from '@/components/ide/WebCoderLayout';
import { ThemeProvider } from '@/components/theme-provider';
import { RightSidebarProvider } from '@/components/ui/right-sidebar';
import { Loader2 } from 'lucide-react';

export default function IDEPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading SoC Pilot...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <RightSidebarProvider defaultOpen={false}>
        <WebCoderLayout />
      </RightSidebarProvider>
    </ThemeProvider>
  );
}
