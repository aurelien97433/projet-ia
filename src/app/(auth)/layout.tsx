import { Logo } from "@/components/shell/logo";

// Écrans du Visiteur (E1, E2) : une colonne centrée, sans barre latérale.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <header>
          <Logo />
        </header>
        <main id="contenu" className="flex flex-col gap-6">
          {children}
        </main>
      </div>
    </div>
  );
}
