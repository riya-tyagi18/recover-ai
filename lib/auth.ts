/**
 * Minimal client-side auth helpers.
 * Auth state is stored in localStorage under "raiAuth".
 * This is intentionally simple – it is demo authentication only.
 */

export const AUTH_KEY = "raiAuth";
export const DEMO_USER = "host";
export const DEMO_PASS = "password";

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

export function login(username: string, password: string): boolean {
  if (username === DEMO_USER && password === DEMO_PASS) {
    localStorage.setItem(AUTH_KEY, "1");
    return true;
  }
  return false;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}
