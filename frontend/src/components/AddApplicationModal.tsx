import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as api from "../lib/api";
import { errorMessage } from "../lib/api";
import type { JobStatus } from "../lib/types";
import Button from "./Button";
import { IconX } from "./icons";

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "shortlisted", label: "Want to apply" },
];

export default function AddApplicationModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    company: "", title: "", location: "", url: "", description: "",
    status: "applied" as JobStatus,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.addManualJob(form),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["stats"] }),
      ]);
      onClose();
    },
    onError: (err) => setError(errorMessage(err, "Could not add that application")),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-lg font-semibold text-text">Add an application</h2>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface-hover"
          >
            <IconX className="text-[15px]" />
          </button>
        </div>
        <p className="text-sm text-muted mb-5">
          Found a role yourself? Track it here alongside your AI matches.
        </p>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company">
              <input
                required
                className="input"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </Field>
            <Field label="Role title">
              <input
                required
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location (optional)">
              <input
                className="input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as JobStatus })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Posting URL (optional)">
            <input
              type="url"
              placeholder="https://..."
              className="input"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </Field>
          <Field label="Notes / job description (optional)">
            <textarea
              className="input h-24"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          {error && <p className="text-sm text-bad">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Add application
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-text">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
