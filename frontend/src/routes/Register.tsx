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
  name: z.string().min(1, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});
type FormData = z.infer<typeof schema>;

export default function Register() {
  const { register: doRegister } = useAuth();
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
      await doRegister(data.email, data.password, data.name);
      navigate("/onboarding");
    } catch (err) {
      setServerError(errorMessage(err, "Could not create your account"));
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[1.6rem] font-semibold text-text tracking-tight leading-tight">
        Create your account
      </h1>
      <p className="text-sm text-muted mt-1">Free, and takes under a minute.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-3.5">
        <div>
          <label className="text-[13px] font-medium text-text">Name</label>
          <input autoComplete="name" className="input mt-1" {...register("name")} />
          {errors.name && <p className="text-xs text-bad mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="text-[13px] font-medium text-text">Email</label>
          <input type="email" autoComplete="email" className="input mt-1" {...register("email")} />
          {errors.email && <p className="text-xs text-bad mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="text-[13px] font-medium text-text">Password</label>
          <input
            type="password"
            autoComplete="new-password"
            className="input mt-1"
            {...register("password")}
          />
          {errors.password && <p className="text-xs text-bad mt-1">{errors.password.message}</p>}
        </div>
        {serverError && <p className="text-sm text-bad">{serverError}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full !py-2.5 mt-1">
          Create account
        </Button>
      </form>
      <p className="text-sm text-muted text-center mt-5">
        Already have an account?{" "}
        <Link to="/login" className="text-accent font-medium hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
