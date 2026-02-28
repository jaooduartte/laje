import { AppRoutePath } from "@/lib/enums";

export function NotFoundPageView() {
  return (
    <div className="app-page flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel enter-section w-full max-w-sm p-8 text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href={AppRoutePath.LIVE} className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
}
