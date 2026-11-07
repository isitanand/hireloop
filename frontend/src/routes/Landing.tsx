import { Link } from "react-router-dom";
import FunnelDiagram from "../components/FunnelDiagram";
import { IconArrowRight, IconBuilding, IconCheck, IconMail, IconSpark, IconTrack } from "../components/icons";
import { LogoBadge } from "../components/Logo";
import ProductPeek from "../components/ProductPeek";
import ThemeToggle from "../components/ThemeToggle";

const CAPABILITIES = [
  {
    icon: IconBuilding,
    tint: "tint-blue",
    title: "Real sources only",
    body: "Greenhouse, Lever and Ashby's documented APIs — no scraping, nothing that violates a platform's terms.",
  },
  {
    icon: IconSpark,
    tint: "tint-blue",
    title: "Resume-aware scoring",
    body: "Checks seniority and hard requirements against your actual profile, not just keyword overlap.",
  },
  {
    icon: IconMail,
    tint: "tint-blue",
    title: "Drafts, not submissions",
    body: "A tailored cover note and bullets for every role worth your time — you edit and send, always.",
  },
  {
    icon: IconTrack,
    tint: "tint-blue",
    title: "One tracker, start to offer",
    body: "Every role you've seen, applied to or interviewed for lives in one place, exportable anytime.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line-soft">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoBadge />
            <span className="font-display font-semibold text-text tracking-tight">HireLoop</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login" className="text-sm font-medium text-muted hover:text-text px-3 py-2">
              Log in
            </Link>
            <Link
              to="/register"
              className="text-sm font-semibold bg-text text-bg px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 glow-bg pointer-events-none" />
        <div className="absolute inset-0 noise-grid pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-5 pt-20 pb-24 grid lg:grid-cols-[1.05fr_0.95fr] gap-16 items-center">
          <div>
            <h1 className="font-display text-[2.6rem] sm:text-[3.4rem] font-semibold leading-[1.06] text-text">
              Job hunting,
              <br />
              minus the <span className="text-gradient">busywork.</span>
            </h1>
            <p className="text-muted text-base mt-6 max-w-md leading-relaxed">
              Scans public job boards daily, scores every posting against your actual resume, and drafts
              an application kit for the roles worth your time. You always hit submit — it never does.
            </p>
            <div className="flex items-center gap-4 mt-8">
              <Link
                to="/register"
                className="group flex items-center gap-2 text-sm font-semibold bg-text text-bg px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                Start free
                <IconArrowRight className="text-[15px] transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/login"
                className="text-sm font-semibold border border-line text-text px-6 py-3 rounded-xl hover:bg-surface transition-colors"
              >
                I have an account
              </Link>
            </div>
            <div className="flex items-center gap-5 mt-8 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <IconCheck className="text-[13px] text-good" />
                No credit card
              </span>
              <span className="flex items-center gap-1.5">
                <IconCheck className="text-[13px] text-good" />
                Never auto-submits
              </span>
            </div>
          </div>
          <ProductPeek />
        </div>
      </section>

      <section className="border-t border-line-soft">
        <div className="max-w-3xl mx-auto px-5 py-16">
          <h2 className="font-display text-xl font-semibold text-text text-center mb-10">
            One run, start to finish
          </h2>
          <FunnelDiagram />
        </div>
      </section>

      <section className="border-t border-line-soft">
        <div className="max-w-4xl mx-auto px-5 py-16">
          <div className="grid sm:grid-cols-2 gap-4">
            {CAPABILITIES.map((c) => (
              <div
                key={c.title}
                className="panel p-5 transition-all hover:-translate-y-0.5 hover:border-accent/25"
              >
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${c.tint}`}>
                  <c.icon className="text-[18px]" />
                </div>
                <div className="font-display font-semibold text-text mt-3.5">{c.title}</div>
                <div className="text-sm text-muted mt-1.5 leading-relaxed">{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line-soft">
        <div className="max-w-3xl mx-auto px-5 py-16 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-text">
            Stop reading postings you'll reject anyway.
          </h2>
          <Link
            to="/register"
            className="group inline-flex items-center gap-2 text-sm font-semibold bg-text text-bg px-6 py-3 rounded-xl hover:opacity-90 transition-opacity mt-8"
          >
            Start free
            <IconArrowRight className="text-[15px] transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line-soft py-8">
        <div className="max-w-6xl mx-auto px-5 text-xs text-muted text-center">
          HireLoop never auto-submits an application. It finds, filters, ranks and drafts — you decide.
        </div>
      </footer>
    </div>
  );
}
