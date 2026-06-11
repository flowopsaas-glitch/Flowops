import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../components/ErrorBoundary';

function Throw({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test error message');
  return <div>Working component</div>;
}

describe('ErrorBoundary', () => {
  const origError = console.error;
  beforeEach(() => { console.error = vi.fn(); });
  afterEach(() => { console.error = origError; });

  it('renders children when no error', () => {
    render(<ErrorBoundary><Throw shouldThrow={false} /></ErrorBoundary>);
    expect(screen.getByText('Working component')).toBeInTheDocument();
  });

  it('shows error UI when child throws', () => {
    render(<ErrorBoundary><Throw shouldThrow={true} /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('shows custom fallback', () => {
    render(<ErrorBoundary fallback={<div>Custom error</div>}><Throw shouldThrow={true} /></ErrorBoundary>);
    expect(screen.getByText('Custom error')).toBeInTheDocument();
  });

  it('has reload button', () => {
    render(<ErrorBoundary><Throw shouldThrow={true} /></ErrorBoundary>);
    expect(screen.getByText('Reload Page')).toBeInTheDocument();
  });

  it('reload button triggers reload', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload }, writable: true });
    render(<ErrorBoundary><Throw shouldThrow={true} /></ErrorBoundary>);
    await userEvent.setup().click(screen.getByText('Reload Page'));
    expect(reload).toHaveBeenCalled();
  });
});
