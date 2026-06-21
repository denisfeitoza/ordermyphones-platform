import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { AuthLayout, AuthField } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';

export default function ResetPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSent(true);
  }

  return (
    <AuthLayout
      title={sent ? 'Check your inbox' : 'Reset password'}
      {...(sent ? {} : { subtitle: 'We’ll email you a secure link to set a new password.' })}
      footer={
        <Link to="/auth/sign-in" className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-5"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/10 text-success">
            <MailCheck className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-medium">Link sent to {email}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open it on this device to continue. Mockup — no email is actually sent.
            </p>
          </div>
        </motion.div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AuthField
            label="Work email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@store.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" size="lg" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
