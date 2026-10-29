import { Routes } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';
import { Login } from './components/pages/login/login/login';
import { Signup } from './components/pages/signup/signup/signup';
import { SectionUnavailable } from './section-unavailable/section-unavailable';
import { ModulePlaceholder } from './module-placeholder/module-placeholder';
import { AnalyticsInsights } from './components/pages/tracking-iot/analytics-insights/analytics-insights';
import { TagIds } from './components/pages/tracking-iot/tag-ids/tag-ids';
import { FirmwareConnectivity } from './components/pages/tracking-iot/firmware-connectivity/firmware-connectivity';
import { AssetRegistration } from './components/pages/assets/asset-registration/asset-registration';
import { AssetList } from './components/pages/assets/asset-list/asset-list';
import { AssetCategories } from './components/pages/assets/asset-categories/asset-categories';
import { AssetTypesModels } from './components/pages/assets/asset-types-models/asset-types-models';
import { AssetHierarchy } from './components/pages/assets/asset-hierarchy/asset-hierarchy';
import { AssetComponents } from './components/pages/assets/asset-components/asset-components';
import { AssetCustomFields } from './components/pages/assets/asset-custom-fields/asset-custom-fields';
import { AssetRelationship } from './components/pages/assets/asset-relationship/asset-relationship';
import { AssetRelationshipList } from './components/pages/assets/asset-relationship-list/asset-relationship-list';
import { AssetDocuments } from './components/pages/assets/asset-documents/asset-documents';
import { AssetImages } from './components/pages/assets/asset-images/asset-images';
import { AssetStatusCondition } from './components/pages/assets/asset-status-condition/asset-status-condition';
import { AssetCriticality } from './components/pages/assets/asset-criticality/asset-criticality';
import { AssetHealthScore } from './components/pages/assets/asset-health-score/asset-health-score';
import { AssetBulk } from './components/pages/assets/asset-bulk/asset-bulk';
import { AssetMerge } from './components/pages/assets/asset-merge/asset-merge';
import { LocationHistory } from './components/pages/assets/asset-location-history/location-history';
import { AssetMaintenance } from './components/pages/assets/asset-maintenance/asset-maintenance';
import { JobTemplates } from './components/pages/wip-operations/job-templates/job-templates';
import { JobOrders } from './components/pages/wip-operations/job-orders/job-orders';
import { Resources } from './components/pages/wip-operations/resources/resources';
import { TaskMaster } from './components/pages/wip-operations/task-master/task-master';
import { MaterialConsumption } from './components/pages/wip-operations/material-consumption/material-consumption';
import { LocationManagement } from './components/pages/wip-operations/location-management/location-management';
import { IssuesDelays } from './components/pages/wip-operations/issues-delays/issues-delays';
import { SlaManagement } from './components/pages/wip-operations/sla-management/sla-management';
import { AssetLinking } from './components/pages/wip-operations/asset-linking/asset-linking';
import { PermitCompliance } from './components/pages/wip-operations/permit-compliance/permit-compliance';
import { ProgressLog } from './components/pages/wip-operations/progress-log/progress-log';
import { ProductOutput } from './components/pages/wip-operations/product-output/product-output';
import { Events } from './components/pages/events/events/events';
import { Reports } from './components/pages/reports/reports/reports';
import { CreateReport } from './components/pages/reports/create-report/create-report';
import { ReportView } from './components/pages/reports/report-view/report-view';
import { Layout } from './components/shared/layout/layout';
// DEMO MODE: Auth guard import kept for reference
// import { authGuard } from './components/guard/auth-guard';
import { Administration } from './components/pages/administration/administration/administration';
import { ReportsAnalytics } from './components/pages/reports-analytics/reports-analytics/reports-analytics';

import { AssetLifecycle } from './components/pages/assets/asset-lifecycle/asset-lifecycle';
import { ProcessAutomation } from './components/pages/process-automation/process-automation/process-automation';
import { ProcessAutomationAdd } from './components/pages/process-automation/process-automation-add/process-automation-add';

