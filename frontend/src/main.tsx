import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import App from "./App";
import { MissingClerkConfiguration } from "./auth/gate";
import "./styles.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root");
}

if (!publishableKey) {
  createRoot(root).render(<MissingClerkConfiguration />);
} else {
  createRoot(root).render(
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <App />
    </ClerkProvider>,
  );
}
