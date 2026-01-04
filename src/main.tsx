
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  // Register PWA service worker
  if ('serviceWorker' in navigator) {
    import('./pwa/register-sw')
  }

  createRoot(document.getElementById("root")!).render(<App />);
  