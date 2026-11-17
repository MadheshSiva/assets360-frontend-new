// Headline figures shared by several Reports & Analytics pages, so the same KPI reads the same everywhere.
// Values stay 0 until the reporting API provides them.

export const RA_METRICS = {
  assets: {
    total: 0,
    healthScore: 0,
    utilization: 0,
    availability: 0,
    status: { active: 0, underMaintenance: 0, retired: 0, missing: 0 }
  },
  reliability: {
    mtbfHours: 0,
    mttrHours: 0
  },
  maintenance: {
    cost: 0,
    budget: 0,
    openWorkOrders: 0,
    totalWorkOrders: 0,
    pmCompliance: 0,
    overdueWorkOrders: 0
  },
  inspection: {
    total: 0,
    completionRate: 0,
    openFindings: 0,
    criticalFindings: 0,
    correctiveActionsDue: 0
  },
  compliance: {
    score: 0,
    openAuditFindings: 0,
    expiringCertifications: 0,
    overdueCapa: 0,
    activeRisks: 0,
    capaClosureRate: 0
  },
  inventory: {
    value: 0,
    stockItems: 0,
    turnover: 0,
    belowReorder: 0,
    stockAccuracy: 0
  },
  financial: {
    totalAssetValue: 0,
    capex: 0,
    opex: 0,
    netBookValue: 0
  },
  production: {
    outputUnits: 0,
    wipValue: 0,
    onTimeCompletion: 0,
    equipmentUtilization: 0,
    oee: 0
  },
  iot: {
    connectedAssets: 0,
    avgUtilization: 0,
    telemetryAvailability: 0,
    activeAlerts: 0
  },
  predictive: {
    assetsMonitored: 0,
    highRiskAssets: 0,
    predictedFailures: 0,
    accuracy: 0
  }
};
