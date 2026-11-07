import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/Button";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type FormData = z.infer<typeof schema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      await login(data.email, data.password);
      navigate("/dashboard");
    } catch (err) {
      setServerError(errorMessage(err, "Could not log in"));
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[1.6rem] font-semibold text-text tracking-tight leading-tight">
        Welcome back
      </h1>
      <p className="text-sm text-muted mt-1">Log in to see today's shortlist.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-3.5">
        <div>
          <label className="text-[13px] font-medium text-text">Email</label>
          <input type="email" autoComplete="email" className="input mt-1" {...register("email")} />
          {errors.email && <p className="text-xs text-bad mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="text-[13px] font-medium text-text">Password</label>
          <input
            type="password"
            autoComplete="current-password"
            className="input mt-1"
            {...register("password")}
          />
          {errors.password && <p className="text-xs text-bad mt-1">{errors.password.message}</p>}
        </div>
        {serverError && <p className="text-sm text-bad">{serverError}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full !py-2.5 mt-1">
          Log in
        </Button>
      </form>
      <p className="text-sm text-muted text-center mt-5">
        New here?{" "}
        <Link to="/register" className="text-accent font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
