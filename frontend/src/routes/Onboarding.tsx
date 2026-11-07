import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Toggle from "../components/Toggle";
import { IconUpload } from "../components/icons";
import * as api from "../lib/api";
import { errorMessage } from "../lib/api";
import type { ParsedProfile } from "../lib/types";

const EMPTY_PROFILE: ParsedProfile = {
  name: "",
  current_title: "",
  years_experience: 0,
  core_skills: [],
  domains: [],
  notable_projects: [],
  education: "",
  target_titles: [],
  seniority: "mid",
};

function linesToList(v: string): string[] {
  return v.split("\n").map((s) => s.trim()).filter(Boolean);
}
function listToLines(v?: string[]): string {
  return (v ?? []).join("\n");
}

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"resume" | "profile" | "filters">("resume");
  const [profile, setProfile] = useState<ParsedProfile>(EMPTY_PROFILE);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [locations, setLocations] = useState("bangalore, bengaluru, india");
  const [allowRemote, setAllowRemote] = useState(true);
  const [scoreThreshold, setScoreThreshold] = useState(6);

  const uploadMutation = useMutation({
    mutationFn: api.uploadResume,
    onSuccess: (data) => {
      setProfile({ ...EMPTY_PROFILE, ...data.parsed_json });
      setStep("profile");
    },
    onError: (err) => {
      setUploadError(
        errorMessage(err, "Resume extraction failed") +
          " — no problem, fill in your profile manually below.",
      );
      setStep("profile");
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: () => api.saveProfile(profile),
    onSuccess: () => setStep("filters"),
  });

  const saveFiltersMutation = useMutation({
    mutationFn: () =>
      api.updateFilters({
        locations: linesToList(locations.replace(/,/g, "\n")),
        allow_remote: allowRemote,
        score_threshold: scoreThreshold,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      navigate("/dashboard");
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    uploadMutation.mutate(file);
  }

  return (
    <div className="flex items-center justify-center py-4 min-h-[calc(100vh-129px)]">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 mb-8 justify-center">
          {(["resume", "profile", "filters"] as const).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 w-16 rounded-full ${
                step === s || i < ["resume", "profile", "filters"].indexOf(step)
                  ? "bg-accent"
                  : "bg-line"
              }`}
            />
          ))}
        </div>

        {step === "resume" && (
          <div className="panel p-8 text-center">
            <div className="h-12 w-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center text-xl mx-auto mb-4">
              {uploadMutation.isPending ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              ) : (
                <IconUpload />
              )}
            </div>
            <h1 className="font-display text-lg font-semibold text-text">
              {uploadMutation.isPending ? "Parsing your resume…" : "Let's build your profile"}
            </h1>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              {uploadMutation.isPending
                ? "AI is reading your resume and pulling out your skills, experience and target roles. This can take up to a minute for longer resumes — hang tight."
                : "Upload your resume and AI will extract your skills, experience and target roles. Having trouble? You can fill it in by hand instead — it works exactly the same either way."}
            </p>
            {!uploadMutation.isPending && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="hidden"
                  onChange={handleFile}
                />
                <Button onClick={() => fileRef.current?.click()}>
                  Upload resume (.pdf, .txt, .md)
                </Button>
                <button
                  onClick={() => setStep("profile")}
                  className="text-sm text-muted hover:text-text underline underline-offset-2"
                >
                  Skip — fill in manually
                </button>
              </div>
            )}
          </div>
        )}

        {step === "profile" && (
          <div className="panel p-8">
            <h1 className="font-display text-lg font-semibold text-text">Review your profile</h1>
            <p className="text-sm text-muted mt-1">
              This is what the AI screens jobs against — the more accurate, the better the shortlist.
            </p>
            {uploadError && <p className="text-sm text-warn mt-3">{uploadError}</p>}

            <div className="mt-5 space-y-4">
              <Field label="Name">
                <input
                  className="input"
                  value={profile.name ?? ""}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Current title">
                  <input
                    className="input"
                    value={profile.current_title ?? ""}
                    onChange={(e) => setProfile({ ...profile, current_title: e.target.value })}
                  />
                </Field>
                <Field label="Years of experience">
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={profile.years_experience ?? 0}
                    onChange={(e) =>
                      setProfile({ ...profile, years_experience: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <Field label="Seniority">
                <select
                  className="input"
                  value={profile.seniority ?? "mid"}
                  onChange={(e) => setProfile({ ...profile, seniority: e.target.value })}
                >
                  {["intern", "new-grad", "junior", "mid", "senior", "staff"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Core skills (one per line)">
                <textarea
                  className="input h-24"
                  value={listToLines(profile.core_skills)}
                  onChange={(e) => setProfile({ ...profile, core_skills: linesToList(e.target.value) })}
                />
              </Field>
              <Field label="Target titles (one per line)">
                <textarea
                  className="input h-20"
                  value={listToLines(profile.target_titles)}
                  onChange={(e) =>
                    setProfile({ ...profile, target_titles: linesToList(e.target.value) })
                  }
                />
              </Field>
              <Field label="Education">
                <input
                  className="input"
                  value={profile.education ?? ""}
                  onChange={(e) => setProfile({ ...profile, education: e.target.value })}
                />
              </Field>
            </div>

            <Button
              className="w-full mt-6"
              loading={saveProfileMutation.isPending}
              onClick={() => saveProfileMutation.mutate()}
            >
              Continue
            </Button>
          </div>
        )}

        {step === "filters" && (
          <div className="panel p-8">
            <h1 className="font-display text-lg font-semibold text-text">Where are you looking?</h1>
            <p className="text-sm text-muted mt-1">
              You can fine-tune title filters later in Settings — this is just the essentials.
            </p>

            <div className="mt-5 space-y-4">
              <Field label="Locations (comma-separated)">
                <input
                  className="input"
                  value={locations}
                  onChange={(e) => setLocations(e.target.value)}
                />
              </Field>
              <Toggle label="Also show remote roles" checked={allowRemote} onChange={setAllowRemote} />
              <Field label={`Minimum AI fit score (${scoreThreshold.toFixed(1)})`}>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={scoreThreshold}
                  onChange={(e) => setScoreThreshold(Number(e.target.value))}
                  className="w-full"
                />
              </Field>
            </div>

            <Button
              className="w-full mt-6"
              loading={saveFiltersMutation.isPending}
              onClick={() => saveFiltersMutation.mutate()}
            >
              Finish setup
            </Button>
          </div>
        )}
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
