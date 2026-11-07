// Mirrors backend/app/schemas.py - keep these in sync when the API changes.

export interface User {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  receive_email: boolean;
  auto_run_daily: boolean;
  created_at: string;
}

export interface Profile {
  resume_filename: string | null;
  parsed_json: ParsedProfile;
  updated_at: string;
}

export interface ParsedProfile {
  name?: string;
  current_title?: string;
  years_experience?: number;
  core_skills?: string[];
  domains?: string[];
  notable_projects?: string[];
  education?: string;
  target_titles?: string[];
  seniority?: string;
  [key: string]: unknown;
}

export interface FilterConfig {
  include_titles: string[];
  exclude_titles: string[];
  locations: string[];
  allow_remote: boolean;
  max_age_days: number | null;
  score_threshold: number;
  max_per_digest: number;
  screen_batch_size: number;
}

export interface Company {
  id: number;
  ats: "greenhouse" | "lever" | "ashby";
  slug: string;
  name: string;
  is_global: boolean;
  included: boolean;
}

export interface DraftKit {
  fit_summary: string;
  tailored_bullets: string[];
  gaps: string[];
  cover_note: string;
  questions_to_ask: string[];
}

export type JobStatus =
  | "new"
  | "shortlisted"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"
  | "dismissed";

export interface UserJob {
  job_id: string;
  ats: string;
  company: string;
  title: string;
  location: string;
  url: string;
  description: string;
  posted_at: string | null;
  salary: string | null;
  score: number | null;
  reason: string | null;
  draft: Partial<DraftKit>;
  status: JobStatus;
  first_seen_at: string;
  emailed: boolean;
  applied_at: string | null;
  status_updated_at: string | null;
}

export interface Stats {
  tracked: number;
  shortlisted: number;
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
  dismissed: number;
}

export interface ManualJobCreate {
  company: string;
  title: string;
  location?: string;
  url?: string;
  description?: string;
  status?: JobStatus;
}

export type RunStatus = "running" | "done" | "failed";
export type RunStage = "starting" | "fetching" | "filtering" | "screening" | "drafting" | "finishing" | "done" | "failed";

export interface RunLog {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  stage: RunStage;
  scanned: number;
  passed_filters: number;
  candidates: number;
  shortlisted: number;
  scorer: string;
  error: string | null;
}
