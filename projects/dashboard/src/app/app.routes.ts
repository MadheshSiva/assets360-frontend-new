import { Routes } from '@angular/router';
import { Dashboard } from './dashboard/dashboard';
import { IotTrackingOverview } from './iot-tracking-overview/iot-tracking-overview';
import { AssetOverview } from './asset-overview/asset-overview';

// Mounted by the shell at /dashboard; paths match the Dashboard menu in the shell's sidebar
export const routes: Routes = [
  // IoT & Tracking Overview is the dashboard's landing page (after login and from any /dashboard link)
  { path: '', redirectTo: 'iot-tracking-overview', pathMatch: 'full' },
  // previous widget dashboard, kept reachable
  { path: 'widgets', component: Dashboard },
  { path: 'iot-tracking-overview', component: IotTrackingOverview },
  { path: 'asset-overview', component: AssetOverview }
];
