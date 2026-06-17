import { useId, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./UrlForm.scss";

type Result = { url: string; score: number; issues: number };

type Props = {
  /** 'inline' shows a mock result card; 'navigate' jumps to `destination?url=...` on submit. */
  mode?: "inline" | "navigate";
  /** Required when mode='navigate'. Base path to navigate to. */
  destination?: string;
  /** Custom label above the input. */
  label?: string;
  /** Custom submit button label. */
  submitLabel?: string;
};

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function UrlForm({
  mode = "inline",
  destination = "/analyze",
  label = "Enter a URL to explore deeper",
  submitLabel,
}: Props) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const statusId = `${inputId}-status`;
  const navigate = useNavigate();

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    const normalized = normalizeUrl(value);
    if (!normalized) {
      setError("Please enter a valid URL, e.g. https://example.com");
      return;
    }
    setError(null);
    if (mode === "navigate") {
      navigate(`${destination}?url=${encodeURIComponent(normalized)}`);
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setResult({ url: normalized, score: 87, issues: 4 });
    }, 1200);
  };

  const buttonText =
    submitLabel ??
    (loading ? "Exploring…" : mode === "navigate" ? "Continue →" : "Dive →");

  return (
    <div className="url-form">
      <form className="url-form__form" onSubmit={handleSubmit} noValidate>
        <label htmlFor={inputId} className="url-form__label">
          {label}
        </label>
        <div className="url-form__row">
          <input
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="url"
            className="url-form__input"
            placeholder="https://example.com"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            required
          />
          <button type="submit" className="url-form__submit" disabled={loading}>
            {buttonText}
          </button>
        </div>

        {error && (
          <p id={errorId} className="url-form__error" role="alert">
            {error}
          </p>
        )}
      </form>

      {mode === "inline" && (
        <div
          id={statusId}
          className="url-form__status"
          role="status"
          aria-live="polite"
        >
          {loading && (
            <div className="url-form__loading">
              <span className="url-form__spinner" aria-hidden="true" />
              <span>Scanning page… this usually takes a moment.</span>
            </div>
          )}

          {!loading && result && (
            <article className="result-card" aria-label="Analysis summary">
              <div className="result-card__score">
                <span className="result-card__score-num">{result.score}</span>
                <span className="result-card__score-label">/ 100</span>
              </div>
              <div className="result-card__body">
                <p className="result-card__url">{result.url}</p>
                <p className="result-card__issues">
                  <strong>{result.issues}</strong> issues found
                </p>
                <Link
                  to={`/analyze?url=${encodeURIComponent(result.url)}`}
                  className="result-card__cta"
                >
                  View full report →
                </Link>
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
