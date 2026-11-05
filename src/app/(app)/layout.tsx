import { AppShell } from "@/components/shell/app-shell";

// Écrans protégés : le proxy redirige sans session, la coquille revérifie (UserEmail).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
