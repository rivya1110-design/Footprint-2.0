// Footprint background service worker
// Handles website scans, scan-history storage, badges and download monitoring.

const VIRUSTOTAL_API_KEY = "YOUR_NEW_API_KEY_HERE";
const RESTRICTED_URL_PATTERN = /^(chrome|edge|about|chrome-extension|view-source):/i;
const MAX_SCAN_HISTORY = 100;
const MAX_DOWNLOAD_HISTORY = 100;
const AUTO_SCAN_DEDUPE_MS = 5000;

const HIGH_RISK_DOWNLOAD_EXTENSIONS = new Set([
    "exe", "scr", "bat", "cmd", "msi", "vbs", "vbe", "js", "jse",
    "jar", "ps1", "apk", "com", "pif", "gadget", "hta", "lnk",
    "reg", "dll", "cpl", "msp", "application"
]);

const CAUTION_DOWNLOAD_EXTENSIONS = new Set([
    "zip", "rar", "7z", "iso", "img", "dmg", "docm", "xlsm", "pptm"
]);

const SAFE_DANGER_STATES = new Set([
    "safe", "accepted", "deepScannedSafe"
]);

const WARNING_DANGER_STATES = new Set([
    "uncommon", "potentially_unwanted", "unwanted", "asyncScanning",
    "sensitiveContentWarning"
]);

const DANGEROUS_DANGER_STATES = new Set([
    "dangerous", "file", "url", "content", "host", "malicious",
    "dangerous_file", "dangerous_url", "dangerous_content", "dangerous_host",
    "blockedPasswordProtected", "blockedTooLarge", "sensitiveContentBlock"
]);

function checkUrlWithVirusTotal(url) {
    return new Promise((resolve) => {
        // The local Footprint checks must still work when no API key is configured.
        if (!VIRUSTOTAL_API_KEY || VIRUSTOTAL_API_KEY.includes("YOUR_NEW_API_KEY")) {
            resolve("unavailable");
            return;
        }

        fetch("https://www.virustotal.com/api/v3/urls", {
            method: "POST",
            headers: {
                "x-apikey": VIRUSTOTAL_API_KEY,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: `url=${encodeURIComponent(url)}`
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`VirusTotal request failed (${response.status})`);
                }
                return response.json();
            })
            .then((data) => {
                const analysisId = data?.data?.id;
                if (!analysisId) {
                    throw new Error("VirusTotal did not return an analysis ID");
                }

                setTimeout(() => {
                    fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
                        headers: { "x-apikey": VIRUSTOTAL_API_KEY }
                    })
                        .then((response) => {
                            if (!response.ok) {
                                throw new Error(`VirusTotal analysis failed (${response.status})`);
                            }
                            return response.json();
                        })
                        .then((result) => {
                            const malicious = Number(
                                result?.data?.attributes?.stats?.malicious || 0
                            );
                            resolve(malicious > 0 ? "malicious" : "clean");
                        })
                        .catch((error) => {
                            console.warn("VirusTotal analysis unavailable:", error);
                            resolve("error");
                        });
                }, 3000);
            })
            .catch((error) => {
                console.warn("VirusTotal URL check unavailable:", error);
                resolve("error");
            });
    });
}

function computeRisk(flags) {
    if (flags.length >= 3) return "DANGER";
    if (flags.length >= 1) return "WARNING";
    return "SAFE";
}

function setBadge(tabId, risk) {
    const badgeMap = {
        SAFE: { text: "✓", color: "#1e7e34" },
        WARNING: { text: "!", color: "#ff9328" },
        DANGER: { text: "!!", color: "#d62020" }
    };

    const badge = badgeMap[risk] || { text: "", color: "#000000" };
    chrome.action.setBadgeText({ tabId, text: badge.text });
    chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
}

function sameFlags(first, second) {
    if (!Array.isArray(first) || !Array.isArray(second)) return false;
    if (first.length !== second.length) return false;
    return first.every((flag, index) => flag === second[index]);
}

