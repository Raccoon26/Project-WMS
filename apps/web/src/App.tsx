import { Component, useCallback, useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import { routes, routeFor } from "./routes";
import { localeOf, translate, formatDate } from "./i18n";
import type { Locale, TranslationKey } from "./i18n";
export class AppBoundary extends Component<
  { children: ReactNode; locale?: Locale },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    const t = (k: TranslationKey) => translate(this.props.locale ?? "ja", k);
    return this.state.failed ? (
      <main className="error-screen">
        <h1>{t("errorTitle")}</h1>
        <p>{t("errorBody")}</p>
        <button onClick={() => location.reload()}>{t("reload")}</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const [locale, setLocale] = useState<Locale>(() =>
    localeOf(new URLSearchParams(location.search).get("lang")),
  );
  const [path, setPath] = useState(location.pathname);
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width:760px)").matches,
  );
  const drawer = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = matchMedia("(max-width:760px)");
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (mobile && menu)
      drawer.current?.querySelector<HTMLElement>("button,a")?.focus();
  }, [mobile, menu]);
  const [connection, setConnection] = useState<
    "checking" | "online" | "degraded" | "unavailable" | "offline"
  >("checking");
  const [checked, setChecked] = useState<string>();
  const [sequence, setSequence] = useState(0);
  const t = useCallback(
    (key: TranslationKey) => translate(locale, key),
    [locale],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const pop = () => {
      setPath(location.pathname);
      setMenu(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      if (document.hidden) return;
      if (!navigator.onLine) {
        setConnection("offline");
        return;
      }
      setConnection("checking");
      timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch("/api/v1/health/ready", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await res.json();
        if (active)
          setConnection(
            navigator.onLine &&
              res.ok &&
              typeof data === "object" &&
              data !== null &&
              "status" in data &&
              data.status === "ok"
              ? "online"
              : navigator.onLine
                ? res.status === 503
                  ? "degraded"
                  : "unavailable"
                : "offline",
          );
      } catch {
        if (active) setConnection(navigator.onLine ? "unavailable" : "offline");
      } finally {
        clearTimeout(timer);
        if (active) setChecked(new Date().toISOString());
      }
    }
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [sequence]);
  useEffect(() => {
    const online = () => setSequence((s) => s + 1);
    const offline = () => setConnection("offline");
    const visible = () => {
      if (!document.hidden) online();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const navigate = (
    event: React.MouseEvent<HTMLAnchorElement>,
    next: string,
  ) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    history.pushState({}, "", next);
    setPath(next);
    setMenu(false);
    document.getElementById("main")?.focus();
  };
  const route = routeFor(path);
  const dashboard = path === "/" || path === "/system-health";
  return (
    <AppBoundary locale={locale}>
      <a className="skip" href="#main">
        {t("skip")}
      </a>
      <div className="app-shell">
        <aside
          ref={drawer}
          className={`sidebar ${menu ? "is-open" : ""}`}
          inert={mobile && !menu}
          aria-hidden={mobile && !menu}
          aria-label={t("workspace")}
          onKeyDown={(e) => {
            if (!mobile || !menu) return;
            if (e.key === "Escape") {
              setMenu(false);
              toggle.current?.focus();
            }
            if (e.key === "Tab") {
              const items =
                drawer.current?.querySelectorAll<HTMLElement>("a,button");
              const first = items?.[0];
              const last = items?.[items.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <button
            className="drawer-close"
            onClick={() => {
              setMenu(false);
              toggle.current?.focus();
            }}
            aria-label={t("close")}
          >
            ×
          </button>
          <a className="brand" href="/" onClick={(e) => navigate(e, "/")}>
            <span className="brand-mark" aria-hidden="true">
              W
            </span>
            <span>
              {t("app")}
              <small>{t("subtitle")}</small>
            </span>
          </a>
          <p className="nav-heading">{t("workspace")}</p>
          <nav aria-label={t("workspace")}>
            {routes.map(([p, key], i) => (
              <a
                key={p}
                href={p}
                className={path === p ? "active" : ""}
                aria-current={path === p ? "page" : undefined}
                onClick={(e) => navigate(e, p)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="4" width="6" height="6" rx="1" />
                  <rect x="14" y="4" width="6" height="6" rx="1" />
                  <path
                    d={
                      i % 2 ? "M4 15h16M4 20h10" : "M4 14h6v6H4zM14 14h6v6h-6z"
                    }
                  />
                </svg>
                {t(key)}
              </a>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className="status-dot" />
            {t("dev")}
            <small>DEV-01</small>
          </div>
        </aside>
        {menu && (
          <button
            className="scrim"
            aria-label={t("close")}
            onClick={() => setMenu(false)}
          />
        )}
        <div className="workspace">
          <header className="topbar">
            <button
              ref={toggle}
              className="menu-toggle"
              aria-expanded={menu}
              aria-label={t(menu ? "close" : "menu")}
              onClick={() => setMenu(!menu)}
            >
              ☰
            </button>
            <span className="breadcrumb">
              {t("workspace")}
              <span>/</span>
              <strong>{route ? t(route[1]) : t("notFound")}</strong>
            </span>
            <label className="locale">
              <span className="sr-only">{t("language")}</span>
              <select
                value={locale}
                onChange={(e) => setLocale(localeOf(e.target.value))}
              >
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </select>
            </label>
            <span className="avatar" aria-hidden="true">
              W
            </span>
          </header>
          <main id="main" tabIndex={-1}>
            {connection === "offline" && (
              <p className="banner warning" role="status">
                {t("offlineNotice")}
              </p>
            )}
            {(connection === "unavailable" || connection === "degraded") && (
              <p className="banner error" role="alert">
                {t(
                  connection === "degraded" ? "databaseNotice" : "errorNotice",
                )}
              </p>
            )}
            {!route ? (
              <section className="panel empty">
                <span className="empty-symbol" aria-hidden="true">
                  ?
                </span>
                <h1>{t("notFound")}</h1>
                <a href="/" onClick={(e) => navigate(e, "/")}>
                  {t("back")}
                </a>
              </section>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">{t("eyebrow")}</p>
                    <h1>{dashboard ? t("heading") : t(route[1])}</h1>
                    <p className="intro">
                      {t(dashboard ? "intro" : "plannedNote")}
                    </p>
                  </div>
                  <span className="pill neutral">
                    {t(dashboard ? "dev" : "planned")}
                  </span>
                </div>
                {dashboard ? (
                  <>
                    <div className="section-title">
                      <h2>{t("connection")}</h2>
                      <button
                        className="refresh"
                        disabled={
                          connection === "checking" || connection === "offline"
                        }
                        onClick={() => setSequence((s) => s + 1)}
                      >
                        {t("refresh")} <span aria-hidden="true">↻</span>
                      </button>
                    </div>
                    <div className="status-grid">
                      {(["api", "database"] as const).map((kind) => (
                        <article className="panel status-card" key={kind}>
                          <div className="card-label">
                            {t(kind)}
                            <span
                              className={`status-dot ${connection === "online" || (kind === "api" && connection === "degraded") ? "green" : ""}`}
                            />
                          </div>
                          <strong data-testid={`${kind}-status`}>
                            {t(
                              connection === "degraded"
                                ? kind === "api"
                                  ? "online"
                                  : "unavailable"
                                : kind === "database" && connection !== "online"
                                  ? "unknown"
                                  : connection,
                            )}
                          </strong>
                          <p>
                            {t("updated")}{" "}
                            <time>
                              {checked ? formatDate(checked, locale) : "—"}
                            </time>
                          </p>
                        </article>
                      ))}
                    </div>
                    <div className="detail-grid">
                      <article className="panel foundation">
                        <span className="outline-icon" aria-hidden="true">
                          ◇
                        </span>
                        <h2>{t("foundation")}</h2>
                        <p>{t("foundationNote")}</p>
                        <div className="tags">
                          <span>React + TypeScript</span>
                          <span>Fastify</span>
                          <span>PostgreSQL</span>
                          <span>Worker</span>
                        </div>
                        <span className="pill neutral">DEV-01</span>
                      </article>
                      <article className="panel next-card">
                        <p className="eyebrow">{t("next")}</p>
                        <h2>{t("nextTitle")}</h2>
                        <p>{t("nextNote")}</p>
                        <span className="pill neutral">{t("planned")}</span>
                      </article>
                    </div>
                  </>
                ) : (
                  <section className="panel empty">
                    <span className="empty-symbol" aria-hidden="true">
                      ◇
                    </span>
                    <span className="pill neutral">{t("planned")}</span>
                    <h2>{t(route[1])}</h2>
                    <p>{t("plannedNote")}</p>
                  </section>
                )}
              </>
            )}
          </main>
          <footer>
            {t("footer")}
            <span>Project-WMS / 0.1.0</span>
          </footer>
        </div>
      </div>
    </AppBoundary>
  );
}
