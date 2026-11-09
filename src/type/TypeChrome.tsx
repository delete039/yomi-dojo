import { useMemo } from "react";
import { useApp } from "../app/AppContext";
import { navigate, type RouteName } from "../app/router";
import { Icon, type IconName } from "../components/Icons";

const DESKTOP_NAV: Array<{ route: RouteName; label: string; icon: IconName }> = [
  { route: "home", label: "首页", icon: "home" },
  { route: "library", label: "词库", icon: "library" },
  { route: "records", label: "记录", icon: "chart" },
  { route: "practice", label: "练习", icon: "keyboard" },
];

const MOBILE_NAV: Array<{ route: RouteName; label: string; icon: IconName }> = [
  { route: "home", label: "首页", icon: "home" },
  { route: "library", label: "词库", icon: "library" },
  { route: "practice", label: "练习", icon: "keyboard" },
  { route: "records", label: "记录", icon: "chart" },
  { route: "settings", label: "设置", icon: "settings" },
];

function TypeBrand() {
  return (
    <button type="button" className="ty-brand" onClick={() => navigate("home")}>
      <span className="ty-brand-mark" aria-hidden="true">
        読
      </span>
      <span className="ty-brand-copy">
        <b>読み道場</b>
        <small>YOMI DOJO</small>
      </span>
    </button>
  );
}

export function TypeDesktopHeader() {
  const { selectedPack, progressForPack } = useApp();
  const due = useMemo(
    () => (selectedPack ? progressForPack(selectedPack.id)?.due ?? 0 : 0),
    [progressForPack, selectedPack],
  );

  return (
    <header className="ty-global-header">
      <TypeBrand />
      <nav className="ty-global-nav" aria-label="主导航">
        {DESKTOP_NAV.map((item) => (
          <button
            type="button"
            className={item.route === "practice" ? "is-current" : undefined}
            key={item.route}
            onClick={() => navigate(item.route)}
            aria-current={item.route === "practice" ? "page" : undefined}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
            {item.route === "library" && due > 0 ? (
              <span className="ty-nav-badge">{Math.min(999, due)}</span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="ty-global-right">
        <button
          type="button"
          className="ty-global-icon"
          aria-label="学习设置"
          title="学习设置"
          onClick={() => navigate("settings")}
        >
          <Icon name="settings" size={19} />
        </button>
        <button
          type="button"
          className="ty-local-user"
          onClick={() => navigate("settings")}
          title="数据仅保存在当前浏览器"
        >
          <Icon name="database" size={16} />
          <span>本地数据</span>
        </button>
      </div>
    </header>
  );
}

export function TypeMobileNav() {
  return (
    <nav className="ty-mobile-nav" aria-label="移动端主导航">
      {MOBILE_NAV.map((item) => (
        <button
          type="button"
          key={item.route}
          className={item.route === "practice" ? "is-active" : undefined}
          onClick={() => navigate(item.route)}
          aria-current={item.route === "practice" ? "page" : undefined}
        >
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
