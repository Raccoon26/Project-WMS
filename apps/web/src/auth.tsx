import type { AuthenticatedIdentity } from "@wms/contracts";
import {
  useRef,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode, FormEvent } from "react";
import { localeOf } from "./i18n";
import type { Locale } from "./i18n";
export type Identity = AuthenticatedIdentity;
const messages = {
  ja: {
    limited: "試行回数の上限に達しました。時間をおいて再試行してください。",
    expired: "認証の有効期限が切れました。もう一度ログインしてください。",
    login: "ログイン",
    id: "ログインID",
    password: "パスワード",
    code: "認証コード",
    mfa: "多要素認証",
    verify: "確認",
    failure:
      "認証または処理に失敗しました。入力・接続・権限を確認してください。",
    logout: "ログアウト",
    enroll: "認証アプリの登録",
    enrollHelp: "認証アプリに次のキーを登録し、6桁のコードを入力してください。",
    recovery: "復旧コードを使用",
    codes: "復旧コード（一度だけ表示）",
    continue: "保存しました",
    offline: "オフラインです。認証と業務操作は利用できません。",
    security: "アカウントとセキュリティ",
    reauth: "重要操作の再認証",
    changePassword: "パスワード変更",
    revoke: "すべてのセッションを終了",
    replace: "MFA機器の交換",
    disable: "MFA無効化",
    newCodes: "復旧コード再発行",
    users: "ユーザーと権限",
    name: "表示名",
    create: "ユーザー作成",
    save: "保存",
    status: "状態",
    audit: "監査記録",
    next: "次のページ",
    loading: "確認中",
    forbidden: "この画面の閲覧権限がありません。",
  },
  ko: {
    limited: "시도 횟수가 제한되었습니다. 잠시 후 다시 시도하세요.",
    expired: "인증 시간이 만료되었습니다. 다시 로그인하세요.",
    login: "로그인",
    id: "로그인 ID",
    password: "비밀번호",
    code: "인증 코드",
    mfa: "다중 인증",
    verify: "확인",
    failure: "인증 또는 처리에 실패했습니다. 입력·연결·권한을 확인하세요.",
    logout: "로그아웃",
    enroll: "인증 앱 등록",
    enrollHelp: "인증 앱에 키를 등록한 후 6자리 코드를 입력하세요.",
    recovery: "복구 코드 사용",
    codes: "복구 코드 (한 번만 표시)",
    continue: "저장했습니다",
    offline: "오프라인입니다. 인증과 업무 작업을 사용할 수 없습니다.",
    security: "계정 및 보안",
    reauth: "중요 작업 재인증",
    changePassword: "비밀번호 변경",
    revoke: "모든 세션 종료",
    replace: "MFA 기기 교체",
    disable: "MFA 비활성화",
    newCodes: "복구 코드 재발급",
    users: "사용자 및 권한",
    name: "표시 이름",
    create: "사용자 생성",
    save: "저장",
    status: "상태",
    audit: "감사 기록",
    next: "다음 페이지",
    loading: "확인 중",
    forbidden: "이 화면의 조회 권한이 없습니다.",
  },
  en: {
    limited: "Too many attempts. Wait before trying again.",
    expired: "Authentication expired. Sign in again.",
    login: "Sign in",
    id: "Login ID",
    password: "Password",
    code: "Authentication code",
    mfa: "Multi-factor authentication",
    verify: "Verify",
    failure:
      "Authentication or request failed. Check input, connection and permissions.",
    logout: "Sign out",
    enroll: "Enroll authenticator",
    enrollHelp:
      "Register this key in your authenticator, then enter its six-digit code.",
    recovery: "Use recovery code",
    codes: "Recovery codes (shown once)",
    continue: "I saved these",
    offline: "Offline. Authentication and business actions are unavailable.",
    security: "Account and security",
    reauth: "Reauthenticate for sensitive actions",
    changePassword: "Change password",
    revoke: "End all sessions",
    replace: "Replace MFA device",
    disable: "Disable MFA",
    newCodes: "Regenerate recovery codes",
    users: "Users and permissions",
    name: "Display name",
    create: "Create user",
    save: "Save",
    status: "Status",
    audit: "Audit events",
    next: "Next page",
    loading: "Checking",
    forbidden: "You do not have permission to view this page.",
  },
};
export const authText = (locale: Locale, key: keyof typeof messages.ja) =>
  messages[locale][key] ?? messages.ja[key];
