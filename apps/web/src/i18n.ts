import type { RouteKey } from "./routes";
export type Locale = "ja" | "ko" | "en";
const ja = {
  dashboard: "ダッシュボード",
  products: "商品",
  inventory: "在庫",
  warehouses: "倉庫",
  inbound: "入庫",
  outbound: "出庫",
  transfers: "在庫移動",
  procurement: "調達",
  analytics: "分析",
  automation: "自動化",
  approvals: "承認",
  activity: "操作履歴",
  integrations: "外部連携",
  health: "システム状態",
  settings: "設定",
  app: "Project WMS",
  subtitle: "倉庫・運用管理",
  workspace: "ワークスペース",
  system: "システム",
  menu: "メニューを開く",
  close: "メニューを閉じる",
  language: "表示言語",
  eyebrow: "開発環境 / DEV-01",
  heading: "運用の基盤を、確かに。",
  intro: "接続状態と開発状況を確認できます。物流業務はまだ実装されていません。",
  api: "API 接続",
  database: "データベース",
  online: "接続済み",
  offline: "オフライン",
  unavailable: "接続できません",
  checking: "確認中",
  unknown: "未確認",
  offlineNotice: "オフラインです。サーバーの処理は実行できません。",
  errorNotice:
    "API に接続できません。接続先とサーバーの状態を確認してください。",
  updated: "最終確認",
  refresh: "再確認",
  foundation: "開発基盤",
  foundationNote:
    "Web・API・DB・Worker の接続基盤。認証と業務機能は今後の開発対象です。",
  next: "次の開発",
  nextTitle: "DEV-02 · 認証と権限",
  nextNote: "業務 API を追加する前に、安全な認証・アクセス制御を構築します。",
  planned: "未実装",
  plannedNote:
    "この画面の業務機能は今後の DEV で実装します。実際の在庫・販売・出庫データは表示していません。",
  notFound: "ページが見つかりません",
  back: "ダッシュボードへ",
  errorTitle: "画面を表示できません",
  errorBody: "再読み込みしてもう一度お試しください。",
  reload: "再読み込み",
  footer: "開発基盤 · 外部への業務処理は無効",
  skip: "メインコンテンツへ",
  connection: "接続状態",
  available: "正常",
  limited: "要確認",
  dev: "開発中",
};
export type TranslationKey = keyof typeof ja;
const en: Partial<Record<TranslationKey, string>> = {
  dashboard: "Dashboard",
  products: "Products",
  inventory: "Inventory",
  warehouses: "Warehouses",
  inbound: "Inbound",
  outbound: "Outbound",
  transfers: "Transfers",
  procurement: "Procurement",
  analytics: "Analytics",
  automation: "Automation",
  approvals: "Approvals",
  activity: "Activity logs",
  integrations: "Integrations",
  health: "System health",
  settings: "Settings",
  menu: "Open menu",
  close: "Close menu",
  language: "Language",
  heading: "A dependable foundation.",
  intro:
    "Connection and development status. Logistics operations are not implemented.",
  planned: "Not implemented",
  plannedNote:
    "Business features are planned for a later DEV. No real inventory, sales or shipments are displayed.",
  online: "Connected",
  offline: "Offline",
  unavailable: "Unavailable",
  checking: "Checking",
  unknown: "Unknown",
  refresh: "Check again",
  notFound: "Page not found",
  back: "Back to dashboard",
  offlineNotice: "Offline. Server operations cannot be executed.",
  errorNotice: "API unavailable. Check your connection and server.",
  updated: "Last checked",
  api: "API connection",
  database: "Database",
  skip: "Skip to content",
};
const ko: Partial<Record<TranslationKey, string>> = {
  dashboard: "대시보드",
  products: "상품",
  inventory: "재고",
  warehouses: "창고",
  inbound: "입고",
  outbound: "출고",
  transfers: "재고 이동",
  procurement: "조달",
  analytics: "분석",
  automation: "자동화",
  approvals: "승인",
  activity: "작업 이력",
  integrations: "외부 연동",
  health: "시스템 상태",
  settings: "설정",
  menu: "메뉴 열기",
  close: "메뉴 닫기",
  language: "표시 언어",
  heading: "안정적인 운영의 기반.",
  intro:
    "연결 상태와 개발 현황입니다. 실제 물류 업무는 아직 구현되지 않았습니다.",
  planned: "미구현",
  plannedNote:
    "실제 업무 기능은 후속 DEV에서 구현합니다. 운영 재고·판매·출고 데이터는 표시하지 않습니다.",
  online: "연결됨",
  offline: "오프라인",
  unavailable: "연결할 수 없음",
  checking: "확인 중",
  unknown: "미확인",
  refresh: "다시 확인",
  notFound: "페이지를 찾을 수 없습니다",
  back: "대시보드로",
  offlineNotice: "오프라인입니다. 서버 작업은 실행할 수 없습니다.",
  errorNotice: "API에 연결할 수 없습니다. 연결과 서버를 확인하세요.",
  updated: "마지막 확인",
  api: "API 연결",
  database: "데이터베이스",
  skip: "본문으로 이동",
};
export function localeOf(value: unknown): Locale {
  return value === "ko" || value === "en" ? value : "ja";
}
export function translate(locale: Locale, key: TranslationKey): string {
  return (locale === "ko" ? ko : locale === "en" ? en : ja)[key] ?? ja[key];
}
export function routeLabel(locale: Locale, key: RouteKey): string {
  return translate(locale, key);
}
export function formatDate(value: string, locale: Locale): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}
export function formatNumber(value: bigint, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}
export function formatCurrencyMinor(
  value: bigint,
  currency: string,
  locale: Locale,
): string {
  if (currency !== "JPY") throw new Error("UNSUPPORTED_CURRENCY_FORMAT");
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
