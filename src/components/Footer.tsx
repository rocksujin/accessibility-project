import "./Footer.scss";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p>
          Built to the{" "}
          <a
            href="https://www.w3.org/WAI/standards-guidelines/wcag/"
            target="_blank"
            rel="noreferrer"
          >
            W3C WCAG 2.2
          </a>{" "}
          and{" "}
          <a
            href="https://nuli.navercorp.com/guideline/s00"
            target="_blank"
            rel="noreferrer"
            lang="ko"
          >
            한국형 KWCAG 2.2
          </a>{" "}
          guidelines.
        </p>
        <p>
          <span className="site-footer__copy">&copy; 2026 kaya ryu</span>
        </p>
      </div>
    </footer>
  );
}
