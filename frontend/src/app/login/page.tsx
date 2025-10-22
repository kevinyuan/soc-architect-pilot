'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Loader2, AlertCircle, KeyRound, Mail, LogIn, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

type ViewMode = 'login' | 'invite' | 'waitlist';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, joinWaitlist } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('login');
  
  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Invite code state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  
  // Waitlist state
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistError, setWaitlistError] = useState('');
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signIn(email, password);
      router.push('/ide');
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');

    try {
      await signUp({
        email: inviteEmail,
        password: invitePassword,
        name: inviteEmail.split('@')[0], // Use email prefix as name
        invitationCode: inviteCode
      });
      
      // Show success screen
      setInviteSuccess(true);
      
      // Auto-login after 2 seconds
      setTimeout(async () => {
        try {
          await signIn(inviteEmail, invitePassword);
          router.push('/ide');
        } catch (err) {
          // If auto-login fails, redirect to login page
          router.push('/login?registered=true');
        }
      }, 2000);
    } catch (err: any) {
      console.error('Invite signup error:', err);
      setInviteError(err.message || 'Signup failed. Please check your invite code.');
      setInviteLoading(false);
    }
  };

  const handleWaitlistJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaitlistLoading(true);
    setWaitlistError('');

    try {
      await joinWaitlist({
        email: waitlistEmail,
        name: waitlistName
      });
      
      setWaitlistSuccess(true);
      setWaitlistEmail('');
      setWaitlistName('');
    } catch (err: any) {
      console.error('Waitlist error:', err);
      setWaitlistError(err.message || 'Failed to join waitlist. Please try again.');
    } finally {
      setWaitlistLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <style jsx>{`
        .smooth-tabs [data-state="active"] {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center mb-4">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">
            SoC Pilot
          </CardTitle>
          <CardDescription>
            AI-powered SoC architecture design platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-full smooth-tabs">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="login" className="flex items-center gap-1">
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Sign In</span>
              </TabsTrigger>
              <TabsTrigger value="invite" className="flex items-center gap-1">
                <KeyRound className="h-4 w-4" />
                <span className="hidden sm:inline">Invite Code</span>
              </TabsTrigger>
              <TabsTrigger value="waitlist" className="flex items-center gap-1">
                <Mail className="h-4 w-4" />
                <span className="hidden sm:inline">Waitlist</span>
              </TabsTrigger>
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="login" className="space-y-4 mt-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={loading}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    className="h-11"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-11" 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* Sign Up with Invite Code Tab */}
            <TabsContent value="invite" className="space-y-4 mt-4">
              {inviteSuccess ? (
                <div className="text-center py-8 space-y-4">
                  <div className="flex justify-center">
                    <div className="rounded-full bg-green-100 p-3">
                      <CheckCircle2 className="h-12 w-12 text-green-600" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-green-900">Account Created Successfully!</h3>
                    <p className="text-sm text-muted-foreground">
                      Welcome to SoC Pilot! Redirecting you to the app...
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInviteSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={inviteLoading}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-code">Invite Code</Label>
                  <Input
                    id="invite-code"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX-XXXX"
                    required
                    disabled={inviteLoading}
                    className="h-11 font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-password">Create Password</Label>
                  <Input
                    id="invite-password"
                    type="password"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={inviteLoading}
                    className="h-11"
                  />
                </div>

                {inviteError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{inviteError}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-11" 
                  disabled={inviteLoading}
                >
                  {inviteLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Sign Up with Invite
                    </>
                  )}
                </Button>
              </form>
              )}
            </TabsContent>

            {/* Waitlist Tab */}
            <TabsContent value="waitlist" className="space-y-4 mt-4">
              {waitlistSuccess ? (
                <Alert className="bg-green-50 border-green-200">
                  <AlertCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Thanks for joining! We'll notify you when access is available.
                  </AlertDescription>
                </Alert>
              ) : (
                <form onSubmit={handleWaitlistJoin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="waitlist-name">Full Name</Label>
                    <Input
                      id="waitlist-name"
                      type="text"
                      value={waitlistName}
                      onChange={(e) => setWaitlistName(e.target.value)}
                      placeholder="John Doe"
                      required
                      disabled={waitlistLoading}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="waitlist-email">Email</Label>
                    <Input
                      id="waitlist-email"
                      type="email"
                      value={waitlistEmail}
                      onChange={(e) => setWaitlistEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      disabled={waitlistLoading}
                      className="h-11"
                    />
                  </div>

                  {waitlistError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{waitlistError}</AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full h-11" 
                    disabled={waitlistLoading}
                  >
                    {waitlistLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Join Waitlist
                      </>
                    )}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
