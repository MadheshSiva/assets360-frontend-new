import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, delay, of, throwError } from 'rxjs';
import { AuthUser, LoginData, LoginResponse, RegisterData, RegisterResponse, SignupRole } from './auth.model';

// 'token' and 'userEmail' are read elsewhere (createdBy/updatedBy in services)
const TOKEN_KEY = 'token';
const EMAIL_KEY = 'userEmail';
const USER_KEY = 'authUser';

/** Roles offered on the sign-up page (static demo data). */
const SIGNUP_ROLES: SignupRole[] = [
  { roleId: 'ROLE-ADMIN', roleName: 'Administrator', description: 'Full access to every module.' },
  { roleId: 'ROLE-ASSET-MGR', roleName: 'Asset Manager', description: 'Manages the asset register, lifecycle and reports.' },
  { roleId: 'ROLE-MAINT', roleName: 'Maintenance Technician', description: 'Works on maintenance and inspection jobs.' },
  { roleId: 'ROLE-VIEWER', roleName: 'Viewer', description: 'Read-only access to dashboards and reports.' }
];

/**
 * DEMO MODE: sign-in without a backend. Any username and password starts a session in this browser;
 * there is no second step and no server call.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  /** Signs in straight away with the given username (any password is accepted). */
  signIn(data: LoginData): Observable<AuthUser> {
    const userName = data.userName.trim();
    if (!userName || !data.password) return throwError(() => new Error('Enter your username and password.'));
    return of(this.startSession(userName)).pipe(delay(300));
  }

  /** Kept for callers of the old two-step flow: the demo never asks for a second step. */
  login(data: LoginData): Observable<LoginResponse> {
    return of({ twoFactorRequired: false, method: 'email' as const, message: 'Signed in.', otpExpiresInSeconds: 0, maskedEmail: data.userName });
  }

  verifyTotp(userName: string, _loginToken: string, _code: string): Observable<AuthUser> {
    return of(this.startSession(userName));
  }

  verifyOtp(userName: string, _otp: string): Observable<AuthUser> {
    return of(this.startSession(userName));
  }

  /** Roles a new account can pick on the sign-up page. */
  getSignupRoles(): Observable<SignupRole[]> {
    return of(SIGNUP_ROLES);
  }

  /** The demo does not store accounts; sign-up just succeeds. */
  register(data: RegisterData): Observable<RegisterResponse> {
    return of({ message: 'Account created.', userName: data.userName, email: data.email }).pipe(delay(300));
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean {
    return !!this.getToken() && !!this.getUser();
  }

  /** No server calls in the demo, so nothing is anonymous or needs a token. */
  isAnonymousAuthCall(_url: string): boolean {
    return true;
  }

  tokenForRequest(): Observable<string | null> {
    return of(this.getToken());
  }

  refresh(_staleToken?: string | null): Observable<string> {
    const token = this.getToken();
    return token ? of(token) : throwError(() => new Error('Not signed in'));
  }

  canRefresh(): boolean {
    return false;
  }

  sessionExpired(): void {
    this.clearSession();
    if (!this.router.url.startsWith('/login')) this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.read(TOKEN_KEY);
  }

  getUser(): AuthUser | null {
    try {
      const json = this.read(USER_KEY);
      return json ? (JSON.parse(json) as AuthUser) : null;
    } catch {
      return null;
    }
  }

  setUserEmail(email: string): void {
    if (email) this.store(EMAIL_KEY, email);
  }

  getUserEmail(): string | null {
    return this.read(EMAIL_KEY);
  }

  clearSession(): void {
    [TOKEN_KEY, EMAIL_KEY, USER_KEY, 'refreshToken'].forEach((key) => this.remove(key));
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('myAccess');
      } catch {
        // storage unavailable
      }
    }
  }

  errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    return err instanceof Error && err.message ? err.message : fallback;
  }

  private startSession(userName: string): AuthUser {
    const email = userName.includes('@') ? userName : `${userName}@assets360.com`;
    const user: AuthUser = { userName, email, roleName: 'Administrator', id: 'demo-user', userId: 'USR-0001', userRoleId: 'ROLE-ADMIN', clientId: 'CLT-1001', tenantId: 'TENANT-DEFAULT' };
    this.store(TOKEN_KEY, 'demo-token');
    this.store(USER_KEY, JSON.stringify(user));
    this.setUserEmail(email);
    return user;
  }

  private read(key: string): string | null {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  }

  private store(key: string, value: string): void {
    if (typeof window !== 'undefined') localStorage.setItem(key, value);
  }

  private remove(key: string): void {
    if (typeof window !== 'undefined') localStorage.removeItem(key);
  }
}
