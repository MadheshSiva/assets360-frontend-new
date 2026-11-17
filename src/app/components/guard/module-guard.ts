import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateChildFn, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { map } from 'rxjs';
import { AccessService, isCreatePath } from 'shared-ui';

/**
 * Role-based access for a section (sidebar label / permission-matrix module, e.g. 'Assets'). Use it as both canActivate
 * and canActivateChild on the section's route:
 * - users whose roles don't allow View go to the first section they may open, or to /no-access when there is none;
 * - create pages inside the section (…/registration, …/new, …/create) also need Create, otherwise they go to the
 *   section's start page. The API gateway refuses the save itself in any case.
 */
export function moduleGuard(section: string): CanActivateFn & CanActivateChildFn {
  return (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    const access = inject(AccessService);
    const router = inject(Router);
    return access.ensureLoaded().pipe(
      map((a) => {
        if (!access.canView(section, a)) return router.createUrlTree([access.homePath(a) ?? '/no-access']);
        if (isCreatePath(state.url) && !access.can(section, 'create')) {
          return router.createUrlTree(['/' + state.url.split(/[/?#]/).filter(Boolean)[0]]);
        }
        return true;
      })
    );
  };
}
