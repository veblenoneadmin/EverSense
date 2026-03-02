import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowRight, Sparkles, CheckCircle } from 'lucide-react';
import { EverSenseLogo } from '../components/EverSenseLogo';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);

  const token = searchParams.get('token');

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setError('Invalid or missing reset token');
        setCheckingToken(false);
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify-reset-token?token=${token}`);
        if (response.ok) {
          setIsValidToken(true);
        } else {
          setError('This reset link has expired or is invalid. Please request a new one.');
        }
      } catch (err) {
        setError('Unable to verify reset token. Please try again.');
      } finally {
        setCheckingToken(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(result.message || 'Failed to reset password');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Password reset error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (checkingToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="glass shadow-elevation w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Verifying reset token...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isValidToken && !success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="glass shadow-elevation w-full max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <div className="text-error text-6xl">❌</div>
            <h2 className="text-xl font-semibold">Invalid Reset Link</h2>
            <p className="text-muted-foreground">{error}</p>
            <Link 
              to="/forgot-password" 
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
            >
              Request New Reset Link
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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

        {/* Reset Password Card */}
        <Card className="glass shadow-elevation">
          {!success ? (
            <>
              <CardHeader className="space-y-1 pb-4">
                <h2 className="text-2xl font-semibold text-center">Create New Password 🔐</h2>
                <p className="text-sm text-muted-foreground text-center">
                  Choose a strong password for your account
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Password Input */}
                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium text-foreground">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-white/80 z-10" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        placeholder="Enter new password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 glass-surface"
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-3 text-white/80 hover:text-white z-10 transition-colors"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password Input */}
                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-white/80 z-10" />
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        id="confirmPassword"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 pr-10 glass-surface"
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-3 text-white/80 hover:text-white z-10 transition-colors"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword ? (
                        <span className="text-red-400">❌ Passwords do not match</span>
                      ) : password.length > 0 && confirmPassword.length > 0 && password === confirmPassword ? (
                        <span className="text-green-400">✅ Passwords match</span>
                      ) : (
                        'Password must be at least 6 characters long'
                      )}
                    </p>
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
                    disabled={loading || password !== confirmPassword || password.length < 6}
                    className="w-full bg-gradient-success hover:bg-gradient-success/90 text-white shadow-glow transition-all duration-300"
                  >
                    {loading ? 'Updating password...' : 'Update Password'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-4 bg-success/10 rounded-full">
                    <CheckCircle className="h-8 w-8 text-success" />
                  </div>
                </div>
                <h2 className="text-2xl font-semibold text-center">Password Updated! ✅</h2>
                <p className="text-sm text-muted-foreground text-center">
                  Your password has been successfully reset
                </p>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-sm text-foreground">
                    You can now sign in with your new password. You'll be redirected to the login page shortly.
                  </p>
                </div>

                <Link 
                  to="/login" 
                  className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  Go to Sign In Now
                  <ArrowRight className="h-4 w-4" />
                </Link>
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