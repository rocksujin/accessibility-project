import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { UrlForm } from "../components/UrlForm";
import { Diving } from "../components/Diving";
import { ExplainPanel } from "../components/ExplainPanel";
import { apiUrl } from "../api";
import "./Keyboard.scss";

type IssueKind =
  | "no-label"
  | "low-contrast"
  | "order-mismatch"
  | "invisible-focus";

type ElementType = "button" | "link" | "input" | "textarea" | "other";

type Stop = {
  id: string;
  label: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  visual?: string;
  issue?: { kind: IssueKind; detail: string };
};

type ScanResult = {
  url: string;
  finalUrl: string;
  viewport: { w: number; h: number };
  screenshot: string | null;
  stops: Stop[];
  source: "live" | "demo";
  error?: string;
};

// ---------- Demo (fallback) data ----------

const DEMO_VIEWPORT = { w: 800, h: 540 };

const DEMO_STOPS: Stop[] = [
  {
    id: "menu",
    label: "Menu button",
    type: "button",
    x: 24,
    y: 22,
    w: 40,
    h: 40,
    visual: "☰",
    issue: {
      kind: "no-label",
      detail:
        'Icon-only button has no accessible name — screen readers announce it as just "button".',
    },
  },
  {
    id: "logo",
    label: "Logo (home)",
    type: "link",
    x: 80,
    y: 26,
    w: 110,
    h: 32,
    visual: "Acme",
  },
  { id: "home", label: "Home", type: "link", x: 472, y: 26, w: 64, h: 32 },
  { id: "about", label: "About", type: "link", x: 548, y: 26, w: 64, h: 32 },
  {
    id: "contact",
    label: "Contact",
    type: "link",
    x: 624,
    y: 26,
    w: 84,
    h: 32,
  },
  {
    id: "cta",
    label: "Get started",
    type: "button",
    x: 60,
    y: 196,
    w: 168,
    h: 52,
  },
  {
    id: "email",
    label: "Email input",
    type: "input",
    x: 60,
    y: 310,
    w: 320,
    h: 44,
    issue: {
      kind: "no-label",
      detail: "Input has placeholder text but no associated <label>.",
    },
  },
  {
    id: "name",
    label: "Name input",
    type: "input",
    x: 400,
    y: 310,
    w: 240,
    h: 44,
  },
  {
    id: "message",
    label: "Message",
    type: "textarea",
    x: 60,
    y: 372,
    w: 580,
    h: 86,
  },
  {
    id: "send",
    label: "Send button",
    type: "button",
    x: 60,
    y: 472,
    w: 110,
    h: 44,
    issue: {
      kind: "low-contrast",
      detail: "Button text contrast is 3.1:1 (needs 4.5:1 for AA).",
    },
  },
  {
    id: "privacy",
    label: "Privacy",
    type: "link",
    x: 540,
    y: 504,
    w: 70,
    h: 24,
  },
  { id: "terms", label: "Terms", type: "link", x: 622, y: 504, w: 70, h: 24 },
];

const DEMO_REGIONS = [
  { id: "header", label: "Header", x: 0, y: 0, w: DEMO_VIEWPORT.w, h: 72 },
  { id: "main", label: "Main", x: 0, y: 88, w: DEMO_VIEWPORT.w, h: 392 },
  { id: "footer", label: "Footer", x: 0, y: 488, w: DEMO_VIEWPORT.w, h: 52 },
];

const ISSUE_LABEL: Record<IssueKind, string> = {
  "no-label": "Missing label",
  "low-contrast": "Low contrast",
  "order-mismatch": "Order mismatch",
  "invisible-focus": "No focus indicator",
};

type Bucket = "critical" | "warning" | "info";

const BUCKETS: Bucket[] = ["critical", "warning", "info"];

const BUCKET_LIMIT: Record<Bucket, number> = {
  critical: Infinity,
  warning: 10,
  info: 10,
};

const BUCKET_LABEL_EN: Record<Bucket, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

const BUCKET_LABEL_KO: Record<Bucket, string> = {
  critical: "심각",
  warning: "불편",
  info: "권장",
};

function bucketForKind(kind: IssueKind): Bucket {
  if (kind === "no-label") return "critical";
  if (kind === "low-contrast" || kind === "invisible-focus") return "warning";
  return "info"; // order-mismatch
}

// ---------- API call ----------

