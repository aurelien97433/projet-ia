import { AppShell } from "@/components/shell/app-shell";

// Écrans protégés (la protection par session arrive en story 1.4).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
