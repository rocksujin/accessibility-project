import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { UrlForm } from "../components/UrlForm";
import { Diving } from "../components/Diving";
import { ExplainPanel } from "../components/ExplainPanel";
import { requestScan, describeScanError, type ScanErrorInfo } from "../api";
import "./Analyze.scss";

type Severity = "critical" | "serious" | "moderate" | "minor";
type Standard = "wcag" | "kwcag";

type WcagIssue = {
  id: string;
  title: string;
  ref: string;
  level: "A" | "AA";
  severity: Severity;
  count: number;
  why: string;
};

type KwcagIssue = {
  id: string;
  code: string;
  title: string;
  category: string;
  severity: Severity;
  count: number;
  checks: string[];
  why: string;
};

const WCAG_ISSUES: WcagIssue[] = [
  {
    id: "alt-text",
    title: "Images missing alternative text",
    ref: "1.1.1 Non-text Content",
    level: "A",
    severity: "critical",
    count: 12,
    why: "Screen-reader users cannot perceive image content. Without alt text, decorative images add noise and informative images become invisible.",
  },
  {
    id: "contrast",
    title: "Insufficient color contrast",
    ref: "1.4.3 Contrast (Minimum)",
    level: "AA",
    severity: "serious",
    count: 8,
    why: "Text that does not meet a 4.5:1 ratio against its background is hard to read for people with low vision or in bright lighting.",
  },
  {
    id: "form-labels",
    title: "Form inputs without labels",
    ref: "1.3.1 Info and Relationships",
    level: "A",
    severity: "critical",
    count: 5,
    why: 'Without a programmatic label, assistive tech announces inputs as "edit text" — users can\'t tell what to type.',
  },
  {
    id: "page-lang",
    title: "Page is missing a lang attribute",
    ref: "3.1.1 Language of Page",
    level: "A",
    severity: "serious",
    count: 1,
    why: "Screen readers need the page language to choose the correct pronunciation rules. Without it, English content may be read with a Spanish voice (or vice versa).",
  },
  {
    id: "heading-order",
    title: "Heading levels skipped",
    ref: "1.3.1 Info and Relationships",
    level: "A",
    severity: "moderate",
    count: 4,
    why: "Jumping from <h1> to <h4> breaks the document outline. Screen-reader users navigate by heading and lose their place.",
  },
  {
    id: "link-text",
    title: 'Links use vague text like "click here"',
    ref: "2.4.4 Link Purpose (In Context)",
    level: "A",
    severity: "moderate",
    count: 7,
    why: "Users who tab through links out of context can't tell where each one goes. Descriptive link text doubles as better SEO.",
  },
  {
    id: "focus-visible",
    title: "Focus indicator is missing or removed",
    ref: "2.4.7 Focus Visible",
    level: "AA",
    severity: "serious",
    count: 3,
    why: "Keyboard users rely on a visible focus ring to know where they are on the page. Without it, the page is effectively unusable without a mouse.",
  },
  {
    id: "target-size",
    title: "Interactive targets are smaller than 24×24px",
    ref: "2.5.8 Target Size (Minimum)",
    level: "AA",
    severity: "moderate",
    count: 6,
    why: "Small touch targets are hard to hit accurately for people with motor impairments or anyone using a touchscreen.",
  },
  {
    id: "autoplay",
    title: "Media autoplays without controls",
    ref: "1.4.2 Audio Control",
    level: "A",
    severity: "serious",
    count: 1,
    why: "Unexpected sound interferes with screen-reader output. Users must be able to pause or mute media within three seconds.",
  },
  {
    id: "empty-button",
    title: "Buttons with no accessible name",
    ref: "4.1.2 Name, Role, Value",
    level: "A",
    severity: "critical",
    count: 2,
    why: 'An icon-only button without aria-label is announced as just "button" — users have no idea what it does until they activate it.',
  },
];

