import Link from "next/link";
import { GUIDE } from "./content";

export default function Page() {
  const g = GUIDE;
  return (
    <main>
      <header className="masthead" style={{ paddingBottom: 12 }}>
        <div className="copy">
          <h1 className="wordmark" style={{ fontSize: 38 }}>{g.title}</h1>
          <div className="rule" />
          <p className="tagline">{g.lead}</p>
        </div>
      </header>
      {g.steps.map(([h, body]) => (
        <section key={h}>
          <div className="step"><b>{h}</b></div>
          <p style={{ margin: 0, color: "var(--ink-2)", maxWidth: "76ch" }}>{body}</p>
        </section>
      ))}
      <section>
        <div className="step"><b>{g.expectTitle}</b></div>
        <ul style={{ margin: 0, paddingLeft: 20, color: "var(--ink-2)", maxWidth: "76ch" }}>
          {g.expect.map((e) => <li key={e} style={{ marginBottom: 7 }}>{e}</li>)}
        </ul>
      </section>
      <footer>
        <div><Link href="/">← Vinyl·Engine</Link></div>
        <div><a href="https://github.com/TanskiSzymon/vinyl-engine" target="_blank" rel="noreferrer">Source on GitHub</a></div>
      </footer>
    </main>
  );
}
