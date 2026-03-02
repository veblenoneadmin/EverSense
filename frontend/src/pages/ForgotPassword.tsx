import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, Sparkles, MailCheck, ArrowLeft } from 'lucide-react';
import { EverSenseLogo } from '../components/EverSenseLogo';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Call the password reset API
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (response.ok) {
        setUserEmail(email);
        setEmailSent(true);
      } else {
        setError(result.message || 'Failed to send reset email');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Password reset error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5"></div>
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      
      {/* Main Content */}
      <div className="w-full max-w-md relative z-10">
        {/* Logo & Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <EverSenseLogo height={56} width={328} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold gradient-text">EverSense Ai</h1>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI-Powered Task Management
            </p>
          </div>
        </div>

        {/* Forgot Password Card */}
        <Card className="glass shadow-elevation">
          {!emailSent ? (
            <>
              <CardHeader className="space-y-1 pb-4">
                <h2 className="text-2xl font-semibold text-center">Forgot your password? 🔑</h2>
                <p className="text-sm text-muted-foreground text-center">
                  No worries! Enter your email and we'll send you a reset link.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Email Input */}
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-foreground">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-white/80 z-10" />
                      <Input
                        type="email"
                        id="email"
                        placeholder="Enter your email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 glass-surface"
                        required
                      />
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                      {error}
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-gradient-primary hover:bg-gradient-primary/90 text-white shadow-glow transition-all duration-300"
                  >
                    {loading ? 'Sending reset email...' : 'Send Reset Email'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>

                {/* Back to Login */}
                <div className="text-center pt-4 border-t border-border">
                  <Link 
                    to="/login" 
                    className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Sign In
                  </Link>
                </div>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-4 bg-success/10 rounded-full">
                    <MailCheck className="h-8 w-8 text-success" />
                  </div>
                </div>
                <h2 className="text-2xl font-semibold text-center">Check Your Email! 📧</h2>
                <p className="text-sm text-muted-foreground text-center">
                  We've sent a password reset link to your email
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center space-y-4">
                  <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                    <p className="text-sm text-foreground mb-2">
                      <strong>Reset email sent to:</strong>
                    </p>
                    <p className="text-success font-medium">{userEmail}</p>
                  </div>
                  
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">What's next?</p>
                    <ol className="text-xs text-muted-foreground space-y-1 text-left bg-muted/30 p-4 rounded-lg">
                      <li>1. Check your email (including spam/junk folder)</li>
                      <li>2. Click the "Reset Password" link in the email</li>
                      <li>3. Create a new password</li>
                      <li>4. Sign in with your new password</li>
                    </ol>
                  </div>

                  <div className="text-xs text-muted-foreground p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <strong>Note:</strong> The reset link will expire in 15 minutes for security.
                  </div>
                </div>

                {/* Back to Login */}
                <div className="text-center pt-4 border-t border-border">
                  <Link 
                    to="/login" 
                    className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Sign In
                  </Link>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-muted-foreground">
            © 2024 EverSense Ai. Secure authentication powered by better-auth.
          </p>
        </div>
      </div>
    </div>
  );
}