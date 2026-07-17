import { SNAPSHOT_VERSION } from "./proposalSnapshot.js";
import { normalizeOptionalEquipment, collapseEquipmentForStorage } from "./optionalEquipment.js";
import { createEmptySiteMap, normalizeSiteMap } from "./siteMapModel.js";

export function buildProposalSnapshot(s) {
  return {
    v: SNAPSHOT_VERSION,
    step: s.step,
    custName: s.custName,
    custAddress: s.custAddress,
    custEmail: s.custEmail,
    custPhone: s.custPhone,
    account: s.account,
    utilityName: s.utilityName,
    prepBy: s.prepBy,
    prepEmail: s.prepEmail,
    prepPhone: s.prepPhone,
    billText: s.billText,
    billFileName: s.billFileName,
    billFileNames: s.billFileNames,
    billExtractNotice: s.billExtractNotice,
    monthlyKWh: s.monthlyKWh,
    ratePerKWh: s.ratePerKWh,
    rateEsc: s.rateEsc,
    productionOnlyMode: s.productionOnlyMode,
    usageComparisonMode: s.usageComparisonMode,
    savingsOnlyMode: s.savingsOnlyMode,
    salesShowcaseMode: s.salesShowcaseMode,
    multiMeterMode: s.multiMeterMode,
    meters: s.meters,
    activeMeterIdx: s.activeMeterIdx,
    usageMeterIdx: s.usageMeterIdx,
    extracted: s.extracted,
    region: s.region,
    systemSizeKw: s.systemSizeKw,
    pricingPerKW: s.pricingPerKW,
    pricingUseRange: s.pricingUseRange,
    pricingPerKWHigh: s.pricingPerKWHigh,
    optionalEquipment: collapseEquipmentForStorage(s.optionalEquipment || []),
    optionalEquipmentOpen: s.optionalEquipmentOpen,
    useNrelApi: s.useNrelApi,
    nrelApiKey: s.nrelApiKey,
    samData: s.samData,
    siteAddress: s.siteAddress,
    siteLat: s.siteLat,
    siteLon: s.siteLon,
    siteMap: normalizeSiteMap(s.siteMap || createEmptySiteMap()),
    samTilt: s.samTilt,
    samAzimuth: s.samAzimuth,
    samArrayType: s.samArrayType,
    samModuleType: s.samModuleType,
    samLosses: s.samLosses,
    samDcAcRatio: s.samDcAcRatio,
    capacityFactorPct: s.capacityFactorPct,
    finPricePerMw: s.finPricePerMw,
    finMaintenancePerMwYear: s.finMaintenancePerMwYear,
    finEnergyValuePerMWh: s.finEnergyValuePerMWh,
    finSavedLandValuePerAcre: s.finSavedLandValuePerAcre,
    finSavedLandValueAuto: s.finSavedLandValueAuto,
    finSavedLandValueSource: s.finSavedLandValueSource,
    includeFinancialsInProposal: s.includeFinancialsInProposal,
    includeCapitalLessSavedLand: s.includeCapitalLessSavedLand,
    selState: s.selState,
    stateManuallySet: s.stateManuallySet,
    itcPct: s.itcPct,
    ecOn: s.ecOn,
    extraCreditName: s.extraCreditName,
    extraCreditAmt: s.extraCreditAmt,
    extraCredits: s.extraCredits,
    removedCreditKeys: s.removedCreditKeys,
    obstH: s.obstH,
    obstD: s.obstD,
    shMonth: s.shMonth,
    shHour: s.shHour,
    showProposalPageBreaks: s.showProposalPageBreaks,
    startPermissionsOnNewPage: s.startPermissionsOnNewPage,
  };
}

