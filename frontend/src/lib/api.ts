import axios from "axios";
import type {
  Company,
  FilterConfig,
  ManualJobCreate,
  ParsedProfile,
  Profile,
  RunLog,
  Stats,
  User,
  UserJob,
} from "./types";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const api = axios.create({ baseURL: API_URL });

const TOKEN_KEY = "jobhunt_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiErrorShape {
  detail?: string;
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as ApiErrorShape | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (err.message) return err.message;
  }
  return fallback;
}

// --------------------------------------------------------------- auth ---
export async function register(email: string, password: string, name: string) {
  const { data } = await api.post<{ access_token: string }>("/auth/register", {
    email,
    password,
    name,
  });
  return data.access_token;
}

export async function login(email: string, password: string) {
  const { data } = await api.post<{ access_token: string }>("/auth/login", { email, password });
  return data.access_token;
}

export async function fetchMe() {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

export async function updateMe(patch: Partial<Pick<User, "name" | "receive_email" | "auto_run_daily">>) {
  const { data } = await api.patch<User>("/auth/me", patch);
  return data;
}

export async function changePassword(current_password: string, new_password: string) {
  await api.post("/auth/change-password", { current_password, new_password });
}

// ------------------------------------------------------------ profile ---
export async function fetchProfile() {
  const { data } = await api.get<Profile>("/profile");
  return data;
}

export async function uploadResume(file: File) {
  const form = new FormData();
  form.append("resume", file);
  const { data } = await api.post<Profile>("/profile/resume", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function saveProfile(parsed_json: ParsedProfile) {
  const { data } = await api.put<Profile>("/profile", { parsed_json });
  return data;
}

// ------------------------------------------------------------ filters ---
export async function fetchFilters() {
  const { data } = await api.get<FilterConfig>("/filters");
  return data;
}

export async function updateFilters(patch: Partial<FilterConfig>) {
  const { data } = await api.put<FilterConfig>("/filters", patch);
  return data;
}

// ---------------------------------------------------------- companies ---
export async function fetchCompanies() {
  const { data } = await api.get<Company[]>("/companies");
  return data;
}

export async function addCompany(body: { ats: string; slug: string; name: string }) {
  const { data } = await api.post<Company>("/companies", body);
  return data;
}

export async function toggleCompany(id: number, included: boolean) {
  const { data } = await api.patch<Company>(`/companies/${id}`, { included });
  return data;
}

export async function removeCompany(id: number) {
  await api.delete(`/companies/${id}`);
}

// ----------------------------------------------------------------- jobs --
export async function fetchJobs(status?: string, onlyQualified = false) {
  const params: Record<string, string | boolean> = {};
  if (status) params.status = status;
  if (onlyQualified) params.only_qualified = true;
  const { data } = await api.get<UserJob[]>("/jobs", { params });
  return data;
}

export async function fetchJob(jobId: string) {
  const { data } = await api.get<UserJob>(`/jobs/${encodeURIComponent(jobId)}`);
  return data;
}

export async function updateJobStatus(jobId: string, status: string) {
  const { data } = await api.patch<UserJob>(`/jobs/${encodeURIComponent(jobId)}`, { status });
  return data;
}

export async function addManualJob(body: ManualJobCreate) {
  const { data } = await api.post<UserJob>("/jobs/manual", body);
  return data;
}

export async function generateDraft(jobId: string) {
  const { data } = await api.post<UserJob>(`/jobs/${encodeURIComponent(jobId)}/draft`);
  return data;
}

export async function previewClearHistory() {
  const { data } = await api.get<{ clearable: number; runs: number }>("/jobs/history/preview");
  return data;
}

export async function clearHistory() {
  const { data } = await api.delete<{ clearable: number; runs: number }>("/jobs/history");
  return data;
}

export async function fetchStats() {
  const { data } = await api.get<Stats>("/jobs/stats");
  return data;
}

/** The export endpoint needs a Bearer header, which a plain <a href> can't
 * send - fetch it as a blob (the request interceptor attaches the token)
 * and trigger the download via a throwaway object URL instead. */
export async function downloadTrackerCsv(): Promise<void> {
  const { data } = await api.get<Blob>("/jobs/export/csv", { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tracker.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------- pipeline --
export async function startRun(scorer: "llm" | "keyword", send_email: boolean) {
  const { data } = await api.post<RunLog>("/pipeline/run", { scorer, send_email });
  return data;
}

export async function fetchRun(id: number) {
  const { data } = await api.get<RunLog>(`/pipeline/runs/${id}`);
  return data;
}

export async function fetchRuns() {
  const { data } = await api.get<RunLog[]>("/pipeline/runs");
  return data;
}
