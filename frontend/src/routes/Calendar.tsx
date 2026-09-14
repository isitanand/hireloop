import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import CompanyAvatar from "../components/CompanyAvatar";
import Spinner from "../components/Spinner";
import StatCard from "../components/StatCard";
import { IconArrowRight, IconCalendar, IconCheck } from "../components/icons";
import * as api from "../lib/api";
import type { UserJob } from "../lib/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface CalEvent {
  job: UserJob;
  label: string;
  dotClass: string;
  textClass: string;
}

// Same palette as StatusBadge, so a color means the same thing everywhere.
const STATUS_STYLE: Record<string, { label: string; dot: string; text: string }> = {
  shortlisted: { label: "Shortlisted", dot: "bg-accent", text: "text-accent-soft" },
  applied: { label: "Applied", dot: "bg-good", text: "text-good" },
  interviewing: { label: "Interviewing", dot: "bg-[#8b5cf6]", text: "text-[#8b5cf6]" },
  offer: { label: "Offer", dot: "bg-good", text: "text-good" },
  rejected: { label: "Rejected", dot: "bg-bad", text: "text-bad" },
};

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const today = dateKey(new Date());
  const [selected, setSelected] = useState<string | null>(today);

  const jobsQuery = useQuery({ queryKey: ["jobs", "calendar"], queryFn: () => api.fetchJobs() });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    // "new" jobs the AI scanned but never cleared the score threshold, and
    // ones you dismissed, are noise here - the calendar should only mark
    // days something worth your attention actually happened.
    const relevant = (jobsQuery.data ?? []).filter((j) => j.status !== "new" && j.status !== "dismissed");
    const push = (key: string, event: CalEvent) => map.set(key, [...(map.get(key) ?? []), event]);

    for (const job of relevant) {
      const shortlisted = STATUS_STYLE.shortlisted;
      push(dateKey(new Date(job.first_seen_at)), { job, label: shortlisted.label, dotClass: shortlisted.dot, textClass: shortlisted.text });

      if (job.applied_at) {
        const applied = STATUS_STYLE.applied;
        push(dateKey(new Date(job.applied_at)), { job, label: applied.label, dotClass: applied.dot, textClass: applied.text });
      }

      // Only the most recent status change is tracked (no full history), so
      // this only fires for whichever of these the job currently sits at -
      // "applied" is skipped here since applied_at already covers it above.
      if (job.status_updated_at && (job.status === "interviewing" || job.status === "offer" || job.status === "rejected")) {
        const s = STATUS_STYLE[job.status];
        push(dateKey(new Date(job.status_updated_at)), { job, label: s.label, dotClass: s.dot, textClass: s.text });
      }
    }
    return map;
  }, [jobsQuery.data]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedEvents = selected ? eventsByDay.get(selected) ?? [] : [];
  const selectedDate = selected
    ? new Date(Number(selected.split("-")[0]), Number(selected.split("-")[1]), Number(selected.split("-")[2]))
    : null;

  let foundThisMonth = 0;
  let appliedThisMonth = 0;
  for (const d of Array.from({ length: daysInMonth }, (_, i) => i + 1)) {
    const events = eventsByDay.get(`${year}-${month}-${d}`) ?? [];
    foundThisMonth += events.filter((e) => e.label === "Shortlisted").length;
    appliedThisMonth += events.filter((e) => e.label === "Applied").length;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Calendar</h1>
          <p className="text-muted text-sm mt-1">When roles were found, and when you applied.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="h-8 w-8 rounded-lg border border-line flex items-center justify-center text-muted hover:text-text hover:bg-surface-hover"
          >
            <IconArrowRight className="rotate-180 text-[15px]" />
          </button>
          <div className="font-display text-sm font-semibold text-text w-36 text-center">
            {MONTH_NAMES[month]} {year}
          </div>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="h-8 w-8 rounded-lg border border-line flex items-center justify-center text-muted hover:text-text hover:bg-surface-hover"
          >
            <IconArrowRight className="text-[15px]" />
          </button>
        </div>
      </div>

      {jobsQuery.isLoading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <StatCard label="Shortlisted this month" value={foundThisMonth} icon={IconCalendar} tint="tint-blue" />
            <StatCard label="Applied this month" value={appliedThisMonth} icon={IconCheck} tint="tint-green" />
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
            <div className="panel p-4">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[11px] font-bold uppercase tracking-wide text-muted py-1.5">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                  if (!d) return <div key={i} className="h-[92px]" />;
                  const key = dateKey(d);
                  const events = eventsByDay.get(key) ?? [];
                  const isToday = key === today;
                  const isSelected = key === selected;
                  const dotColors = Array.from(new Set(events.map((e) => e.dotClass)));
                  return (
                    <button
                      key={i}
                      onClick={() => setSelected(key)}
                      className={`h-[92px] rounded-lg p-2 text-left flex flex-col gap-1.5 transition-colors border ${
                        isSelected
                          ? "border-accent bg-accent/10"
                          : "border-transparent hover:bg-surface-hover"
                      }`}
                    >
                      <span
                        className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                          isToday ? "bg-accent text-white" : "text-text"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {dotColors.map((c) => (
                          <span key={c} className={`h-1.5 w-1.5 rounded-full ${c}`} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-4 border-t border-line-soft text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Shortlisted
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-good" /> Applied / Offer
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" /> Interviewing
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-bad" /> Rejected
                </span>
              </div>
            </div>

            <div className="panel p-5">
              <div className="font-display text-sm font-semibold text-text mb-3">
                {selectedDate
                  ? selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
                  : "Select a day"}
              </div>
              {selected && selectedEvents.length === 0 && (
                <p className="text-sm text-muted">Nothing happened on this day.</p>
              )}
              <div className="space-y-2.5">
                {selectedEvents.map((e, i) => (
                  <Link
                    key={i}
                    to={`/jobs/${encodeURIComponent(e.job.job_id)}`}
                    className="flex items-center gap-3 rounded-lg border border-line-soft p-2.5 hover:border-accent/40 transition-colors"
                  >
                    <CompanyAvatar company={e.job.company} size={34} />
                    <div className="min-w-0">
                      <div className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${e.textClass}`}>
                        {e.label}
                      </div>
                      <div className="text-sm font-medium text-text truncate">{e.job.title}</div>
                      <div className="text-xs text-muted truncate">{e.job.company}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
