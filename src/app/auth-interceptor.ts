import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from 'shared-ui';

/**
 * Adds the signed-in user's access token to every API call, and keeps the session alive: access tokens last
 * 30 minutes, so one about to expire is renewed with the refresh token first, and a call refused with 401 is
 * retried once after renewing. When the server won't renew the session, the user is sent to the sign-in page.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (typeof window === 'undefined') return next(req); // SSR: no browser storage
  const auth = inject(AuthService);
  if (auth.isAnonymousAuthCall(req.url)) return next(req);

  const withToken = (r: HttpRequest<unknown>, token: string | null) =>
    token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;

  return auth.tokenForRequest().pipe(
    catchError(() => {
      // Renewing failed before the call: the session is over
      auth.sessionExpired();
      return throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Session expired', url: req.url }));
    }),
    switchMap((token) =>
      next(withToken(req, token)).pipe(
        catchError((err: unknown) => {
          if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !token || !auth.canRefresh()) {
            return throwError(() => err);
          }
          // The token was refused (expired or revoked meanwhile): renew once and retry
          return auth.refresh(token).pipe(
            catchError(() => {
              auth.sessionExpired();
              return throwError(() => err);
            }),
            switchMap((fresh) => next(withToken(req, fresh)))
          );
        })
      )
    )
  );
};