async function fetchScan(url: string): Promise<ScanResult> {
  const res = await fetch(apiUrl("/api/scan"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || j.error || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const data = await res.json();
  const stops: Stop[] = data.stops.map(
    (
      s: {
        tag: string;
        type: ElementType;
        label: string;
        rect: { x: number; y: number; w: number; h: number };
        issue?: { kind: IssueKind; detail: string };
      },
      i: number,
    ): Stop => ({
      id: `s-${i}`,
      label: s.label || `(unnamed ${s.tag.toLowerCase()})`,
      type: s.type,
      x: s.rect.x,
      y: s.rect.y,
      w: s.rect.w,
      h: s.rect.h,
      issue: s.issue,
    }),
  );
  return {
    url: data.url,
    finalUrl: data.finalUrl,
    viewport: data.viewport,
    screenshot: data.screenshot,
    stops,
    source: "live",
  };
}

// ---------- geometry ----------

function midpoint(s: Stop) {
  return { cx: s.x + s.w / 2, cy: s.y + s.h / 2 };
}

function curvePath(from: Stop, to: Stop) {
  const a = midpoint(from);
  const b = midpoint(to);
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const curveAmount = Math.min(60, dist * 0.18);
  const mx = (a.cx + b.cx) / 2;
  const my = (a.cy + b.cy) / 2;
  const nx = -dy / dist;
  const ny = dx / dist;
  const cx = mx + nx * curveAmount;
  const cy = my + ny * curveAmount;
  return `M ${a.cx} ${a.cy} Q ${cx} ${cy} ${b.cx} ${b.cy}`;
}

// ---------- Component ----------

export function Keyboard() {
  const [params] = useSearchParams();
  const url = params.get("url");

  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">(
    url ? "loading" : "idle",
  );
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!url) {
      setPhase("idle");
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setPhase("loading");
    setIdx(0);
    setPlaying(false);
    setError(null);
    fetchScan(url)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setPhase("done");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const useDemo = () => {
    setResult({
      url: url ?? "demo://kayai",
      finalUrl: url ?? "demo://kayai",
      viewport: DEMO_VIEWPORT,
      screenshot: null,
      stops: DEMO_STOPS,
      source: "demo",
    });
    setPhase("done");
    setError(null);
    setIdx(0);
  };

  const retry = () => {
    if (!url) return;
    setPhase("loading");
    setError(null);
    fetchScan(url)
      .then((r) => {
        setResult(r);
        setPhase("done");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      });
  };

  const stops = result?.stops ?? [];
  const total = stops.length;
  const viewport = result?.viewport ?? DEMO_VIEWPORT;

  const next = useCallback(
    () => setIdx((i) => (total ? (i + 1) % total : 0)),
    [total],
  );
  const prev = useCallback(
    () => setIdx((i) => (total ? (i - 1 + total) % total : 0)),
    [total],
  );
  const reset = useCallback(() => setIdx(0), []);

  useEffect(() => {
    if (!playing || phase !== "done" || total === 0) return;
    const t = setInterval(() => {
      setIdx((i) => {
        if (i + 1 >= total) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 1400);
    return () => clearInterval(t);
  }, [playing, total, phase]);

  const onCanvasKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "Home") {
      e.preventDefault();
      setIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setIdx(Math.max(0, total - 1));
    }
  };

  // ---- Idle: ask for a URL ----
  if (phase === "idle" || !url) {
    return (
      <div className="kb kb--idle">
        <header className="kb__intro">
          <p className="kb__eyebrow">Focus Flow</p>
          <h1 className="kb__title">See your page through a keyboard.</h1>
          <p className="kb__lede">
            Enter a URL and we&rsquo;ll render the page, trace every tab stop,
            and highlight any focus issues a keyboard-only visitor would hit.
          </p>
        </header>
        <UrlForm
          mode="navigate"
          destination="/keyboard"
          label="Enter a URL to visualize"
          submitLabel="Scan keyboard flow →"
        />
      </div>
    );
  }

  // ---- Loading: underwater diving ----
  if (phase === "loading") {
    return (
      <div className="kb kb--loading">
        <Diving url={url} label="Tracing focus order…" />
      </div>
    );
  }

  // ---- Error ----
  if (phase === "error" || !result) {
    return (
      <div className="kb kb--error">
        <header className="kb__intro">
          <p className="kb__eyebrow">Scan failed</p>
          <h1 className="kb__title">Couldn&rsquo;t scan that URL.</h1>
          <p className="kb__lede">
            {error ?? "The scanner returned an error."} Some sites block
            automated browsers (Cloudflare, login walls). You can retry, or load
            the demo mock to keep exploring the visualizer.
          </p>
        </header>
        <div className="kb__buttons">
          <button type="button" className="kb__btn" onClick={retry}>
            ↺ Try again
          </button>
          <button type="button" className="kb__btn" onClick={useDemo}>
            Use demo mock →
          </button>
          <Link to="/keyboard" className="kb__btn kb__btn--link">
            ✕ Scan a different URL
          </Link>
        </div>
      </div>
    );
  }

  // ---- Done: render the visualizer ----
  const current = stops[idx];
  const issueStops = stops.filter((s) => s.issue);
  const viewBox = `0 0 ${viewport.w} ${viewport.h}`;
  const totalIssues = issueStops.length;

  return (
    <div className="kb">
      <header className="kb__intro">
        <p className="kb__eyebrow">
          Keyboard flow{result.source === "demo" ? " · demo mock" : ""}
        </p>
        <h1 className="kb__title">{result.finalUrl}</h1>
        <div className="kb__lede-row">
          <p className="kb__lede">
            {total} focus {total === 1 ? "stop" : "stops"} detected ·{" "}
            {totalIssues} {totalIssues === 1 ? "issue" : "issues"} flagged. Step
            through to see how a keyboard user moves across the page.
          </p>
          <Link to="/keyboard" className="kb__new-scan">
            ↺ New scan
          </Link>
        </div>
      </header>

      <div className="kb__toolbar" role="group" aria-label="Step controls">
        <div className="kb__step">
          <span className="kb__step-num">
            {String(idx + 1).padStart(2, "0")}
          </span>
          <span className="kb__step-of">
            / {String(total).padStart(2, "0")}
          </span>
        </div>
        <div className="kb__step-label">
          {current ? (
            <>
              Currently focused: <strong>{current.label}</strong>
              {current.issue && (
                <span className="kb__step-warn">
                  ⚠ {ISSUE_LABEL[current.issue.kind]}
                </span>
              )}
            </>
          ) : (
            <em>No focusable elements found on this page.</em>
          )}
        </div>
        <div className="kb__buttons">
          <button
            type="button"
            className="kb__btn"
            onClick={prev}
            aria-label="Previous focus stop"
            disabled={!total}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="kb__btn"
            onClick={next}
            aria-label="Next focus stop"
            disabled={!total}
          >
            Next →
          </button>
          <button
            type="button"
            className="kb__btn"
            onClick={reset}
            aria-label="Reset to first stop"
            disabled={!total}
          >
            ↺ Reset
          </button>
          <button
            type="button"
            className={`kb__btn kb__btn--play ${playing ? "is-playing" : ""}`}
            aria-pressed={playing}
            onClick={() => setPlaying((p) => !p)}
            disabled={!total}
          >
            {playing ? "⏸ Pause" : "▶ Auto-play"}
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className={`kb__canvas ${result.source === "demo" ? "kb__canvas--demo" : ""}`}
        role="application"
        tabIndex={0}
        aria-label="Keyboard navigation visualizer. Use Arrow Left and Arrow Right to step through tab stops."
        onKeyDown={onCanvasKey}
      >
        <div className="kb-chrome" aria-hidden="true">
          <span className="kb-chrome__dot kb-chrome__dot--r" />
          <span className="kb-chrome__dot kb-chrome__dot--y" />
          <span className="kb-chrome__dot kb-chrome__dot--g" />
          <span className="kb-chrome__url">{result.finalUrl}</span>
        </div>

        <div
          className="kb-page"
          style={{ aspectRatio: `${viewport.w} / ${viewport.h}` }}
        >
          {result.screenshot ? (
            <img
              className="kb-page__shot"
              src={result.screenshot}
              alt=""
              aria-hidden="true"
            />
          ) : (
            <>
              {DEMO_REGIONS.map((r) => (
                <div
                  key={r.id}
                  className={`kb-region kb-region--${r.id}`}
                  style={{
                    left: `${(r.x / viewport.w) * 100}%`,
                    top: `${(r.y / viewport.h) * 100}%`,
                    width: `${(r.w / viewport.w) * 100}%`,
                    height: `${(r.h / viewport.h) * 100}%`,
                  }}
                  aria-hidden="true"
                >
                  <span className="kb-region__label">{r.label}</span>
                </div>
              ))}
              {stops.map((s) => (
                <div
                  key={s.id}
                  className={`kb-el kb-el--${s.type}`}
                  style={{
                    left: `${(s.x / viewport.w) * 100}%`,
                    top: `${(s.y / viewport.h) * 100}%`,
                    width: `${(s.w / viewport.w) * 100}%`,
                    height: `${(s.h / viewport.h) * 100}%`,
                  }}
                  aria-hidden="true"
                >
                  {s.visual ?? s.label}
                </div>
              ))}
            </>
          )}

          <svg
            className="kb-overlay"
            viewBox={viewBox}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="arrowhead"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M0,0 L10,5 L0,10 z"
                  fill="var(--color-accent)"
                  opacity="0.85"
                />
              </marker>
            </defs>

            {stops.slice(0, -1).map((from, i) => {
              const to = stops[i + 1];
              const isPast = i + 1 <= idx;
              return (
                <path
                  key={`p-${i}`}
                  d={curvePath(from, to)}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={isPast ? 2 : 1.4}
                  strokeDasharray={isPast ? "0" : "6 5"}
                  strokeOpacity={isPast ? 0.85 : 0.35}
                  markerEnd="url(#arrowhead)"
                />
              );
            })}
          </svg>

          {stops.map((s, i) => (
            <div
              key={`chip-${i}`}
              className={`kb-chip ${i === idx ? "is-current" : ""} ${i < idx ? "is-past" : ""}`}
              style={{
                left: `calc(${(s.x / viewport.w) * 100}% - 14px)`,
                top: `calc(${(s.y / viewport.h) * 100}% - 14px)`,
              }}
              aria-hidden="true"
            >
              {i + 1}
            </div>
          ))}

          {stops.map((s, i) =>
            s.issue ? (
              <div
                key={`warn-${i}`}
                className="kb-warn"
                style={{
                  left: `calc(${((s.x + s.w) / viewport.w) * 100}% - 14px)`,
                  top: `calc(${(s.y / viewport.h) * 100}% - 8px)`,
                }}
                aria-label={ISSUE_LABEL[s.issue.kind]}
                title={s.issue.detail}
              >
                !
              </div>
            ) : null,
          )}

          {current && (
            <div
              className="kb-focus"
              style={{
                left: `${(current.x / viewport.w) * 100}%`,
                top: `${(current.y / viewport.h) * 100}%`,
                width: `${(current.w / viewport.w) * 100}%`,
                height: `${(current.h / viewport.h) * 100}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>

        <p className="visually-hidden" role="status" aria-live="polite">
          {current
            ? `Step ${idx + 1} of ${total}: ${current.label}${
                current.issue
                  ? `. ${ISSUE_LABEL[current.issue.kind]}: ${current.issue.detail}`
                  : "."
              }`
            : "No focusable elements detected."}
        </p>
      </div>

      <ul className="kb__legend" aria-label="Legend">
        <li>
          <span className="legend-chip">1</span> Tab order
        </li>
        <li>
          <span className="legend-arrow" aria-hidden="true" /> Focus path
        </li>
        <li>
          <span className="legend-focus" aria-hidden="true" /> Current focus
        </li>
        <li>
          <span className="legend-warn">!</span> Issue at this stop
        </li>
      </ul>

      <section className="kb__issues" aria-labelledby="kb-issues-h">
        <h2 id="kb-issues-h">Issues by severity ({totalIssues})</h2>
        {totalIssues === 0 ? (
          <p className="kb__issues-empty">
            No keyboard-only issues found on this page. Nice work.
          </p>
        ) : (
          <div className="issue-buckets">
            {BUCKETS.map((bucket) => {
              const all = issueStops.filter(
                (s) => bucketForKind(s.issue!.kind) === bucket,
              );
              if (all.length === 0) return null;
              const limit = BUCKET_LIMIT[bucket];
              const visible = all.slice(0, limit);
              const hiddenCount = all.length - visible.length;

              return (
                <section
                  key={bucket}
                  className={`issue-bucket issue-bucket--${bucket}`}
                  aria-labelledby={`kb-bucket-${bucket}`}
                >
                  <header className="issue-bucket__header">
                    <span className="issue-bucket__dot" aria-hidden="true" />
                    <span
                      id={`kb-bucket-${bucket}`}
                      className="issue-bucket__label"
                    >
                      {BUCKET_LABEL_EN[bucket]}{" "}
                      <span className="issue-bucket__ko" lang="ko">
                        · {BUCKET_LABEL_KO[bucket]}
                      </span>
                    </span>
                    <span className="issue-bucket__count">
                      {visible.length} of {all.length}
                    </span>
                  </header>

                  <ul>
                    {visible.map((s) => {
                      const i = stops.findIndex((x) => x === s);
                      return (
                        <li key={`issue-${i}`} className="kb-issue">
                          <button
                            type="button"
                            className="kb-issue__rank"
                            onClick={() => {
                              setIdx(i);
                              canvasRef.current?.focus();
                            }}
                            aria-label={`Jump to stop ${i + 1}: ${s.label}`}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </button>
                          <div className="kb-issue__body">
                            <p className="kb-issue__head">
                              <span className="kb-issue__el">{s.label}</span>
                              <span className="kb-issue__kind">
                                {ISSUE_LABEL[s.issue!.kind]}
                              </span>
                            </p>
                            <p className="kb-issue__detail">
                              {s.issue!.detail}
                            </p>
                            <ExplainPanel
                              payload={{
                                source: "scan",
                                kind: s.issue!.kind,
                                element: `${s.type} "${s.label}"`,
                                detail: s.issue!.detail,
                                reference: result.finalUrl,
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {hiddenCount > 0 && (
                    <p className="issue-bucket__more">
                      + {hiddenCount} more not shown (capped at {limit})
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
