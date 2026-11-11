import { AppProviders } from "@/components/shell/AppProviders";

/**
 * Signed-in pages are a client-rendered app: nothing is drawn until the
 * session has been read in the browser, so there is nothing for Next.js to
 * pre-render and validate here. Moving between these pages is still instant
 * because this layout (and its data cache) stays mounted.
 */
export const instant = false;

/** Layout for every signed-in page. The request proxy has already checked the session. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppProviders>{children}</AppProviders>;
}
