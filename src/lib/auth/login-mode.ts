export type LoginMode = "admin" | "student" | "tutor";

const storageKey = "gps-tutor-login-mode";

export function setLoginMode(mode: LoginMode): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(storageKey, mode);
  }
}

export function getLoginMode(): LoginMode | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.sessionStorage.getItem(storageKey);
  return value === "admin" || value === "student" || value === "tutor"
    ? value
    : null;
}

export function clearLoginMode(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(storageKey);
  }
}
