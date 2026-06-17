import { useId, useState, type FormEvent } from "react";
import { Diving } from "../components/Diving";
import { ExplainPanel } from "../components/ExplainPanel";
import "./Component.scss";

type IssueKind =
  | "no-label"
  | "low-contrast"
  | "order-mismatch"
  | "invisible-focus";
type ElementType = "button" | "link" | "input" | "textarea" | "other";

type Stop = {
  tag: string;
  type: ElementType;
  label: string;
  rect: { x: number; y: number; w: number; h: number };
  issue?: { kind: IssueKind; detail: string };
};

type Result = {
  html: string;
  screenshot: string;
  stops: Stop[];
};

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
  return "info";
}

const TYPE_LABEL: Record<ElementType, string> = {
  button: "Button",
  link: "Link",
  input: "Input",
  textarea: "Textarea",
  other: "Element",
};

const EXAMPLE = `<form>
  <input type="email" placeholder="you@example.com" />
  <button>Subscribe</button>
</form>

<a href="#">click here</a>

<button aria-label="">⚙</button>`;

async function fetchScanHtml(html: string): Promise<Result> {
  const res = await fetch("/api/scan-html", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html }),
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
  return { html, screenshot: data.screenshot, stops: data.stops };
}

export function Component() {
  const inputId = useId();
  const errorId = `${inputId}-error`;

  const [html, setHtml] = useState<string>("");
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!html.trim()) {
      setError("Paste some HTML to analyze.");
      return;
    }
    setError(null);
    setPhase("loading");
    fetchScanHtml(html)
      .then((r) => {
        setResult(r);
        setPhase("done");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      });
  };

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setError(null);
  };

  const loadExample = () => {
    setHtml(EXAMPLE);
    setError(null);
  };

  // ---- Loading ----
  if (phase === "loading") {
    return (
      <div className="cmp cmp--loading">
        <Diving label="Inspecting components…" />
      </div>
    );
  }

  // ---- Done ----
  if (phase === "done" && result) {
    const total = result.stops.length;
    const issues = result.stops.filter((s) => s.issue);
    return (
      <div className="cmp">
        <header className="cmp__intro">
          <p className="cmp__eyebrow">Component scan</p>
          <h1 className="cmp__title">
            {total} {total === 1 ? "component" : "components"} detected
          </h1>
          <div className="cmp__lede-row">
            <p className="cmp__lede">
              {issues.length === 0
                ? "No accessibility issues detected in the snippet."
                : `${issues.length} ${issues.length === 1 ? "issue" : "issues"} flagged. See each component below for details.`}
            </p>
            <button type="button" className="cmp__new-scan" onClick={reset}>
              ↺ Scan another snippet
            </button>
          </div>
        </header>

        <section className="cmp__panel" aria-label="Rendered preview">
          <h2 className="cmp__panel-title">Rendered preview</h2>
          <div className="cmp__preview">
            <img src={result.screenshot} alt="" aria-hidden="true" />
          </div>
        </section>

        {issues.length > 0 && (
          <section className="cmp__panel" aria-labelledby="cmp-issues-h">
            <h2 id="cmp-issues-h" className="cmp__panel-title">
              Issues by severity ({issues.length})
            </h2>
            <div className="issue-buckets">
              {BUCKETS.map((bucket) => {
                const all = issues.filter(
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
                    aria-labelledby={`cmp-bucket-${bucket}`}
                  >
                    <header className="issue-bucket__header">
                      <span className="issue-bucket__dot" aria-hidden="true" />
                      <span
                        id={`cmp-bucket-${bucket}`}
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

                    <ul className="cmp__list">
                      {visible.map((s) => {
                        const i = result.stops.findIndex((x) => x === s);
                        return (
                          <li key={`b-${i}`} className="cmp-item has-issue">
                            <div className="cmp-item__rank" aria-hidden="true">
                              {String(i + 1).padStart(2, "0")}
                            </div>
                            <div className="cmp-item__body">
                              <div className="cmp-item__head">
                                <span
                                  className={`cmp-item__tag cmp-item__tag--${s.type}`}
                                >
                                  {`<${s.tag.toLowerCase()}>`}
                                </span>
                                <span className="cmp-item__label">
                                  {s.label || <em>(no accessible name)</em>}
                                </span>
                              </div>
                              <div className="cmp-item__issue">
                                <span className="cmp-item__issue-kind">
                                  ⚠ {ISSUE_LABEL[s.issue!.kind]}
                                </span>
                                <span className="cmp-item__issue-detail">
                                  {s.issue!.detail}
                                </span>
                              </div>
                              <ExplainPanel
                                payload={{
                                  source: "snippet",
                                  kind: s.issue!.kind,
                                  element: `${s.tag.toLowerCase()}${s.label ? ` "${s.label}"` : ""}`,
                                  detail: s.issue!.detail,
                                  html: result.html,
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
          </section>
        )}

        <section className="cmp__panel" aria-labelledby="cmp-list-h">
          <h2 id="cmp-list-h" className="cmp__panel-title">
            Components ({total})
          </h2>
          {total === 0 ? (
            <p className="cmp__empty">
              No focusable elements found in the snippet. The scanner looks for
              links, buttons, form inputs, and anything with a tabindex.
            </p>
          ) : (
            <ol className="cmp__list">
              {result.stops.map((s, i) => (
                <li
                  key={i}
                  className={`cmp-item ${s.issue ? "has-issue" : "is-ok"}`}
                >
                  <div className="cmp-item__rank" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="cmp-item__body">
                    <div className="cmp-item__head">
                      <span
                        className={`cmp-item__tag cmp-item__tag--${s.type}`}
                      >
                        {`<${s.tag.toLowerCase()}>`}
                      </span>
                      <span className="cmp-item__label">
                        {s.label || <em>(no accessible name)</em>}
                      </span>
                      <span className="cmp-item__type">
                        {TYPE_LABEL[s.type]}
                      </span>
                    </div>
                    {s.issue ? (
                      <div className="cmp-item__issue">
                        <span className="cmp-item__issue-kind">
                          ⚠ {ISSUE_LABEL[s.issue.kind]}
                        </span>
                        <span className="cmp-item__issue-detail">
                          {s.issue.detail}
                        </span>
                      </div>
                    ) : (
                      <p className="cmp-item__ok">
                        ✓ No issues detected for this component.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    );
  }

  // ---- Idle / Error: paste form ----
  return (
    <div className="cmp cmp--idle">
      <header className="cmp__intro">
        <p className="cmp__eyebrow">Snippet Check</p>
        <h1 className="cmp__title">Paste an HTML snippet to inspect.</h1>
        <p className="cmp__lede">
          We&rsquo;ll render it in a real browser, identify each focusable
          component, and surface accessibility issues — missing labels, low
          contrast, removed focus outlines.
        </p>
      </header>

      <form className="cmp__form" onSubmit={handleSubmit} noValidate>
        <div className="cmp__label-row">
          <label htmlFor={inputId} className="cmp__label">
            HTML snippet
          </label>
          <button type="button" className="cmp__example" onClick={loadExample}>
            Load example
          </button>
        </div>

        <textarea
          id={inputId}
          className="cmp__textarea"
          value={html}
          onChange={(e) => {
            setHtml(e.target.value);
            if (error) setError(null);
          }}
          placeholder="<button>Click me</button>"
          spellCheck={false}
          rows={12}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          required
        />

        {error && (
          <p id={errorId} className="cmp__error" role="alert">
            {error}
          </p>
        )}

        <div className="cmp__actions">
          <button type="submit" className="cmp__submit">
            Analyze →
          </button>
          <p className="cmp__hint">
            Fragments are fine — we&rsquo;ll wrap them in a baseline document.
            Max 200&nbsp;KB.
          </p>
        </div>
      </form>
    </div>
  );
}
