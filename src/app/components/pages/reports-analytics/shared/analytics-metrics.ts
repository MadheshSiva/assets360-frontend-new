// DEMO MODE: headline figures shared by several Reports & Analytics pages, so the same KPI reads the
// same everywhere (e.g. Maintenance Cost on Maintenance Analytics, Financial Analytics and the KPI Dashboard).
// Period: 01 Jan 2026 – 28 Oct 2026. Amounts in AED.

export const RA_METRICS = {
  assets: {
    total: 1248,
    healthScore: 87,
    utilization: 78,
    availability: 94.6,
    status: { active: 847, underMaintenance: 225, retired: 125, missing: 51 }
  },
  reliability: {
    mtbfHours: 1284,
    mttrHours: 6.8
  },
  maintenance: {
    cost: 1_860_000,
    budget: 1_720_000,
    openWorkOrders: 86,
    totalWorkOrders: 348,
    pmCompliance: 92,
    overdueWorkOrders: 18
  },
  inspection: {
    total: 3486,
    completionRate: 94.2,
    openFindings: 128,
    criticalFindings: 12,
    correctiveActionsDue: 34
  },
  compliance: {
    score: 93.6,
    openAuditFindings: 42,
    expiringCertifications: 18,
    overdueCapa: 9,
    activeRisks: 16,
    capaClosureRate: 88.4
  },
  inventory: {
    value: 4_820_000,
    stockItems: 8426,
    turnover: 6.8,
    belowReorder: 186,
    stockAccuracy: 97.4
  },
  financial: {
    totalAssetValue: 42_800_000,
    capex: 6_400_000,
    opex: 3_180_000,
    netBookValue: 28_600_000
  },
  production: {
    outputUnits: 48620,
    wipValue: 3_420_000,
    onTimeCompletion: 91.4,
    equipmentUtilization: 78,
    oee: 84.6
  },
  iot: {
    connectedAssets: 1086,
    avgUtilization: 78.6,
    telemetryAvailability: 98.2,
    activeAlerts: 37
  },
  predictive: {
    assetsMonitored: 1086,
    highRiskAssets: 34,
    predictedFailures: 18,
    accuracy: 91.8
  }
} as const;
