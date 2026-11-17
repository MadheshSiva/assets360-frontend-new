import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, finalize, map, of, shareReplay, throwError } from 'rxjs';
import { environment } from '../environment/environment';
import { AuthTokenResponse, AuthUser, LoginData, LoginResponse, RegisterData, RegisterResponse, SignupRole } from './auth.model';

// 'token' and 'userEmail' are read elsewhere (the auth interceptor, createdBy/updatedBy in services)
const TOKEN_KEY = 'token';
const REFRESH_KEY = 'refreshToken';
const EMAIL_KEY = 'userEmail';
const USER_KEY = 'authUser';
/** Access tokens are renewed when they have less than this left, so a request never leaves with an expired one. */
const RENEW_BEFORE_MS = 60_000;
/** Auth endpoints that need no access token; the interceptor leaves these requests alone. */
const ANONYMOUS_AUTH_PATHS = ['/roles', '/register', '/login', '/verify-otp', '/verify-totp', '/refresh', '/logout'];

/**
 * Sign-in against the UserAccount service (through the API gateway):
 * 1. login(): username + password → the second step (authenticator app code, or emailed code)
 * 2. verifyTotp() / verifyOtp(): the 6-digit code → access + refresh tokens, kept in this browser
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = `${environment.authApiUrl}api/auth`;
  /** Calls that must skip the interceptor (the token refresh itself). */
  private readonly rawHttp = new HttpClient(inject(HttpBackend));
  /** The refresh in flight: every request waiting for a new token shares it (a refresh token works only once). */
  private refreshing: Observable<string> | null = null;

  /** Step 1: checks the password; the response says which second step comes next. */
  login(data: LoginData): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.api}/login`, { userName: data.userName, password: data.password });
  }

  /** Step 2 with the authenticator app (Google Authenticator etc.); starts the session. */
  verifyTotp(userName: string, loginToken: string, code: string): Observable<AuthUser> {
    return this.http
      .post<AuthTokenResponse>(`${this.api}/verify-totp`, { userName, loginToken, code })
      .pipe(map((res) => this.startSession(res)));
  }

  /** Step 2 with an emailed code; starts the session. */
  verifyOtp(userName: string, otp: string): Observable<AuthUser> {
    return this.http.post<AuthTokenResponse>(`${this.api}/verify-otp`, { userName, otp }).pipe(map((res) => this.startSession(res)));
  }

  /** Roles a new account can pick on the sign-up page. */
  getSignupRoles(): Observable<SignupRole[]> {
    return this.http.get<SignupRole[]>(`${this.api}/roles`);
  }

  register(data: RegisterData): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.api}/register`, data);
  }

  /** Ends the session on the server (revokes the refresh token) and in this browser. */
  logout(): void {
    const refreshToken = this.read(REFRESH_KEY);
    if (refreshToken) this.http.post(`${this.api}/logout`, { refreshToken }).subscribe({ error: () => undefined });
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * True while this browser holds a session from the server: an unexpired access token, or an expired one with a
   * refresh token to renew it (the interceptor renews it on the next request). Old demo tokens don't count.
   */
  isLoggedIn(): boolean {
    const token = this.getToken();
    if (!token) return false;
    const expiresAt = this.tokenExpiry(token);
    if (expiresAt === null || (expiresAt <= Date.now() && !this.read(REFRESH_KEY))) {
      this.clearSession();
      return false;
    }
    return true;
  }

  /** True for the sign-in endpoints that take no access token (login, verify, refresh...). */
  isAnonymousAuthCall(url: string): boolean {
    if (!url.startsWith(this.api)) return false;
    const path = url.slice(this.api.length).split(/[?#]/)[0];
    return ANONYMOUS_AUTH_PATHS.includes(path);
  }

  /**
   * Access token for the next request: the stored one, or a renewed one when it expires within a minute.
   * Null when signed out. When the server refuses to renew the session, the user is sent to the sign-in page.
   */
  tokenForRequest(): Observable<string | null> {
    const token = this.getToken();
    if (!token || !this.expiresSoon(token) || !this.read(REFRESH_KEY)) return of(token);
    return this.refresh(token);
  }

  /**
   * A new access token from the refresh token. `staleToken` is the token a request used: if another request or
   * browser tab has already replaced it with a fresh one, that one is used instead of refreshing again (sending a
   * refresh token twice makes the server end every session of the user).
   */
  refresh(staleToken?: string | null): Observable<string> {
    const current = this.getToken();
    if (current && current !== staleToken && !this.expiresSoon(current)) return of(current);
    if (this.refreshing) return this.refreshing;
    const refreshToken = this.read(REFRESH_KEY);
    if (!refreshToken) return throwError(() => new Error('No refresh token'));
    this.refreshing = this.rawHttp.post<AuthTokenResponse>(`${this.api}/refresh`, { refreshToken }).pipe(
      map((res) => {
        this.startSession(res);
        return res.accessToken;
      }),
      finalize(() => (this.refreshing = null)),
      shareReplay(1)
    );
    return this.refreshing;
  }

  /** True when a refresh token is stored. */
  canRefresh(): boolean {
    return !!this.read(REFRESH_KEY);
  }

  /** The server refused to renew the session: forget it and go to the sign-in page. */
  sessionExpired(): void {
    this.clearSession();
    if (!this.router.url.startsWith('/login')) this.router.navigate(['/login']);
  }

  /** True when the token expires within RENEW_BEFORE_MS (or can't be read). */
  private expiresSoon(token: string): boolean {
    const expiresAt = this.tokenExpiry(token);
    return expiresAt === null || expiresAt - Date.now() < RENEW_BEFORE_MS;
  }

  /** Expiry of a JWT in ms (its `exp` claim), or null when the token is not a JWT. */
  private tokenExpiry(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return typeof json.exp === 'number' ? json.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  getToken(): string | null {
    return this.read(TOKEN_KEY);
  }

  getUser(): AuthUser | null {
    return this.parse<AuthUser | null>(this.read(USER_KEY), null);
  }

  setUserEmail(email: string): void {
    if (email) this.store(EMAIL_KEY, email);
  }

  getUserEmail(): string | null {
    return this.read(EMAIL_KEY);
  }

  clearSession(): void {
    [TOKEN_KEY, REFRESH_KEY, EMAIL_KEY, USER_KEY].forEach((key) => this.remove(key));
    // The role-based access cached by AccessService belongs to this session too
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('myAccess');
      } catch {
        // storage unavailable
      }
    }
  }

  /** Readable message for a failed auth call: the server's message, first validation error, or the status. */
  errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (!(err instanceof HttpErrorResponse)) return fallback;
    if (err.status === 0) return 'Cannot reach the server. Check that the backend is running.';
    const body = err.error;
    const firstError = body?.errors && Object.values(body.errors as Record<string, string[]>)[0]?.[0];
    return body?.message || firstError || body?.title || fallback;
  }

  private startSession(res: AuthTokenResponse): AuthUser {
    const u = res.user;
    const user: AuthUser = {
      userName: u.userName, email: u.email, roleName: u.roleName, id: u.id, userId: u.userId, userRoleId: u.userRoleId, clientId: u.clientId, tenantId: u.tenantId,
    };
    this.store(TOKEN_KEY, res.accessToken);
    this.store(REFRESH_KEY, res.refreshToken);
    this.store(USER_KEY, JSON.stringify(user));
    this.setUserEmail(user.email || user.userName);
    return user;
  }

  private parse<T>(json: string | null, fallback: T): T {
    try {
      return json ? (JSON.parse(json) as T) : fallback;
    } catch {
      return fallback;
    }
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
