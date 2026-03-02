import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../lib/auth-client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { Building2, Users, UserCheck, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { EverSenseLogo } from '../components/EverSenseLogo';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
}

interface Organization {
  name: string;
  slug?: string;
}

interface UserProfile {
  firstName: string;
  lastName: string;
  jobTitle: string;
  company: string;
}

export function Onboarding() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form data
  const [organization, setOrganization] = useState<Organization>({ name: '' });
  const [userProfile, setUserProfile] = useState<UserProfile>({
    firstName: '',
    lastName: '',
    jobTitle: '',
    company: ''
  });
  const [inviteEmails, setInviteEmails] = useState<string[]>(['']);

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to EverSense Ai',
      description: 'Let\'s get you set up with your workspace',
      icon: <CheckCircle className="w-6 h-6" />,
      completed: false
    },
    {
      id: 'organization',
      title: 'Create Organization',
      description: 'Set up your workspace and organization',
      icon: <Building2 className="w-6 h-6" />,
      completed: false
    },
    {
      id: 'profile',
      title: 'Complete Profile',
      description: 'Tell us a bit about yourself',
      icon: <UserCheck className="w-6 h-6" />,
      completed: false
    },
    {
      id: 'team',
      title: 'Invite Team',
      description: 'Invite team members to collaborate',
      icon: <Users className="w-6 h-6" />,
      completed: false
    }
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  // Check wizard status and set current step
  useEffect(() => {
    if (session?.user) {
      checkWizardStatus();
    }
  }, [session]);

  const checkWizardStatus = async () => {
    try {
      const response = await fetch('/api/wizard/status', {
        credentials: 'include'
      });
      const result = await response.json();
      
      if (result.success) {
        const { needsOnboarding, nextStep } = result.data;
        
        if (!needsOnboarding) {
          // User has completed onboarding, redirect to dashboard
          navigate('/dashboard', { replace: true });
          return;
        }

        if (nextStep && steps.some(s => s.id === nextStep)) {
          const stepIndex = steps.findIndex(s => s.id === nextStep);
          setCurrentStep(stepIndex);
        }
      }
    } catch (error) {
      console.error('Error checking wizard status:', error);
    }
  };

  const completeWizardStep = async (stepId: string) => {
    try {
      const response = await fetch('/api/wizard/complete-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ step: stepId })
      });

      const result = await response.json();
      if (result.success) {
        console.log(`Wizard step '${stepId}' completed successfully`);
        return true;
      } else {
        console.error('Failed to complete wizard step:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error completing wizard step:', error);
      return false;
    }
  };

  const nextStep = async () => {
    // Complete current step in wizard system
    const currentStepId = steps[currentStep].id;
    const stepCompleted = await completeWizardStep(currentStepId);
    
    if (stepCompleted) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreateOrganization = async () => {
    if (!organization.name.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: organization.name,
          slug: organization.slug
        })
      });

      if (response.ok) {
        const stepCompleted = await completeWizardStep('organization');
        if (stepCompleted) {
          nextStep();
        }
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create organization');
      }
    } catch (error) {
      console.error('Error creating organization:', error);
      alert('Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setLoading(true);
    try {
      // Mark onboarding as complete and redirect
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteTeam = async () => {
    const validEmails = inviteEmails.filter(email => email.trim() && email.includes('@'));
    
    if (validEmails.length > 0) {
      setLoading(true);
      try {
        // Send invitations using the API
        console.log('Sending invitations to:', validEmails);
        
        // Get the current user's organization ID (assuming first org for now)
        const orgResponse = await fetch(`/api/organizations?userId=${session?.user?.id}`);
        if (orgResponse.ok) {
          const orgData = await orgResponse.json();
          const organizationId = orgData.organizations?.[0]?.id;
          
          if (organizationId) {
            // Send invites for each email
            for (const email of validEmails) {
              const inviteResponse = await fetch(`/api/invites`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  email: email.trim(),
                  role: 'STAFF',
                  organizationId: organizationId,
                  message: 'Join our team on EverSense Ai!'
                }),
              });
              
              if (inviteResponse.ok) {
                console.log(`✅ Invite sent to ${email}`);
              } else {
                console.error(`❌ Failed to send invite to ${email}`);
              }
            }
          }
        }
        nextStep();
      } catch (error) {
        console.error('Error sending invitations:', error);
      } finally {
        setLoading(false);
      }
    } else {
      nextStep(); // Skip if no emails provided
    }
  };

  const addEmailField = () => {
    setInviteEmails([...inviteEmails, '']);
  };

  const updateEmail = (index: number, email: string) => {
    const newEmails = [...inviteEmails];
    newEmails[index] = email;
    setInviteEmails(newEmails);
  };

  const removeEmail = (index: number) => {
    if (inviteEmails.length > 1) {
      setInviteEmails(inviteEmails.filter((_, i) => i !== index));
    }
  };

  const renderStep = () => {
    const step = steps[currentStep];

    switch (step.id) {
      case 'welcome':
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center mx-auto shadow-glow">
              <CheckCircle className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold gradient-text">Welcome to EverSense Ai!</h2>
              <p className="text-muted-foreground mt-2">
                Hi {session?.user?.name || 'there'}! Let's set up your workspace to get you started with task management and team collaboration.
              </p>
            </div>
            <div className="glass-surface p-4 rounded-lg border border-border">
              <p className="text-sm text-foreground">
                This quick setup will take about 2-3 minutes and will help you get the most out of EverSense Ai.
              </p>
            </div>
            <Button onClick={nextStep} className="w-full bg-gradient-primary hover:bg-gradient-primary/90 text-white shadow-glow transition-all duration-300">
              Let's Get Started
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        );

      case 'organization':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center mx-auto shadow-glow">
                <Building2 className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold gradient-text mt-4">Create Your Organization</h2>
              <p className="text-muted-foreground mt-2">
                Your organization is your workspace where you'll manage tasks, projects, and collaborate with your team.
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="orgName" className="block text-sm font-medium text-foreground mb-1">
                  Organization Name *
                </label>
                <Input
                  id="orgName"
                  type="text"
                  placeholder="Enter your organization name"
                  value={organization.name}
                  onChange={(e) => setOrganization({ ...organization, name: e.target.value })}
                  className="w-full glass-surface"
                />
              </div>
              
              <div>
                <label htmlFor="orgSlug" className="block text-sm font-medium text-foreground mb-1">
                  URL Slug (optional)
                </label>
                <Input
                  id="orgSlug"
                  type="text"
                  placeholder="your-organization"
                  value={organization.slug || ''}
                  onChange={(e) => setOrganization({ ...organization, slug: e.target.value })}
                  className="w-full glass-surface"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will be used in your organization URL
                </p>
              </div>
            </div>

            <div className="flex space-x-3">
              <Button variant="outline" onClick={prevStep} className="flex-1 glass-surface border-border hover:bg-surface-elevated">
                <ArrowLeft className="mr-2 w-4 h-4" />
                Back
              </Button>
              <Button 
                onClick={handleCreateOrganization} 
                className="flex-1 bg-gradient-primary hover:bg-gradient-primary/90 text-white shadow-glow transition-all duration-300"
                disabled={!organization.name.trim() || loading}
              >
                {loading ? 'Creating...' : 'Create Organization'}
                {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
              </Button>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 shadow-glow rounded-full flex items-center justify-center mx-auto">
                <UserCheck className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold gradient-text mt-4">Complete Your Profile</h2>
              <p className="text-muted-foreground mt-2">
                Help your team know who you are by completing your profile information.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-foreground mb-1">
                  First Name
                </label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  value={userProfile.firstName}
                  onChange={(e) => setUserProfile({ ...userProfile, firstName: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-foreground mb-1">
                  Last Name
                </label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={userProfile.lastName}
                  onChange={(e) => setUserProfile({ ...userProfile, lastName: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="jobTitle" className="block text-sm font-medium text-foreground mb-1">
                  Job Title
                </label>
                <Input
                  id="jobTitle"
                  type="text"
                  placeholder="Product Manager"
                  value={userProfile.jobTitle}
                  onChange={(e) => setUserProfile({ ...userProfile, jobTitle: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-foreground mb-1">
                  Company
                </label>
                <Input
                  id="company"
                  type="text"
                  placeholder="Acme Corp"
                  value={userProfile.company}
                  onChange={(e) => setUserProfile({ ...userProfile, company: e.target.value })}
                />
              </div>
            </div>

            <div className="flex space-x-3">
              <Button variant="outline" onClick={prevStep} className="flex-1">
                <ArrowLeft className="mr-2 w-4 h-4" />
                Back
              </Button>
              <Button onClick={nextStep} className="flex-1 bg-gradient-primary hover:bg-gradient-primary/90 text-white shadow-glow transition-all duration-300">
                Continue
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        );

      case 'team':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 shadow-glow rounded-full flex items-center justify-center mx-auto">
                <Users className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold gradient-text mt-4">Invite Your Team</h2>
              <p className="text-muted-foreground mt-2">
                Invite team members to collaborate on tasks and projects. You can always do this later from settings.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">
                Team Member Email Addresses
              </label>
              {inviteEmails.map((email, index) => (
                <div key={index} className="flex space-x-2">
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={(e) => updateEmail(index, e.target.value)}
                    className="flex-1"
                  />
                  {inviteEmails.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeEmail(index)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={addEmailField}
                className="w-full glass-surface"
              >
                Add Another Email
              </Button>
            </div>

            <div className="flex space-x-3">
              <Button variant="outline" onClick={prevStep} className="flex-1">
                <ArrowLeft className="mr-2 w-4 h-4" />
                Back
              </Button>
              <Button onClick={handleInviteTeam} className="flex-1 bg-gradient-primary hover:bg-gradient-primary/90 text-white shadow-glow transition-all duration-300" disabled={loading}>
                {loading ? 'Sending...' : inviteEmails.some(e => e.trim()) ? 'Send Invites' : 'Skip for Now'}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold gradient-text">You're All Set!</h2>
              <p className="text-muted-foreground mt-2">
                Welcome to EverSense Ai! Your workspace is ready and you can start managing tasks and collaborating with your team.
              </p>
            </div>
            <Button onClick={handleCompleteOnboarding} className="w-full glass-surface" disabled={loading}>
              {loading ? 'Setting up...' : 'Go to Dashboard'}
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-success/5"></div>
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-success/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      
      <div className="w-full max-w-2xl relative z-10">
        {/* Logo & Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <EverSenseLogo width={280} height={55} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold gradient-text">EverSense Ai</h1>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Building2 className="h-4 w-4" />
              AI-Powered Task Management
            </p>
          </div>
        </div>

        <Card className="glass shadow-elevation">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold gradient-text">
                  Setup Progress
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Step {currentStep + 1} of {steps.length}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-foreground">
                  {Math.round(progress)}% Complete
                </div>
              </div>
            </div>
            <Progress value={progress} className="w-full bg-surface-elevated" />
          </CardHeader>
          
          <CardContent className="pt-6">
            {renderStep()}
          </CardContent>
        </Card>

        {/* Step indicators */}
        <div className="mt-6 flex justify-center space-x-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`w-3 h-3 rounded-full ${
                index <= currentStep ? 'bg-primary' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}