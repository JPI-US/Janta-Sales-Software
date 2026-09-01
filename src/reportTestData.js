import {
  CRM_DEAL_TYPE_PILOT,
  CRM_DEAL_TYPE_RESIDENTIAL,
  CRM_PRIORITY_HIGH,
  CRM_PRIORITY_LOW,
  CRM_PRIORITY_MEDIUM,
  CRM_PROJECT_TYPE_COMMERCIAL,
  CRM_PROJECT_TYPE_UTILITY,
  CRM_FINANCING_LOAN,
  CRM_FINANCING_PPA,
  CRM_FINANCING_SELF_PAY,
  CRM_STAGE_APPROVED,
  CRM_STAGE_CREATED,
  CRM_STAGE_DRAFTING,
  CRM_STAGE_NEGOTIATION,
  CRM_STAGE_NEEDS_FOLLOW_UP,
  CRM_STAGE_REVISION,
  CRM_STAGE_SENT,
} from "../shared/proposalCrmFields.js";
import {
  aggregateSalesReport,
  getQuarterlyPeriod,
  listMonthsInPeriod,
  shiftQuarterlyPeriod,
} from "../shared/reportMetrics.js";

const FINANCING_CYCLE = [CRM_FINANCING_SELF_PAY, CRM_FINANCING_PPA, CRM_FINANCING_LOAN];

const SAMPLE_PROJECTS = [
  { title: "Sonoran Mesa Utility", dealType: CRM_PROJECT_TYPE_UTILITY, kw: 9200, revenue: 19_800_000, stage: CRM_STAGE_NEGOTIATION, likelihood: 80, priority: CRM_PRIORITY_HIGH, monthOffset: 0 },
  { title: "Harbor Logistics Center", dealType: CRM_PROJECT_TYPE_COMMERCIAL, kw: 680, revenue: 1_420_000, stage: CRM_STAGE_SENT, likelihood: 65, priority: CRM_PRIORITY_MEDIUM, monthOffset: 0 },
  { title: "Greenfield Pilot Array", dealType: CRM_DEAL_TYPE_PILOT, kw: 45, revenue: 185_000, stage: CRM_STAGE_APPROVED, likelihood: 55, priority: CRM_PRIORITY_LOW, monthOffset: 1 },
  { title: "Maple Street Residence", dealType: CRM_DEAL_TYPE_RESIDENTIAL, kw: 12, revenue: 42_000, stage: CRM_STAGE_DRAFTING, likelihood: 40, priority: CRM_PRIORITY_LOW, monthOffset: 2 },
  { title: "Prairie Wind Cooperative", dealType: CRM_PROJECT_TYPE_UTILITY, kw: 5400, revenue: 11_200_000, stage: CRM_STAGE_SENT, likelihood: 70, priority: CRM_PRIORITY_HIGH, monthOffset: 1 },
  { title: "Northgate Retail Park", dealType: CRM_PROJECT_TYPE_COMMERCIAL, kw: 320, revenue: 780_000, stage: CRM_STAGE_REVISION, likelihood: 45, priority: CRM_PRIORITY_MEDIUM, monthOffset: 0 },
  { title: "Summit School District", dealType: CRM_PROJECT_TYPE_COMMERCIAL, kw: 890, revenue: 2_050_000, stage: CRM_STAGE_NEGOTIATION, likelihood: 75, priority: CRM_PRIORITY_HIGH, monthOffset: 1 },
  { title: "Canyon Ridge Homes", dealType: CRM_DEAL_TYPE_RESIDENTIAL, kw: 8, revenue: 28_500, stage: CRM_STAGE_CREATED, likelihood: 25, priority: CRM_PRIORITY_LOW, monthOffset: 2 },
  { title: "Delta Industrial Park", dealType: CRM_PROJECT_TYPE_COMMERCIAL, kw: 1200, revenue: 2_880_000, stage: CRM_STAGE_NEEDS_FOLLOW_UP, likelihood: 35, priority: CRM_PRIORITY_MEDIUM, monthOffset: 2 },
  { title: "Blue River Utility", dealType: CRM_PROJECT_TYPE_UTILITY, kw: 15_500, revenue: 31_000_000, stage: CRM_STAGE_NEGOTIATION, likelihood: 85, priority: CRM_PRIORITY_HIGH, monthOffset: 0 },
  { title: "Eastside Microgrid Pilot", dealType: CRM_DEAL_TYPE_PILOT, kw: 28, revenue: 112_000, stage: CRM_STAGE_SENT, likelihood: 60, priority: CRM_PRIORITY_LOW, monthOffset: 1 },
  { title: "Lakeview Medical", dealType: CRM_PROJECT_TYPE_COMMERCIAL, kw: 450, revenue: 990_000, stage: CRM_STAGE_APPROVED, likelihood: 50, priority: CRM_PRIORITY_MEDIUM, monthOffset: 2 },
  { title: "Wildflower Community Solar", dealType: CRM_PROJECT_TYPE_UTILITY, kw: 3200, revenue: 6_750_000, stage: CRM_STAGE_DRAFTING, likelihood: 55, priority: CRM_PRIORITY_HIGH, monthOffset: 1 },
  { title: "Brookside Apartments", dealType: CRM_DEAL_TYPE_RESIDENTIAL, kw: 22, revenue: 68_000, stage: CRM_STAGE_REVISION, likelihood: 30, priority: CRM_PRIORITY_LOW, monthOffset: 0 },
  { title: "Ironworks Manufacturing", dealType: CRM_PROJECT_TYPE_COMMERCIAL, kw: 980, revenue: 2_250_000, stage: CRM_STAGE_SENT, likelihood: 72, priority: CRM_PRIORITY_HIGH, monthOffset: 0 },
  { title: "High Plains Array", dealType: CRM_PROJECT_TYPE_UTILITY, kw: 7200, revenue: 14_900_000, stage: CRM_STAGE_APPROVED, likelihood: 62, priority: CRM_PRIORITY_HIGH, monthOffset: 2 },
  { title: "Riverbend Shopping", dealType: CRM_PROJECT_TYPE_COMMERCIAL, kw: 210, revenue: 520_000, stage: CRM_STAGE_CREATED, likelihood: 20, priority: CRM_PRIORITY_LOW, monthOffset: 1 },
  { title: "Oak Hollow Pilot", dealType: CRM_DEAL_TYPE_PILOT, kw: 18, revenue: 76_000, stage: CRM_STAGE_DRAFTING, likelihood: 48, priority: CRM_PRIORITY_LOW, monthOffset: 2 },
  { title: "Sunset Ridge Estate", dealType: CRM_DEAL_TYPE_RESIDENTIAL, kw: 15, revenue: 51_000, stage: CRM_STAGE_NEGOTIATION, likelihood: 58, priority: CRM_PRIORITY_LOW, monthOffset: 0 },
  { title: "Valley Transit Authority", dealType: CRM_PROJECT_TYPE_COMMERCIAL, kw: 560, revenue: 1_180_000, stage: CRM_STAGE_SENT, likelihood: 68, priority: CRM_PRIORITY_MEDIUM, monthOffset: 1 },
  { title: "Red Mesa Generating", dealType: CRM_PROJECT_TYPE_UTILITY, kw: 11_200, revenue: 23_500_000, stage: CRM_STAGE_NEEDS_FOLLOW_UP, likelihood: 42, priority: CRM_PRIORITY_HIGH, monthOffset: 2 },
  { title: "Cedar Point Cold Storage", dealType: CRM_PROJECT_TYPE_COMMERCIAL, kw: 740, revenue: 1_650_000, stage: CRM_STAGE_REVISION, likelihood: 52, priority: CRM_PRIORITY_MEDIUM, monthOffset: 0 },
];

