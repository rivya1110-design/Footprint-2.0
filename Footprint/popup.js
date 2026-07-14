document.addEventListener("DOMContentLoaded", () => {
    const scanBTN = document.getElementById("scanBTN");
    const resultContent = document.getElementById("resultContent");
    const moreFeaturesBtn = document.getElementById("moreFeaturesBtn");

    moreFeaturesBtn?.addEventListener("click", () => {
        chrome.tabs.create({
            url: `${chrome.runtime.getURL("index.html")}#features`
        });
    });

    function renderResult(result) {
        if (!result) {
            resultContent.innerHTML = "<p>Could not scan this page.</p>";
            return;
        }

        const colors = { SAFE: "#50f366", WARNING: "#ff9328", DANGER: "#d62020" };
        const color = colors[result.risk] || "#50f366";

        resultContent.innerHTML =
            result.flags.length === 0
                ? `<h2 style="color:${color}">${result.risk}</h2><p>No suspicious indicators found.</p>`
                : `<h2 style="color:${color}">${result.risk}</h2><ul>${result.flags
                      .map((flag) => `<li>${flag}</li>`)
                      .join("")}</ul>`;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab) return;

        const pageUrl = tab.url || "";
        const restrictedPage = /^(chrome|edge|about|chrome-extension|view-source):/i.test(pageUrl);

        if (!tab.id || restrictedPage || !/^https?:\/\//i.test(pageUrl)) {
            resultContent.innerHTML =
                "<p>This browser page cannot be scanned. Open a normal website first.</p>";
            scanBTN.disabled = true;
            return;
        }

        chrome.runtime.sendMessage(
            { type: "GET_TAB_RESULT", tabId: tab.id, url: pageUrl },
            (result) => {
                if (chrome.runtime.lastError) {
                    console.warn(chrome.runtime.lastError.message);
                }

                if (result) {
                    renderResult(result);
                    return;
                }

                resultContent.innerHTML = "<p>Scanning...</p>";
                chrome.runtime.sendMessage({ type: "RESCAN_ACTIVE_TAB" }, (freshResult) => {
                    if (chrome.runtime.lastError) {
                        console.warn(chrome.runtime.lastError.message);
                    }
                    renderResult(freshResult);
                });
            }
        );

        scanBTN.addEventListener("click", () => {
            resultContent.innerHTML = "<p>Re-scanning...</p>";
            chrome.runtime.sendMessage({ type: "RESCAN_ACTIVE_TAB" }, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn(chrome.runtime.lastError.message);
                }
                renderResult(result);
            });
        });
    });
});