export function applyProposalSnapshot(snapshot, setters) {
  if (!snapshot || snapshot.v !== SNAPSHOT_VERSION) return;
  const set = (fn, value) => {
    if (value !== undefined && value !== null) fn(value);
  };
  set(setters.setStep, snapshot.step ?? 0);
  set(setters.setCustName, snapshot.custName ?? "");
  set(setters.setCustAddress, snapshot.custAddress ?? "");
  set(setters.setCustEmail, snapshot.custEmail ?? "");
  set(setters.setCustPhone, snapshot.custPhone ?? "");
  set(setters.setAccount, snapshot.account ?? "");
  set(setters.setUtilityName, snapshot.utilityName ?? "");
  set(setters.setPrepBy, snapshot.prepBy);
  set(setters.setPrepEmail, snapshot.prepEmail);
  set(setters.setPrepPhone, snapshot.prepPhone);
  set(setters.setBillText, snapshot.billText ?? "");
  set(setters.setBillFileName, snapshot.billFileName ?? "");
  set(setters.setBillFileNames, Array.isArray(snapshot.billFileNames) ? snapshot.billFileNames : []);
  set(setters.setBillExtractNotice, snapshot.billExtractNotice ?? "");
  if (Array.isArray(snapshot.monthlyKWh)) setters.setMonthlyKWh(snapshot.monthlyKWh);
  set(setters.setRatePerKWh, snapshot.ratePerKWh ?? "0.12");
  set(setters.setRateEsc, snapshot.rateEsc ?? "3");
  set(setters.setProductionOnlyMode, Boolean(snapshot.productionOnlyMode));
  set(setters.setUsageComparisonMode, Boolean(snapshot.usageComparisonMode));
  set(setters.setSavingsOnlyMode, Boolean(snapshot.savingsOnlyMode));
  set(setters.setSalesShowcaseMode, Boolean(snapshot.salesShowcaseMode));
  set(setters.setMultiMeterMode, Boolean(snapshot.multiMeterMode));
  if (Array.isArray(snapshot.meters) && snapshot.meters.length > 0) setters.setMeters(snapshot.meters);
  set(setters.setActiveMeterIdx, snapshot.activeMeterIdx ?? 0);
  set(setters.setUsageMeterIdx, snapshot.usageMeterIdx ?? 0);
  set(setters.setExtracted, Boolean(snapshot.extracted));
  set(setters.setRegion, snapshot.region ?? "texas");
  set(setters.setSystemSizeKw, snapshot.systemSizeKw ?? "");
  set(setters.setPricingPerKW, snapshot.pricingPerKW);
  set(setters.setPricingUseRange, Boolean(snapshot.pricingUseRange));
  set(setters.setPricingPerKWHigh, snapshot.pricingPerKWHigh ?? "");
  setters.setOptionalEquipment(normalizeOptionalEquipment(snapshot));
  set(setters.setOptionalEquipmentOpen, Boolean(snapshot.optionalEquipmentOpen));
  set(setters.setUseNrelApi, Boolean(snapshot.useNrelApi));
  set(setters.setNrelApiKey, snapshot.nrelApiKey);
  set(setters.setSamData, snapshot.samData ?? null);
  set(setters.setSiteAddress, snapshot.siteAddress ?? "");
  set(setters.setSiteLat, snapshot.siteLat ?? null);
  set(setters.setSiteLon, snapshot.siteLon ?? null);
  const restoredSiteMap = normalizeSiteMap(snapshot.siteMap);
  setters.setSiteMap(restoredSiteMap);
  const mapAddress = String(restoredSiteMap.address || "").trim();
  const restoredSiteAddress = String(snapshot.siteAddress || "").trim();
  // Preserve an explicit Site address override that differs from the site map.
  if (typeof setters.markSiteAddressManual === "function") {
    setters.markSiteAddressManual(Boolean(restoredSiteAddress && mapAddress && restoredSiteAddress !== mapAddress));
  }
  set(setters.setSamTilt, snapshot.samTilt ?? "60");
  set(setters.setSamAzimuth, snapshot.samAzimuth ?? "180");
  set(setters.setSamArrayType, snapshot.samArrayType ?? 4);
  set(setters.setSamModuleType, snapshot.samModuleType ?? 0);
  set(setters.setSamLosses, snapshot.samLosses ?? "2");
  set(setters.setSamDcAcRatio, snapshot.samDcAcRatio ?? "1.0");
  set(setters.setCapacityFactorPct, snapshot.capacityFactorPct ?? "");
  set(setters.setFinPricePerMw, snapshot.finPricePerMw);
  set(setters.setFinMaintenancePerMwYear, snapshot.finMaintenancePerMwYear);
  set(setters.setFinEnergyValuePerMWh, snapshot.finEnergyValuePerMWh);
  set(setters.setFinSavedLandValuePerAcre, snapshot.finSavedLandValuePerAcre);
  set(setters.setFinSavedLandValueAuto, snapshot.finSavedLandValueAuto !== false);
  set(setters.setFinSavedLandValueSource, snapshot.finSavedLandValueSource ?? "Manual");
  set(setters.setIncludeFinancialsInProposal, Boolean(snapshot.includeFinancialsInProposal));
  set(setters.setIncludeCapitalLessSavedLand, Boolean(snapshot.includeCapitalLessSavedLand));
  set(setters.setSelState, snapshot.selState ?? "TX");
  set(setters.setStateManuallySet, Boolean(snapshot.stateManuallySet));
  set(setters.setItcPct, snapshot.itcPct ?? 30);
  set(setters.setEcOn, Boolean(snapshot.ecOn));
  set(setters.setExtraCreditName, snapshot.extraCreditName ?? "");
  set(setters.setExtraCreditAmt, snapshot.extraCreditAmt ?? "");
  if (Array.isArray(snapshot.extraCredits)) setters.setExtraCredits(snapshot.extraCredits);
  if (snapshot.removedCreditKeys && typeof snapshot.removedCreditKeys === "object") {
    setters.setRemovedCreditKeys(snapshot.removedCreditKeys);
  }
  set(setters.setObstH, snapshot.obstH ?? "8");
  set(setters.setObstD, snapshot.obstD ?? "15");
  set(setters.setShMonth, snapshot.shMonth ?? 6);
  set(setters.setShHour, snapshot.shHour ?? 12);
  set(setters.setShowProposalPageBreaks, snapshot.showProposalPageBreaks !== false);
  set(setters.setStartPermissionsOnNewPage, Boolean(snapshot.startPermissionsOnNewPage));
}
