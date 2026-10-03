import { Component, ElementRef, HostListener, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import {
  LucideAngularModule,
  LucideIconData,
  LayoutDashboard,
  Boxes,
  RadioTower,
  ArrowLeftRight,
  Wrench,
  ClipboardCheck,
  Warehouse,
  Factory,
  ShieldCheck,
  FilePen,
  CircleDollarSign,
  ChartColumn,
  Settings
} from 'lucide-angular';

export interface NavItem {
  label: string;
  path: string;
  // Lucide icon, only used for top-level items
  icon?: LucideIconData;
  children?: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar-component.scss'],
  host: {
    '[class.collapsed]': 'collapsed'
  }
})
export class Sidebar {
  @Output() collapsedChange = new EventEmitter<boolean>();
  collapsed = false;
  isCollapsing = false;

  // label of the top-level item whose flyout is open (e.g. 'Administration')
  openDropdown: string | null = null;
  // label of the nested sub-item that's expanded inside the open flyout (e.g. 'User Management')
  openSubDropdown: string | null = null;
  // label of the third-level item expanded inside the open sub-dropdown (e.g. 'Assets')
  openSubSubDropdown: string | null = null;
  // viewport coordinates for the currently open flyout, computed from the clicked trigger element
  flyoutPosition: { top: number; left: number } | null = null;

  navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    {
      label: 'Assets',
      path: '/assets',
      icon: Boxes,
      children: [
        { label: 'Asset Registration', path: '/assets/registration' },
        { label: 'Asset List', path: '/assets/list' },
        { label: 'Location History', path: '/assets/location-history' },
        { label: 'Assignment', path: '/assets/assignment' },
        { label: 'Maintenance', path: '/assets/maintenance' },
        { label: 'Service Requests', path: '/assets/service-requests' },
        { label: 'Asset Audit', path: '/assets/audit' },
        { label: 'Disposal', path: '/assets/disposal' }
      ]
    },
    {
      label: 'Tracking & IoT',
      path: '/tracking-iot',
      icon: RadioTower,
      children: [
        { label: 'Real-time Location', path: '/tracking-iot/real-time-location' }
      ]
    },
    { label: 'Movement & Custody', path: '/movement-custody', icon: ArrowLeftRight },
    { label: 'Maintenance', path: '/maintenance', icon: Wrench },
    { label: 'Inspection', path: '/inspection', icon: ClipboardCheck },
    { label: 'Inventory', path: '/inventory', icon: Warehouse },
    { label: 'WIP / Operations', path: '/wip-operations', icon: Factory },
    { label: 'Audit & Compliance', path: '/audit-compliance', icon: ShieldCheck },
    { label: 'Contracts & Warranty', path: '/contracts-warranty', icon: FilePen },
    { label: 'Financial', path: '/financial', icon: CircleDollarSign },
    { label: 'Reports & Analytics', path: '/reports-analytics', icon: ChartColumn },
    // { label: 'Locating', path: '/locating', icon: this.assetUrl('trackingpurple.png') },
    // { label: 'Events', path: '/events', icon: this.assetUrl('Events-purple.png') },
    // { label: 'Report', path: '/report', icon: this.assetUrl('reports-purple.png') },
    // { label: 'Process & Automation', path: '/process-automation', icon: this.assetUrl('Process&auto-purple.png') },
    {
      label: 'Administration',
      path: '/administration',
      icon: Settings,
      children: [
        {
          label: 'Configuration',
          path: '/administration/configuration',
          children: [
            { label: 'Project', path: '/administration/configuration/projects' },
            { label: 'Devices', path: '/administration/configuration/devices' },
            {
              label: 'Assets',
              path: '/administration/configuration/assets',
              children: [
                { label: 'Asset registration', path: '/administration/configuration/assets/asset-registry' },
                { label: 'Location History', path: '/administration/configuration/assets/location-history' },
                { label: 'Assignment / Ownership', path: '/administration/configuration/assets/assignment-ownership' },
                { label: 'Asset Lifecycle', path: '/administration/configuration/assets/asset-lifecycle' },
                { label: 'Tracking & Telemetry', path: '/administration/configuration/assets/tracking-telemetry' },
                { label: 'Maintenance & Service', path: '/administration/configuration/assets/maintenance-service' },
                { label: 'Utilization & Performance', path: '/administration/configuration/assets/utilization-performance' },
                { label: 'Financial', path: '/administration/configuration/assets/financial' },
                { label: 'Document & Attachment', path: '/administration/configuration/assets/document-attachment' },
                { label: 'Warranty & Contract', path: '/administration/configuration/assets/warranty-contract' },
                { label: 'Alert & Incident', path: '/administration/configuration/assets/alert-incident' },
                { label: 'Audit & Verification', path: '/administration/configuration/assets/audit-verification' },
                { label: 'Activity / Audit Trail', path: '/administration/configuration/assets/activity-audit-trail' },
                { label: 'Custom / Domain-specific Asset Type Fields', path: '/administration/configuration/assets/custom-domain-fields' },
                { label: 'Integration', path: '/administration/configuration/assets/integration' },
                { label: 'Compliance & Certification', path: '/administration/configuration/assets/compliance-certification' },
                { label: 'Assets Audit', path: '/administration/configuration/assets/assets-audit' },
                { label: 'Asset Movement', path: '/administration/configuration/assets/asset-movement' },
                { label: 'Asset Disposal', path: '/administration/configuration/assets/asset-disposal' },
                { label: 'Tagged Assets', path: '/administration/configuration/assets/tagged-assets' },
                { label: 'Asset Check-Out', path: '/administration/configuration/assets/asset-checkout' },
                { label: 'Asset Check-In', path: '/administration/configuration/assets/asset-checkin' }
              ]
            },
            {
              label: 'Maintenance',
              path: '/administration/configuration/maintenance',
              children: [
                { label: 'Work Order', path: '/administration/configuration/maintenance/work-order' },
                { label: 'Maintenance Task', path: '/administration/configuration/maintenance/maintenance-task' },
                { label: 'Preventive Maintenance', path: '/administration/configuration/maintenance/preventive-maintenance' },
                { label: 'Predictive Maintenance', path: '/administration/configuration/maintenance/predictive-maintenance' },
                { label: 'Breakdown / Issue Reporting', path: '/administration/configuration/maintenance/breakdown-issue-reporting' },
                { label: 'Spare Parts', path: '/administration/configuration/maintenance/spare-parts' },
                { label: 'Technician', path: '/administration/configuration/maintenance/technician' },
                { label: 'Vendor / AMC', path: '/administration/configuration/maintenance/vendor-amc' },
                { label: 'Cost Tracking', path: '/administration/configuration/maintenance/cost-tracking' },
                { label: 'Downtime Tracking', path: '/administration/configuration/maintenance/downtime-tracking' },
                { label: 'Performance', path: '/administration/configuration/maintenance/performance' },
                { label: 'Compliance & Inspection', path: '/administration/configuration/maintenance/compliance-inspection' }
              ]
            },
            {
              label: 'Workflows',
              path: '/administration/configuration/workflows',
              children: [
                { label: 'Workflow List', path: '/administration/configuration/workflows/list' },
                { label: 'Workflow Builder', path: '/administration/configuration/workflows/builder' },
                { label: 'Workflow Instances', path: '/administration/configuration/workflows/instances' },
                { label: 'My Tasks / Approvals', path: '/administration/configuration/workflows/tasks' },
                { label: 'Insights', path: '/administration/configuration/workflows/insights' }
              ]
            },
            {
              label: 'WIP',
              path: '/administration/configuration/wip',
              children: [
                { label: 'Job Master', path: '/administration/configuration/wip/job-master' },
                { label: 'Status Master', path: '/administration/configuration/wip/status-master' },
                { label: 'Resource Master', path: '/administration/configuration/wip/resource-master' },
                { label: 'Task Master', path: '/administration/configuration/wip/task-master' },
                { label: 'Checklist Master', path: '/administration/configuration/wip/checklist-master' },
                { label: 'Checklist Items', path: '/administration/configuration/wip/checklist-items' },
                { label: 'Location Master', path: '/administration/configuration/wip/location-master' },
                { label: 'Asset Linking', path: '/administration/configuration/wip/asset-linking' },
                { label: 'SLA Master', path: '/administration/configuration/wip/sla-master' },
                { label: 'Issue / Delay', path: '/administration/configuration/wip/issue-delay' },
                { label: 'Material Consumption', path: '/administration/configuration/wip/material-consumption' },
                { label: 'Permit / Compliance', path: '/administration/configuration/wip/permit-compliance' },
                { label: 'Progress Log', path: '/administration/configuration/wip/progress-log' },
                { label: 'Alerts', path: '/administration/configuration/wip/alerts' },
                { label: 'KPI Config', path: '/administration/configuration/wip/kpi-config' },
                { label: 'Role & Access', path: '/administration/configuration/wip/role-access' }
              ]
            },
            {
              label: 'Inspection',
              path: '/administration/configuration/inspection',
              children: [
                { label: 'Inspection Type', path: '/administration/configuration/inspection/inspection-type' },
                { label: 'Task Category', path: '/administration/configuration/inspection/task-category' },
                { label: 'Inspection Task', path: '/administration/configuration/inspection/inspection-task' },
                { label: 'Checklist', path: '/administration/configuration/inspection/checklist-template/list' },
                { label: 'Failure Reason', path: '/administration/configuration/inspection/failure-reason' },
                { label: 'Defect', path: '/administration/configuration/inspection/defect' },
                { label: 'Severity', path: '/administration/configuration/inspection/severity' },
                { label: 'Priority', path: '/administration/configuration/inspection/priority' },
                { label: 'Signature and Stamp', path: '/administration/configuration/inspection/signature-stamp' },
                { label: 'Notification Template', path: '/administration/configuration/inspection/notification-template' },
                { label: 'Report Template', path: '/administration/configuration/inspection/report-template' },
                { label: 'Numbering Sequence', path: '/administration/configuration/inspection/numbering-sequence' },
                { label: 'Holiday and Working Calendar', path: '/administration/configuration/inspection/holiday-calendar' }
              ]
            },
            {
              label: 'Master Management',
              path: '/administration/configuration/master-management',
              children: [
                { label: 'Organization', path: '/administration/configuration/master-management/organization' },
                { label: 'Business Unit', path: '/administration/configuration/master-management/business-unit' },
                { label: 'Department', path: '/administration/configuration/master-management/department' },
                { label: 'Site', path: '/administration/configuration/master-management/site' },
                { label: 'Manufacturer', path: '/administration/configuration/master-management/manufacturer' },
                { label: 'Supplier', path: '/administration/configuration/master-management/supplier' },
                { label: 'Master Maintenance', path: '/administration/configuration/master-management/master-maintenance' },
                { label: 'Category / Sub-category', path: '/administration/configuration/master-management/category-subcategory' },
                { label: 'Asset Type', path: '/administration/configuration/master-management/asset-type' },
                { label: 'Assigned Custodian / Department', path: '/administration/configuration/master-management/assigned-custodian-department' },
                { label: 'Current Location', path: '/administration/configuration/master-management/current-location' },
                { label: 'Status Changes', path: '/administration/configuration/master-management/status-changes' },
                { label: 'Tag IDs', path: '/administration/configuration/master-management/tag-ids' },
                { label: 'Depreciation Method', path: '/administration/configuration/master-management/depreciation-method' },
                { label: 'Cost Center', path: '/administration/configuration/master-management/cost-center' },
                { label: 'Alert Type', path: '/administration/configuration/master-management/alert-type' },
                { label: 'Resolution Status', path: '/administration/configuration/master-management/resolution-status' },
                { label: 'Auditor Details', path: '/administration/configuration/master-management/auditor-details' },
                { label: 'Physical Verification Result', path: '/administration/configuration/master-management/physical-verification-result' },
                { label: 'Asset Type Fields', path: '/administration/configuration/master-management/asset-type-fields' },
                { label: 'API Sync Status Master', path: '/administration/configuration/master-management/api-sync-status-master' },
                { label: 'Certification Type Master', path: '/administration/configuration/master-management/certification-type-master' },
                { label: 'Work Type', path: '/administration/configuration/master-management/work-type' },
                { label: 'Priority', path: '/administration/configuration/master-management/priority' },
                { label: 'Status', path: '/administration/configuration/master-management/status' },
                { label: 'Resource Type', path: '/administration/configuration/master-management/resource-type' },
                { label: 'Skill Master', path: '/administration/configuration/master-management/skill-master' },
                { label: 'Shift Master', path: '/administration/configuration/master-management/shift-master' },
                { label: 'Checklist Type Master', path: '/administration/configuration/master-management/checklist-type-master' },
                { label: 'Response Type Master', path: '/administration/configuration/master-management/response-type-master' },
                { label: 'Condition Master', path: '/administration/configuration/master-management/condition-master' },
                { label: 'Issue Type Master', path: '/administration/configuration/master-management/issue-type-master' },
                { label: 'Severity Master', path: '/administration/configuration/master-management/severity-master' },
                { label: 'Unit Master', path: '/administration/configuration/master-management/unit-master' },
                { label: 'Permit Type Master', path: '/administration/configuration/master-management/permit-type-master' },
                { label: 'Update Source Master', path: '/administration/configuration/master-management/update-source-master' },
                { label: 'Chart Type Master', path: '/administration/configuration/master-management/chart-type-master' },
                { label: 'Permission Master', path: '/administration/configuration/master-management/permission-master' },
                { label: 'Module Access Master', path: '/administration/configuration/master-management/module-access-master' }
              ]
            },
          ]
        },
        { label: 'License', path: '/administration/license' },
        {
          label: 'User Management',
          path: '/administration/user-management',
          children: [
            { label: 'User', path: '/administration/user-management/user' },
            { label: 'Role', path: '/administration/user-management/role' }
          ]
        }
      ]
    }
  ];

  // labels of the top-level items whose submenu is expanded inline inside the sidebar (e.g. 'Assets')
  openInline = new Set<string>();

  constructor(private router: Router, private elementRef: ElementRef) {
    // Keep the section that contains the current page expanded, including on first load / deep links
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.navItems
          .filter((item) => this.isInline(item) && this.isSectionActive(item))
          .forEach((item) => this.openInline.add(item.label));
      });
  }

  // Items with a single level of children expand inline; deeper menus (Administration) keep the flyout
  isInline(item: NavItem): boolean {
    return !!item.children?.length && item.children.every((child) => !child.children);
  }

  // True when the current page is this item's page or one of its sub pages
  isSectionActive(item: NavItem): boolean {
    const url = this.router.url.split('?')[0];
    return url === item.path || url.startsWith(item.path + '/');
  }

  isInlineOpen(label: string): boolean {
    return !this.collapsed && this.openInline.has(label);
  }

  // Inline items expand in place; when the sidebar is collapsed there is no room, so they use the flyout
  toggleInline(item: NavItem, triggerEl: EventTarget | null): void {
    if (this.collapsed) {
      this.toggleDropdown(item.label, triggerEl);
      return;
    }
    if (this.openInline.has(item.label)) {
      this.openInline.delete(item.label);
    } else {
      this.openInline.add(item.label);
    }
  }

  private assetUrl(fileName: string): string {
    return `/assets/${encodeURIComponent(fileName)}`;
  }

  toggleCollapse(): void {
    this.isCollapsing = true;
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
    setTimeout(() => {
      this.isCollapsing = false;
    }, 200);
  }

  // Opens/closes the top-level flyout (e.g. clicking "Administration")
  // `triggerEl` is the clicked row element (passed as $event.currentTarget from the
  // template, which TypeScript types as EventTarget | null), used to position the
  // fixed flyout beside it.
  toggleDropdown(label: string, triggerEl: EventTarget | null): void {
    if (this.openDropdown === label) {
      this.openDropdown = null;
      this.openSubDropdown = null;
      this.openSubSubDropdown = null;
      this.flyoutPosition = null;
      return;
    }

    if (!(triggerEl instanceof HTMLElement)) {
      // Defensive fallback: still open the dropdown, just without a measured
      // position (template guards on `flyoutPosition` before rendering anyway).
      this.openDropdown = label;
      this.openSubDropdown = null;
      this.openSubSubDropdown = null;
      this.flyoutPosition = null;
      return;
    }

    const sidebar = document.querySelector('.sidebar');
    const width = sidebar?.getBoundingClientRect().width || 280;

    this.flyoutPosition = {
      top: 0,
      left: width
    };
    this.openDropdown = label;
    this.openSubDropdown = null;
    this.openSubSubDropdown = null;
  }

  isDropdownOpen(label: string): boolean {
    return this.openDropdown === label;
  }

  // Expands/collapses a nested item inside the open flyout (e.g. "User Management")
  toggleSubDropdown(label: string): void {
    this.openSubDropdown = this.openSubDropdown === label ? null : label;
    this.openSubSubDropdown = null;
  }

  isSubDropdownOpen(label: string): boolean {
    return this.openSubDropdown === label;
  }

  // Expands/collapses a third-level item inside the open sub-dropdown (e.g. "Assets")
  toggleSubSubDropdown(label: string): void {
    this.openSubSubDropdown = this.openSubSubDropdown === label ? null : label;
  }

  isSubSubDropdownOpen(label: string): boolean {
    return this.openSubSubDropdown === label;
  }

  // Navigates to a leaf item's route and closes the whole flyout stack
  navigateAndClose(path: string): void {
    this.openDropdown = null;
    this.openSubDropdown = null;
    this.openSubSubDropdown = null;
    this.flyoutPosition = null;
    this.router.navigateByUrl(path);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.openDropdown || !event.target) {
      return;
    }
    const clickedInsideSidebar = this.elementRef.nativeElement.contains(event.target);
    const clickedInsideFlyout = !!(event.target as HTMLElement).closest('.nav-flyout');
    if (!clickedInsideSidebar && !clickedInsideFlyout) {
      this.openDropdown = null;
      this.openSubDropdown = null;
      this.openSubSubDropdown = null;
      this.flyoutPosition = null;
    }
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    // Fixed-position flyouts go stale on scroll/resize since they no longer
    // track the trigger; simplest correct behavior is to close them.
    if (this.openDropdown) {
      this.openDropdown = null;
      this.openSubDropdown = null;
      this.openSubSubDropdown = null;
      this.flyoutPosition = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.openDropdown) {
      this.openDropdown = null;
      this.openSubDropdown = null;
      this.openSubSubDropdown = null;
      this.flyoutPosition = null;
    }
  }
}