const KWCAG_ISSUES: KwcagIssue[] = [
  {
    id: "k-5.1.1",
    code: "5.1.1",
    title: "적절한 대체 텍스트",
    category: "인식의 용이성",
    severity: "critical",
    count: 12,
    checks: [
      "img alt 속성 존재 여부",
      '의미 없는 이미지의 빈 alt(alt="") 사용 여부',
      "아이콘 버튼의 접근 가능한 이름(aria-label 등) 존재 여부",
    ],
    why: "스크린리더 사용자는 이미지 내용을 직접 볼 수 없으므로, 의미 있는 이미지에는 적절한 대체 텍스트가 필요합니다. 장식용 이미지는 빈 alt를 사용해 스크린리더가 건너뛰도록 해야 합니다.",
  },
  {
    id: "k-5.2.1",
    code: "5.2.1",
    title: "자막 제공",
    category: "인식의 용이성",
    severity: "serious",
    count: 1,
    checks: [
      "영상 콘텐츠 자막 제공 여부",
      "자막을 대신할 수 있는 대체 수단(스크립트, 수어) 제공 여부",
    ],
    why: "청각 장애 사용자가 영상의 음성 정보를 이해할 수 있도록 자막 또는 동등한 대체 수단이 제공되어야 합니다.",
  },
  {
    id: "k-5.3.1",
    code: "5.3.1",
    title: "표의 구성",
    category: "인식의 용이성",
    severity: "moderate",
    count: 2,
    checks: [
      "<th> 요소 사용 여부",
      "scope 속성 명시 여부",
      "<caption> 또는 표 제목 제공 여부",
    ],
    why: "데이터 표는 <th>와 scope 속성으로 헤더와 데이터 셀의 관계를 명확히 해야 스크린리더가 셀을 읽을 때 어느 헤더에 속하는지 안내할 수 있습니다.",
  },
  {
    id: "k-5.3.2",
    code: "5.3.2",
    title: "콘텐츠의 선형 구조",
    category: "인식의 용이성",
    severity: "serious",
    count: 3,
    checks: [
      "DOM 순서와 시각적 순서의 일치 여부",
      "스크린리더 읽기 순서가 의도한 흐름과 일치하는지 검토",
    ],
    why: "시각적 배치와 DOM 순서가 다르면 스크린리더 사용자나 키보드 사용자가 콘텐츠를 의도와 다른 순서로 경험하게 됩니다.",
  },
  {
    id: "k-5.3.3",
    code: "5.3.3",
    title: "명확한 지시사항 제공",
    category: "인식의 용이성",
    severity: "moderate",
    count: 4,
    checks: [
      "색상만으로 안내하고 있지는 않은지 확인",
      '위치 또는 방향 정보(예: "오른쪽 메뉴")만으로 안내하고 있지는 않은지 확인',
    ],
    why: '"빨간 버튼"이나 "오른쪽 메뉴"처럼 색상이나 위치만 사용한 안내는 색맹·시각장애·모바일 사용자에게 전달되지 않습니다. 모양·텍스트·아이콘 등 보조 단서를 함께 제공해야 합니다.',
  },
  {
    id: "k-5.4.1",
    code: "5.4.1",
    title: "색에 무관한 콘텐츠 인식",
    category: "인식의 용이성",
    severity: "serious",
    count: 5,
    checks: [
      "색상 외에 콘텐츠를 구분할 수 있는 수단(텍스트, 아이콘, 패턴) 존재 여부",
    ],
    why: "색상만으로 정보를 전달하면 색맹 사용자가 구분할 수 없습니다. 텍스트 라벨, 아이콘, 패턴 등 추가 구분 수단이 필요합니다.",
  },
  {
    id: "k-5.4.2",
    code: "5.4.2",
    title: "자동 재생 금지",
    category: "인식의 용이성",
    severity: "serious",
    count: 1,
    checks: [
      "3초 이상 자동 재생되는 오디오 존재 여부",
      "정지·일시정지·음량 조절 기능 제공 여부",
    ],
    why: "3초 이상 자동 재생되는 오디오는 스크린리더 출력과 겹쳐 사용자가 화면 내용을 들을 수 없게 만듭니다. 정지·일시정지·음량 조절 수단을 반드시 제공해야 합니다.",
  },
  {
    id: "k-5.4.3",
    code: "5.4.3",
    title: "텍스트 콘텐츠의 명도 대비",
    category: "인식의 용이성",
    severity: "serious",
    count: 8,
    checks: [
      "일반 텍스트 대비 4.5:1 이상 만족 여부",
      "큰 텍스트(18pt 이상 또는 14pt 굵은 글씨) 3:1 이상 예외 검토",
    ],
    why: "저시력 사용자나 밝은 환경에서 화면을 보는 사용자가 텍스트를 읽으려면 충분한 명도 대비가 필요합니다. 일반 텍스트는 4.5:1, 큰 텍스트는 3:1 이상을 만족해야 합니다.",
  },
  {
    id: "k-5.4.4",
    code: "5.4.4",
    title: "콘텐츠 간 구분",
    category: "인식의 용이성",
    severity: "moderate",
    count: 6,
    checks: [
      "인접 콘텐츠 간 경계선 제공 여부",
      "여백을 이용한 시각적 구분 여부",
      "배경색 대비를 이용한 영역 구분 여부",
    ],
    why: "인접한 콘텐츠 간 구분이 명확하지 않으면 시각적으로 영역 구조를 파악하기 어렵습니다. 경계선·여백·배경 대비를 통해 시각적 그룹을 분명히 나타내야 합니다.",
  },
];

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function mockScore(url: string): number {
  return 50 + (hashSeed(url) % 46);
}

