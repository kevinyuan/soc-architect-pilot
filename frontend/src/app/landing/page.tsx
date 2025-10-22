
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Lightbulb, Blocks, ShieldAlert, FileJson2, BarChart3, ArrowRight } from "lucide-react";
import Link from 'next/link';
import { ThemeProvider } from "@/components/theme-provider";

export default function LandingPage() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="flex flex-col min-h-screen bg-background text-foreground">
        {/* Header */}
        <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-16 items-center justify-between px-4 md:px-6">
            <Link href="/landing" className="flex items-center space-x-2">
              <Zap className="h-7 w-7 text-primary" />
              <span className="font-bold text-xl">SoC Pilot</span>
            </Link>
            <div className="flex items-center gap-4">
              <Button variant="ghost" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Get Started</Link>
              </Button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1">
          <section className="container px-4 md:px-6 py-20 md:py-32">
            <div className="flex flex-col items-center text-center space-y-8 max-w-3xl mx-auto">
              <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm">
                <Zap className="h-3 w-3 mr-2 text-primary" />
                AI-Powered SoC Design Platform
              </div>
              
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                Design System-on-Chip
                <span className="text-primary"> with AI</span>
              </h1>
              
              <p className="text-lg text-muted-foreground md:text-xl max-w-2xl">
                From concept to validation, SoC Pilot streamlines your hardware design workflow with intelligent architecture tools and real-time collaboration.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button size="lg" asChild className="text-base">
                  <Link href="/signup">
                    Start Designing
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base">
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="container px-4 md:px-6 py-20 bg-muted/30">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
                  Complete Design Workflow
                </h2>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                  Integrated tools for every stage of your SoC design process
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="border-border/50 hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Lightbulb className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold text-lg">Concept Design</h3>
                      <p className="text-sm text-muted-foreground">
                        AI-assisted ideation and requirements gathering
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Blocks className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold text-lg">Architecture</h3>
                      <p className="text-sm text-muted-foreground">
                        Visual canvas for component design and connections
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <ShieldAlert className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold text-lg">Validation</h3>
                      <p className="text-sm text-muted-foreground">
                        Design rule checks and timing analysis
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <FileJson2 className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold text-lg">Code Editor</h3>
                      <p className="text-sm text-muted-foreground">
                        Integrated development environment
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <BarChart3 className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold text-lg">Analytics</h3>
                      <p className="text-sm text-muted-foreground">
                        Performance metrics and optimization insights
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Zap className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold text-lg">AI-Powered</h3>
                      <p className="text-sm text-muted-foreground">
                        Intelligent suggestions throughout your workflow
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="container px-4 md:px-6 py-20">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to start designing?
              </h2>
              <p className="text-lg text-muted-foreground">
                Join the waitlist or sign up with an invitation code to get started.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Button size="lg" asChild>
                  <Link href="/signup">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t py-8">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-primary" />
                <span className="font-semibold">SoC Pilot</span>
              </div>
              <p className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} SoC Pilot. All rights reserved.
              </p>
              <div className="flex gap-6">
                <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Privacy
                </Link>
                <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ThemeProvider>
  );
}

