import type { ReactNode } from "react";
import { useApp } from "../app/AppContext";
import { navigate, type RouteName } from "../app/router";
import { cx } from "../lib/utils";
import { Brand } from "./Brand";
import { Icon, type IconName } from "./Icons";

const NAV: Array<{ route: RouteName; label: string; icon: IconName }> = [
  { route: "home", label: "首页", icon: "home" },
  { route: "library", label: "词库", icon: "library" },
  { route: "records", label: "记录", icon: "chart" },
  { route: "settings", label: "设置", icon: "settings" },
];

const MOBILE_NAV: Array<{ route: RouteName; label: string; icon: IconName }> = [
  { route: "home", label: "首页", icon: "home" },
  { route: "library", label: "词库", icon: "library" },
  { route: "practice", label: "练习", icon: "keyboard" },
  { route: "records", label: "记录", icon: "chart" },
  { route: "settings", label: "设置", icon: "settings" },
];

export function AppShell({
  route,
  children,
}: {
  route: RouteName;
  children: ReactNode;
}) {
  const {
    selectedPack,
    selectedPlan,
    progressForPack,
  } = useApp();
  const progress = selectedPack ? progressForPack(selectedPack.id) : null;

  const continueLabel = selectedPlan?.activeSession
    ? "继续练习"
    : selectedPack
      ? "开始练习"
      : "选择词包";

  const openPractice = () => {
    navigate(selectedPack ? "practice" : "library");
  };

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <button
            type="button"
            className="site-brand-button"
            onClick={() => navigate("home")}
            aria-label="回到首页"
          >
            <Brand />
          </button>

          <nav className="site-nav" aria-label="主导航">
            {NAV.map((item) => (
              <button
                key={item.route}
                type="button"
                className={cx(route === item.route && "is-active")}
                onClick={() => navigate(item.route)}
                aria-current={route === item.route ? "page" : undefined}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="site-header-right">
            {selectedPack ? (
              <button
                type="button"
                className="site-pack-status"
                onClick={() => navigate("library")}
                title="查看当前词包"
              >
                <span className="site-pack-dot" aria-hidden="true" />
                <span>{selectedPack.name}</span>
                <small>{progress?.due ?? 0} 待复习</small>
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary site-practice-button"
              onClick={openPractice}
            >
              <Icon
                name={selectedPack ? "play" : "library"}
                size={15}
                filled={Boolean(selectedPack)}
              />
              {continueLabel}
            </button>
          </div>
        </div>
      </header>

      <main className="main-content" id="main-content">
        {children}
      </main>

      <nav className="mobile-nav" aria-label="移动端主导航">
        {MOBILE_NAV.map((item) => (
          <button
            key={item.route}
            type="button"
            className={cx(route === item.route && "is-active")}
            onClick={() => navigate(item.route)}
            aria-current={route === item.route ? "page" : undefined}
          >
            <Icon name={item.icon} size={21} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
