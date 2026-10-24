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

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion';
export { Alert, AlertDescription, AlertTitle } from './alert';
export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger } from './alert-dialog';
export { Avatar, AvatarFallback, AvatarImage } from './avatar';
export { Badge } from './badge';
export type { BadgeProps } from './badge';
export { Button } from './button';
export type { ButtonProps } from './button';
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from './dialog';
export { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from './dropdown-menu';
export { Input } from './input';
export type { InputProps } from './input';
export { Label } from './label';
export { Progress } from './progress';
export { RadioGroup, RadioGroupItem } from './radio-group';
export { ScrollArea, ScrollBar } from './scroll-area';
export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue } from './select';
export { Separator } from './separator';
export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger } from './sheet';
export { Skeleton } from './skeleton';
export { Spinner } from './spinner';
export { Switch } from './switch';
export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from './table';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
export { Textarea } from './textarea';
export type { TextareaProps } from './textarea';
export { Toast, ToastAction, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, type ToastActionElement, type ToastProps } from './toast';
export { Toaster } from './toaster';
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
// NOT re-exported: the ./use-toast hook and the cva variant helpers in
// ./button-variants and ./badge-variants. This barrel is component-only so
// fast-refresh stays precise; import hooks/variants from their own modules.

// Deliberately NOT re-exported: ./sidebar.
// It is a 23 kB navigation-specific module that shares names with
// components/Sidebar.tsx. Import it from
// '@/components/ui/sidebar' so the collision stays visible at the call site
// instead of being flattened away here.
