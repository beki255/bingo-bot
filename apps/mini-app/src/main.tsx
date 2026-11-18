import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./index.css";

// Tell Telegram WebApp to expand to full screen if inside Telegram
if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
  const tg = (window as any).Telegram.WebApp;
  tg.ready();
  tg.expand();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
