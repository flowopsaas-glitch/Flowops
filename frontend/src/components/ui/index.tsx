/**
 * Barrel for the design-system primitives.
 *
 * This file previously defined two ad-hoc components — a `Table` with
 * `bg-white` and a `Button` with `bg-blue-500` — which shadowed the real
 * primitives in this directory. They were light-theme stubs in a dark-theme
 * application, they had no variants, no `forwardRef`, no focus ring and no
 * disabled state, and nothing imported them (every consumer imports the
 * individual files directly). They are removed rather than kept for
 * compatibility: keeping them would mean `./ui` and `./ui/button` resolve to
 * two different buttons with two different themes.
 *
 * Everything below is a re-export. Nothing is defined here.
 */

export * from './accordion';
export * from './alert';
export * from './alert-dialog';
export * from './avatar';
export * from './badge';
export * from './button';
export * from './card';
export * from './dialog';
export * from './dropdown-menu';
export * from './input';
export * from './label';
export * from './progress';
export * from './radio-group';
export * from './scroll-area';
export * from './select';
export * from './separator';
export * from './sheet';
export * from './skeleton';
export * from './spinner';
export * from './switch';
export * from './table';
export * from './tabs';
export * from './textarea';
export * from './toast';
export * from './toaster';
export * from './tooltip';
export * from './use-toast';

// Deliberately NOT re-exported: ./sidebar.
// It is a 23 kB navigation-specific module that shares names with
// components/Sidebar.tsx and components/SidebarNavigation.tsx. Import it from
// '@/components/ui/sidebar' so the collision stays visible at the call site
// instead of being flattened away here.
