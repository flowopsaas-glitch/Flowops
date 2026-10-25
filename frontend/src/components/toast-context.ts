import { createContext, useContext } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

/**
 * Toast context + hook live apart from ToastProvider so the provider file
 * only exports a component (react-refresh). The context object is created
 * here; ToastProvider supplies the value.
 */
export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
};
