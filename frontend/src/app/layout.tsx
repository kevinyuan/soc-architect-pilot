
import type {Metadata} from 'next';
import 'reactflow/dist/style.css'; // Import React Flow styles here
import './globals.css'; // Then import global overrides
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { ContextMenuDisabler } from '@/components/ContextMenuDisabler';

export const metadata: Metadata = {
  title: 'SoC Pilot',
  description: 'A modern web-based IDE with AI-powered SoC design and architecture development.',
  icons: {
    icon: '/sparkles.svg',
    shortcut: '/sparkles.svg',
    apple: '/sparkles.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <ContextMenuDisabler />
        <AuthProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </AuthProvider>
        {/* <Toaster /> */}
      </body>
    </html>
  );
}
