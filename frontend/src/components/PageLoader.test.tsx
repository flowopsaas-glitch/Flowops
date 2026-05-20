import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageLoader from '../components/PageLoader';

describe('PageLoader', () => {
  it('shows loading text', () => {
    render(<PageLoader />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('has spinner', () => {
    const { container } = render(<PageLoader />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('has pulse on text', () => {
    render(<PageLoader />);
    expect(screen.getByText('Loading').className).toContain('animate-pulse');
  });
});