export class AuthRequestError extends Error {
  constructor(public status: number) {
    super("REQUEST_FAILED");
  }
}
let csrf = "";
export async function authRequest(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<unknown> {
  if (!navigator.onLine) throw new Error("OFFLINE");
  if (body !== undefined) {
    const r = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
    if (!r.ok) throw new Error("UNAVAILABLE");
    csrf = (await r.json()).csrf;
  }
  const response = await fetch("/api/v1/" + path, {
    method: body === undefined ? "GET" : method,
    cache: "no-store",
    headers:
      body === undefined
        ? {}
        : { "content-type": "application/json", "x-csrf-token": csrf },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    if (
      response.status === 401 &&
      !["auth/login", "auth/mfa/verify", "auth/reauth", "auth/me"].includes(
        path,
      )
    )
      window.dispatchEvent(new Event("wms-unauthorized"));
    throw new AuthRequestError(response.status);
  }
  return response.json();
}
interface AuthState {
  user: Identity | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthState>({
  user: null,
  refresh: async () => {},
  logout: async () => {},
});
export const useAuth = () => useContext(AuthContext);
export function AuthGate({ children }: { children: ReactNode }) {
  const generation = useRef(0);
  const stageRef = useRef("loading");
  const [user, setUser] = useState<Identity | null>(null),
    [stage, setStage] = useState("loading"),
    [locale, setLocale] = useState<Locale>(() =>
      localeOf(new URLSearchParams(location.search).get("lang")),
    );
  const [limited, setLimited] = useState(false),
    [expired, setExpired] = useState(false);
  const [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [secret, setSecret] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [recovery, setRecovery] = useState(false);
  const t = (key: keyof typeof messages.ja) => authText(locale, key);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const data = (await authRequest("auth/me")) as Identity;
      if (current === generation.current && navigator.onLine) {
        setUser(data);
        setStage("authenticated");
      }
    } catch {
      if (current === generation.current) {
        setUser(null);
        setStage(navigator.onLine ? "login" : "offline");
      }
    }
  }, []);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const channel = new BroadcastChannel("wms-auth");
    const reset = () => {
      generation.current++;
      setUser(null);
      setSecret("");
      setCodes([]);
      setStage("login");
    };
    const offline = () => {
      reset();
      setStage("offline");
    };
    const visible = (event: Event) => {
      if (document.hidden) return;
      // Switching to a mobile authenticator must preserve the restricted MFA
      // challenge/enrollment. It never grants access to the protected UI.
      if (!["authenticated", "loading", "offline"].includes(stageRef.current))
        return;
      if (event.type === "pageshow" || event.type === "online") {
        reset();
        setStage("loading");
      }
      void refresh();
    };
    channel.onmessage = () => {
      reset();
      void refresh();
    };
    window.addEventListener("wms-unauthorized", reset);
    window.addEventListener("offline", offline);
    window.addEventListener("online", visible);
    window.addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);
    void Promise.resolve().then(refresh);
    return () => {
      channel.close();
      window.removeEventListener("wms-unauthorized", reset);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", visible);
      window.removeEventListener("pageshow", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(
      () => {
        setUser(null);
        setStage("login");
        setSecret("");
        setCodes([]);
      },
      Math.max(0, Date.parse(user.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [user]);
  useEffect(() => {
    if (stage !== "mfa" && stage !== "enroll") return;
    const timer = setTimeout(() => {
      generation.current++;
      setUser(null);
      setSecret("");
      setCodes([]);
      setStage("login");
      setExpired(true);
      setError(false);
    }, 300000);
    return () => clearTimeout(timer);
  }, [stage]);
  const logout = async () => {
    generation.current++;
    try {
      await authRequest("auth/logout", {});
    } finally {
      generation.current++;
      setUser(null);
      setSecret("");
      setCodes([]);
      setStage("login");
      csrf = "";
      const c = new BroadcastChannel("wms-auth");
      c.postMessage("logout");
      c.close();
    }
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    setLimited(false);
    setExpired(false);
    const data = new FormData(event.currentTarget);
    try {
      if (stage === "login") {
        const result = (await authRequest("auth/login", {
          login: data.get("login"),
          password: data.get("password"),
        })) as { stage: string };
        setStage(result.stage);
      } else if (stage === "mfa") {
        await authRequest("auth/mfa/verify", {
          code: data.get("code"),
          recovery,
        });
        await refresh();
      } else if (stage === "enroll" && !secret) {
        const result = (await authRequest("auth/mfa/enroll", {})) as {
          secret: string;
        };
        setSecret(result.secret);
      } else if (stage === "enroll") {
        const result = (await authRequest("auth/mfa/confirm", {
          code: data.get("code"),
        })) as { codes: string[] };
        setCodes(result.codes);
        setSecret("");
        setStage("codes");
      }
    } catch (failure) {
      setLimited(failure instanceof AuthRequestError && failure.status === 429);
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (user && stage === "authenticated")
    return (
      <AuthContext.Provider value={{ user, refresh, logout }}>
        {children}
      </AuthContext.Provider>
    );
  return (
    <div className="auth-shell">
      <main className="panel auth-card">
        <span className="brand-mark">W</span>
        <label>
          Language
          <select
            aria-label="Language"
            value={locale}
            onChange={(e) => {
              const next = localeOf(e.target.value);
              const url = new URL(location.href);
              url.searchParams.set("lang", next);
              history.replaceState({}, "", url);
              setLocale(next);
            }}
          >
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
        <h1>
          {t(
            stage === "mfa"
              ? "mfa"
              : stage === "enroll"
                ? "enroll"
                : stage === "loading"
                  ? "loading"
                  : "login",
          )}
        </h1>
        {expired && <p role="alert">{t("expired")}</p>}
        {error && <p role="alert">{t(limited ? "limited" : "failure")}</p>}
        {stage === "offline" ? (
          <p role="status">{t("offline")}</p>
        ) : stage === "codes" ? (
          <>
            <h2>{t("codes")}</h2>
            <pre>{codes.join("\n")}</pre>
            <button
              onClick={() => {
                setCodes([]);
                void refresh();
              }}
            >
              {t("continue")}
            </button>
          </>
        ) : stage === "loading" ? null : (
          <form key={stage} onSubmit={(e) => void submit(e)}>
            {stage === "login" ? (
              <>
                <label>
                  {t("id")}
                  <input
                    name="login"
                    autoComplete="username"
                    required
                    maxLength={64}
                  />
                </label>
                <label>
                  {t("password")}
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                  />
                </label>
              </>
            ) : stage === "mfa" ? (
              <>
                <label>
                  {recovery ? t("recovery") : t("code")}
                  <input
                    name="code"
                    autoComplete="one-time-code"
                    inputMode={recovery ? "text" : "numeric"}
                    required
                    maxLength={128}
                  />
                </label>
                <button type="button" onClick={() => setRecovery(!recovery)}>
                  {t("recovery")}
                </button>
              </>
            ) : secret ? (
              <>
                <p>{t("enrollHelp")}</p>
                <code>{secret}</code>
                <label>
                  {t("code")}
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    required
                  />
                </label>
              </>
            ) : (
              <p>{t("enrollHelp")}</p>
            )}
            <button disabled={busy}>
              {t(stage === "login" ? "login" : "verify")}
            </button>
            {stage !== "login" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void logout()}
              >
                {t("logout")}
              </button>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
export function SecurityPanel({ locale }: { locale: Locale }) {
  const { user, refresh, logout } = useAuth();
  const [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [secret, setSecret] = useState(""),
    [codes, setCodes] = useState<string[]>([]);
  const t = (key: keyof typeof messages.ja) => authText(locale, key);
  async function run(
    path: string,
    body: unknown,
    onSuccess?: (v: unknown) => void,
  ) {
    if (busy) return;
    setBusy(true);
    setError(false);
    setNote("");
    try {
      const r = await authRequest(path, body);
      onSuccess?.(r);
      setNote("✓");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel security">
      <h2>{t("security")}</h2>
      <p>
        {user?.displayName} · {user?.roles.join(", ")} · MFA{" "}
        {user?.mfaEnabled ? "✓" : "—"}
      </p>
      {error && <p role="alert">{t("failure")}</p>}
      <p role="status">{note}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void run("auth/reauth", {
            password: d.get("password"),
            code: d.get("code"),
          });
          e.currentTarget.reset();
        }}
      >
        <h3>{t("reauth")}</h3>
        <label>
          {t("password")}
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          {t("code")}
          <input name="code" inputMode="numeric" required />
        </label>
        <button disabled={busy}>{t("verify")}</button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void run(
            "auth/password",
            { password: d.get("password") },
            () => void logout(),
          );
          e.currentTarget.reset();
        }}
      >
        <label>
          {t("changePassword")}
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={14}
            maxLength={128}
            required
          />
        </label>
        <button disabled={busy}>{t("save")}</button>
      </form>
      <button
        disabled={busy}
        onClick={() =>
          void run("auth/mfa/enroll", {}, (r) =>
            setSecret((r as { secret: string }).secret),
          )
        }
      >
        {t("replace")}
      </button>
      {secret && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              "auth/mfa/confirm",
              { code: new FormData(e.currentTarget).get("code") },
              (r) => {
                setCodes((r as { codes: string[] }).codes);
                setSecret("");
                void refresh();
              },
            );
          }}
        >
          <p>{t("enrollHelp")}</p>
          <code>{secret}</code>
          <label>
            {t("code")}
            <input name="code" required />
          </label>
          <button disabled={busy}>{t("verify")}</button>
        </form>
      )}
      <button
        disabled={busy}
        onClick={() =>
          void run("auth/mfa/recovery", {}, (r) =>
            setCodes((r as { codes: string[] }).codes),
          )
        }
      >
        {t("newCodes")}
      </button>
      {codes.length > 0 && (
        <>
          <h3>{t("codes")}</h3>
          <pre>{codes.join("\n")}</pre>
          <button onClick={() => setCodes([])}>{t("continue")}</button>
        </>
      )}
      <button
        disabled={busy}
        onClick={() => void run("auth/mfa/disable", {}, () => void logout())}
      >
        {t("disable")}
      </button>
      <button
        disabled={busy}
        onClick={() =>
          void run("auth/sessions/revoke", {}, () => void logout())
        }
      >
        {t("revoke")}
      </button>
      <button onClick={() => void logout()}>{t("logout")}</button>
    </section>
  );
}
interface UserRow {
  id: string;
  login: string;
  display_name: string;
  roles: string[];
  status: string;
}
export function UsersPanel({ locale }: { locale: Locale }) {
  const t = (key: keyof typeof messages.ja) => authText(locale, key);
  const pageCursor = useRef<string | undefined>(undefined);
  const listGeneration = useRef(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UserRow[]>([]),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [cursor, setCursor] = useState<string | null>(null);
  async function load(next?: string) {
    const current = ++listGeneration.current;
    setLoading(true);
    try {
      const r = (await authRequest(
        "users" + (next ? "?cursor=" + encodeURIComponent(next) : ""),
      )) as { items: UserRow[]; nextCursor: string | null };
      if (current !== listGeneration.current) return;
      pageCursor.current = next;
      setItems(r.items);
      setCursor(r.nextCursor);
    } catch {
      if (current === listGeneration.current) setError(true);
    } finally {
      if (current === listGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    const current = ++listGeneration.current;
    void authRequest("users")
      .then((r) => {
        if (active && current === listGeneration.current) {
          setItems((r as { items: UserRow[] }).items);
          setCursor((r as { nextCursor: string | null }).nextCursor);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active && current === listGeneration.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function change(path: string, body: unknown, method = "POST") {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await authRequest(path, body, method);
      await load(
        path === "users" && method === "POST" ? undefined : pageCursor.current,
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel security" aria-busy={busy || loading}>
      <h2>{t("users")}</h2>
      {error && <p role="alert">{t("failure")}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget,
            d = new FormData(f);
          void change("users", {
            login: d.get("login"),
            password: d.get("password"),
            displayName: d.get("displayName"),
            locale,
          });
          f.reset();
        }}
      >
        <label>
          {t("id")}
          <input name="login" required maxLength={64} />
        </label>
        <label>
          {t("name")}
          <input name="displayName" required maxLength={100} />
        </label>
        <label>
          {t("password")}
          <input name="password" type="password" minLength={14} required />
        </label>
        <button disabled={busy || loading}>{t("create")}</button>
      </form>
      {items.map((u) => (
        <article key={u.id + u.roles.join()}>
          <h3>{u.display_name}</h3>
          <p>
            {u.login} · {u.status} · {u.roles.join(", ")}
          </p>
          <label>
            {t("status")}
            <select
              aria-label={u.login + " status"}
              value={u.status}
              disabled={busy}
              onChange={(e) =>
                void change(
                  "users/" + u.id,
                  { status: e.target.value },
                  "PATCH",
                )
              }
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="locked">locked</option>
            </select>
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const roles = new FormData(e.currentTarget).getAll("roles");
              void change("users/" + u.id + "/roles", { roles }, "PUT");
            }}
          >
            {["Administrator", "Manager", "Operator", "Viewer", "Auditor"].map(
              (r) => (
                <label key={r}>
                  <input
                    name="roles"
                    type="checkbox"
                    value={r}
                    defaultChecked={u.roles.includes(r)}
                  />
                  {r}
                </label>
              ),
            )}
            <button disabled={busy || loading}>{t("save")}</button>
          </form>
        </article>
      ))}
      {cursor && (
        <button disabled={busy || loading} onClick={() => void load(cursor)}>
          {t("next")}
        </button>
      )}
    </section>
  );
}
export function AuditPanel({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<Record<string, string>[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(false);
  async function load(next?: string) {
    try {
      const r = (await authRequest(
        "audit-events" + (next ? "?cursor=" + next : ""),
      )) as { items: Record<string, string>[]; nextCursor: string | null };
      setItems(r.items);
      setCursor(r.nextCursor);
    } catch {
      setError(true);
    }
  }
  useEffect(() => {
    let active = true;
    void authRequest("audit-events")
      .then((r) => {
        if (active) {
          setItems((r as { items: Record<string, string>[] }).items);
          setCursor((r as { nextCursor: string | null }).nextCursor);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel security">
      <h2>{authText(locale, "audit")}</h2>
      {error && <p role="alert">{authText(locale, "failure")}</p>}
      {items.map((r) => (
        <p key={r.id}>
          {r.occurred_at} · {r.action} · {r.result_code}
        </p>
      ))}
      {cursor && (
        <button onClick={() => void load(cursor)}>
          {authText(locale, "next")}
        </button>
      )}
    </section>
  );
}
