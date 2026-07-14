document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const historyList = document.getElementById("historyList");
    const scanCount = document.getElementById("scanCount");
    const downloadList = document.getElementById("downloadList");
    const downloadCount = document.getElementById("downloadCount");
    const clearBtn = document.getElementById("clearBtn");

    function timestampOf(entry) {
        return Number(entry?.timestamp) || Date.parse(entry?.time || "") || 0;
    }

    function createEmpty(icon, message) {
        const empty = document.createElement("div");
        empty.className = "empty";

        const symbol = document.createElement("span");
        symbol.textContent = icon;

        empty.append(symbol, document.createTextNode(message));
        return empty;
    }

    function normalizeRisk(value) {
        const risk = String(value || "SAFE").toUpperCase();

        if (risk === "DANGEROUS") {
            return "DANGER";
        }

        if (risk === "SUSPICIOUS") {
            return "WARNING";
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

    function riskClasses(value) {
        const risk = normalizeRisk(value);

        if (risk === "DANGER") {
            return { bar: "bar-danger", badge: "badge-danger" };
        }
        if (risk === "WARNING") {
            return { bar: "bar-warning", badge: "badge-warning" };
        }
        if (risk === "CHECKING") {
            return { bar: "bar-checking", badge: "badge-checking" };
        }
        return { bar: "bar-safe", badge: "badge-safe" };
    }

    function createCard({ risk, time, title, details, subtitle = "" }) {
        const normalizedRisk = normalizeRisk(risk);
        const classes = riskClasses(normalizedRisk);
        const card = document.createElement("div");
        card.className = "card";

        const bar = document.createElement("div");
        bar.className = `card-bar ${classes.bar}`;

        const body = document.createElement("div");
        body.className = "card-body";

        const top = document.createElement("div");
        top.className = "card-top";

        const badge = document.createElement("span");
        badge.className = `risk-badge ${classes.badge}`;
        badge.textContent = normalizedRisk;

        const timeElement = document.createElement("span");
        timeElement.className = "card-time";
        timeElement.textContent = time || "Time unavailable";

        const titleElement = document.createElement("div");
        titleElement.className = "card-url";
        titleElement.textContent = title || "Unknown item";

        top.append(badge, timeElement);
        body.append(top, titleElement);

        if (subtitle) {
            const subtitleElement = document.createElement("div");
            subtitleElement.className = "card-subtitle";
            subtitleElement.textContent = subtitle;
            body.appendChild(subtitleElement);
        }

        const safeDetails = Array.isArray(details) ? details : [];
        if (safeDetails.length === 0) {
            const noFlags = document.createElement("p");
            noFlags.className = "no-flags";
            noFlags.textContent = "✅ No issues detected";
            body.appendChild(noFlags);
        } else {
            const list = document.createElement("ul");
            list.className = "flags-list";
            safeDetails.forEach((detail) => {
                const item = document.createElement("li");
                item.textContent = detail;
                list.appendChild(item);
            });
            body.appendChild(list);
        }

        card.append(bar, body);
        return card;
    }

    function renderScans(history) {
        const scans = (Array.isArray(history) ? history : [])
            .slice()
            .sort((first, second) => timestampOf(second) - timestampOf(first));

        scanCount.textContent = `${scans.length} site(s) scanned`;
        historyList.replaceChildren();

        if (scans.length === 0) {
            historyList.appendChild(
                createEmpty("🔍", "No scans yet! Go scan some sites using the extension.")
            );
            return;
        }

        scans.forEach((scan) => {
            historyList.appendChild(
                createCard({
                    risk: scan.risk || "SAFE",
                    time: scan.time,
                    title: scan.url,
                    details: Array.isArray(scan.flags) ? scan.flags : [],
                    subtitle: scan.source === "manual" ? "Manual re-scan" : "Automatic page scan"
                })
            );
        });
    }

    function legacyAlertsToRecords(alerts) {
        return (Array.isArray(alerts) ? alerts : []).map((alert, index) => ({
            id: `legacy-${index}-${alert.time || ""}`,
            downloadId: `legacy-${index}`,
            filename: alert.filename || "Unknown file",
            url: alert.url || "",
            risk: "DANGER",
            reasons: [alert.reason || "Previously flagged download"],
            state: "complete",
            timestamp: Date.parse(alert.time || "") || 0,
            time: alert.time || "Time unavailable"
        }));
    }

    function renderDownloads(history, legacyAlerts) {
        const modern = Array.isArray(history) ? history : [];
        const legacy = modern.length === 0 ? legacyAlertsToRecords(legacyAlerts) : [];
        const downloads = [...modern, ...legacy]
            .sort((first, second) => timestampOf(second) - timestampOf(first));

        downloadCount.textContent = `${downloads.length} download(s) analysed`;
        downloadList.replaceChildren();

        if (downloads.length === 0) {
            downloadList.appendChild(
                createEmpty("📥", "No downloads have been analysed yet.")
            );
            return;
        }

        downloads.forEach((download) => {
            const details = Array.isArray(download.reasons)
                ? download.reasons
                : [download.reason || "No local warning detected"];

            const sourceHost = (() => {
                try {
                    return new URL(download.url).hostname;
                } catch (_error) {
                    return download.url || "Source unavailable";
                }
            })();

            downloadList.appendChild(
                createCard({
                    risk: download.risk || "CHECKING",
                    time: download.time,
                    title: download.filename || "Unknown file",
                    details,
                    subtitle: `${sourceHost} • ${download.state || "state unavailable"}`
                })
            );
        });
    }

    function loadAllHistory() {
        chrome.storage.local.get(
            { scanHistory: [], downloadHistory: [], downloadAlerts: [] },
            (data) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                renderScans(data.scanHistory);
                renderDownloads(data.downloadHistory, data.downloadAlerts);
                scrollToRequestedSection();
            }
        );
    }

    function scrollToRequestedSection() {
        const targetId =
            window.location.hash.replace("#", "");

        if (!targetId) {
            return;
        }

        const target =
            document.getElementById(targetId);

        if (target) {
            window.requestAnimationFrame(() => {
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            });
        }
    }

    clearBtn.addEventListener("click", () => {
        chrome.storage.local.remove(
            ["scanHistory", "tabResults", "downloadHistory", "downloadAlerts"],
            () => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }
                renderScans([]);
                renderDownloads([], []);
            }
        );
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (
            areaName === "local" &&
            (changes.scanHistory || changes.downloadHistory || changes.downloadAlerts)
        ) {
            loadAllHistory();
        }
    });

    window.addEventListener("focus", loadAllHistory);
    loadAllHistory();
});
