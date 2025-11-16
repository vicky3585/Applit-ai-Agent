import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Code2, Sparkles, Zap, Shield } from "lucide-react";

const signupSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, and underscores"),
  email: z.string()
    .min(1, "Email is required")
    .email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type SignupFormData = z.infer<typeof signupSchema>;
type LoginFormData = z.infer<typeof loginSchema>;

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Signup - simple controlled inputs
  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupErrors, setSignupErrors] = useState<Record<string, string>>({});

  // Login - React Hook Form (works fine)
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: SignupFormData) => {
      const response = await apiRequest("POST", "/api/auth/signup", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account created!",
        description: "Please log in to continue.",
      });
      setMode("login");
      // Reset signup form
      setSignupUsername("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupErrors({});
    },
    onError: (error: Error) => {
      toast({
        title: "Signup failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: async () => {
      // Invalidate auth cache to fetch updated user
      const { queryClient } = await import("@/lib/queryClient");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      toast({
        title: "Welcome back!",
        description: "Redirecting to your dashboard...",
      });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials.",
        variant: "destructive",
      });
    },
  });

  const onSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSignupErrors({});

    // Validate using Zod schema
    const result = signupSchema.safeParse({
      username: signupUsername,
      email: signupEmail,
      password: signupPassword,
    });

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      setSignupErrors(errors);
      return;
    }

    signupMutation.mutate(result.data);
  };

  const onLoginSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1">
        {/* Left Side - Hero Section */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/90 to-primary relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0wLTEwYzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMC0xMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6TTI0IDM0YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMC0xMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTAtMTBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00ek0xMiAzNGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTAtMTBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-10"></div>
          
          <div className="relative z-10 flex flex-col justify-center px-12 text-primary-foreground">
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="relative">
                  <div className="w-12 h-12 bg-primary-foreground/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <Code2 className="w-7 h-7" />
                  </div>
                  <Sparkles className="w-4 h-4 absolute -top-1 -right-1 drop-shadow-lg" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">Applit</h1>
                  <p className="text-sm opacity-90">by Flying Venture System</p>
                </div>
              </div>
              <p className="text-2xl font-semibold mb-4">AI-Powered Development Environment</p>
              <p className="text-lg opacity-90 mb-8 max-w-md">
                Transform your ideas into reality with intelligent code generation, real-time collaboration, and seamless deployment.
              </p>
            </div>

            <div className="space-y-6 max-w-md">
              <div className="flex items-start gap-4 hover-elevate p-4 rounded-lg transition-all duration-200">
                <div className="w-10 h-10 bg-primary-foreground/10 rounded-lg flex items-center justify-center backdrop-blur-sm flex-shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">AI-First Workflow</h3>
                  <p className="text-sm opacity-80">Describe your app in natural language and watch it come to life</p>
                </div>
              </div>

              <div className="flex items-start gap-4 hover-elevate p-4 rounded-lg transition-all duration-200">
                <div className="w-10 h-10 bg-primary-foreground/10 rounded-lg flex items-center justify-center backdrop-blur-sm flex-shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Instant Deployment</h3>
                  <p className="text-sm opacity-80">One-click deployment to production with automatic scaling</p>
                </div>
              </div>

              <div className="flex items-start gap-4 hover-elevate p-4 rounded-lg transition-all duration-200">
                <div className="w-10 h-10 bg-primary-foreground/10 rounded-lg flex items-center justify-center backdrop-blur-sm flex-shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Secure & Isolated</h3>
                  <p className="text-sm opacity-80">Your workspace is completely private and secure</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Auth Form */}
        <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-background via-background to-muted/20">
          <div className="w-full max-w-md">
            <div className="text-center mb-8 lg:hidden">
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="relative">
                  <Code2 className="w-8 h-8 text-primary" />
                  <Sparkles className="w-3 h-3 text-primary absolute -top-1 -right-1" />
                </div>
                <div className="text-left">
                  <h1 className="text-3xl font-bold">Applit</h1>
                  <p className="text-xs text-muted-foreground">by Flying Venture System</p>
                </div>
              </div>
              <p className="text-muted-foreground">AI-Powered Development Environment</p>
            </div>

            <Card className="border-border shadow-lg">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl">
                  {mode === "login" ? "Welcome back" : "Create your account"}
                </CardTitle>
                <CardDescription>
                  {mode === "login" 
                    ? "Enter your credentials to access your workspace" 
                    : "Sign up to start building amazing applications"}
                </CardDescription>
              </CardHeader>

              <CardContent>
                {mode === "signup" ? (
                  <form onSubmit={onSignupSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="signup-username" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Username
                      </label>
                      <Input 
                        id="signup-username"
                        data-testid="input-username"
                        type="text"
                        placeholder="johndoe"
                        value={signupUsername}
                        onChange={(e) => setSignupUsername(e.target.value)}
                        className="transition-all duration-200"
                      />
                      {signupErrors.username && (
                        <p className="text-sm font-medium text-destructive">{signupErrors.username}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="signup-email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Email
                      </label>
                      <Input 
                        id="signup-email"
                        data-testid="input-email"
                        type="email"
                        placeholder="john@example.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="transition-all duration-200"
                      />
                      {signupErrors.email && (
                        <p className="text-sm font-medium text-destructive">{signupErrors.email}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="signup-password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Password
                      </label>
                      <Input 
                        id="signup-password"
                        data-testid="input-password"
                        type="password"
                        placeholder="••••••••"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="transition-all duration-200"
                      />
                      {signupErrors.password && (
                        <p className="text-sm font-medium text-destructive">{signupErrors.password}</p>
                      )}
                    </div>

                    <Button 
                      data-testid="button-signup"
                      type="submit" 
                      className="w-full" 
                      disabled={signupMutation.isPending}
                    >
                      {signupMutation.isPending ? "Creating account..." : "Create account"}
                    </Button>
                  </form>
                ) : (
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input 
                                data-testid="input-username"
                                placeholder="johndoe" 
                                className="transition-all duration-200"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input 
                                data-testid="input-password"
                                type="password" 
                                placeholder="••••••••" 
                                className="transition-all duration-200"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button 
                        data-testid="button-login"
                        type="submit" 
                        className="w-full" 
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? "Signing in..." : "Sign in"}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <div className="text-sm text-center text-muted-foreground">
                  {mode === "login" ? (
                    <>
                      Don't have an account?{" "}
                      <button
                        data-testid="link-switch-signup"
                        type="button"
                        onClick={() => setMode("signup")}
                        className="text-primary hover:underline font-medium transition-colors"
                      >
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <button
                        data-testid="link-switch-login"
                        type="button"
                        onClick={() => setMode("login")}
                        className="text-primary hover:underline font-medium transition-colors"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </div>
              </CardFooter>
            </Card>

            <p className="text-xs text-center text-muted-foreground mt-6">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>

      {/* Professional Footer */}
      <footer className="border-t bg-card/30 backdrop-blur-sm py-6">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold">Applit</span>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} <span className="font-semibold text-foreground">Flying Venture System</span>. All rights reserved.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              AI-Powered Development
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
