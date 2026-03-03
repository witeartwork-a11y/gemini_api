import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    padding: '2rem',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    background: '#0f172a',
                    color: '#e2e8f0',
                    textAlign: 'center'
                }}>
                    <div style={{
                        background: '#1e293b',
                        borderRadius: '12px',
                        padding: '2rem 3rem',
                        maxWidth: '500px',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.3)'
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>
                            Что-то пошло не так
                        </h2>
                        <p style={{
                            color: '#94a3b8',
                            fontSize: '0.875rem',
                            margin: '0 0 1.5rem',
                            wordBreak: 'break-word'
                        }}>
                            {this.state.error?.message}
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                onClick={this.handleReset}
                                style={{
                                    padding: '0.5rem 1.25rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#6366f1',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    fontWeight: 500
                                }}
                            >
                                Попробовать снова
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                style={{
                                    padding: '0.5rem 1.25rem',
                                    borderRadius: '8px',
                                    border: '1px solid #475569',
                                    background: 'transparent',
                                    color: '#e2e8f0',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    fontWeight: 500
                                }}
                            >
                                Перезагрузить
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
