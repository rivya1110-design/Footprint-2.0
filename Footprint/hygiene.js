document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const refreshBtn = document.getElementById("refreshBtn");
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");
  const pdfStatus = document.getElementById("pdfStatus");

  const scoreRing = document.getElementById("scoreRing");
  const scoreValue = document.getElementById("scoreValue");
  const gradeBadge = document.getElementById("gradeBadge");
  const gradeTitle = document.getElementById("gradeTitle");
  const scoreDescription = document.getElementById("scoreDescription");

  const totalScans = document.getElementById("totalScans");
  const safeRate = document.getElementById("safeRate");
  const uniqueDomains = document.getElementById("uniqueDomains");
  const repeatRiskVisits = document.getElementById("repeatRiskVisits");

  const safeBar = document.getElementById("safeBar");
  const warningBar = document.getElementById("warningBar");
  const dangerBar = document.getElementById("dangerBar");
  const safeCount = document.getElementById("safeCount");
  const warningCount = document.getElementById("warningCount");
  const dangerCount = document.getElementById("dangerCount");

  const totalDownloads = document.getElementById("totalDownloads");
  const safeDownloadRate = document.getElementById("safeDownloadRate");
  const riskyDownloads = document.getElementById("riskyDownloads");
  const dangerDownloads = document.getElementById("dangerDownloads");
  const downloadSafeBar = document.getElementById("downloadSafeBar");
  const downloadWarningBar = document.getElementById("downloadWarningBar");
  const downloadDangerBar = document.getElementById("downloadDangerBar");
  const downloadCheckingBar = document.getElementById("downloadCheckingBar");
  const downloadSafeCount = document.getElementById("downloadSafeCount");
  const downloadWarningCount = document.getElementById("downloadWarningCount");
  const downloadDangerCount = document.getElementById("downloadDangerCount");
  const downloadCheckingCount = document.getElementById("downloadCheckingCount");
  const downloadDataQuality = document.getElementById("downloadDataQuality");

  const dataQuality = document.getElementById("dataQuality");
  const componentList = document.getElementById("componentList");
  const recommendationList = document.getElementById("recommendationList");
  const riskyDomainList = document.getElementById("riskyDomainList");
  const riskyDownloadPatternList = document.getElementById("riskyDownloadPatternList");
  const recentList = document.getElementById("recentList");
  const recentDownloadList = document.getElementById("recentDownloadList");
  const timeline = document.getElementById("timeline");

  let lastAnalysis = null;

  refreshBtn.addEventListener("click", loadAndAnalyse);
  downloadPdfBtn.disabled = false;
  downloadPdfBtn.addEventListener("click", downloadAnalysisPdf);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === "local" &&
      (changes.scanHistory || changes.downloadHistory || changes.downloadAlerts)
    ) {
      loadAndAnalyse();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      loadAndAnalyse();
    }
  });

  window.addEventListener("focus", loadAndAnalyse);
  loadAndAnalyse();

  function loadAndAnalyse() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing…";

    chrome.storage.local.get(
      { scanHistory: [], downloadHistory: [], downloadAlerts: [] },
      (data) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          showNoData("Footprint could not read the local activity history.");
        } else {
          analyseAll(
            Array.isArray(data.scanHistory) ? data.scanHistory : [],
            Array.isArray(data.downloadHistory) ? data.downloadHistory : [],
            Array.isArray(data.downloadAlerts) ? data.downloadAlerts : []
          );
        }

        refreshBtn.disabled = false;
        refreshBtn.textContent = "Refresh analysis";
      }
    );
  }

  function analyseAll(rawScans, rawDownloads, legacyAlerts) {
    const scans = rawScans
      .map(normaliseScanRecord)
      .filter(Boolean)
      .sort((first, second) => second.timestamp - first.timestamp);

    const modernDownloads = rawDownloads
      .map(normaliseDownloadRecord)
      .filter(Boolean);

    const fallbackDownloads = modernDownloads.length === 0
      ? legacyAlerts.map(normaliseLegacyDownload).filter(Boolean)
      : [];

    const downloads = [...modernDownloads, ...fallbackDownloads]
      .sort((first, second) => second.timestamp - first.timestamp);

    if (scans.length === 0 && downloads.length === 0) {
      showNoData(
        "No valid website-scan or download records were found. Scan a website or download a file using Footprint first."
      );
      return;
    }

    const analysis = buildAnalysis(scans, downloads);
    lastAnalysis = analysis;
    downloadPdfBtn.disabled = false;
    showPdfStatus("Analysis is ready to export.");
    renderAnalysis(analysis);
  }

  function normaliseScanRecord(record, index) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const risk = normaliseRisk(record.risk, "SAFE");
    if (!['SAFE', 'WARNING', 'DANGER'].includes(risk)) {
      return null;
    }

    const url = String(record.url || "Unknown URL");
    const flags = Array.isArray(record.flags)
      ? record.flags.map((flag) => String(flag))
      : [];
    const timestamp = timestampOf(record);

    return {
      id: String(record.id || `scan-${timestamp}-${index}`),
      kind: "Website scan",
      url,
      domain: getDomain(url),
      label: getDomain(url),
      risk,
      flags,
      reasons: flags,
      timeText: String(record.time || formatTimestamp(timestamp)),
      timestamp,
      riskValue: riskToValue(risk),
      action: normaliseAction(record.action)
    };
  }

  function normaliseDownloadRecord(record, index) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const risk = normaliseRisk(record.risk || record.status, "CHECKING");
    if (!['SAFE', 'WARNING', 'DANGER', 'CHECKING'].includes(risk)) {
      return null;
    }

    const filename = String(
      record.filename || record.fileName || filenameFromUrl(record.url) || "Unknown file"
    );
    const reasons = Array.isArray(record.reasons)
      ? record.reasons.map((reason) => String(reason))
      : [String(record.reason || "No local warning detected")];
    const url = String(record.url || "");
    const timestamp = timestampOf(record);

    return {
      id: String(record.id || `download-${record.downloadId || index}-${timestamp}`),
      kind: "Download",
      downloadId: record.downloadId,
      filename,
      label: filename,
      url,
      source: getDomain(url),
      extension: String(record.extension || extensionOf(filename)),
      risk,
      reasons,
      flags: reasons,
      state: String(record.state || "state unavailable"),
      timeText: String(record.time || formatTimestamp(timestamp)),
      timestamp,
      riskValue: riskToValue(risk)
    };
  }

  function normaliseLegacyDownload(record, index) {
    if (!record || typeof record !== "object") {
      return null;
    }

    return normaliseDownloadRecord({
      id: `legacy-download-${index}`,
      downloadId: `legacy-${index}`,
      filename: record.filename || "Unknown file",
      url: record.url || "",
      risk: "DANGER",
      reasons: [record.reason || "Previously flagged download"],
      state: "complete",
      time: record.time,
      timestamp: Date.parse(record.time || "") || 0
    }, index);
  }

  function buildAnalysis(scans, downloads) {
    const safeScans = scans.filter((record) => record.risk === "SAFE");
    const warningScans = scans.filter((record) => record.risk === "WARNING");
    const dangerScans = scans.filter((record) => record.risk === "DANGER");
    const safeScanRatio = scans.length ? safeScans.length / scans.length : 0;
    const warningScanRatio = scans.length ? warningScans.length / scans.length : 0;
    const dangerScanRatio = scans.length ? dangerScans.length / scans.length : 0;

    const safeDownloads = downloads.filter((record) => record.risk === "SAFE");
    const warningDownloads = downloads.filter((record) => record.risk === "WARNING");
    const dangerousDownloads = downloads.filter((record) => record.risk === "DANGER");
    const checkingDownloads = downloads.filter((record) => record.risk === "CHECKING");
    const settledDownloads = downloads.filter((record) => record.risk !== "CHECKING");
    const safeDownloadRatio = settledDownloads.length
      ? safeDownloads.length / settledDownloads.length
      : 0;

    const domainMap = buildDomainMap(scans);
    const repeatedRiskyDomains = [...domainMap.values()]
      .filter((entry) => entry.riskyVisits >= 2)
      .sort((first, second) => {
        if (second.riskyVisits !== first.riskyVisits) {
          return second.riskyVisits - first.riskyVisits;
        }
        return second.highestRiskValue - first.highestRiskValue;
      });

    const repeatedRiskVisits = repeatedRiskyDomains.reduce(
      (total, entry) => total + entry.riskyVisits - 1,
      0
    );

    const riskyDownloadPatterns = buildRiskyDownloadPatterns(downloads);
    const repeatedRiskyDownloads = riskyDownloadPatterns.reduce(
      (total, pattern) => total + Math.max(0, pattern.count - 1),
      0
    );

    const combinedEvents = [...scans, ...downloads]
      .sort((first, second) => second.timestamp - first.timestamp);

    const components = calculateComponents({
      scans,
      downloads,
      safeScanRatio,
      safeDownloadRatio,
      warningScans,
      dangerScans,
      warningDownloads,
      dangerousDownloads,
      repeatedRiskVisits,
      repeatedRiskyDownloads,
      combinedEvents
    });

    const rawScore = components.reduce(
      (sum, component) => sum + component.score,
      0
    );

    const confidence = calculateConfidence(scans.length, downloads.length);
    const finalScore = clamp(Math.round(rawScore * confidence.factor), 0, 100);
    const grade = classifyGrade(finalScore);

    const recommendations = buildRecommendations({
      scans,
      downloads,
      safeScanRatio,
      safeDownloadRatio,
      warningScans,
      dangerScans,
      warningDownloads,
      dangerousDownloads,
      checkingDownloads,
      repeatedRiskyDomains,
      riskyDownloadPatterns,
      confidence
    });

    return {
      scans,
      downloads,
      safeScans,
      warningScans,
      dangerScans,
      safeScanRatio,
      warningScanRatio,
      dangerScanRatio,
      safeDownloads,
      warningDownloads,
      dangerousDownloads,
      checkingDownloads,
      settledDownloads,
      safeDownloadRatio,
      uniqueDomains: domainMap.size,
      repeatedRiskVisits,
      repeatedRiskyDomains,
      riskyDownloadPatterns,
      components,
      rawScore,
      finalScore,
      grade,
      confidence,
      recommendations,
      combinedEvents
    };
  }

  function calculateComponents(context) {
    const siteScore = context.scans.length
      ? context.safeScanRatio * 30
      : 15;

    const downloadScore = context.downloads.length
      ? context.safeDownloadRatio * 25
      : 12.5;

    const settledActivity = [
      ...context.scans,
      ...context.downloads.filter((record) => record.risk !== "CHECKING")
    ];
    const warningCount = settledActivity.filter((record) => record.risk === "WARNING").length;
    const dangerCount = settledActivity.filter((record) => record.risk === "DANGER").length;
    const settledTotal = Math.max(1, settledActivity.length);
    const exposureScore = clamp(
      15 - (warningCount / settledTotal) * 6 - (dangerCount / settledTotal) * 15,
      0,
      15
    );

    const consistencyScore = Math.min(
      (context.scans.length + context.downloads.length) / 15,
      1
    ) * 10;

    const repetitionScore = clamp(
      10 - context.repeatedRiskVisits * 1.5 - context.repeatedRiskyDownloads * 1.5,
      0,
      10
    );

    const trend = calculateCombinedTrend(context.combinedEvents);

    return [
      {
        name: "Safe website-scan ratio",
        score: siteScore,
        maximum: 30,
        detail: context.scans.length
          ? "Rewards a higher percentage of website scans classified as safe."
          : "A neutral score is used until website-scan data becomes available."
      },
      {
        name: "Safe download ratio",
        score: downloadScore,
        maximum: 25,
        detail: context.downloads.length
          ? "Rewards downloads with no risky file-type or browser protection warning."
          : "A neutral score is used until download-safety data becomes available."
      },
      {
        name: "Low warning and danger exposure",
        score: exposureScore,
        maximum: 15,
        detail: "Reduces the score when warning or danger results appear across websites and downloads."
      },
      {
        name: "Protection monitoring consistency",
        score: consistencyScore,
        maximum: 10,
        detail: "Rewards building enough scan and download records for a more reliable estimate."
      },
      {
        name: "Avoiding repeated risky sources",
        score: repetitionScore,
        maximum: 10,
        detail: "Reduces the score for repeated risky domains, file types or download sources."
      },
      {
        name: "Recent combined risk trend",
        score: trend.score,
        maximum: 10,
        detail: trend.detail
      }
    ];
  }

  function calculateCombinedTrend(events) {
    const settled = events.filter((record) => record.risk !== "CHECKING");
    if (settled.length < 6) {
      return {
        score: 5,
        detail: "A neutral trend score is used until at least six completed activities are available."
      };
    }

    const sampleSize = Math.min(5, Math.floor(settled.length / 2));
    const recent = settled.slice(0, sampleSize);
    const older = settled.slice(sampleSize, sampleSize * 2);
    const improvement = averageRisk(older) - averageRisk(recent);
    const score = clamp(5 + improvement * 3.5, 0, 10);

    let detail = "Recent and earlier website/download activity shows a similar risk level.";
    if (improvement >= 0.45) {
      detail = "Recent website and download activity contains fewer risky results than the earlier comparison period.";
    } else if (improvement <= -0.45) {
      detail = "Recent website and download activity contains more risky results than the earlier comparison period.";
    }

    return { score, detail };
  }

  function calculateConfidence(scanTotal, downloadTotal) {
    const activityTotal = scanTotal + downloadTotal;
    const volumeProgress = Math.min(activityTotal / 15, 1);
    const breadthBonus = scanTotal > 0 && downloadTotal > 0 ? 0.1 : 0;
    const factor = Math.min(1, 0.62 + volumeProgress * 0.28 + breadthBonus);

    let label = "Low";
    let detail = "The estimate is based on a small amount of activity data.";
    if (activityTotal >= 15 && scanTotal > 0 && downloadTotal > 0) {
      label = "High";
      detail = "The estimate uses both website and download records with at least fifteen activities.";
    } else if (activityTotal >= 7) {
      label = "Moderate";
      detail = "The estimate will become more stable with fifteen activities and both data types."
    }

    return { factor, label, detail };
  }

  function classifyGrade(score) {
    if (score >= 85) {
      return {
        label: "Excellent",
        title: "Strong cyber hygiene",
        description: "Website and download history show frequent safe results, limited repeated exposure and consistent protection monitoring.",
        cssClass: "grade-excellent",
        colour: "var(--safe)"
      };
    }
    if (score >= 70) {
      return {
        label: "Good",
        title: "Healthy digital habits",
        description: "Your activity appears generally careful, with some opportunities to reduce risky websites or downloads.",
        cssClass: "grade-good",
        colour: "var(--info)"
      };
    }
    if (score >= 50) {
      return {
        label: "Developing",
        title: "Cyber hygiene is improving",
        description: "The combined history shows mixed results. Follow the recommendations to strengthen safer browsing and downloading habits.",
        cssClass: "grade-developing",
        colour: "var(--warning)"
      };
    }
    return {
      label: "Needs attention",
      title: "Higher risky-site or download exposure",
      description: "Warnings, dangers or repeated risky sources are lowering the current cyber-hygiene estimate.",
      cssClass: "grade-attention",
      colour: "var(--danger)"
    };
  }

  function buildRecommendations(context) {
    const recommendations = [];
    const activityTotal = context.scans.length + context.downloads.length;

    if (activityTotal < 15) {
      recommendations.push(
        `Continue using Footprint. ${15 - activityTotal} more activity record(s) will improve the confidence of the estimate.`
      );
    }
    if (context.scans.length === 0) {
      recommendations.push("Scan unfamiliar websites so the score can evaluate browsing behaviour as well as downloads.");
    }
    if (context.downloads.length === 0) {
      recommendations.push("Download monitoring has no records yet. New downloads will be included automatically after Footprint is reloaded.");
    }
    if (context.dangerScans.length > 0) {
      recommendations.push("Avoid entering passwords, payment details or personal information on pages classified as danger.");
    }
    if (context.warningScans.length > 0) {
      recommendations.push("Review warning pages carefully and verify the domain spelling before continuing.");
    }
    if (context.dangerousDownloads.length > 0) {
      recommendations.push("Do not open downloads classified as danger until they have been independently verified and scanned.");
    }
    if (context.warningDownloads.length > 0) {
      recommendations.push("Treat archives, disk images and macro-enabled documents as caution items, even when they came from a familiar page.");
    }
    if (context.checkingDownloads.length > 0) {
      recommendations.push("Wait for downloads marked checking to receive their final Footprint and Chrome protection result.");
    }

    const insecureHttpCount = countMatchingFlags(context.scans, /not using https|insecure connection/i);
    if (insecureHttpCount > 0) {
      recommendations.push(`${insecureHttpCount} website scan(s) used HTTP. Prefer HTTPS for logins, payments and personal data.`);
    }

    const executableCount = context.downloads.filter((record) =>
      /executable|script type|\.exe|\.bat|\.cmd|\.js/i.test(record.reasons.join(" "))
    ).length;
    if (executableCount > 0) {
      recommendations.push(`${executableCount} executable or script download(s) were detected. Confirm the publisher and digital signature before running them.`);
    }

    if (context.repeatedRiskyDomains.length > 0) {
      recommendations.push("Avoid returning to repeatedly flagged domains unless their legitimacy has been confirmed through a trusted source.");
    }
    if (context.riskyDownloadPatterns.some((pattern) => pattern.count >= 2)) {
      recommendations.push("Repeated risky download patterns were detected. Review the listed file types and sources before downloading similar files again.");
    }
    if (context.safeScanRatio < 0.6 && context.scans.length > 0) {
      recommendations.push("Pause before opening unfamiliar links and compare the domain with an official source.");
    }
    if (context.safeDownloadRatio < 0.6 && context.downloads.length > 0) {
      recommendations.push("Prefer downloads from official vendor pages and avoid files sent through unsolicited messages.");
    }
    if (recommendations.length === 0) {
      recommendations.push("Maintain the current habit of checking unfamiliar sites and reviewing every download warning.");
    }

    return [...new Set(recommendations)];
  }

  function buildRiskyDownloadPatterns(downloads) {
    const patterns = new Map();
    const risky = downloads.filter((record) => ['WARNING', 'DANGER'].includes(record.risk));

    risky.forEach((record) => {
      const extension = record.extension || "unknown";
      const extensionKey = `type:${extension}`;
      const extensionLabel = extension === "unknown" ? "Unknown file type" : `.${extension} files`;
      addPattern(patterns, extensionKey, extensionLabel, "File type", record.risk);

      if (record.source && record.source !== "Unknown domain") {
        addPattern(patterns, `source:${record.source}`, record.source, "Download source", record.risk);
      }
    });

    return [...patterns.values()]
      .sort((first, second) => {
        if (second.count !== first.count) {
          return second.count - first.count;
        }
        return second.highestRiskValue - first.highestRiskValue;
      })
      .slice(0, 10);
  }

  function addPattern(map, key, label, category, risk) {
    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        category,
        count: 0,
        highestRisk: "WARNING",
        highestRiskValue: 1
      });
    }
    const entry = map.get(key);
    entry.count += 1;
    if (riskToValue(risk) > entry.highestRiskValue) {
      entry.highestRisk = risk;
      entry.highestRiskValue = riskToValue(risk);
    }
  }

  function renderAnalysis(analysis) {
    const scoreAngle = Math.round(analysis.finalScore / 100 * 360);
    scoreRing.style.setProperty("--score-angle", `${scoreAngle}deg`);
    scoreRing.style.setProperty("--score-colour", analysis.grade.colour);
    scoreValue.textContent = String(analysis.finalScore);
    gradeBadge.className = `grade ${analysis.grade.cssClass}`;
    gradeBadge.textContent = analysis.grade.label;
    gradeTitle.textContent = analysis.grade.title;
    scoreDescription.textContent = analysis.grade.description;

    totalScans.textContent = String(analysis.scans.length);
    safeRate.textContent = `${Math.round(analysis.safeScanRatio * 100)}%`;
    uniqueDomains.textContent = String(analysis.uniqueDomains);
    repeatRiskVisits.textContent = String(analysis.repeatedRiskVisits);
    safeCount.textContent = String(analysis.safeScans.length);
    warningCount.textContent = String(analysis.warningScans.length);
    dangerCount.textContent = String(analysis.dangerScans.length);
    setBarWidths(
      analysis.scans.length,
      [
        [safeBar, analysis.safeScans.length],
        [warningBar, analysis.warningScans.length],
        [dangerBar, analysis.dangerScans.length]
      ]
    );

    totalDownloads.textContent = String(analysis.downloads.length);
    safeDownloadRate.textContent = `${Math.round(analysis.safeDownloadRatio * 100)}%`;
    riskyDownloads.textContent = String(analysis.warningDownloads.length + analysis.dangerousDownloads.length);
    dangerDownloads.textContent = String(analysis.dangerousDownloads.length);
    downloadSafeCount.textContent = String(analysis.safeDownloads.length);
    downloadWarningCount.textContent = String(analysis.warningDownloads.length);
    downloadDangerCount.textContent = String(analysis.dangerousDownloads.length);
    downloadCheckingCount.textContent = String(analysis.checkingDownloads.length);
    setBarWidths(
      analysis.downloads.length,
      [
        [downloadSafeBar, analysis.safeDownloads.length],
        [downloadWarningBar, analysis.warningDownloads.length],
        [downloadDangerBar, analysis.dangerousDownloads.length],
        [downloadCheckingBar, analysis.checkingDownloads.length]
      ]
    );

    dataQuality.replaceChildren();
    const confidenceStrong = document.createElement("strong");
    confidenceStrong.textContent = `Data confidence: ${analysis.confidence.label}. `;
    dataQuality.append(confidenceStrong, document.createTextNode(analysis.confidence.detail));

    downloadDataQuality.replaceChildren();
    const downloadStrong = document.createElement("strong");
    downloadStrong.textContent = "Download interpretation: ";
    const settledText = analysis.settledDownloads.length
      ? `${analysis.settledDownloads.length} completed result(s); checking records are excluded from the safe-rate denominator.`
      : "No completed download result is available yet.";
    downloadDataQuality.append(downloadStrong, document.createTextNode(settledText));

    renderComponents(analysis.components);
    renderRecommendations(analysis.recommendations);
    renderRiskyDomains(analysis.repeatedRiskyDomains);
    renderRiskyDownloadPatterns(analysis.riskyDownloadPatterns);
    renderRecentScans(analysis.scans.slice(0, 10));
    renderRecentDownloads(analysis.downloads.slice(0, 10));
    renderTimeline(analysis.combinedEvents.slice(0, 10).reverse());
  }

  function setBarWidths(total, entries) {
    entries.forEach(([element, count]) => {
      element.style.width = total ? `${count / total * 100}%` : "0%";
    });
  }

  function renderComponents(components) {
    componentList.replaceChildren();
    components.forEach((component) => {
      const item = document.createElement("li");
      item.className = "component-item";
      const copy = document.createElement("div");
      copy.className = "component-copy";
      const title = document.createElement("strong");
      title.textContent = component.name;
      const detail = document.createElement("span");
      detail.textContent = component.detail;
      const score = document.createElement("div");
      score.className = "component-score";
      score.textContent = `${component.score.toFixed(1)} / ${component.maximum}`;
      copy.append(title, detail);
      item.append(copy, score);
      componentList.appendChild(item);
    });
  }

  function renderRecommendations(recommendations) {
    recommendationList.replaceChildren();
    recommendations.forEach((recommendation) => {
      const item = document.createElement("li");
      item.className = "recommendation-item";
      const icon = document.createElement("div");
      icon.className = "recommendation-icon";
      icon.textContent = "✓";
      const text = document.createElement("div");
      text.textContent = recommendation;
      item.append(icon, text);
      recommendationList.appendChild(item);
    });
  }

  function renderRiskyDomains(domains) {
    riskyDomainList.replaceChildren();
    if (domains.length === 0) {
      riskyDomainList.appendChild(createEmptyMessage("No domain currently has two or more warning or danger results."));
      return;
    }
    domains.slice(0, 8).forEach((entry) => {
      riskyDomainList.appendChild(createListCard(
        entry.domain,
        `${entry.riskyVisits} risky scan(s) across ${entry.totalVisits} total visit(s)`,
        entry.highestRisk
      ));
    });
  }

  function renderRiskyDownloadPatterns(patterns) {
    riskyDownloadPatternList.replaceChildren();
    if (patterns.length === 0) {
      riskyDownloadPatternList.appendChild(createEmptyMessage("No risky download pattern is currently recorded."));
      return;
    }
    patterns.forEach((pattern) => {
      riskyDownloadPatternList.appendChild(createListCard(
        pattern.label,
        `${pattern.category} • ${pattern.count} risky occurrence(s)`,
        pattern.highestRisk
      ));
    });
  }

  function renderRecentScans(records) {
    recentList.replaceChildren();
    if (records.length === 0) {
      recentList.appendChild(createEmptyMessage("No recent website scans are available."));
      return;
    }
    records.forEach((record) => {
      recentList.appendChild(createListCard(
        record.domain,
        `${record.timeText} • ${record.flags.length} flag(s)`,
        record.risk
      ));
    });
  }

  function renderRecentDownloads(records) {
    recentDownloadList.replaceChildren();
    if (records.length === 0) {
      recentDownloadList.appendChild(createEmptyMessage("No recent downloads are available."));
      return;
    }
    records.forEach((record) => {
      recentDownloadList.appendChild(createListCard(
        record.filename,
        `${record.source} • ${record.state} • ${record.timeText}`,
        record.risk
      ));
    });
  }

  function createListCard(titleText, detailText, risk) {
    const item = document.createElement("li");
    item.className = "domain-item";
    const copy = document.createElement("div");
    copy.className = "domain-copy";
    const title = document.createElement("strong");
    title.textContent = titleText;
    const detail = document.createElement("span");
    detail.textContent = detailText;
    copy.append(title, detail);
    item.append(copy, createRiskPill(risk));
    return item;
  }

  function renderTimeline(records) {
    timeline.replaceChildren();
    if (records.length === 0) {
      timeline.appendChild(createEmptyMessage("No timeline data is available."));
      return;
    }
    records.forEach((record) => {
      const column = document.createElement("div");
      column.className = "timeline-column";
      const wrap = document.createElement("div");
      wrap.className = "timeline-bar-wrap";
      const bar = document.createElement("div");
      bar.className = "timeline-bar";
      const height = record.risk === "SAFE" ? 100
        : record.risk === "WARNING" ? 62
          : record.risk === "CHECKING" ? 48
            : 28;
      bar.style.height = `${height}%`;
      bar.style.background = riskColour(record.risk);
      bar.title = `${record.kind}: ${record.label} - ${record.risk}`;
      const label = document.createElement("div");
      label.className = "timeline-label";
      label.textContent = record.kind === "Download" ? `D: ${record.label}` : `S: ${record.label}`;
      wrap.appendChild(bar);
      column.append(wrap, label);
      timeline.appendChild(column);
    });
  }

  function showNoData(message) {
    lastAnalysis = null;
    downloadPdfBtn.disabled = false;
    showPdfStatus("Refresh after creating scan or download history.");
    scoreRing.style.setProperty("--score-angle", "0deg");
    scoreRing.style.setProperty("--score-colour", "var(--warning)");
    scoreValue.textContent = "0";
    gradeBadge.className = "grade grade-developing";
    gradeBadge.textContent = "Awaiting data";
    gradeTitle.textContent = "No analysis yet";
    scoreDescription.textContent = message;

    [totalScans, uniqueDomains, repeatRiskVisits, safeCount, warningCount, dangerCount,
      totalDownloads, riskyDownloads, dangerDownloads, downloadSafeCount,
      downloadWarningCount, downloadDangerCount, downloadCheckingCount]
      .forEach((element) => { element.textContent = "0"; });
    safeRate.textContent = "0%";
    safeDownloadRate.textContent = "0%";
    [safeBar, warningBar, dangerBar, downloadSafeBar, downloadWarningBar,
      downloadDangerBar, downloadCheckingBar]
      .forEach((element) => { element.style.width = "0%"; });

    dataQuality.textContent = "Data confidence: Waiting for website or download history.";
    downloadDataQuality.textContent = "Download data: Waiting for download history.";

    componentList.replaceChildren(createEmptyMessage("Score components will appear after the first valid activity record."));
    recommendationList.replaceChildren(createEmptyMessage("Use Footprint to receive personalised recommendations."));
    riskyDomainList.replaceChildren(createEmptyMessage("No risky domains are available."));
    riskyDownloadPatternList.replaceChildren(createEmptyMessage("No risky download patterns are available."));
    recentList.replaceChildren(createEmptyMessage("No recent website scans are available."));
    recentDownloadList.replaceChildren(createEmptyMessage("No recent downloads are available."));
    timeline.replaceChildren(createEmptyMessage("No timeline data is available."));
  }

  function downloadAnalysisPdf() {
    if (!lastAnalysis) {
      showPdfStatus(
        "Refresh the analysis first so Footprint has data for the report.",
        "error"
      );
      return;
    }

    downloadPdfBtn.disabled = true;
    downloadPdfBtn.textContent = "Preparing PDF…";
    showPdfStatus("Building the PDF locally…");

    try {
      const reportLines = buildPdfReportLines(lastAnalysis);
      const pdfBlob = createSimplePdf(reportLines);
      const objectUrl = URL.createObjectURL(pdfBlob);
      const datePart = new Date().toISOString().slice(0, 10);
      const filename = `Footprint-Cyber-Hygiene-Analysis-${datePart}.pdf`;

      const finish = (message, type = "success") => {
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.textContent = "Download analysis PDF";
        showPdfStatus(message, type);
      };

      const fallbackAnchorDownload = () => {
        try {
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = filename;
          link.style.display = "none";
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
          finish("PDF download started.");
        } catch (error) {
          console.error("Footprint PDF fallback failed:", error);
          URL.revokeObjectURL(objectUrl);
          finish("The PDF could not be downloaded. Reload the extension and try again.", "error");
        }
      };

      if (chrome.downloads && typeof chrome.downloads.download === "function") {
        chrome.downloads.download(
          {
            url: objectUrl,
            filename,
            saveAs: true,
            conflictAction: "uniquify"
          },
          (downloadId) => {
            const error = chrome.runtime.lastError;

            if (error || typeof downloadId !== "number") {
              console.warn(
                "Chrome downloads API could not start the PDF download:",
                error ? error.message : "No download ID returned"
              );
              fallbackAnchorDownload();
              return;
            }

            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
            finish("PDF download started. Choose where to save it.");
          }
        );
      } else {
        fallbackAnchorDownload();
      }
    } catch (error) {
      console.error("Footprint PDF creation failed:", error);
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = "Download analysis PDF";
      showPdfStatus(
        error && error.message
          ? `PDF creation failed: ${error.message}`
          : "PDF creation failed. Reload the extension and try again.",
        "error"
      );
    }
  }

  function showPdfStatus(message, type = "") {
    if (!pdfStatus) {
      return;
    }

    pdfStatus.textContent = message;
    pdfStatus.className = `pdf-status${type ? ` ${type}` : ""}`;
  }

  function buildPdfReportLines(analysis) {
    const lines = [];
    const addHeading = (text) => lines.push({ text, size: 14, bold: true, spaceBefore: 8, spaceAfter: 4 });
    const addText = (text, options = {}) => lines.push({ text, size: options.size || 10, bold: Boolean(options.bold), indent: options.indent || 0, spaceAfter: options.spaceAfter ?? 2 });

    lines.push({ text: "FOOTPRINT CYBER HYGIENE ANALYSIS", size: 20, bold: true, spaceAfter: 8 });
    addText(`Generated: ${new Date().toLocaleString()}`);
    addText("This report was generated locally from Footprint website-scan and download-safety history.");

    addHeading("Overall result");
    addText(`Cyber hygiene score: ${analysis.finalScore}/100`, { bold: true });
    addText(`Grade: ${analysis.grade.label} - ${analysis.grade.title}`);
    addText(`Data confidence: ${analysis.confidence.label}. ${analysis.confidence.detail}`);
    addText(analysis.grade.description);

    addHeading("Website scan overview");
    addText(`Total scans: ${analysis.scans.length}`);
    addText(`Safe: ${analysis.safeScans.length} (${Math.round(analysis.safeScanRatio * 100)}%)`);
    addText(`Warning: ${analysis.warningScans.length}`);
    addText(`Danger: ${analysis.dangerScans.length}`);
    addText(`Unique domains: ${analysis.uniqueDomains}`);
    addText(`Repeated risky visits: ${analysis.repeatedRiskVisits}`);

    addHeading("Download safety overview");
    addText(`Total downloads: ${analysis.downloads.length}`);
    addText(`Safe: ${analysis.safeDownloads.length} (${Math.round(analysis.safeDownloadRatio * 100)}% of completed results)`);
    addText(`Warning: ${analysis.warningDownloads.length}`);
    addText(`Danger: ${analysis.dangerousDownloads.length}`);
    addText(`Checking: ${analysis.checkingDownloads.length}`);

    addHeading("Score components");
    analysis.components.forEach((component) => {
      addText(`${component.name}: ${component.score.toFixed(1)} / ${component.maximum}`, { bold: true });
      addText(component.detail, { indent: 12 });
    });

    addHeading("Personalised recommendations");
    analysis.recommendations.forEach((recommendation, index) => {
      addText(`${index + 1}. ${recommendation}`, { indent: 4 });
    });

    addHeading("Repeated risky domains");
    if (analysis.repeatedRiskyDomains.length === 0) {
      addText("No domain has two or more warning or danger results.");
    } else {
      analysis.repeatedRiskyDomains.slice(0, 10).forEach((entry) => {
        addText(`${entry.domain}: ${entry.riskyVisits} risky scan(s), highest risk ${entry.highestRisk}`);
      });
    }

    addHeading("Risky download patterns");
    if (analysis.riskyDownloadPatterns.length === 0) {
      addText("No risky download pattern is currently recorded.");
    } else {
      analysis.riskyDownloadPatterns.forEach((pattern) => {
        addText(`${pattern.category} - ${pattern.label}: ${pattern.count} occurrence(s), highest risk ${pattern.highestRisk}`);
      });
    }

    addHeading("Recent website scans");
    if (analysis.scans.length === 0) {
      addText("No website scans are available.");
    } else {
      analysis.scans.slice(0, 10).forEach((record) => {
        addText(`${record.timeText} | ${record.risk} | ${record.domain}`);
        if (record.flags.length) {
          addText(`Reasons: ${record.flags.join("; ")}`, { indent: 12 });
        }
      });
    }

    addHeading("Recent downloads");
    if (analysis.downloads.length === 0) {
      addText("No download records are available.");
    } else {
      analysis.downloads.slice(0, 10).forEach((record) => {
        addText(`${record.timeText} | ${record.risk} | ${record.filename}`);
        addText(`Source: ${record.source} | State: ${record.state}`, { indent: 12 });
        if (record.reasons.length) {
          addText(`Reasons: ${record.reasons.join("; ")}`, { indent: 12 });
        }
      });
    }

    addHeading("Interpretation limitation");
    addText("This score is an early-warning estimate. Website history does not prove that a user left immediately after a warning, and download history does not prove that a risky file was opened or executed.");
    addText("Footprint performs local pattern-based checks and uses Chrome download-protection status; it does not guarantee that a safe-labelled file is malware-free.");

    return lines;
  }

  function createSimplePdf(lineItems) {
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 48;
    const bottomMargin = 48;
    const contentWidth = pageWidth - margin * 2;
    const pages = [];
    let currentPage = [];
    let y = pageHeight - margin;

    const pushPage = () => {
      if (currentPage.length) {
        pages.push(currentPage);
        currentPage = [];
      }
      y = pageHeight - margin;
    };

    lineItems.forEach((item) => {
      const size = item.size || 10;
      const lineHeight = size * 1.35;
      const spaceBefore = item.spaceBefore || 0;
      const spaceAfter = item.spaceAfter || 0;
      const indent = item.indent || 0;
      const maxChars = Math.max(25, Math.floor((contentWidth - indent) / (size * 0.52)));
      const wrapped = wrapText(toPdfAscii(item.text), maxChars);

      if (y - spaceBefore - wrapped.length * lineHeight < bottomMargin) {
        pushPage();
      }
      y -= spaceBefore;

      wrapped.forEach((line) => {
        if (y - lineHeight < bottomMargin) {
          pushPage();
        }
        currentPage.push({
          text: line,
          x: margin + indent,
          y,
          size,
          bold: Boolean(item.bold)
        });
        y -= lineHeight;
      });
      y -= spaceAfter;
    });
    pushPage();

    const objects = [];
    const addObject = (content) => {
      objects.push(content);
      return objects.length;
    };

    const catalogId = addObject("");
    const pagesId = addObject("");
    const regularFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pageIds = [];

    pages.forEach((page, pageIndex) => {
      const streamParts = [];
      streamParts.push("0.12 0.07 0.13 rg");
      page.forEach((line) => {
        const escaped = escapePdfText(line.text);
        const fontName = line.bold ? "F2" : "F1";
        streamParts.push(
          `BT /${fontName} ${line.size} Tf 1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm (${escaped}) Tj ET`
        );
      });
      streamParts.push(`BT /F1 8 Tf 1 0 0 1 ${margin} 25 Tm (Footprint Cyber Hygiene Analysis - Page ${pageIndex + 1} of ${pages.length}) Tj ET`);
      const stream = streamParts.join("\n");
      const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = addObject(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        `/Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> ` +
        `/Contents ${contentId} 0 R >>`
      );
      pageIds.push(pageId);
    });

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF`;

    return new Blob([pdf], { type: "application/pdf" });
  }

  function wrapText(text, maxCharacters) {
    if (!text) {
      return [""];
    }
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      if (word.length > maxCharacters) {
        if (line) {
          lines.push(line);
          line = "";
        }
        for (let index = 0; index < word.length; index += maxCharacters) {
          lines.push(word.slice(index, index + maxCharacters));
        }
        return;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxCharacters && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) {
      lines.push(line);
    }
    return lines.length ? lines : [""];
  }

  function toPdfAscii(value) {
    return String(value ?? "")
      .replace(/[–—]/g, "-")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/•/g, "-")
      .replace(/✓/g, "OK")
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "?");
  }

  function escapePdfText(value) {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function buildDomainMap(records) {
    const map = new Map();
    records.forEach((record) => {
      if (!map.has(record.domain)) {
        map.set(record.domain, {
          domain: record.domain,
          totalVisits: 0,
          riskyVisits: 0,
          highestRisk: "SAFE",
          highestRiskValue: 0
        });
      }
      const entry = map.get(record.domain);
      entry.totalVisits += 1;
      if (record.risk !== "SAFE") {
        entry.riskyVisits += 1;
      }
      if (record.riskValue > entry.highestRiskValue) {
        entry.highestRiskValue = record.riskValue;
        entry.highestRisk = record.risk;
      }
    });
    return map;
  }

  function countMatchingFlags(records, pattern) {
    return records.filter((record) =>
      record.flags.some((flag) => pattern.test(flag))
    ).length;
  }

  function timestampOf(record) {
    if (typeof record.timestamp === "number" && Number.isFinite(record.timestamp)) {
      return record.timestamp;
    }
    if (typeof record.startedAt === "number" && Number.isFinite(record.startedAt)) {
      return record.startedAt;
    }
    const parsed = new Date(record.time || record.createdAt || record.startTime || 0).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function formatTimestamp(timestamp) {
    return timestamp ? new Date(timestamp).toLocaleString() : "Time unavailable";
  }

  function getDomain(urlValue) {
    if (!urlValue) {
      return "Unknown domain";
    }
    try {
      return new URL(urlValue).hostname || "Unknown domain";
    } catch (_error) {
      return String(urlValue).replace(/^https?:\/\//i, "").split("/")[0] || "Unknown domain";
    }
  }

  function filenameFromUrl(urlValue) {
    if (!urlValue) {
      return "";
    }
    try {
      return decodeURIComponent(new URL(urlValue).pathname.split("/").pop() || "");
    } catch (_error) {
      return String(urlValue).split("/").pop() || "";
    }
  }

  function extensionOf(filename) {
    const match = String(filename || "").toLowerCase().match(/\.([a-z0-9]{1,10})(?:$|[?#])/);
    return match ? match[1] : "unknown";
  }

  function normaliseAction(value) {
    const action = String(value || "UNKNOWN").toUpperCase();
    return ["LEFT_SITE", "STAYED", "UNKNOWN"].includes(action) ? action : "UNKNOWN";
  }

  function normaliseRisk(value, fallback = "SAFE") {
    const risk = String(value || fallback).toUpperCase();
    if (risk === "DANGEROUS") {
      return "DANGER";
    }
    if (risk === "SUSPICIOUS") {
      return "WARNING";
    }
    return ["SAFE", "WARNING", "DANGER", "CHECKING"].includes(risk) ? risk : fallback;
  }

  function averageRisk(records) {
    if (!records.length) {
      return 0;
    }
    return records.reduce((sum, record) => sum + record.riskValue, 0) / records.length;
  }

  function riskToValue(risk) {
    if (risk === "DANGER") {
      return 2;
    }
    if (risk === "WARNING") {
      return 1;
    }
    if (risk === "CHECKING") {
      return 0.5;
    }
    return 0;
  }

  function riskColour(risk) {
    if (risk === "DANGER") {
      return "var(--danger)";
    }
    if (risk === "WARNING") {
      return "var(--warning)";
    }
    if (risk === "CHECKING") {
      return "var(--info)";
    }
    return "var(--safe)";
  }

  function createRiskPill(riskValue) {
    const risk = normaliseRisk(riskValue, "SAFE");
    const pill = document.createElement("span");
    pill.className = `risk-pill risk-${risk.toLowerCase()}`;
    pill.textContent = risk;
    return pill;
  }

  function createEmptyMessage(message) {
    const item = document.createElement("li");
    item.className = "empty-message";
    item.textContent = message;
    return item;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }
});
