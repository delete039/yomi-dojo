import { useCallback, useEffect, useState } from "react";

export type RouteName = "home" | "library" | "practice" | "records" | "settings";

export interface Route {
  name: RouteName;
}

const ROUTES: RouteName[] = ["home", "library", "practice", "records", "settings"];

export function parseRoute(hash = window.location.hash): Route {
  const clean = hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  if (clean === "type") return { name: "practice" };
  return {
    name: ROUTES.includes(clean as RouteName) ? (clean as RouteName) : "home",
  };
}

export function navigate(name: RouteName): void {
  if (parseRoute().name === name) return;
  window.location.hash = name === "practice" ? "/type" : `/${name}`;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const onChange = () => {
      const next = parseRoute();
      setRoute(next);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", onChange);
    if (!window.location.hash) window.history.replaceState(null, "", "#/home");
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

export function useNavigate(): (name: RouteName) => void {
  return useCallback((name: RouteName) => navigate(name), []);
}
