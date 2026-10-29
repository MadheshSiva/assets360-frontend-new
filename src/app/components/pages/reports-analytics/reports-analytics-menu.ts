export interface ReportsModule {
  label: string;
  slug: string;
  description: string;
}

export const REPORTS_ANALYTICS_BASE_PATH = '/reports-analytics';

// Sub modules of Reports & Analytics, in sidebar order. Each opens /reports-analytics/<slug>.
export const REPORTS_ANALYTICS_MENU: ReportsModule[] = [
  { label: 'Standard Reports', slug: 'standard-reports', description: 'Ready-made reports for every module.' },
  { label: 'Custom Reports', slug: 'custom-reports', description: 'Build your own reports with fields, filters and grouping.' },
  { label: 'Interactive Dashboards', slug: 'interactive-dashboards', description: 'Drill-down dashboards with live filters.' },
  { label: 'Asset Performance', slug: 'asset-performance', description: 'Availability, utilization, MTBF and asset health.' },
  { label: 'Maintenance Analytics', slug: 'maintenance-analytics', description: 'Work orders, backlog, MTTR and PM compliance.' },
  { label: 'Inspection Analytics', slug: 'inspection-analytics', description: 'Inspection results, defects and pass rates.' },
  { label: 'WIP / Production Analytics', slug: 'wip-production-analytics', description: 'Job progress, throughput, delays and output.' },
  { label: 'Inventory Analytics', slug: 'inventory-analytics', description: 'Stock levels, consumption, turnover and reorders.' },
  { label: 'Financial Analytics', slug: 'financial-analytics', description: 'Asset value, depreciation and maintenance cost.' },
  { label: 'Compliance Analytics', slug: 'compliance-analytics', description: 'Certificates, audits, expiries and compliance score.' },
  { label: 'IoT / Utilization Analytics', slug: 'iot-utilization-analytics', description: 'Sensor data, tag activity and usage hours.' },
  { label: 'Predictive Analytics', slug: 'predictive-analytics', description: 'Failure risk, forecasts and anomaly detection.' },
  { label: 'KPI Dashboard', slug: 'kpi-dashboard', description: 'Key performance indicators against targets.' },
  { label: 'Data Export / API', slug: 'data-export-api', description: 'Scheduled exports, data feeds and reporting API.' }
];
