import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import { initLangSync } from "./i18n/langSync";
import { initThemeSync } from "./store/themeSync";
import { initUiPreferences } from "./store/uiPreferences";

// Mirror the host CPA panel's theme (light/white/dark) onto this iframe's
// <html> before React mounts, so the first paint already matches the panel and
// there's no theme flash. No-op / light fallback when opened standalone.
initThemeSync();

// Likewise mirror the panel's selected language (zh-CN/zh-TW/en/ru) into our
// i18n store before React mounts, so the first paint is already in the right
// language. Falls back to browser default / zh-CN when standalone.
initLangSync();
initUiPreferences();

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root was not found");

ReactDOM.createRoot(root).render(
  // <React.StrictMode>
  <HashRouter>
    <App />
  </HashRouter>,
  // </React.StrictMode>,
);
