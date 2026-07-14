document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const recentScansContainer =
    document.getElementById("recentScans");

  const recentDownloadsContainer =
    document.getElementById("recentDownloads");

  if (!recentScansContainer || !recentDownloadsContainer) {
    console.error(
      "Footprint homepage error: recentScans or recentDownloads container is missing."
    );
    return;
  }

  if (
    typeof chrome === "undefined" ||
    !chrome.storage ||
    !chrome.storage.local
  ) {
    renderStorageUnavailable();
    return;
  }

  let refreshTimer = null;

  function loadRecentActivity() {
    chrome.storage.local.get(
      {
        scanHistory: [],
        downloadHistory: [],
        downloadAlerts: [],

        /*
         * Compatibility fallbacks for older builds or accidental
         * alternative storage-key names.
         */
        downloadsHistory: [],
        recentDownloads: [],
        downloads: []
      },
      (data) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Unable to read Footprint activity:",
            chrome.runtime.lastError.message
          );

          renderStorageUnavailable();
          return;
        }

        const scans = Array.isArray(data.scanHistory)
          ? data.scanHistory
          : [];

        const modernDownloads = firstNonEmptyArray(
          data.downloadHistory,
          data.downloadsHistory,
          data.recentDownloads,
          data.downloads
        );

        /*
         * Old Footprint versions saved only dangerous download alerts.
         * Use those records only when no modern download history exists.
         */
        const legacyDownloads =
          modernDownloads.length === 0
            ? convertLegacyDownloadAlerts(data.downloadAlerts)
            : [];

        renderRecentScans(scans);
        renderRecentDownloads([
          ...modernDownloads,
          ...legacyDownloads
        ]);
      }
    );
  }

  function firstNonEmptyArray(...values) {
    for (const value of values) {
      if (Array.isArray(value) && value.length > 0) {
        return value;
      }
    }

    return [];
  }

  function renderRecentScans(history) {
    recentScansContainer.replaceChildren();

    const scans = normaliseObjectArray(history)
      .sort(
        (first, second) =>
          getRecordTimestamp(second) -
          getRecordTimestamp(first)
      )
      .slice(0, 4);

    if (scans.length === 0) {
      recentScansContainer.appendChild(
        createEmptyMessage(
          "No scans recorded yet. Browse to a website first."
        )
      );
      return;
    }

    scans.forEach((scan) => {
      const risk = normaliseRisk(scan.risk);
      const title = getDisplayDomain(scan.url);

      const detailParts = [];

      const timeText = formatRecordTime(scan);
      if (timeText) {
        detailParts.push(timeText);
      }

      detailParts.push(
        scan.source === "manual"
          ? "Manual re-scan"
          : "Automatic scan"
      );

      const row = createActivityRow({
        href: "scanshistory.html#scanHistorySection",
        title,
        detail: detailParts.join(" • "),
        risk
      });

      row.title = String(scan.url || title);
      recentScansContainer.appendChild(row);
    });
  }

  function renderRecentDownloads(history) {
    recentDownloadsContainer.replaceChildren();

    const downloads = normaliseObjectArray(history)
      .sort(
        (first, second) =>
          getRecordTimestamp(second) -
          getRecordTimestamp(first)
      )
      .slice(0, 4);

    if (downloads.length === 0) {
      recentDownloadsContainer.appendChild(
        createEmptyMessage(
          "No downloads recorded yet. Download a new file after reloading Footprint."
        )
      );
      return;
    }

    downloads.forEach((download) => {
      const risk = normaliseRisk(
        download.risk ||
        download.status ||
        download.verdict ||
        "CHECKING"
      );

      const filename = getDownloadFilename(download);

      const reasons = getDownloadReasons(download);
      const detailParts = [];

      if (reasons.length > 0) {
        detailParts.push(reasons[0]);
      } else if (download.state) {
        detailParts.push(
          formatDownloadState(download.state)
        );
      }

      const timeText = formatRecordTime(download);
      if (timeText) {
        detailParts.push(timeText);
      }

      const row = createActivityRow({
        href: "scanshistory.html#downloadHistorySection",
        title: filename,
        detail:
          detailParts.join(" • ") ||
          "Download analysed",
        risk
      });

      row.title = String(
        download.url ||
        download.finalUrl ||
        download.filename ||
        filename
      );

      recentDownloadsContainer.appendChild(row);
    });
  }

  function normaliseObjectArray(value) {
    return (Array.isArray(value) ? value : [])
      .filter(
        (item) =>
          item &&
          typeof item === "object"
      )
      .slice();
  }

  function getDownloadFilename(download) {
    const storedName =
      download.filename ||
      download.fileName ||
      download.name ||
      "";

    if (storedName) {
      return basename(storedName);
    }

    const sourceUrl =
      download.finalUrl ||
      download.url ||
      "";

    const fromUrl = getFileNameFromUrl(sourceUrl);

    return fromUrl || "Unknown file";
  }

  function basename(value) {
    const text = String(value || "");
    const finalPart =
      text.split(/[\\/]/).pop() || text;

    try {
      return (
        decodeURIComponent(finalPart) ||
        "Unknown file"
      );
    } catch (_error) {
      return finalPart || "Unknown file";
    }
  }

  function getDownloadReasons(download) {
    if (
      Array.isArray(download.reasons) &&
      download.reasons.length > 0
    ) {
      return download.reasons
        .map((reason) => String(reason))
        .filter(Boolean);
    }

    if (Array.isArray(download.flags)) {
      return download.flags
        .map((flag) => String(flag))
        .filter(Boolean);
    }

    const singleReason =
      download.reason ||
      download.message ||
      "";

    return singleReason
      ? [String(singleReason)]
      : [];
  }

  function createActivityRow({
    href,
    title,
    detail,
    risk
  }) {
    const row = document.createElement("a");
    row.className = "demo-row";
    row.href = href;

    const dot = document.createElement("span");
    dot.className =
      `dot ${getRiskClass(risk)}`;

    dot.setAttribute("aria-hidden", "true");

    const information =
      document.createElement("div");

    information.className = "demo-url";

    const primaryText =
      document.createElement("div");

    primaryText.textContent =
      title || "Unknown item";

    const secondaryText =
      document.createElement("span");

    secondaryText.className = "demo-subtext";
    secondaryText.textContent =
      detail || "Activity recorded";

    const badge =
      document.createElement("span");

    badge.className =
      `demo-badge ${getBadgeClass(risk)}`;

    badge.textContent = getRiskLabel(risk);

    information.append(
      primaryText,
      secondaryText
    );

    row.append(
      dot,
      information,
      badge
    );

    return row;
  }

  function convertLegacyDownloadAlerts(alerts) {
    return (Array.isArray(alerts) ? alerts : [])
      .filter(
        (alert) =>
          alert &&
          typeof alert === "object"
      )
      .map((alert, index) => ({
        id:
          `legacy-${index}-${alert.time || ""}`,
        downloadId:
          `legacy-${index}`,
        filename:
          alert.filename ||
          alert.fileName ||
          "Unknown file",
        url: alert.url || "",
        risk:
          alert.risk ||
          alert.status ||
          "DANGER",
        reasons: [
          alert.reason ||
          alert.message ||
          "Previously flagged download"
        ],
        state:
          alert.state ||
          "complete",
        timestamp:
          Number(alert.timestamp) ||
          Date.parse(alert.time || "") ||
          0,
        time:
          alert.time ||
          "Time unavailable"
      }));
  }

  function normaliseRisk(value) {
    const risk =
      String(value || "SAFE").toUpperCase();

    if (
      risk === "DANGEROUS" ||
      risk === "MALICIOUS" ||
      risk === "HIGH"
    ) {
      return "DANGER";
    }

    if (
      risk === "SUSPICIOUS" ||
      risk === "CAUTION" ||
      risk === "MEDIUM"
    ) {
      return "WARNING";
    }

    if (
      risk === "PENDING" ||
      risk === "IN_PROGRESS"
    ) {
      return "CHECKING";
    }

    if (
      risk === "SAFE" ||
      risk === "WARNING" ||
      risk === "DANGER" ||
      risk === "CHECKING"
    ) {
      return risk;
    }

    return "SAFE";
  }

  function getRiskClass(risk) {
    if (risk === "DANGER") {
      return "danger";
    }

    if (risk === "WARNING") {
      return "warn";
    }

    if (risk === "CHECKING") {
      return "checking";
    }

    return "safe";
  }

  function getBadgeClass(risk) {
    if (risk === "DANGER") {
      return "badge-danger";
    }

    if (risk === "WARNING") {
      return "badge-warn";
    }

    if (risk === "CHECKING") {
      return "badge-checking";
    }

    return "badge-safe";
  }

  function getRiskLabel(risk) {
    if (risk === "DANGER") {
      return "Danger";
    }

    if (risk === "WARNING") {
      return "Warning";
    }

    if (risk === "CHECKING") {
      return "Checking";
    }

    return "Safe";
  }

  function getRecordTimestamp(record) {
    const timestampCandidates = [
      record?.timestamp,
      record?.startedAt,
      record?.createdAt,
      record?.startTime,
      record?.endTime
    ];

    for (const candidate of timestampCandidates) {
      const number = Number(candidate);

      if (
        Number.isFinite(number) &&
        number > 0
      ) {
        return number;
      }
    }

    const dateCandidates = [
      record?.time,
      record?.date,
      record?.createdAt,
      record?.startTime,
      record?.endTime
    ];

    for (const candidate of dateCandidates) {
      if (!candidate) {
        continue;
      }

      const parsed = Date.parse(candidate);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return 0;
  }

  function formatRecordTime(record) {
    const timestamp =
      getRecordTimestamp(record);

    if (!timestamp) {
      return "";
    }

    return new Date(timestamp).toLocaleString();
  }

  function formatDownloadState(value) {
    return String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      );
  }

  function getDisplayDomain(urlValue) {
    if (!urlValue) {
      return "Unknown website";
    }

    try {
      return (
        new URL(urlValue).hostname ||
        "Unknown website"
      );
    } catch (_error) {
      return (
        String(urlValue)
          .replace(/^https?:\/\//i, "")
          .split("/")[0] ||
        "Unknown website"
      );
    }
  }

  function getFileNameFromUrl(urlValue) {
    if (!urlValue) {
      return "";
    }

    try {
      const pathname =
        new URL(urlValue).pathname;

      const finalPart =
        pathname.split("/").pop() || "";

      return basename(finalPart);
    } catch (_error) {
      return basename(
        String(urlValue).split("/").pop() || ""
      );
    }
  }

  function createEmptyMessage(message) {
    const paragraph =
      document.createElement("p");

    paragraph.className = "demo-empty";
    paragraph.textContent = message;

    return paragraph;
  }

  function renderStorageUnavailable() {
    const message =
      "Extension storage is unavailable. Open this page through the installed Footprint extension.";

    recentScansContainer.replaceChildren(
      createEmptyMessage(message)
    );

    recentDownloadsContainer.replaceChildren(
      createEmptyMessage(message)
    );
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);

    refreshTimer = window.setTimeout(
      loadRecentActivity,
      120
    );
  }

  chrome.storage.onChanged.addListener(
    (changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (
        changes.scanHistory ||
        changes.downloadHistory ||
        changes.downloadAlerts ||
        changes.downloadsHistory ||
        changes.recentDownloads ||
        changes.downloads
      ) {
        scheduleRefresh();
      }
    }
  );

  window.addEventListener(
    "focus",
    scheduleRefresh
  );

  window.addEventListener(
    "pageshow",
    scheduleRefresh
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        scheduleRefresh();
      }
    }
  );

  /*
   * A lightweight periodic refresh ensures the homepage catches a
   * service-worker update even if the page missed a storage event.
   */
  const periodicRefreshId = window.setInterval(
    loadRecentActivity,
    3000
  );

  window.addEventListener("beforeunload", () => {
    window.clearInterval(periodicRefreshId);
    window.clearTimeout(refreshTimer);
  });

  loadRecentActivity();
});