function remoteRoutes(remoteName: string) {
  return () =>
    loadRemoteModule({ remoteName, exposedModule: './routes' })
      .then((m) => m.routes)
      .catch((err) => {
        console.error(`Failed to load remote "${remoteName}":`, err);
        return [{ path: '', component: SectionUnavailable }];
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
      { path: 'dashboard', loadChildren: remoteRoutes('dashboard') },
      // New UI modules: placeholder pages until their screens are built
      // The Assets menu only expands its submenu; a direct visit to /assets lands on the Asset List
      { path: 'assets', redirectTo: 'assets/list', pathMatch: 'full' },
      // Asset detail tabs take the asset as ?tag=, e.g. /assets/relationships?tag=GEN-00045
      { path: 'assets/relationships', component: AssetRelationship },
      // Menu page: relationships users create between a main asset and a sub asset
      { path: 'assets/asset-relationships', component: AssetRelationshipList },
      { path: 'assets/registration', component: AssetRegistration },
      { path: 'assets/list', component: AssetList },
      { path: 'assets/categories', component: AssetCategories },
      { path: 'assets/types-models', component: AssetTypesModels },
      { path: 'assets/hierarchy', component: AssetHierarchy },
      { path: 'assets/components', component: AssetComponents },
      { path: 'assets/location-history', component: LocationHistory },
      { path: 'assets/assignment', component: ModulePlaceholder, data: { title: 'Assignment' } },
      { path: 'assets/maintenance', component: AssetMaintenance },
      { path: 'assets/service-requests', component: ModulePlaceholder, data: { title: 'Service Requests' } },
      { path: 'assets/audit', component: ModulePlaceholder, data: { title: 'Asset Audit' } },
      { path: 'assets/disposal', component: ModulePlaceholder, data: { title: 'Disposal' } },
      { path: 'assets/custom-fields', component: AssetCustomFields },
      { path: 'assets/lifecycle', component: AssetLifecycle },
      { path: 'assets/documents', component: AssetDocuments },
      // Menu page: documents of every asset, uploaded to one or more assets at a time
      { path: 'assets/all-documents', component: AssetDocuments, data: { allAssets: true } },
      { path: 'assets/images', component: AssetImages },
      // Menu page: images of every asset, uploaded to one or more assets at a time
      { path: 'assets/all-images', component: AssetImages, data: { allAssets: true } },
      { path: 'assets/status-condition', component: AssetStatusCondition },
      { path: 'assets/criticality', component: AssetCriticality },
      { path: 'assets/health-score', component: AssetHealthScore },
      { path: 'assets/bulk-import-export', component: AssetBulk },
      { path: 'assets/merge-dedup', component: AssetMerge },
      { path: 'tracking-iot', component: ModulePlaceholder, data: { title: 'Tracking & IoT' } },
      { path: 'tracking-iot/analytics-insights', component: AnalyticsInsights },
      { path: 'tracking-iot/tag-ids', component: TagIds },
      { path: 'tracking-iot/firmware-connectivity', component: FirmwareConnectivity },
      { path: 'tracking-iot/real-time-location', loadChildren: remoteRoutes('locating') },
      { path: 'master-data-management', loadChildren: remoteRoutes('masterDataManagement') },
      { path: 'movement-custody', component: ModulePlaceholder, data: { title: 'Movement & Custody' } },
      { path: 'maintenance', component: ModulePlaceholder, data: { title: 'Maintenance' } },
      { path: 'inspection', component: ModulePlaceholder, data: { title: 'Inspection' } },
      { path: 'inventory', component: ModulePlaceholder, data: { title: 'Inventory' } },
      { path: 'wip-operations', redirectTo: 'wip-operations/job-templates', pathMatch: 'full' },
      // Opens one template; ?code=JT-00042 picks which
      { path: 'wip-operations/job-templates', component: JobTemplates },
      // Opens one job order; ?code=JO-2026-00438 picks which
      { path: 'wip-operations/job-orders', component: JobOrders },
      { path: 'wip-operations/process-routing', component: ModulePlaceholder, data: { title: 'Process & Routing' } },
      // Opens one task; ?code=TM-00056 picks which
      { path: 'wip-operations/task-master', component: TaskMaster },
      { path: 'wip-operations/resources', component: Resources },
      // Opens one job order's materials; ?job=JO-2026-00438 picks which
      { path: 'wip-operations/material-consumption', component: MaterialConsumption },
      { path: 'wip-operations/location-management', component: LocationManagement },
      { path: 'wip-operations/asset-linking', component: AssetLinking },
      { path: 'wip-operations/sla-management', component: SlaManagement },
      { path: 'wip-operations/progress-log', component: ProgressLog },
      { path: 'wip-operations/product-output', component: ProductOutput },
      { path: 'wip-operations/progress-output', redirectTo: 'wip-operations/progress-log', pathMatch: 'full' },
      { path: 'wip-operations/issues-delays', component: IssuesDelays },
      { path: 'wip-operations/permit-compliance', component: PermitCompliance },
      { path: 'audit-compliance', component: ModulePlaceholder, data: { title: 'Audit & Compliance' } },
      { path: 'contracts-warranty', component: ModulePlaceholder, data: { title: 'Contracts & Warranty' } },
      { path: 'financial', component: ModulePlaceholder, data: { title: 'Financial' } },
      { path: 'reports-analytics', component: ReportsAnalytics },
      {
        path: 'reports-analytics/standard-reports',
        loadComponent: () => import('./components/pages/reports-analytics/standard-reports/standard-reports').then((m) => m.StandardReportsPage)
      },
      {
        path: 'reports-analytics/custom-reports',
        loadComponent: () => import('./components/pages/reports-analytics/custom-reports/custom-reports').then((m) => m.CustomReportsPage)
      },
      {
        path: 'reports-analytics/interactive-dashboards',
        loadComponent: () => import('./components/pages/reports-analytics/interactive-dashboards/interactive-dashboards').then((m) => m.InteractiveDashboardsPage)
      },
      {
        path: 'reports-analytics/asset-performance',
        loadComponent: () => import('./components/pages/reports-analytics/asset-performance/asset-performance').then((m) => m.AssetPerformancePage)
      },
      {
        path: 'reports-analytics/maintenance-analytics',
        loadComponent: () => import('./components/pages/reports-analytics/maintenance-analytics/maintenance-analytics').then((m) => m.MaintenanceAnalyticsPage)
      },
      {
        path: 'reports-analytics/inspection-analytics',
        loadComponent: () => import('./components/pages/reports-analytics/inspection-analytics/inspection-analytics').then((m) => m.InspectionAnalyticsPage)
      },
      {
        path: 'reports-analytics/wip-production-analytics',
        loadComponent: () => import('./components/pages/reports-analytics/wip-production-analytics/wip-production-analytics').then((m) => m.WipProductionAnalyticsPage)
      },
      {
        path: 'reports-analytics/inventory-analytics',
        loadComponent: () => import('./components/pages/reports-analytics/inventory-analytics/inventory-analytics').then((m) => m.InventoryAnalyticsPage)
      },
      {
        path: 'reports-analytics/financial-analytics',
        loadComponent: () => import('./components/pages/reports-analytics/financial-analytics/financial-analytics').then((m) => m.FinancialAnalyticsPage)
      },
      {
        path: 'reports-analytics/compliance-analytics',
        loadComponent: () => import('./components/pages/reports-analytics/compliance-analytics/compliance-analytics').then((m) => m.ComplianceAnalyticsPage)
      },
      {
        path: 'reports-analytics/iot-utilization-analytics',
        loadComponent: () => import('./components/pages/reports-analytics/iot-utilization-analytics/iot-utilization-analytics').then((m) => m.IotUtilizationAnalyticsPage)
      },
      {
        path: 'reports-analytics/predictive-analytics',
        loadComponent: () => import('./components/pages/reports-analytics/predictive-analytics/predictive-analytics').then((m) => m.PredictiveAnalyticsPage)
      },
      {
        path: 'reports-analytics/kpi-dashboard',
        loadComponent: () => import('./components/pages/reports-analytics/kpi-dashboard/kpi-dashboard').then((m) => m.KpiDashboardPage)
      },
      {
        path: 'reports-analytics/data-export-api',
        loadComponent: () => import('./components/pages/reports-analytics/data-export-api/data-export-api').then((m) => m.DataExportApiPage)
      },
      { path: 'locating', redirectTo: 'tracking-iot/real-time-location', pathMatch: 'full' },
      { path: 'events', component: Events },
      { path: 'report', component: Reports },
      { path: 'report/create', component: CreateReport },
      { path: 'report/view/:id', component: ReportView },
      { path: 'process-automation', component: ProcessAutomation },
      { path: 'process-automation/add', component: ProcessAutomationAdd },
      { path: 'administration', component: Administration },
      {
        path: 'administration/organization',
        loadComponent: () => import('./components/pages/administration/organization/organization').then((m) => m.OrganizationPage)
      },
      {
        path: 'administration/user-management',
        loadComponent: () => import('./components/pages/administration/user-management/user-management').then((m) => m.UserManagementPage)
      },
      {
        path: 'administration/role-access-control',
        loadComponent: () => import('./components/pages/administration/role-access-control/role-access-control').then((m) => m.RoleAccessControlPage)
      },
      {
        path: 'administration/module-access',
        loadComponent: () => import('./components/pages/administration/module-access/module-access').then((m) => m.ModuleAccessPage)
      },
      {
        path: 'administration/workflow-builder',
        loadComponent: () => import('./components/pages/administration/workflow-builder/workflow-builder').then((m) => m.WorkflowBuilderPage)
      },
      {
        path: 'administration/notification-templates',
        loadComponent: () => import('./components/pages/administration/notification-templates/notification-templates').then((m) => m.NotificationTemplatesPage)
      },
      {
        path: 'administration/numbering-sequence',
        loadComponent: () => import('./components/pages/administration/numbering-sequence/numbering-sequence').then((m) => m.NumberingSequencePage)
      },
      {
        path: 'administration/checklist-templates',
        loadComponent: () => import('./components/pages/administration/checklist-templates/checklist-templates').then((m) => m.ChecklistTemplatesPage)
      },
      {
        path: 'administration/system-configuration',
        loadComponent: () => import('./components/pages/administration/system-configuration/system-configuration').then((m) => m.SystemConfigurationPage)
      },
      {
        path: 'administration/integration-api',
        loadComponent: () => import('./components/pages/administration/integration-api/integration-api').then((m) => m.IntegrationApiPage)
      },
      {
        path: 'administration/data-import-export',
        loadComponent: () => import('./components/pages/administration/data-import-export/data-import-export').then((m) => m.DataImportExportPage)
      },
      {
        path: 'administration/system-audit-log',
        loadComponent: () => import('./components/pages/administration/system-audit-log/system-audit-log').then((m) => m.SystemAuditLogPage)
      }
    ]
  }
];