function saveScanResult(tabId, url, risk, flags, source = "automatic") {
    const timestamp = Date.now();
    const newScan = {
        id: `scan-${timestamp}-${Math.random().toString(16).slice(2)}`,
        tabId,
        url,
        risk,
        flags: Array.isArray(flags) ? [...flags] : [],
        source,
        timestamp,
        time: new Date(timestamp).toLocaleString()
    };

    chrome.storage.local.get({ scanHistory: [], tabResults: {} }, (data) => {
        const history = Array.isArray(data.scanHistory) ? data.scanHistory : [];
        const last = history[0];
        const lastTimestamp = Number(last?.timestamp) || Date.parse(last?.time || "") || 0;

        // Prevent the automatic page-load event from creating the same record twice,
        // but always preserve manual re-scans as fresh activity.
        const recentAutomaticDuplicate =
            source === "automatic" &&
            last &&
            last.url === url &&
            last.risk === risk &&
            sameFlags(last.flags, newScan.flags) &&
            timestamp - lastTimestamp < AUTO_SCAN_DEDUPE_MS;

        if (recentAutomaticDuplicate) {
            history[0] = {
                ...last,
                ...newScan,
                id: last.id || newScan.id
            };
        } else {
            history.unshift(newScan);
        }

        if (history.length > MAX_SCAN_HISTORY) {
            history.length = MAX_SCAN_HISTORY;
        }

        const tabResults = data.tabResults && typeof data.tabResults === "object"
            ? data.tabResults
            : {};
        tabResults[tabId] = newScan;

        chrome.storage.local.set({ scanHistory: history, tabResults }, () => {
            if (chrome.runtime.lastError) {
                console.error("Could not save scan result:", chrome.runtime.lastError.message);
            }
        });
    });
}

function sendScanMessage(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE" }, (response) => {
            if (chrome.runtime.lastError || !response || !Array.isArray(response.flags)) {
                resolve(null);
                return;
            }
            resolve(response.flags);
        });
    });
}

async function requestPageFlags(tabId) {
    // Content scripts from manifest.json are normally already present.
    let flags = await sendScanMessage(tabId);
    if (flags) return flags;

    // Fallback for a tab that was open before the extension was installed/reloaded.
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            { target: { tabId }, files: ["content.js"] },
            async () => {
                if (chrome.runtime.lastError) {
                    console.warn("Could not inject scanner:", chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                resolve(await sendScanMessage(tabId));
            }
        );
    });
}

async function injectAndScan(tabId, url, source = "automatic") {
    if (!tabId || !url || RESTRICTED_URL_PATTERN.test(url) || !/^https?:\/\//i.test(url)) {
        return null;
    }

    const flags = await requestPageFlags(tabId);
    if (!flags) return null;

    const risk = computeRisk(flags);
    saveScanResult(tabId, url, risk, flags, source);
    setBadge(tabId, risk);

    return { url, risk, flags };
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url && /^https?:\/\//i.test(tab.url)) {
        injectAndScan(tabId, tab.url, "automatic");
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.get({ tabResults: {} }, (data) => {
        const tabResults = data.tabResults || {};
        if (Object.prototype.hasOwnProperty.call(tabResults, tabId)) {
            delete tabResults[tabId];
            chrome.storage.local.set({ tabResults });
        }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CHECK_URL") {
        checkUrlWithVirusTotal(message.url).then((result) => sendResponse({ result }));
        return true;
    }

    if (message.type === "RESCAN_ACTIVE_TAB") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab?.id || !tab.url) {
                sendResponse(null);
                return;
            }

            injectAndScan(tab.id, tab.url, "manual")
                .then((result) => sendResponse(result))
                .catch((error) => {
                    console.error("Manual scan failed:", error);
                    sendResponse(null);
                });
        });
        return true;
    }

    if (message.type === "GET_TAB_RESULT") {
        chrome.storage.local.get({ tabResults: {} }, (data) => {
            const result = data.tabResults?.[message.tabId] || null;
            if (message.url && result?.url !== message.url) {
                sendResponse(null);
                return;
            }
            sendResponse(result);
        });
        return true;
    }
});

