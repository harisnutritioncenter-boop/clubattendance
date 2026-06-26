import { Metadata } from 'next';
import { LoginForm } from '@/features/auth/components/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Login | Club Attendance',
  description: 'Login to your account',
};

export default function LoginPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-secondary/30 px-4">
      <Card className="w-full max-w-md shadow-lg border-none">
        <CardHeader className="space-y-1 pb-6 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-primary">Club Attendance</CardTitle>
          <CardDescription>
            Enter your email and password to sign in
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
