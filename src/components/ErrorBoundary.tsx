import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-red-800 mb-2">Terjadi Kesalahan Aplikasi</h2>
            <p className="text-red-700 mb-4 whitespace-nowrap overflow-hidden text-ellipsis">
              {this.state.error?.toString()}
            </p>
            <div className="bg-white p-4 rounded bg-red-100 text-xs font-mono overflow-auto max-h-60 text-red-900 border border-red-200">
              {this.state.errorInfo?.componentStack}
            </div>
            <button
              className="mt-4 bg-red-600 text-white px-4 py-2 rounded font-medium hover:bg-red-700 w-full"
              onClick={() => window.location.reload()}
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
