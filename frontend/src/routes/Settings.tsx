import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import ClearHistoryModal from "../components/ClearHistoryModal";
import CompanyAvatar from "../components/CompanyAvatar";
import { IconBuilding, IconCheck, IconFilter, IconLock, IconSettings, IconUpload, IconUser } from "../components/icons";
import Spinner from "../components/Spinner";
import Toggle from "../components/Toggle";
import * as api from "../lib/api";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ParsedProfile } from "../lib/types";

const TABS = [
  { key: "Profile", icon: IconUser },
  { key: "Filters", icon: IconFilter },
  { key: "Companies", icon: IconBuilding },
  { key: "Account", icon: IconSettings },
] as const;
type Tab = (typeof TABS)[number]["key"];

function isTab(v: string | null): v is Tab {
  return TABS.some((t) => t.key === v);
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "Profile";

  function setTab(next: Tab) {
    setSearchParams({ tab: next });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-semibold text-text">Settings</h1>
      <div className="flex items-center gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            <t.icon className="text-[15px]" />
            {t.key}
          </button>
        ))}
      </div>

      {tab === "Profile" && <ProfileTab />}
      {tab === "Filters" && <FiltersTab />}
      {tab === "Companies" && <CompaniesTab />}
      {tab === "Account" && <AccountTab />}
    </div>
  );
}

function linesToList(v: string): string[] {
  return v.split("\n").map((s) => s.trim()).filter(Boolean);
}
function listToLines(v?: string[]): string {
  return (v ?? []).join("\n");
}

function SaveBar({ loading, saved, onSave }: { loading: boolean; saved: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <Button loading={loading} onClick={onSave}>
        Save changes
      </Button>
      {saved && (
        <span className="flex items-center gap-1 text-sm text-good">
          <IconCheck className="text-[13px]" /> Saved
        </span>
      )}
    </div>
  );
}

function ProfileTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["profile"], queryFn: api.fetchProfile, retry: false });
  const [profile, setProfile] = useState<ParsedProfile>({});
  // Kept as raw textarea text, not derived from profile.core_skills/target_titles
  // on every keystroke - round-tripping through linesToList (which drops blank
  // lines) on each change fought the cursor and ate the newline the instant
  // you pressed Enter, since the just-created empty line got filtered out
  // before the next render. Only converted to a list at save time.
  const [coreSkillsText, setCoreSkillsText] = useState("");
  const [targetTitlesText, setTargetTitlesText] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setProfile(data.parsed_json);
      setCoreSkillsText(listToLines(data.parsed_json.core_skills));
      setTargetTitlesText(listToLines(data.parsed_json.target_titles));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.saveProfile({
        ...profile,
        core_skills: linesToList(coreSkillsText),
        target_titles: linesToList(targetTitlesText),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: api.uploadResume,
    onSuccess: async (updated) => {
      setProfile(updated.parsed_json);
      setUploadError(null);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => setUploadError(errorMessage(err, "Could not read that resume")),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    uploadMutation.mutate(file);
    e.target.value = "";
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="panel p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-xl tint-blue flex items-center justify-center shrink-0">
            <IconUpload className="text-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-text">Resume</div>
            <div className="text-xs text-muted mt-0.5 truncate">
              {data?.resume_filename
                ? `${data.resume_filename} — uploaded ${new Date(data.updated_at).toLocaleDateString()}`
                : "No resume on file yet — the AI has nothing to score jobs against."}
            </div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md" className="hidden" onChange={handleFile} />
        <Button variant="secondary" loading={uploadMutation.isPending} onClick={() => fileRef.current?.click()}>
          {data?.resume_filename ? "Replace" : "Upload"}
        </Button>
      </div>
      {uploadError && <p className="text-sm text-bad">{uploadError}</p>}
      {uploadMutation.isSuccess && !uploadError && (
        <p className="text-sm text-good">Resume parsed — review the fields below and save.</p>
      )}

      <div className="panel p-6 space-y-4">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-accent-soft">Who you are</div>
        <Field label="Name">
          <input className="input" value={profile.name ?? ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
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
              onChange={(e) => setProfile({ ...profile, years_experience: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Field label="Education">
          <input
            className="input"
            value={profile.education ?? ""}
            onChange={(e) => setProfile({ ...profile, education: e.target.value })}
          />
        </Field>
        <SaveBar loading={saveMutation.isPending} saved={saved} onSave={() => saveMutation.mutate()} />
      </div>

      <div className="panel p-6 space-y-4">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-accent-soft">What the AI screens against</div>
        <Field label="Core skills (one per line)">
          <textarea
            className="input h-24"
            value={coreSkillsText}
            onChange={(e) => setCoreSkillsText(e.target.value)}
          />
        </Field>
        <Field label="Target titles (one per line)">
          <textarea
            className="input h-20"
            value={targetTitlesText}
            onChange={(e) => setTargetTitlesText(e.target.value)}
          />
        </Field>
        <SaveBar loading={saveMutation.isPending} saved={saved} onSave={() => saveMutation.mutate()} />
      </div>
    </div>
  );
}

function FiltersTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["filters"], queryFn: api.fetchFilters });
  const [form, setForm] = useState({
    include_titles: "", exclude_titles: "", locations: "",
    allow_remote: true, max_age_days: 14, score_threshold: 6, max_per_digest: 5,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        include_titles: data.include_titles.join("\n"),
        exclude_titles: data.exclude_titles.join("\n"),
        locations: data.locations.join(", "),
        allow_remote: data.allow_remote,
        max_age_days: data.max_age_days ?? 14,
        score_threshold: data.score_threshold,
        max_per_digest: data.max_per_digest,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateFilters({
        include_titles: linesToList(form.include_titles),
        exclude_titles: linesToList(form.exclude_titles),
        locations: linesToList(form.locations.replace(/,/g, "\n")),
        allow_remote: form.allow_remote,
        max_age_days: form.max_age_days,
        score_threshold: form.score_threshold,
        max_per_digest: form.max_per_digest,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["filters"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="panel p-6 space-y-4">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-accent-soft">Where & how fresh</div>
        <Field label="Locations (comma-separated, leave empty to accept any)">
          <input className="input" value={form.locations} onChange={(e) => setForm({ ...form, locations: e.target.value })} />
        </Field>
        <div className="divide-y divide-line-soft">
          <Toggle
            label="Also show remote roles"
            description="Include postings that don't list one of your locations but are remote-friendly."
            checked={form.allow_remote}
            onChange={(v) => setForm({ ...form, allow_remote: v })}
          />
        </div>
        <Field label="Max posting age (days)">
          <input
            type="number"
            min={0}
            className="input max-w-32"
            value={form.max_age_days}
            onChange={(e) => setForm({ ...form, max_age_days: Number(e.target.value) })}
          />
        </Field>
        <SaveBar loading={saveMutation.isPending} saved={saved} onSave={() => saveMutation.mutate()} />
      </div>

      <div className="panel p-6 space-y-4">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-accent-soft">AI scoring</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Minimum AI fit score">
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              className="input"
              value={form.score_threshold}
              onChange={(e) => setForm({ ...form, score_threshold: Number(e.target.value) })}
            />
          </Field>
          <Field label="Max shortlisted per run">
            <input
              type="number"
              min={1}
              className="input"
              value={form.max_per_digest}
              onChange={(e) => setForm({ ...form, max_per_digest: Number(e.target.value) })}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">
          Only postings scoring at or above this get shortlisted, drafted, and shown on your dashboard —
          everything below it is still saved to your Tracker, just kept out of the way.
        </p>
        <SaveBar loading={saveMutation.isPending} saved={saved} onSave={() => saveMutation.mutate()} />
      </div>

      <div className="panel p-6 space-y-4">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-accent-soft">Title matching (advanced)</div>
        <Field label="Include title patterns (one per line, regex allowed)">
          <textarea
            className="input h-28 font-mono text-xs"
            value={form.include_titles}
            onChange={(e) => setForm({ ...form, include_titles: e.target.value })}
          />
        </Field>
        <Field label="Exclude title patterns (one per line, regex allowed)">
          <textarea
            className="input h-24 font-mono text-xs"
            value={form.exclude_titles}
            onChange={(e) => setForm({ ...form, exclude_titles: e.target.value })}
          />
        </Field>
        <SaveBar loading={saveMutation.isPending} saved={saved} onSave={() => saveMutation.mutate()} />
      </div>
    </div>
  );
}

function CompaniesTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["companies"], queryFn: api.fetchCompanies });
  const [form, setForm] = useState({ ats: "greenhouse", slug: "", name: "" });
  const [error, setError] = useState<string | null>(null);

  const toggleMutation = useMutation({
    mutationFn: ({ id, included }: { id: number; included: boolean }) => api.toggleCompany(id, included),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });
  const removeMutation = useMutation({
    mutationFn: (id: number) => api.removeCompany(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });
  const addMutation = useMutation({
    mutationFn: () => api.addCompany(form),
    onSuccess: () => {
      setForm({ ats: "greenhouse", slug: "", name: "" });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (err) => setError(errorMessage(err, "Could not add that board")),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="panel p-6">
        <div className="font-display text-sm font-semibold text-text mb-3">Add a board</div>
        <div className="flex flex-wrap gap-3">
          <select
            className="input w-40"
            value={form.ats}
            onChange={(e) => setForm({ ...form, ats: e.target.value })}
          >
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
          </select>
          <input
            className="input flex-1 min-w-40"
            placeholder="board slug, e.g. stripe"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <input
            className="input flex-1 min-w-40"
            placeholder="display name, e.g. Stripe"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Button
            loading={addMutation.isPending}
            disabled={!form.slug || !form.name}
            onClick={() => addMutation.mutate()}
          >
            Add
          </Button>
        </div>
        {error && <p className="text-sm text-bad mt-2">{error}</p>}
      </div>

      <div className="panel divide-y divide-line-soft">
        {data?.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-5 py-3.5 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <CompanyAvatar company={c.name} size={32} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-text truncate">{c.name}</div>
                <div className="text-xs text-muted">
                  {c.ats}:{c.slug} {c.is_global ? "· shared" : "· private"}
                </div>
              </div>
            </div>
            {c.is_global ? (
              <Toggle
                label=""
                checked={c.included}
                onChange={(v) => toggleMutation.mutate({ id: c.id, included: v })}
              />
            ) : (
              <Button variant="ghost" onClick={() => removeMutation.mutate(c.id)}>
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [nameSaved, setNameSaved] = useState(false);
  const [receiveEmail, setReceiveEmail] = useState(user?.receive_email ?? false);
  const [autoRun, setAutoRun] = useState(user?.auto_run_daily ?? false);
  const [saved, setSaved] = useState(false);
  const [showClear, setShowClear] = useState(false);

  const nameMutation = useMutation({
    mutationFn: () => api.updateMe({ name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 1500);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => api.updateMe({ receive_email: receiveEmail, auto_run_daily: autoRun }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const initial = (name.trim()[0] || user?.email?.trim()[0] || "?").toUpperCase();

  function commitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== (user?.name ?? "").trim()) {
      nameMutation.mutate();
    } else {
      setName(user?.name ?? "");
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel p-5 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-accent to-warmth text-bg flex items-center justify-center font-display font-bold text-xl shrink-0">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 bg-transparent -mx-1.5 px-1.5 py-0.5 rounded-md font-display font-semibold text-text truncate outline-none transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:ring-1 focus:ring-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setName(user?.name ?? "");
              }}
              placeholder="Your name"
            />
            {nameMutation.isPending && (
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
            )}
            {!nameMutation.isPending && nameSaved && (
              <IconCheck className="text-[13px] text-good shrink-0" />
            )}
          </div>
          <div className="text-sm text-muted truncate mt-0.5">{user?.email}</div>
        </div>
      </div>

      <div className="panel p-6">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-accent-soft mb-1">Notifications</div>
        <div className="divide-y divide-line-soft">
          <Toggle
            label="Email me the shortlist after each run"
            description="A digest of everything that cleared your minimum score, sent to your inbox."
            checked={receiveEmail}
            onChange={setReceiveEmail}
          />
          <Toggle
            label="Include me in the daily automated run"
            description="HireLoop runs a search for opted-in users once a day even if you don't open the site."
            checked={autoRun}
            onChange={setAutoRun}
          />
        </div>
        <div className="pt-3">
          <SaveBar loading={saveMutation.isPending} saved={saved} onSave={() => saveMutation.mutate()} />
        </div>
      </div>

      <ChangePasswordCard />

      <div className="panel p-6 border-bad/25">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-bad mb-1">Danger zone</div>
        <div className="flex items-center justify-between gap-4 pt-2">
          <div>
            <div className="text-sm font-medium text-text">Clear scan history</div>
            <div className="text-xs text-muted mt-0.5 max-w-md">
              Reset the "already seen" list so your next run rescans every board from scratch.
              Applications you've actually applied to are never touched.
            </div>
          </div>
          <Button variant="danger" onClick={() => setShowClear(true)}>
            Clear history
          </Button>
        </div>
      </div>
      {showClear && <ClearHistoryModal onClose={() => setShowClear(false)} />}
    </div>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm;

  return (
    <div className="panel p-6">
      <div className="flex items-start gap-3.5 pb-5 border-b border-line-soft">
        <div className="h-11 w-11 rounded-xl tint-blue flex items-center justify-center shrink-0">
          <IconLock className="text-[18px]" />
        </div>
        <div>
          <div className="text-sm font-semibold text-text">Password</div>
          <div className="text-xs text-muted mt-0.5">
            Use at least 8 characters. You'll stay signed in on this device after changing it.
          </div>
        </div>
      </div>

      <div className="pt-5 space-y-4 max-w-md">
        <Field label="Current password">
          <input
            type="password"
            autoComplete="current-password"
            className="input"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="New password">
            <input
              type="password"
              autoComplete="new-password"
              className="input"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm new">
            <input
              type="password"
              autoComplete="new-password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>

        {next.length > 0 && next.length < 8 && (
          <p className="text-xs text-muted">{8 - next.length} more character{8 - next.length === 1 ? "" : "s"} needed.</p>
        )}
        {mismatch && <p className="text-sm text-bad">Passwords don't match.</p>}
        {mutation.isError && (
          <p className="text-sm text-bad">{errorMessage(mutation.error, "Could not change your password")}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button loading={mutation.isPending} disabled={!canSubmit} onClick={() => mutation.mutate()}>
            Change password
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-good">
              <IconCheck className="text-[13px]" /> Password updated
            </span>
          )}
        </div>
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
