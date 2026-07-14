// For scaning URLs and suspicious keywords 
// Auto scan and send results to popup.js 
// Check for sus sites w VirusTotal API,  URL pattern checking, login keyword checking

// Footprint page scanner. The installation guard prevents duplicate message
// listeners if the script is injected as a fallback into an already-open tab.
if (!globalThis.__footprintScannerInstalled) {
    globalThis.__footprintScannerInstalled = true;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type !== "SCAN_PAGE") return undefined;

        const pageText = String(document.body?.innerText || "").toLowerCase();
        const pageUrl = window.location.href;
        const flags = [];

        chrome.runtime.sendMessage({ type: "CHECK_URL", url: pageUrl }, (apiResponse) => {
            if (chrome.runtime.lastError) {
                console.warn("Remote URL check unavailable:", chrome.runtime.lastError.message);
            }

            if (apiResponse?.result === "malicious") {
                flags.push("⚠️ VirusTotal: Malicious URL detected");
            }

            let parsedUrl = null;
            try {
                parsedUrl = new URL(pageUrl);
            } catch (_error) {
                // The URL-pattern checks below will simply use the raw URL.
            }

            const hostname = String(parsedUrl?.hostname || "").toLowerCase();

            if (parsedUrl?.protocol === "http:" && !["localhost", "127.0.0.1"].includes(hostname)) {
                flags.push("⚠️ Site is not using HTTPS (insecure connection)");
            }

            if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
                flags.push("URL uses raw IP address (suspicious)");
            }

            if (/login.*-.*\.(xyz|top|click|tk|ml|ga)$/i.test(hostname)) {
                flags.push("Suspicious login domain");
            }

            const protectedBrands = [
                { brand: "paypal", official: ["paypal.com"] },
                { brand: "amazon", official: ["amazon.com", "amazon.co.uk"] },
                { brand: "apple", official: ["apple.com"] },
                { brand: "microsoft", official: ["microsoft.com", "live.com"] },
                { brand: "google", official: ["google.com", "googleusercontent.com"] }
            ];

            protectedBrands.forEach(({ brand, official }) => {
                const mentionsBrand = hostname.includes(brand);
                const isOfficial = official.some(
                    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
                );

                if (mentionsBrand && !isOfficial) {
                    flags.push(`Brand name “${brand}” appears in a non-official domain`);
                }
            });

            // Phishing phrases are used as supporting evidence only after a URL or
            // reputation warning has already been found.
            if (flags.length > 0) {
                const phishingKeywords = [
                    "verify your account",
                    "confirm your identity",
                    "your account has been suspended",
                    "enter your credit card",
                    "urgent action required",
                    "you have won",
                    "click here to claim",
                    "limited time offer"
                ];

                phishingKeywords.forEach((phrase) => {
                    if (pageText.includes(phrase)) {
                        flags.push(`Phishing phrase: “${phrase}”`);
                    }
                });
            }

            sendResponse({ flags: [...new Set(flags)] });
        });

        return true;
    });
}
