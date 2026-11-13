import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportBrowserFailure } from "@/lib/observability";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Only mount in laje-tcc: legacy laje/Supabase keeps the original tree. */
export class AwsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    reportBrowserFailure("react-render");
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main role="alert" className="mx-auto max-w-lg p-8 text-center">
          <h1 className="text-xl font-semibold">Não foi possível carregar esta página.</h1>
          <p className="mt-3">Atualize a página para tentar novamente.</p>
        </main>
      );
    }

    return this.props.children;
  }
}
