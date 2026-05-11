import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { VirtualList } from './VirtualList';

// Mock @tanstack/react-virtual - must be at top level
vi.mock('@tanstack/react-virtual', () => {
  // Create a mock virtualizer that works with any number of items
  const createMockVirtualizer = (itemCount: number) => ({
    getTotalSize: () => itemCount * 50,
    getVirtualItems: () => Array.from({ length: itemCount }, (_, index) => ({
      index,
      start: index * 50,
      size: 50,
      key: index,
    })),
    getVirtualItem: vi.fn(),
  });
  
  return {
    useVirtualizer: vi.fn(({ count }) => createMockVirtualizer(count)),
  };
});

describe('VirtualList', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const items = ['Item 1', 'Item 2', 'Item 3'];
    render(
      <VirtualList
        items={items}
        renderItem={(item) => <div>{item}</div>}
        height={300}
      />
    );
    expect(screen.getByText('Item 1')).toBeTruthy();
    expect(screen.getByText('Item 2')).toBeTruthy();
    expect(screen.getByText('Item 3')).toBeTruthy();
  });

  it('uses custom getItemKey when provided', () => {
    const items = [
      { id: 'a', text: 'First' },
      { id: 'b', text: 'Second' },
    ];
    
    render(
      <VirtualList
        items={items}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.text}</div>}
      />
    );
    
    // Check that items are rendered
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('applies custom className', () => {
    const items = ['Test'];
    const { container } = render(
      <VirtualList
        items={items}
        renderItem={(item) => <div>{item}</div>}
        className="custom-class"
      />
    );
    
    // Check if the container has the class
    const listElement = container.querySelector('.virtual-list');
    expect(listElement).toBeTruthy();
    expect(listElement?.className).toContain('custom-class');
  });

  it('handles empty items array', () => {
    render(
      <VirtualList
        items={[]}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    
    // Should render without crashing
    const listElement = document.querySelector('.virtual-list');
    expect(listElement).toBeTruthy();
  });
});