function extensionOf(filenameOrUrl) {
    const cleanValue = String(filenameOrUrl || "").split(/[?#]/)[0];
    const match = /\.([a-z0-9]+)$/i.exec(cleanValue);
    return match ? match[1].toLowerCase() : "";
}

function basename(value) {
    const text = String(value || "");
    const finalPart = text.split(/[\\/]/).pop() || "";
    try {
        return decodeURIComponent(finalPart) || "unknown file";
    } catch (_error) {
        return finalPart || "unknown file";
    }
}

function filenameFromDownload(item) {
    if (item?.filename) return basename(item.filename);

    const sourceUrl = item?.finalUrl || item?.url || "";
    try {
        const parsed = new URL(sourceUrl);
        return basename(parsed.pathname);
    } catch (_error) {
        return basename(sourceUrl);
    }
}

function classifyDownload(item) {
    const filename = filenameFromDownload(item);
    const extension = extensionOf(filename) || extensionOf(item?.finalUrl) || extensionOf(item?.url);
    const dangerState = String(item?.danger || "");
    const state = String(item?.state || "in_progress");
    const reasons = [];
    let risk = "SAFE";

    if (DANGEROUS_DANGER_STATES.has(dangerState)) {
        risk = "DANGER";
        reasons.push(`Chrome download protection reported: ${dangerState}`);
    } else if (WARNING_DANGER_STATES.has(dangerState)) {
        risk = "WARNING";
        reasons.push(`Chrome download protection reported: ${dangerState}`);
    }

    if (HIGH_RISK_DOWNLOAD_EXTENSIONS.has(extension)) {
        risk = "DANGER";
        reasons.push(`Potentially dangerous executable or script type (.${extension})`);
    } else if (CAUTION_DOWNLOAD_EXTENSIONS.has(extension) && risk !== "DANGER") {
        risk = "WARNING";
        reasons.push(`Compressed, disk-image or macro-enabled file type (.${extension})`);
    }

    if (state === "interrupted" && risk === "SAFE") {
        risk = "WARNING";
        reasons.push("Download was interrupted before completion");
    }

    if (!dangerState && state === "in_progress" && reasons.length === 0) {
        risk = "CHECKING";
        reasons.push("Download is still being checked");
    }

    if (risk === "SAFE") {
        if (SAFE_DANGER_STATES.has(dangerState)) {
            reasons.push("No warning was reported by Chrome download protection");
        } else {
            reasons.push("No risky file type or browser warning was detected");
        }
    }

    return { risk, reasons, filename, extension, dangerState, state };
}

function riskRank(risk) {
    return { CHECKING: 0, SAFE: 1, WARNING: 2, DANGER: 3 }[risk] || 0;
}

function notifyDownload(record) {
    if (!record || !["WARNING", "DANGER"].includes(record.risk)) return;

    chrome.notifications.create(`download-${record.downloadId}-${record.risk}`, {
        type: "basic",
        iconUrl: "pixel-capybara-pack 1.png",
        title: record.risk === "DANGER"
            ? "⚠️ Footprint: Dangerous download warning"
            : "⚠️ Footprint: Download needs caution",
        message: `${record.filename} — ${record.reasons[0] || "Review this download"}`
    });
}

function upsertDownloadRecord(downloadItem) {
    if (!downloadItem || typeof downloadItem.id !== "number") return;

    const classification = classifyDownload(downloadItem);
    const timestamp = Date.now();

    chrome.storage.local.get({ downloadHistory: [] }, (data) => {
        const history = Array.isArray(data.downloadHistory) ? data.downloadHistory : [];
        const existingIndex = history.findIndex(
            (entry) => Number(entry.downloadId) === Number(downloadItem.id)
        );
        const previous = existingIndex >= 0 ? history[existingIndex] : null;

        const record = {
            id: previous?.id || `download-${downloadItem.id}`,
            downloadId: downloadItem.id,
            filename: classification.filename,
            url: downloadItem.finalUrl || downloadItem.url || previous?.url || "",
            referrer: downloadItem.referrer || previous?.referrer || "",
            mime: downloadItem.mime || previous?.mime || "",
            bytesReceived: Number(downloadItem.bytesReceived || previous?.bytesReceived || 0),
            totalBytes: Number(downloadItem.totalBytes || previous?.totalBytes || 0),
            risk: classification.risk,
            reasons: classification.reasons,
            dangerState: classification.dangerState,
            state: classification.state,
            startedAt: previous?.startedAt || timestamp,
            timestamp,
            time: new Date(timestamp).toLocaleString(),
            notifiedRisk: previous?.notifiedRisk || null
        };

        const shouldNotify =
            ["WARNING", "DANGER"].includes(record.risk) &&
            riskRank(record.risk) > riskRank(previous?.notifiedRisk);

        if (shouldNotify) {
            record.notifiedRisk = record.risk;
        }

        if (existingIndex >= 0) {
            history.splice(existingIndex, 1);
        }
        history.unshift(record);

        if (history.length > MAX_DOWNLOAD_HISTORY) {
            history.length = MAX_DOWNLOAD_HISTORY;
        }

        chrome.storage.local.set({ downloadHistory: history }, () => {
            if (chrome.runtime.lastError) {
                console.error("Could not save download result:", chrome.runtime.lastError.message);
                return;
            }
            if (shouldNotify) notifyDownload(record);
        });
    });
}

function refreshDownloadById(downloadId) {
    chrome.downloads.search({ id: downloadId }, (items) => {
        if (chrome.runtime.lastError) {
            console.warn("Could not read download:", chrome.runtime.lastError.message);
            return;
        }
        if (items?.[0]) upsertDownloadRecord(items[0]);
    });
}

// Record every download, including files with no warning.
chrome.downloads.onCreated.addListener((downloadItem) => {
    upsertDownloadRecord(downloadItem);

    // The final filename may not be assigned at onCreated time.
    setTimeout(() => refreshDownloadById(downloadItem.id), 500);
});

// Reclassify when Chrome supplies a filename, danger state, progress or completion state.
chrome.downloads.onChanged.addListener((delta) => {
    if (
        delta.filename ||
        delta.danger ||
        delta.state ||
        delta.bytesReceived ||
        delta.totalBytes ||
        delta.finalUrl
    ) {
        refreshDownloadById(delta.id);
    }
});


// // ── URL / VirusTotal check (unchanged logic, kept as a helper) ──
// function checkUrlWithVirusTotal(url) {
//     return new Promise((resolve) => {
//         fetch("https://www.virustotal.com/api/v3/urls", {
//             method: "POST",
//             headers: {
//                 "x-apikey": "YOUR_NEW_API_KEY_HERE",
//                 "Content-Type": "application/x-www-form-urlencoded"
//             },
//             body: `url=${encodeURIComponent(url)}`
//         })
//             .then((res) => res.json())
//             .then((data) => {
//                 const id = data.data.id;

//                 // VirusTotal needs a moment to actually analyse the URL
//                 setTimeout(() => {
//                     fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, {
//                         headers: { "x-apikey": "YOUR_NEW_API_KEY_HERE" }
//                     })
//                         .then((res) => res.json())
//                         .then((result) => {
//                             const malicious = result.data.attributes.stats.malicious;
//                             resolve(malicious > 0 ? "malicious" : "clean");
//                         })
//                         .catch(() => resolve("error"));
//                 }, 3000);
//             })
//             .catch(() => resolve("error"));
//     });
// }

// // ── Shared scan logic — used for BOTH auto-scan-on-load and manual re-scan ──
// const RESTRICTED_URL_PATTERN = /^(chrome|edge|about|chrome-extension):/i;

// function computeRisk(flags) {
//     if (flags.length >= 3) return "DANGER";
//     if (flags.length >= 1) return "WARNING";
//     return "SAFE";
// }

// function setBadge(tabId, risk) {
//     const badgeMap = {
//         SAFE: { text: "\u2713", color: "#1e7e34" },
//         WARNING: { text: "!", color: "#ff9328" },
//         DANGER: { text: "!!", color: "#d62020" }
//     };
//     const badge = badgeMap[risk] || { text: "", color: "#000000" };
//     chrome.action.setBadgeText({ tabId, text: badge.text });
//     chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
// }

// function saveScanResult(tabId, url, risk, flags) {
//     const newScan = { url, risk, flags, time: new Date().toLocaleString() };

//     chrome.storage.local.get({ scanHistory: [], tabResults: {} }, (data) => {
//         const history = Array.isArray(data.scanHistory) ? data.scanHistory : [];
//         const last = history[0];
//         const isDuplicate =
//             last && last.url === url && last.risk === risk && last.flags.length === flags.length;

//         if (!isDuplicate) {
//             history.unshift(newScan);
//             if (history.length > 50) history.length = 50;
//         }

//         const tabResults = data.tabResults || {};
//         tabResults[tabId] = newScan;

//         chrome.storage.local.set({ scanHistory: history, tabResults });
//     });
// }

// function injectAndScan(tabId, url) {
//     return new Promise((resolve) => {
//         if (!tabId || !url || RESTRICTED_URL_PATTERN.test(url)) {
//             resolve(null);
//             return;
//         }

//         chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
//             if (chrome.runtime.lastError) {
//                 resolve(null);
//                 return;
//             }

//             chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE" }, (response) => {
//                 if (chrome.runtime.lastError || !response || !Array.isArray(response.flags)) {
//                     resolve(null);
//                     return;
//                 }

//                 const flags = response.flags;
//                 const risk = computeRisk(flags);

//                 saveScanResult(tabId, url, risk, flags);
//                 setBadge(tabId, risk);

//                 resolve({ url, risk, flags });
//             });
//         });
//     });
// }

// // ── AUTO-SCAN: fires the moment any page finishes loading ──
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     if (changeInfo.status === "complete" && tab.url && /^https?:\/\//i.test(tab.url)) {
//         injectAndScan(tabId, tab.url);
//     }
// });

// // ── Messages from popup.js / content.js ──
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.type === "CHECK_URL") {
//         checkUrlWithVirusTotal(message.url).then((result) => sendResponse({ result }));
//         return true;
//     }

//     if (message.type === "RESCAN_ACTIVE_TAB") {
//         chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//             const tab = tabs[0];
//             if (!tab || !tab.id) {
//                 sendResponse(null);
//                 return;
//             }
//             injectAndScan(tab.id, tab.url).then((result) => sendResponse(result));
//         });
//         return true;
//     }

//     if (message.type === "GET_TAB_RESULT") {
//         chrome.storage.local.get({ tabResults: {} }, (data) => {
//             sendResponse(data.tabResults[message.tabId] || null);
//         });
//         return true;
//     }
// });

// // ── AUTO-DETECT MALICIOUS DOWNLOADS ──
// const DANGEROUS_DOWNLOAD_EXTENSIONS = [
//     "exe", "scr", "bat", "cmd", "msi", "vbs", "js", "jar",
//     "ps1", "apk", "com", "pif", "gadget", "hta", "lnk"
// ];

// function extensionOf(filename) {
//     const match = /\.([a-z0-9]+)$/i.exec(filename || "");
//     return match ? match[1].toLowerCase() : "";
// }

// function flagDownload(downloadItem, reason) {
//     const entry = {
//         filename: (downloadItem.filename || "unknown file").split(/[\\/]/).pop(),
//         url: downloadItem.url || downloadItem.finalUrl || "",
//         reason,
//         time: new Date().toLocaleString()
//     };

//     chrome.storage.local.get({ downloadAlerts: [] }, (data) => {
//         const alerts = Array.isArray(data.downloadAlerts) ? data.downloadAlerts : [];
//         alerts.unshift(entry);
//         if (alerts.length > 50) alerts.length = 50;
//         chrome.storage.local.set({ downloadAlerts: alerts });
//     });

//     chrome.notifications.create({
//         type: "basic",
//         iconUrl: "pixel-capybara-pack 1.png",
//         title: "\u26A0\uFE0F Footprint: Suspicious download",
//         message: `${entry.filename} \u2014 ${reason}`
//     });
// }

// // Catches risky file types the moment a download starts
// chrome.downloads.onCreated.addListener((downloadItem) => {
//     const ext = extensionOf(downloadItem.filename);
//     if (DANGEROUS_DOWNLOAD_EXTENSIONS.includes(ext)) {
//         flagDownload(downloadItem, `Potentially dangerous file type (.${ext})`);
//     }
// });

// // Catches anything Chrome's own Safe Browsing later marks as dangerous
// chrome.downloads.onChanged.addListener((delta) => {
//     if (delta.danger && delta.danger.current && !["safe", "accepted"].includes(delta.danger.current)) {
//         chrome.downloads.search({ id: delta.id }, (items) => {
//             if (items && items[0]) {
//                 flagDownload(items[0], `Flagged by Chrome Safe Browsing (${delta.danger.current})`);
//             }
//         });
//     }
// });





// // chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
// //     if (message.type === "CHECK_URL") {

// //         let url = message.url;

// //         fetch("https://www.virustotal.com/api/v3/urls", {
// //             method: "POST",
// //             headers: {
// //                 "x-apikey": "YOUR_NEW_API_KEY_HERE",
// //                 "Content-Type": "application/x-www-form-urlencoded"
// //             },
// //             body: `url=${encodeURIComponent(url)}`
// //         })
// //         .then(res => res.json())
// //         .then(data => {
// //             let id = data.data.id;

// //             // ✅ Wait 3 seconds before fetching result
// //             // VirusTotal needs time to actually analyse the URL
// //             return new Promise(resolve => {
// //                 setTimeout(() => {
// //                     resolve(fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, {
// //                         headers: { "x-apikey": "YOUR_NEW_API_KEY_HERE" }
// //                     }));
// //                 }, 3000);
// //             });
// //         })
// //         .then(res => res.json())
// //         .then(result => {
// //             let malicious = result.data.attributes.stats.malicious;
// //             sendResponse({ result: malicious > 0 ? "malicious" : "clean" });
// //         })
// //         .catch(err => {
// //             console.log("API Error:", err);
// //             sendResponse({ result: "error" });
// //         });

// //         return true;
// //     }
// // });
