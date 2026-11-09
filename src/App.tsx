import {
  Component,
  useEffect,
  useLayoutEffect,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { AppProvider, useApp } from "./app/AppContext";
import { useHashRoute } from "./app/router";
import { AppShell } from "./components/AppShell";
import { Brand } from "./components/Brand";
import { Icon } from "./components/Icons";
import { ToastStack } from "./components/ToastStack";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { RecordsPage } from "./pages/RecordsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TypePage } from "./type/TypePage";

const PAGE_TITLES = {
  home: "今日 · 読み道場",
  library: "词库 · 読み道場",
  practice: "打字 · 読み道場",
  records: "学习记录 · 読み道場",
  settings: "设置 · 読み道場",
} as const;

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught application error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="boot-screen">
        <Brand />
        <span className="boot-status-icon is-error">
          <Icon name="alert" size={24} />
        </span>
        <h1>界面遇到了未处理的问题</h1>
        <p>{this.state.error.message}</p>
        <p className="boot-hint">
          学习数据保存在 IndexedDB 中，刷新通常不会丢失。若问题持续出现，请先尝试导出备份。
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          重新载入应用
        </button>
      </main>
    );
  }
}

function LoadingScreen() {
  return (
    <main className="boot-screen" aria-live="polite">
      <Brand />
      <span className="boot-status-icon">
        <span className="spinner" />
      </span>
      <h1>正在准备道场</h1>
      <p>读取本地词包、学习计划与记忆曲线…</p>
      <div className="boot-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}

function ErrorScreen({
  message,
  retry,
}: {
  message: string;
  retry: () => Promise<void>;
}) {
  return (
    <main className="boot-screen">
      <Brand />
      <span className="boot-status-icon is-error">
        <Icon name="database" size={24} />
      </span>
      <h1>无法打开本地学习数据</h1>
      <p>{message}</p>
      <p className="boot-hint">
        请检查网络资源是否可访问、浏览器是否允许 IndexedDB，或关闭其他占用同一数据库的标签页后重试。
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void retry()}
      >
        <Icon name="rotate" size={16} />
        重新载入
      </button>
    </main>
  );
}

function AppRouter() {
  const route = useHashRoute();
  const { loading, error, retryLoad } = useApp();

  useLayoutEffect(() => {
    const isTypeRoute = route.name === "practice";
    document.documentElement.classList.toggle("type-route-root", isTypeRoute);
    document.body.classList.toggle("type-route", isTypeRoute);
    return () => {
      if (isTypeRoute) {
        document.documentElement.classList.remove("type-route-root");
        document.body.classList.remove("type-route");
      }
    };
  }, [route.name]);

  useEffect(() => {
    document.title = PAGE_TITLES[route.name];
  }, [route.name]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} retry={retryLoad} />;
  if (route.name === "practice") return <TypePage />;

  return (
    <AppShell route={route.name}>
      {route.name === "home" ? <HomePage /> : null}
      {route.name === "library" ? <LibraryPage /> : null}
      {route.name === "records" ? <RecordsPage /> : null}
      {route.name === "settings" ? <SettingsPage /> : null}
    </AppShell>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <AppRouter />
        <ToastStack />
      </AppProvider>
    </AppErrorBoundary>
  );
}
