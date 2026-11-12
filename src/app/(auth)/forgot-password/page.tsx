import { AuthCard, ForgotForm } from "@/components/AuthForms";

// Reads the session per request: never prerendered or cached.
export const instant = false;

export const metadata = { title: "Reset password · Garage desk" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" intro="We'll email you a link to set a new one.">
      <ForgotForm />
    </AuthCard>
  );
}
