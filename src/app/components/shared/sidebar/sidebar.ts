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
  Settings,
  Database
} from 'lucide-angular';
import { MASTER_DATA_BASE_PATH, MASTER_DATA_MENU } from 'shared-ui';
import { ADMINISTRATION_BASE_PATH, ADMINISTRATION_MENU } from '../../pages/administration/administration-menu';
import { REPORTS_ANALYTICS_BASE_PATH, REPORTS_ANALYTICS_MENU } from '../../pages/reports-analytics/reports-analytics-menu';

export interface NavItem {
  label: string;
  path: string;
  // Lucide icon, only used for top-level items
  icon?: LucideIconData;
  children?: NavItem[];
  // The item has its own page: clicking it opens that page as well as its submenu
  hasPage?: boolean;
  // Expand inline under the item even though the submenu has a second level
  inline?: boolean;
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
        { label: 'Asset Categories', path: '/assets/categories' },
        { label: 'Asset Types & Models', path: '/assets/types-models' },
        { label: 'Asset Hierarchy', path: '/assets/hierarchy' },
        { label: 'Asset Components', path: '/assets/components' },
        { label: 'Location History', path: '/assets/location-history' },
        { label: 'Assignment', path: '/assets/assignment' },
        { label: 'Maintenance', path: '/assets/maintenance' },
        { label: 'Service Requests', path: '/assets/service-requests' },
        { label: 'Asset Audit', path: '/assets/audit' },
        { label: 'Disposal', path: '/assets/disposal' },
        { label: 'Custom Fields', path: '/assets/custom-fields' },
        { label: 'Asset Lifecycle', path: '/assets/lifecycle' },
        { label: 'Asset Relationship', path: '/assets/asset-relationships' },
        { label: 'Asset Documents', path: '/assets/all-documents' },
        { label: 'Asset Images', path: '/assets/all-images' },
        { label: 'Asset Status & Condition', path: '/assets/status-condition' },
        { label: 'Asset Criticality', path: '/assets/criticality' },
        { label: 'Asset Health Score', path: '/assets/health-score' },
        { label: 'Bulk Import / Export', path: '/assets/bulk-import-export' },
        { label: 'Asset Merge / Dedup', path: '/assets/merge-dedup' }
      ]
    },
    {
      label: 'Tracking & IoT',
      path: '/tracking-iot',
      icon: RadioTower,
      children: [
        { label: 'Tag Management', path: '/tracking-iot/tag-management' },
        { label: 'Tag IDs', path: '/tracking-iot/tag-ids' },
        { label: 'IoT Device Management', path: '/tracking-iot/device-management' },
        { label: 'Device Type & Model', path: '/tracking-iot/device-type-model' },
        { label: 'Gateways', path: '/tracking-iot/gateways' },
        { label: 'Device Configuration', path: '/tracking-iot/device-configuration' },
        { label: 'Device Health & Status', path: '/tracking-iot/device-health' },
        { label: 'Firmware & Connectivity', path: '/tracking-iot/firmware-connectivity' },
        { label: 'Sensor Management', path: '/tracking-iot/sensor-management' },
        { label: 'Tracking & Telemetry', path: '/tracking-iot/tracking-telemetry' },
        { label: 'Real-Time Location', path: '/tracking-iot/real-time-location' },
        { label: 'Geofence & Alerts', path: '/tracking-iot/geofence-alerts' },
        { label: 'Analytics & Insights', path: '/tracking-iot/analytics-insights' },
        { label: 'Device Maintenance', path: '/tracking-iot/device-maintenance' },
        { label: 'Device Replacement', path: '/tracking-iot/device-replacement' }
      ]
    },
    { label: 'Movement & Custody', path: '/movement-custody', icon: ArrowLeftRight },
    { label: 'Maintenance', path: '/maintenance', icon: Wrench },
    { label: 'Inspection', path: '/inspection', icon: ClipboardCheck },
    { label: 'Inventory', path: '/inventory', icon: Warehouse },
    {
      label: 'WIP / Operations',
      path: '/wip-operations',
      icon: Factory,
      children: [
        { label: 'Job Templates', path: '/wip-operations/job-templates' },
        { label: 'Job Orders', path: '/wip-operations/job-orders' },
        { label: 'Process & Routing', path: '/wip-operations/process-routing' },
        { label: 'Task Master', path: '/wip-operations/task-master' },
        { label: 'Resources', path: '/wip-operations/resources' },
        { label: 'Material Consumption', path: '/wip-operations/material-consumption' },
        { label: 'Location Management', path: '/wip-operations/location-management' },
        { label: 'Asset Linking', path: '/wip-operations/asset-linking' },
        { label: 'SLA Management', path: '/wip-operations/sla-management' },
        { label: 'Issues & Delays', path: '/wip-operations/issues-delays' },
        { label: 'Permit / Compliance', path: '/wip-operations/permit-compliance' },
        { label: 'Progress Log', path: '/wip-operations/progress-log' },
        { label: 'Product / Output', path: '/wip-operations/product-output' }
      ]
    },
    { label: 'Audit & Compliance', path: '/audit-compliance', icon: ShieldCheck },
    { label: 'Contracts & Warranty', path: '/contracts-warranty', icon: FilePen },
    { label: 'Financial', path: '/financial', icon: CircleDollarSign },
    {
      label: 'Reports & Analytics',
      path: REPORTS_ANALYTICS_BASE_PATH,
      icon: ChartColumn,
      hasPage: true,
      children: REPORTS_ANALYTICS_MENU.map((m) => ({ label: m.label, path: `${REPORTS_ANALYTICS_BASE_PATH}/${m.slug}` }))
    },
    // { label: 'Locating', path: '/locating', icon: this.assetUrl('trackingpurple.png') },
    // { label: 'Events', path: '/events', icon: this.assetUrl('Events-purple.png') },
    // { label: 'Report', path: '/report', icon: this.assetUrl('reports-purple.png') },
    // { label: 'Process & Automation', path: '/process-automation', icon: this.assetUrl('Process&auto-purple.png') },
    {
      label: 'Administration',
      path: ADMINISTRATION_BASE_PATH,
      icon: Settings,
      hasPage: true,
      children: ADMINISTRATION_MENU.map((m) => ({ label: m.label, path: `${ADMINISTRATION_BASE_PATH}/${m.slug}` }))
    },
    {
      label: 'Master Data Management',
      path: MASTER_DATA_BASE_PATH,
      icon: Database,
      hasPage: true,
      inline: true,
      children: MASTER_DATA_MENU.map((group) => ({
        label: group.label,
        path: `${MASTER_DATA_BASE_PATH}/${group.slug}`,
        hasPage: true,
        children: group.items.map((item) => ({
          label: item.label,
          path: `${MASTER_DATA_BASE_PATH}/${group.slug}/${item.slug}`
        }))
      }))
    }
  ];

  // labels of the top-level items whose submenu is expanded inline inside the sidebar (e.g. 'Assets')
  openInline = new Set<string>();
  // path of the second-level group expanded inside an inline menu (e.g. '/master-data-management/asset')
  openInlineGroup: string | null = null;

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
          .forEach((item) => {
            this.openInline.add(item.label);
            const activeGroup = item.children?.find((child) => child.children && this.isSectionActive(child));
            if (activeGroup) this.openInlineGroup = activeGroup.path;
          });
      });
  }

  // Items with a single level of children expand inline; deeper menus (Administration) keep the flyout
  // unless they opt in with `inline`
  isInline(item: NavItem): boolean {
    return !!item.children?.length && (!!item.inline || item.children.every((child) => !child.children));
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
    // Items with their own page open it and expand; clicking again while on that page collapses
    if (item.hasPage && this.router.url.split('?')[0] !== item.path) {
      this.openInline.add(item.label);
      this.router.navigate([item.path]);
      return;
    }
    if (this.openInline.has(item.label)) {
      this.openInline.delete(item.label);
    } else {
      this.openInline.add(item.label);
    }
  }

  isInlineGroupOpen(group: NavItem): boolean {
    return this.openInlineGroup === group.path;
  }

  // Second-level groups (e.g. Master Data Management > Asset): one open at a time. Clicking a
  // closed group opens it and its overview page; clicking an open group just closes it.
  toggleInlineGroup(group: NavItem): void {
    if (this.isInlineGroupOpen(group)) {
      this.openInlineGroup = null;
      return;
    }
    this.openInlineGroup = group.path;
    if (group.hasPage && this.router.url.split('?')[0] !== group.path) {
      this.router.navigate([group.path]);
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