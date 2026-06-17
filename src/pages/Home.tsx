import { UrlForm } from "../components/UrlForm";
import "./Home.scss";

export function Home() {
  return (
    <div className="home">
      <section className="home__hero">
        <p className="home__eyebrow">Accessibility Starts With Visibility</p>
        <h1 className="home__headline">
          See
          <br />
          <em>Beyond the Surface</em>
        </h1>
        <p className="home__lede">
          Visualize accessibility issues, focus flows, and hidden barriers
          before your users do.
        </p>
      </section>
      <section className="home__form" aria-label="Start an analysis">
        <UrlForm />
      </section>
    </div>
  );
}
