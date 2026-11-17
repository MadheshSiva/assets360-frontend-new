import { Routes } from '@angular/router';
import { OrganizationPage } from './organization/organization/organization';
import { BusinessUnitPage } from './organization/business-unit/business-unit';
import { DepartmentPage } from './organization/department/department';
import { SitePage } from './organization/site/site';
import { BuildingFloorZonePage } from './organization/building-floor-zone/building-floor-zone';
import { LocationPage } from './organization/location/location';
import { CategorySubcategoryPage } from './asset/category-subcategory/category-subcategory';
import { AssetTypePage } from './asset/asset-type/asset-type';
import { AssetSubTypePage } from './asset/asset-sub-type/asset-sub-type';
import { AssetModelPage } from './asset/asset-model/asset-model';
import { ManufacturerPage } from './asset/manufacturer/manufacturer';
import { ConditionPage } from './asset/condition/condition';
import { CriticalityPage } from './asset/criticality/criticality';
import { EmployeePage } from './people/employee/employee';
import { TechnicianPage } from './people/technician/technician';
import { SkillPage } from './people/skill/skill';
import { TeamPage } from './people/team/team';
import { ShiftPage } from './people/shift/shift';
import { SupplierPage } from './vendor/supplier/supplier';
import { ServiceProviderPage } from './vendor/service-provider/service-provider';
import { AmcVendorPage } from './vendor/amc-vendor/amc-vendor';
import { MaintenanceTypePage } from './maintenance/maintenance-type/maintenance-type';
import { WorkTypePage } from './maintenance/work-type/work-type';
import { FailureCodePage } from './maintenance/failure-code/failure-code';
import { TaskTemplatePage } from './maintenance/task-template/task-template';
import { ChecklistPage } from './maintenance/checklist/checklist';
import { PrioritySeverityPage } from './maintenance/priority-severity/priority-severity';
import { ItemPage } from './inventory/item/item';
import { ItemCategoryPage } from './inventory/item-category/item-category';
import { UomPage } from './inventory/uom/uom';
import { WarehouseStoreBinPage } from './inventory/warehouse-store-bin/warehouse-store-bin';
import { StockStatusPage } from './inventory/stock-status/stock-status';
import { CertificationTypePage } from './compliance/certification-type/certification-type';
import { RegulationPage } from './compliance/regulation/regulation';
import { StandardPage } from './compliance/standard/standard';
import { PermitTypePage } from './compliance/permit-type/permit-type';
import { ApiSyncStatusPage } from './system-configuration/api-sync-status/api-sync-status';
import { UpdateSourcePage } from './system-configuration/update-source/update-source';
import { ChartTypePage } from './system-configuration/chart-type/chart-type';
import { SystemSettingsPage } from './system-configuration/system-settings/system-settings';
import { PermissionMasterPage } from './security/permission-master/permission-master';
import { ModuleAccessMasterPage } from './security/module-access-master/module-access-master';
import { RoleMasterPage } from './security/role-master/role-master';
import { UserManagementPage } from './security/user-management/user-management';

// Paths match MASTER_DATA_MENU in shared-ui, which the shell's sidebar is built from.
// There are no module or group landing pages: bare paths redirect to the group's first master.
export const routes: Routes = [
  { path: '', redirectTo: 'organization/organization', pathMatch: 'full' },
  {
    path: 'organization',
    children: [
      { path: '', redirectTo: 'organization', pathMatch: 'full' },
      { path: 'organization', component: OrganizationPage },
      { path: 'business-unit', component: BusinessUnitPage },
      { path: 'department', component: DepartmentPage },
      { path: 'site', component: SitePage },
      { path: 'building-floor-zone', component: BuildingFloorZonePage },
      { path: 'location', component: LocationPage }
    ]
  },
  {
    path: 'asset',
    children: [
      { path: '', redirectTo: 'category-subcategory', pathMatch: 'full' },
      { path: 'category-subcategory', component: CategorySubcategoryPage },
      { path: 'asset-type', component: AssetTypePage },
      { path: 'asset-sub-type', component: AssetSubTypePage },
      { path: 'asset-model', component: AssetModelPage },
      { path: 'manufacturer', component: ManufacturerPage },
      { path: 'condition', component: ConditionPage },
      { path: 'criticality', component: CriticalityPage }
    ]
  },
  {
    path: 'people',
    children: [
      { path: '', redirectTo: 'employee', pathMatch: 'full' },
      { path: 'employee', component: EmployeePage },
      { path: 'technician', component: TechnicianPage },
      { path: 'skill', component: SkillPage },
      { path: 'team', component: TeamPage },
      { path: 'shift', component: ShiftPage }
    ]
  },
  {
    path: 'vendor',
    children: [
      { path: '', redirectTo: 'supplier', pathMatch: 'full' },
      { path: 'supplier', component: SupplierPage },
      { path: 'service-provider', component: ServiceProviderPage },
      { path: 'amc-vendor', component: AmcVendorPage }
    ]
  },
  {
    path: 'maintenance',
    children: [
      { path: '', redirectTo: 'maintenance-type', pathMatch: 'full' },
      { path: 'maintenance-type', component: MaintenanceTypePage },
      { path: 'work-type', component: WorkTypePage },
      { path: 'failure-code', component: FailureCodePage },
      { path: 'task-template', component: TaskTemplatePage },
      { path: 'checklist', component: ChecklistPage },
      { path: 'priority-severity', component: PrioritySeverityPage }
    ]
  },
  {
    path: 'inventory',
    children: [
      { path: '', redirectTo: 'item', pathMatch: 'full' },
      { path: 'item', component: ItemPage },
      { path: 'item-category', component: ItemCategoryPage },
      { path: 'uom', component: UomPage },
      { path: 'warehouse-store-bin', component: WarehouseStoreBinPage },
      { path: 'stock-status', component: StockStatusPage }
    ]
  },
  {
    path: 'compliance',
    children: [
      { path: '', redirectTo: 'certification-type', pathMatch: 'full' },
      { path: 'certification-type', component: CertificationTypePage },
      { path: 'regulation', component: RegulationPage },
      { path: 'standard', component: StandardPage },
      { path: 'permit-type', component: PermitTypePage }
    ]
  },
  {
    path: 'system-configuration',
    children: [
      { path: '', redirectTo: 'api-sync-status', pathMatch: 'full' },
      { path: 'api-sync-status', component: ApiSyncStatusPage },
      { path: 'update-source', component: UpdateSourcePage },
      { path: 'chart-type', component: ChartTypePage },
      { path: 'system-settings', component: SystemSettingsPage }
    ]
  },
  {
    path: 'security',
    children: [
      { path: '', redirectTo: 'permission-master', pathMatch: 'full' },
      { path: 'permission-master', component: PermissionMasterPage },
      { path: 'module-access-master', component: ModuleAccessMasterPage },
      { path: 'role-master', component: RoleMasterPage },
      { path: 'user-management', component: UserManagementPage }
    ]
  }
];