const SEVERITY_LABEL_EN: Record<Severity, string> = {
  critical: "Critical",
  serious: "Serious",
  moderate: "Moderate",
  minor: "Minor",
};

const SEVERITY_LABEL_KO: Record<Severity, string> = {
  critical: "심각",
  serious: "중요",
  moderate: "보통",
  minor: "경미",
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

function bucketForSeverity(s: Severity): Bucket {
  if (s === "critical") return "critical";
  if (s === "serious") return "warning";
  return "info"; // moderate + minor
}

function scoreBand(score: number) {
  if (score >= 90)
    return {
      label: "Excellent",
      labelKo: "매우 우수",
      tone: "excellent" as const,
    };
  if (score >= 75)
    return { label: "Good", labelKo: "양호", tone: "good" as const };
  if (score >= 60)
    return { label: "Needs work", labelKo: "개선 필요", tone: "warn" as const };
  return { label: "Poor", labelKo: "미흡", tone: "poor" as const };
}

const TABS: { id: Standard; label: string; lang?: string }[] = [
  { id: "wcag", label: "WCAG 2.2" },
  { id: "kwcag", label: "KWCAG 2.2 · 한국형", lang: "ko" },
];

export function Analyze() {
  const [params, setParams] = useSearchParams();
  const url = params.get("url");
  const standard: Standard =
    params.get("standard") === "kwcag" ? "kwcag" : "wcag";

  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">(
    url ? "loading" : "idle",
  );
  const [error, setError] = useState<ScanErrorInfo | null>(null);

  const tabsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!url) {
      setPhase("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setPhase("loading");
    setError(null);
    // The audit findings below are illustrative, but we still hit the scanner so
    // a non-existent / blocked URL surfaces a real error instead of a fake report.
    requestScan(url)
      .then(() => {
        if (!cancelled) setPhase("done");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(describeScanError(e));
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const score = useMemo(() => (url ? mockScore(url) : 0), [url]);

  const setStandard = (next: Standard) => {
    const params2 = new URLSearchParams(params);
    if (next === "wcag") params2.delete("standard");
    else params2.set("standard", next);
    setParams(params2, { replace: true });
  };

  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const idx = TABS.findIndex((t) => t.id === standard);
    if (idx === -1) return;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft")
      next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    setStandard(TABS[next].id);
    const btn = tabsRef.current?.querySelector<HTMLButtonElement>(
      `#tab-${TABS[next].id}`,
    );
    btn?.focus();
  };

  if (phase === "idle" || !url) {
    return (
      <div className="analyze analyze--idle">
        <header className="analyze__intro">
          <p className="analyze__eyebrow">Audit</p>
          <h1 className="analyze__title">Run a new scan.</h1>
          <p className="analyze__lede">
            Paste a public URL below. We&rsquo;ll evaluate it against WCAG 2.2
            AA and KWCAG 2.2 (한국형) and surface the issues that matter most.
          </p>
        </header>
        <UrlForm />
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="analyze analyze--loading">
        <Diving url={url ?? undefined} />
      </div>
    );
  }

  if (phase === "error") {
    const info = error ?? {
      heading: "Scan failed",
      message: "The scanner returned an error.",
    };
    return (
      <div className="analyze analyze--idle">
        <header className="analyze__intro">
          <p className="analyze__eyebrow">{info.heading}</p>
          <h1 className="analyze__title">Couldn&rsquo;t audit that URL.</h1>
          <p className="analyze__lede">{info.message}</p>
        </header>
        <UrlForm />
      </div>
    );
  }

  const band = scoreBand(score);
  const issues = standard === "wcag" ? WCAG_ISSUES : KWCAG_ISSUES;
  const sevLabel = standard === "wcag" ? SEVERITY_LABEL_EN : SEVERITY_LABEL_KO;

  const tally = issues.reduce(
    (acc, i) => {
      acc[i.severity] += i.count;
      return acc;
    },
    { critical: 0, serious: 0, moderate: 0, minor: 0 } as Record<
      Severity,
      number
    >,
  );

  return (
    <div className="analyze">
      <header className="analyze__intro">
        <p className="analyze__eyebrow">Analysis report</p>
        <h1 className="analyze__title">{url}</h1>
        <div className="analyze__lede-row">
          <p className="analyze__lede">
            {standard === "wcag" ? (
              <>
                Measured against WCAG 2.2 Level AA. Switch tabs to view KWCAG
                2.2 (한국형 웹 접근성 지침) results.
              </>
            ) : (
              <span lang="ko">
                KWCAG 2.2 (한국형 웹 콘텐츠 접근성 지침) 기준으로 분석한
                결과입니다. WCAG 결과를 보려면 탭을 전환하세요.
              </span>
            )}
          </p>
          <Link to="/analyze" className="analyze__new-scan">
            ↺ New scan
          </Link>
        </div>
      </header>

      <section
        className={`score score--${band.tone}`}
        aria-labelledby="score-heading"
      >
        <h2 id="score-heading" className="visually-hidden">
          Overall score
        </h2>
        <div className="score__main">
          <div className="score__num">
            <span className="score__value">{score}</span>
            <span className="score__total">/ 100</span>
          </div>
          <p className="score__band">
            {standard === "wcag" ? (
              band.label
            ) : (
              <span lang="ko">{band.labelKo}</span>
            )}
          </p>
        </div>
        <dl className="score__breakdown">
          {(["critical", "serious", "moderate", "minor"] as Severity[]).map(
            (sev) => (
              <div key={sev} className={`score__chip score__chip--${sev}`}>
                <dt>{sevLabel[sev]}</dt>
                <dd>{tally[sev]}</dd>
              </div>
            ),
          )}
        </dl>
      </section>

      <div
        className="tabs"
        role="tablist"
        aria-label="Accessibility standard"
        ref={tabsRef}
        onKeyDown={onTabKey}
      >
        {TABS.map((t) => {
          const active = t.id === standard;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls="issues-panel"
              tabIndex={active ? 0 : -1}
              className={`tabs__tab ${active ? "is-active" : ""}`}
              onClick={() => setStandard(t.id)}
            >
              <span {...(t.lang ? { lang: t.lang } : {})}>{t.label}</span>
            </button>
          );
        })}
      </div>

      <section
        className="issues"
        id="issues-panel"
        role="tabpanel"
        aria-labelledby={`tab-${standard}`}
        tabIndex={0}
        {...(standard === "kwcag" ? { lang: "ko" } : {})}
      >
        <div className="issues__head">
          {standard === "wcag" ? (
            <>
              <h2 id="issues-heading">Issues by severity</h2>
              <p className="issues__sub">
                Grouped into Critical (unlimited), Warning, and Info (each capped
                at 10). Each entry explains why it matters and which WCAG
                criterion it maps to.
              </p>
            </>
          ) : (
            <>
              <h2 id="issues-heading">심각도별 점검 항목</h2>
              <p className="issues__sub">
                심각(전체 표시), 불편, 권장(각 최대 10개)으로 분류되어 있습니다.
                각 항목은 KWCAG 2.2 기준 코드, 점검 체크리스트, 그리고 왜
                중요한지를 함께 안내합니다.
              </p>
            </>
          )}
        </div>

        <div className="issue-buckets">
          {BUCKETS.map((bucket) => {
            const all = issues.filter((i) => bucketForSeverity(i.severity) === bucket)
            if (all.length === 0) return null
            const limit = BUCKET_LIMIT[bucket]
            const visible = all.slice(0, limit)
            const hiddenCount = all.length - visible.length
            const isKwcag = standard === "kwcag"

            return (
              <section
                key={bucket}
                className={`issue-bucket issue-bucket--${bucket}`}
                aria-labelledby={`bucket-${bucket}`}
              >
                <header className="issue-bucket__header">
                  <span className="issue-bucket__dot" aria-hidden="true" />
                  <span id={`bucket-${bucket}`} className="issue-bucket__label">
                    {BUCKET_LABEL_EN[bucket]}{" "}
                    <span className="issue-bucket__ko" lang="ko">
                      · {BUCKET_LABEL_KO[bucket]}
                    </span>
                  </span>
                  <span className="issue-bucket__count">
                    {isKwcag
                      ? `${visible.length} / ${all.length}건`
                      : `${visible.length} of ${all.length}`}
                  </span>
                </header>

                <ol className="issues__list">
                  {visible.map((issue, idx) => {
                    const kw = isKwcag ? (issue as KwcagIssue) : null;
                    const wc = !isKwcag ? (issue as WcagIssue) : null;

                    return (
                      <li
                        key={issue.id}
                        className={`issue issue--${issue.severity}`}
                      >
                        <div className="issue__rank" aria-hidden="true">
                          {String(idx + 1).padStart(2, "0")}
                        </div>
                        <div className="issue__body">
                          <div className="issue__head">
                            <h3 className="issue__title">
                              {kw ? `${kw.code} ${kw.title}` : wc!.title}
                            </h3>
                            <span
                              className={`issue__sev issue__sev--${issue.severity}`}
                              aria-label={
                                isKwcag
                                  ? `심각도 ${SEVERITY_LABEL_KO[issue.severity]}`
                                  : `${SEVERITY_LABEL_EN[issue.severity]} severity`
                              }
                            >
                              {sevLabel[issue.severity]}
                            </span>
                          </div>
                          <p className="issue__meta">
                            {kw ? (
                              <>
                                <span className="issue__wcag">{kw.category}</span>
                                <span className="issue__dot" aria-hidden="true">
                                  ·
                                </span>
                                <span>{kw.count}건</span>
                              </>
                            ) : (
                              <>
                                <span className="issue__wcag">{wc!.ref}</span>
                                <span className="issue__dot" aria-hidden="true">
                                  •
                                </span>
                                <span>Level {wc!.level}</span>
                                <span className="issue__dot" aria-hidden="true">
                                  •
                                </span>
                                <span>
                                  {wc!.count}{" "}
                                  {wc!.count === 1 ? "instance" : "instances"}
                                </span>
                              </>
                            )}
                          </p>

                          {kw && (
                            <ul className="issue__checks">
                              {kw.checks.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          )}

                          <p className="issue__why">
                            <strong>
                              {isKwcag ? "왜 중요한가요." : "Why it matters."}
                            </strong>{" "}
                            {kw ? kw.why : wc!.why}
                          </p>
                          <ExplainPanel
                            payload={{
                              source: isKwcag ? "kwcag" : "wcag",
                              kind: kw ? kw.code : (wc!.id ?? wc!.ref),
                              element: kw ? kw.title : wc!.title,
                              detail: kw ? kw.why : wc!.why,
                              reference: kw
                                ? `KWCAG ${kw.code} ${kw.title}`
                                : `WCAG ${wc!.ref} (Level ${wc!.level})`,
                              language: isKwcag ? "ko" : "en",
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {hiddenCount > 0 && (
                  <p className="issue-bucket__more">
                    {isKwcag
                      ? `+ ${hiddenCount}개 더 있음 (최대 ${limit}개 표시)`
                      : `+ ${hiddenCount} more not shown (capped at ${limit})`}
                  </p>
                )}
              </section>
            )
          })}
        </div>
      </section>

      <p className="analyze__cta-row">
        <Link
          to={`/keyboard?url=${encodeURIComponent(url)}`}
          className="analyze__cta"
        >
          See keyboard flow →
        </Link>
      </p>
    </div>
  );
}
