import { Routes } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';
import { ModulePlaceholder } from 'shared-ui';
import { Login } from './components/pages/login/login/login';
import { Signup } from './components/pages/signup/signup/signup';
import { SectionUnavailable } from './section-unavailable/section-unavailable';
import { Events } from './components/pages/events/events/events';
import { Layout } from './components/shared/layout/layout';
// DEMO MODE: Auth guard import kept for reference
// import { authGuard } from './components/guard/auth-guard';
import { ProcessAutomation } from './components/pages/process-automation/process-automation/process-automation';
import { ProcessAutomationAdd } from './components/pages/process-automation/process-automation-add/process-automation-add';

function remoteRoutes(remoteName: string) {
  return () =>
    loadRemoteModule({ remoteName, exposedModule: './routes' })
      .then((m) => m.routes)
      .catch((err) => {
        console.error(`Failed to load remote "${remoteName}":`, err);
        // '**' so deep links into the module (e.g. /assets/list) show the message too
        return [{ path: '**', component: SectionUnavailable }];
      });
}

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'signup', component: Signup },
  {
    path: '',
    component: Layout,
    // DEMO MODE: Auth guard is disabled
    // canActivate: [authGuard],
    children: [
      // Each main sidebar menu is its own micro-frontend (projects/<name>); its pages are routed inside it
      { path: 'dashboard', loadChildren: remoteRoutes('dashboard') },
      { path: 'assets', loadChildren: remoteRoutes('assets') },
      // previous floor-plan Locating module (federated remote), kept reachable
      { path: 'tracking-iot/locating-classic', loadChildren: remoteRoutes('locating') },
      { path: 'tracking-iot', loadChildren: remoteRoutes('trackingIot') },
      { path: 'wip-operations', loadChildren: remoteRoutes('wipOperations') },
      { path: 'inspection', loadChildren: remoteRoutes('inspection') },
      { path: 'maintenance', loadChildren: remoteRoutes('maintenance') },
      { path: 'reports-analytics', loadChildren: remoteRoutes('reports') },
      { path: 'administration', loadChildren: remoteRoutes('administration') },
      { path: 'master-data-management', loadChildren: remoteRoutes('masterDataManagement') },
      // New UI modules: placeholder pages until their screens are built
      { path: 'movement-custody', component: ModulePlaceholder, data: { title: 'Movement & Custody' } },
      { path: 'inventory', component: ModulePlaceholder, data: { title: 'Inventory' } },
      { path: 'audit-compliance', component: ModulePlaceholder, data: { title: 'Audit & Compliance' } },
      { path: 'contracts-warranty', component: ModulePlaceholder, data: { title: 'Contracts & Warranty' } },
      { path: 'financial', component: ModulePlaceholder, data: { title: 'Financial' } },
      { path: 'locating', redirectTo: 'tracking-iot/real-time-location', pathMatch: 'full' },
      // Generated Reports was removed; old report links open the Reports & Analytics home
      { path: 'report', redirectTo: 'reports-analytics', pathMatch: 'full' },
      { path: 'report/create', redirectTo: 'reports-analytics', pathMatch: 'full' },
      { path: 'report/view/:id', redirectTo: 'reports-analytics', pathMatch: 'full' },
      { path: 'events', component: Events },
      { path: 'process-automation', component: ProcessAutomation },
      { path: 'process-automation/add', component: ProcessAutomationAdd }
    ]
  }
];
