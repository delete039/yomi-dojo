import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("缺少应用挂载节点 #root。");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The Pages build is fully static. A tiny service worker keeps the last
// runnable shell available when the browser is offline or was suspended.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const workerUrl = new URL("sw.js", document.baseURI);
    navigator.serviceWorker.register(workerUrl).catch((error: unknown) => {
      console.warn("离线缓存注册失败", error);
    });
  });
}