const OWNERS = ["Adam B.", "Sean S.", "Maria L.", "Jordan K.", "Alex T."];

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function closeDateForMonth(monthKey, day = 15) {
  const [y, m] = monthKey.split("-").map(Number);
  const maxDay = new Date(y, m, 0).getDate();
  const safeDay = Math.min(Math.max(1, day), maxDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

const REVENUE_TIERS = [
  38_000, 72_000, 125_000, 210_000, 385_000, 620_000, 890_000, 1_150_000, 1_480_000, 1_920_000,
  2_650_000, 3_400_000, 4_800_000, 6_200_000, 8_750_000, 11_400_000, 15_600_000, 19_200_000, 24_500_000,
  31_000_000, 38_500_000, 45_000_000,
];

/** @param {number} [count] */
export function generateTestProposals(count = 22, { from, to } = {}) {
  const quarter = from && to ? { from, to } : getQuarterlyPeriod();
  const months = listMonthsInPeriod(quarter.from, quarter.to);
  const fallbackMonth = months[0] || new Date().toISOString().slice(0, 7);

  return Array.from({ length: count }, (_, i) => {
    const spec = SAMPLE_PROJECTS[i % SAMPLE_PROJECTS.length];
    const cycle = Math.floor(i / SAMPLE_PROJECTS.length);
    const monthKey = months[(spec.monthOffset + i * 2) % months.length] || fallbackMonth;
    const [y, m] = monthKey.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const closeDay = 1 + ((i * 7 + spec.monthOffset * 5) % daysInMonth);
    const omitCloseDate = i % 11 === 0 || i % 19 === 0;
    const revenueTier = REVENUE_TIERS[(i * 3 + spec.monthOffset) % REVENUE_TIERS.length];
    const revenueJitter = 0.68 + ((i * 13) % 45) / 100;
    const revenue = Math.round(revenueTier * revenueJitter);
    const kwFromRevenue = Math.max(8, Math.round(revenue / (2200 + (i % 5) * 180)));
    return {
      id: `test-proposal-${i + 1}`,
      userId: "acct_test_preview",
      title: cycle > 0 ? `${spec.title} ${cycle + 1}` : spec.title,
      status: "in_progress",
      stage: spec.stage,
      dealType: spec.dealType,
      financing: FINANCING_CYCLE[i % FINANCING_CYCLE.length],
      proposalOwner: OWNERS[i % OWNERS.length],
      estimatedRevenue: revenue,
      estimatedRevenueManual: true,
      closeLikelihoodPct: Math.min(100, spec.likelihood + (i % 4) * 5),
      priority: spec.priority,
      priorityManual: true,
      expectedCloseDate: omitCloseDate ? null : closeDateForMonth(monthKey, closeDay),
      expectedCloseMonth: omitCloseDate ? null : monthKey,
      createdAt: isoDaysAgo(14 + i * 3),
      updatedAt: isoDaysAgo(i % 9),
      snapshot: {
        systemSizeKw: kwFromRevenue,
        pricingPerKW: Math.round(revenue / kwFromRevenue),
        custName: spec.title,
        step: 3,
      },
    };
  });
}

export function buildTestSalesReport({ periodIndex, sampleCount = 80 } = {}) {
  const period =
    periodIndex != null && periodIndex !== ""
      ? shiftQuarterlyPeriod(Number(periodIndex))
      : getQuarterlyPeriod();
  const proposals = generateTestProposals(sampleCount, { from: period.from, to: period.to });
  const report = aggregateSalesReport(proposals, {
    from: period.from,
    to: period.to,
    quarterPipeline: true,
  });
  return { period, report, reportView: "test" };
}
