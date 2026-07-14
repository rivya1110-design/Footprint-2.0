document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const officialInput = document.getElementById("officialUsername");
  const suspiciousInput = document.getElementById("suspiciousUsername");
  const platformInput = document.getElementById("platformInput");
  const officialCounter = document.getElementById("officialCounter");
  const suspiciousCounter = document.getElementById("suspiciousCounter");

  const analyseBtn = document.getElementById("analyseBtn");
  const resetBtn = document.getElementById("resetBtn");
  const copyBtn = document.getElementById("copyBtn");
  const status = document.getElementById("status");

  const emptyState = document.getElementById("emptyState");
  const resultContent = document.getElementById("resultContent");

  const scoreRing = document.getElementById("scoreRing");
  const scoreNumber = document.getElementById("scoreNumber");
  const riskBadge = document.getElementById("riskBadge");
  const resultHeading = document.getElementById("resultHeading");
  const resultSummary = document.getElementById("resultSummary");

  const officialDisplay = document.getElementById("officialDisplay");
  const suspiciousDisplay = document.getElementById("suspiciousDisplay");

  const levenshteinMetric = document.getElementById("levenshteinMetric");
  const jaroMetric = document.getElementById("jaroMetric");
  const distanceMetric = document.getElementById("distanceMetric");
  const canonicalMetric = document.getElementById("canonicalMetric");

  const patternList = document.getElementById("patternList");
  const recommendationList = document.getElementById("recommendationList");

  const rawOfficial = document.getElementById("rawOfficial");
  const rawSuspicious = document.getElementById("rawSuspicious");
  const unicodeOfficial = document.getElementById("unicodeOfficial");
  const unicodeSuspicious = document.getElementById("unicodeSuspicious");
  const compactOfficial = document.getElementById("compactOfficial");
  const compactSuspicious = document.getElementById("compactSuspicious");
  const canonicalOfficial = document.getElementById("canonicalOfficial");
  const canonicalSuspicious = document.getElementById("canonicalSuspicious");

  const CONFUSABLE_MAP = new Map([
    ["а", "a"], ["ɑ", "a"], ["α", "a"], ["Ꭺ", "a"],
    ["Ь", "b"], ["ь", "b"], ["β", "b"], ["в", "b"],
    ["с", "c"], ["ϲ", "c"], ["ⅽ", "c"],
    ["ԁ", "d"], ["ժ", "d"],
    ["е", "e"], ["ε", "e"], ["℮", "e"],
    ["ғ", "f"], ["ϝ", "f"],
    ["ɡ", "g"], ["ց", "g"],
    ["һ", "h"], ["н", "h"], ["η", "h"],
    ["і", "i"], ["ı", "i"], ["ι", "i"], ["ӏ", "i"], ["ⅼ", "i"],
    ["ј", "j"], ["ϳ", "j"],
    ["κ", "k"], ["к", "k"],
    ["ӏ", "l"], ["ⅼ", "l"], ["ℓ", "l"],
    ["м", "m"], ["ｍ", "m"],
    ["ո", "n"], ["п", "n"], ["η", "n"],
    ["о", "o"], ["ο", "o"], ["օ", "o"], ["૦", "o"],
    ["р", "p"], ["ρ", "p"],
    ["ԛ", "q"], ["գ", "q"],
    ["г", "r"], ["ᴦ", "r"],
    ["ѕ", "s"], ["ꜱ", "s"],
    ["т", "t"], ["τ", "t"],
    ["υ", "u"], ["ս", "u"],
    ["ѵ", "v"], ["ν", "v"],
    ["ԝ", "w"], ["ω", "w"],
    ["х", "x"], ["χ", "x"],
    ["у", "y"], ["ү", "y"], ["γ", "y"],
    ["ᴢ", "z"], ["Ζ", "z"]
  ]);

  const LEET_MAP = new Map([
    ["0", "o"],
    ["1", "i"],
    ["2", "z"],
    ["3", "e"],
    ["4", "a"],
    ["5", "s"],
    ["6", "g"],
    ["7", "t"],
    ["8", "b"],
    ["9", "g"]
  ]);

  let lastAnalysis = null;

  officialInput.addEventListener("input", updateCounters);
  suspiciousInput.addEventListener("input", updateCounters);

  analyseBtn.addEventListener("click", analyseUsernames);
  resetBtn.addEventListener("click", resetTool);
  copyBtn.addEventListener("click", copyAnalysis);

  document.querySelectorAll(".example-btn").forEach((button) => {
    button.addEventListener("click", () => {
      officialInput.value = button.dataset.official || "";
      suspiciousInput.value = button.dataset.suspicious || "";
      updateCounters();
      analyseUsernames();
    });
  });

  [officialInput, suspiciousInput].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        analyseUsernames();
      }
    });
  });

  updateCounters();

  function analyseUsernames() {
    const official = officialInput.value.trim();
    const suspicious = suspiciousInput.value.trim();

    if (!official || !suspicious) {
      showStatus("Enter both the official and suspicious username.", "error");

      if (!official) {
        officialInput.focus();
      } else {
        suspiciousInput.focus();
      }

      return;
    }

    if (official.length < 2 || suspicious.length < 2) {
      showStatus("Each username must contain at least two characters.", "error");
      return;
    }

    const officialProfile = buildUsernameProfile(official);
    const suspiciousProfile = buildUsernameProfile(suspicious);

    const comparison = compareProfiles(
      officialProfile,
      suspiciousProfile,
      platformInput.value
    );

    lastAnalysis = comparison;
    renderAnalysis(comparison);
    showStatus("Similarity analysis completed locally.", "success");
  }

  function buildUsernameProfile(value) {
    const raw = value.trim();
    const lower = raw.toLocaleLowerCase("en");

    let unicodeNormalized = lower.normalize("NFKC");
    let confusableCount = 0;
    let leetCount = 0;

    unicodeNormalized = Array.from(unicodeNormalized)
      .map((character) => {
        if (CONFUSABLE_MAP.has(character)) {
          confusableCount += 1;
          return CONFUSABLE_MAP.get(character);
        }

        return character;
      })
      .join("");

    unicodeNormalized = unicodeNormalized
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const compact = unicodeNormalized.replace(/[\s._\-–—]+/g, "");

    const leetNormalized = Array.from(compact)
      .map((character) => {
        if (LEET_MAP.has(character)) {
          leetCount += 1;
          return LEET_MAP.get(character);
        }

        return character;
      })
      .join("");

    const canonical = leetNormalized
      .replace(/[^a-z0-9]/g, "")
      .replace(/(.)\1{2,}/g, "$1");

    return {
      raw,
      lower,
      unicodeNormalized,
      compact,
      canonical,
      confusableCount,
      leetCount,
      separatorCount: (lower.match(/[\s._\-–—]/g) || []).length,
      repeatedRun: /(.)\1{2,}/.test(leetNormalized)
    };
  }

  function compareProfiles(official, suspicious, platform) {
    const officialCanonical = official.canonical || official.compact || official.lower;
    const suspiciousCanonical =
      suspicious.canonical || suspicious.compact || suspicious.lower;

    const distance = levenshteinDistance(
      officialCanonical,
      suspiciousCanonical
    );

    const maximumLength = Math.max(
      officialCanonical.length,
      suspiciousCanonical.length,
      1
    );

    const levenshteinSimilarity = 1 - distance / maximumLength;
    const jaroWinklerScore = jaroWinkler(
      officialCanonical,
      suspiciousCanonical
    );

    const patterns = detectPatterns(
      official,
      suspicious,
      distance,
      levenshteinSimilarity,
      jaroWinklerScore
    );

    const score = calculateRiskScore(
      official,
      suspicious,
      levenshteinSimilarity,
      jaroWinklerScore,
      patterns
    );

    const risk = classifyRisk(score);
    const recommendations = buildRecommendations(risk, patterns);

    return {
      official,
      suspicious,
      platform,
      distance,
      levenshteinSimilarity,
      jaroWinklerScore,
      patterns,
      score,
      risk,
      recommendations,
      analysedAt: new Date()
    };
  }

  function detectPatterns(
    official,
    suspicious,
    distance,
    levenshteinSimilarity,
    jaroWinklerScore
  ) {
    const patterns = [];

    const rawExact = official.lower === suspicious.lower;
    const canonicalExact =
      official.canonical.length > 0 &&
      official.canonical === suspicious.canonical;

    if (rawExact) {
      patterns.push({
        id: "exact",
        severity: 18,
        label: "Exact username match",
        detail:
          "Both usernames are identical after letter-case normalization. Confirm that the account belongs to the expected person."
      });
    }

    if (canonicalExact && !rawExact) {
      patterns.push({
        id: "canonical-collision",
        severity: 22,
        label: "Normalized usernames are identical",
        detail:
          "The visible usernames differ, but separators, number substitutions or look-alike characters reduce them to the same canonical form."
      });
    }

    if (suspicious.confusableCount > 0) {
      patterns.push({
        id: "homograph",
        severity: 15,
        label: "Unicode homograph characters detected",
        detail:
          `${suspicious.confusableCount} look-alike character(s) were converted to their Latin equivalent during analysis.`
      });
    }

    if (suspicious.leetCount > 0) {
      patterns.push({
        id: "leet",
        severity: 11,
        label: "Number-to-letter substitution detected",
        detail:
          `${suspicious.leetCount} number character(s) resemble letters, such as 0/o, 1/i or 3/e.`
      });
    }

    if (
      official.separatorCount !== suspicious.separatorCount &&
      (official.separatorCount > 0 || suspicious.separatorCount > 0)
    ) {
      patterns.push({
        id: "separator",
        severity: 7,
        label: "Separator modification detected",
        detail:
          "Dots, underscores, hyphens or spaces were added or removed while preserving the main username."
      });
    }

    if (suspicious.repeatedRun && !official.repeatedRun) {
      patterns.push({
        id: "repeat",
        severity: 6,
        label: "Repeated-character variation detected",
        detail:
          "The checked username contains a repeated character sequence that is not present in the official username."
      });
    }

    const shorter =
      official.canonical.length <= suspicious.canonical.length
        ? official.canonical
        : suspicious.canonical;

    const longer =
      official.canonical.length > suspicious.canonical.length
        ? official.canonical
        : suspicious.canonical;

    const lengthDifference = longer.length - shorter.length;

    if (
      shorter.length >= 3 &&
      longer.includes(shorter) &&
      lengthDifference > 0 &&
      lengthDifference <= 12
    ) {
      const prefix = longer.endsWith(shorter);
      const suffix = longer.startsWith(shorter);

      patterns.push({
        id: "affix",
        severity: 8,
        label: "Prefix or suffix added",
        detail: prefix
          ? "Extra characters were added before the main username."
          : suffix
            ? "Extra characters were added after the main username."
            : "The official username appears inside the checked username with extra surrounding characters."
      });
    }

    const prefixLength = commonPrefixLength(
      official.canonical,
      suspicious.canonical
    );

    const prefixRatio =
      prefixLength /
      Math.max(
        1,
        Math.min(
          official.canonical.length,
          suspicious.canonical.length
        )
      );

    if (
      prefixLength >= 3 &&
      prefixRatio >= 0.55 &&
      !canonicalExact
    ) {
      patterns.push({
        id: "shared-prefix",
        severity: 5,
        label: "Strong shared prefix",
        detail:
          `The first ${prefixLength} canonical character(s) match, which may make the usernames look related at a glance.`
      });
    }

    if (distance > 0 && distance <= 2) {
      patterns.push({
        id: "small-edit",
        severity: 10,
        label: "Only a small number of edits",
        detail:
          `Only ${distance} insertion, deletion or substitution is required to transform one canonical username into the other.`
      });
    }

    if (
      isSingleAdjacentTransposition(
        official.canonical,
        suspicious.canonical
      )
    ) {
      patterns.push({
        id: "transposition",
        severity: 9,
        label: "Adjacent characters swapped",
        detail:
          "Two neighboring characters appear to have been reversed, a common typo-style impersonation pattern."
      });
    }

    if (
      levenshteinSimilarity >= 0.85 ||
      jaroWinklerScore >= 0.9
    ) {
      patterns.push({
        id: "algorithmic-similarity",
        severity: 7,
        label: "High algorithmic resemblance",
        detail:
          "The combined similarity algorithms indicate that the username structures are closely related."
      });
    }

    return deduplicatePatterns(patterns);
  }

  function calculateRiskScore(
    official,
    suspicious,
    levenshteinSimilarity,
    jaroWinklerScore,
    patterns
  ) {
    let score =
      levenshteinSimilarity * 52 +
      jaroWinklerScore * 38;

    const patternAdjustment = patterns.reduce(
      (total, pattern) => total + pattern.severity,
      0
    );

    score += Math.min(24, patternAdjustment);

    const rawExact = official.lower === suspicious.lower;
    const canonicalExact =
      official.canonical.length > 0 &&
      official.canonical === suspicious.canonical;

    if (rawExact) {
      score = 100;
    } else if (canonicalExact) {
      score = Math.max(score, 97);
    }

    const shortestLength = Math.min(
      official.canonical.length,
      suspicious.canonical.length
    );

    if (shortestLength <= 3 && !canonicalExact) {
      score *= 0.84;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function classifyRisk(score) {
    if (score >= 90) {
      return {
        level: "High",
        badge: "High impersonation risk",
        heading: "Very close resemblance detected",
        cssClass: "risk-high",
        colour: "var(--danger)",
        summary:
          "The checked username strongly resembles the official username and contains patterns commonly associated with impersonation."
      };
    }

    if (score >= 75) {
      return {
        level: "Elevated",
        badge: "Elevated risk",
        heading: "Suspicious resemblance detected",
        cssClass: "risk-elevated",
        colour: "var(--elevated)",
        summary:
          "Several structural similarities or modification patterns were detected. Verify the account before interacting."
      };
    }

    if (score >= 55) {
      return {
        level: "Moderate",
        badge: "Moderate risk",
        heading: "Some resemblance detected",
        cssClass: "risk-moderate",
        colour: "var(--warning)",
        summary:
          "The usernames share some characteristics, but similarity alone is insufficient to determine impersonation."
      };
    }

    return {
      level: "Low",
      badge: "Low similarity risk",
      heading: "Low resemblance detected",
      cssClass: "risk-low",
      colour: "var(--safe)",
      summary:
        "The usernames are not strongly similar according to the current pattern-based checks. Continue using normal account-verification practices."
    };
  }

  function buildRecommendations(risk, patterns) {
    const recommendations = [];

    if (risk.level === "High" || risk.level === "Elevated") {
      recommendations.push(
        "Do not share passwords, verification codes, payment details or personal documents with the checked account.",
        "Open the known official profile through a saved link, verified website or previous trusted conversation.",
        "Compare the profile creation date, post history, followers, biography and contact information.",
        "Contact the person or organisation through another trusted channel before taking action."
      );
    } else if (risk.level === "Moderate") {
      recommendations.push(
        "Review the account profile and recent activity before accepting messages or requests.",
        "Check whether the official account publicly lists alternative usernames.",
        "Avoid urgent financial requests until the identity is confirmed through another channel."
      );
    } else {
      recommendations.push(
        "Similarity risk is low, but still check profile history and context before trusting an unfamiliar account.",
        "Treat unsolicited links, urgent requests and requests for sensitive information cautiously."
      );
    }

    if (patterns.some((pattern) => pattern.id === "homograph")) {
      recommendations.push(
        "Copy the username into a plain-text field and inspect each character because some Unicode letters may only look like Latin letters."
      );
    }

    return [...new Set(recommendations)];
  }

  function renderAnalysis(analysis) {
    emptyState.hidden = true;
    resultContent.hidden = false;

    const scoreAngle = Math.round((analysis.score / 100) * 360);

    scoreRing.style.setProperty("--score", `${scoreAngle}deg`);
    scoreRing.style.setProperty("--score-color", analysis.risk.colour);
    scoreNumber.textContent = String(analysis.score);

    riskBadge.className = `risk-badge ${analysis.risk.cssClass}`;
    riskBadge.textContent = analysis.risk.badge;
    resultHeading.textContent = analysis.risk.heading;
    resultSummary.textContent = analysis.risk.summary;

    officialDisplay.textContent = analysis.official.raw;
    suspiciousDisplay.textContent = analysis.suspicious.raw;

    levenshteinMetric.textContent =
      `${Math.round(analysis.levenshteinSimilarity * 100)}%`;

    jaroMetric.textContent =
      `${Math.round(analysis.jaroWinklerScore * 100)}%`;

    distanceMetric.textContent = String(analysis.distance);

    canonicalMetric.textContent =
      analysis.official.canonical === analysis.suspicious.canonical
        ? "Yes"
        : "No";

    rawOfficial.textContent = analysis.official.raw;
    rawSuspicious.textContent = analysis.suspicious.raw;
    unicodeOfficial.textContent =
      analysis.official.unicodeNormalized || "—";
    unicodeSuspicious.textContent =
      analysis.suspicious.unicodeNormalized || "—";
    compactOfficial.textContent = analysis.official.compact || "—";
    compactSuspicious.textContent = analysis.suspicious.compact || "—";
    canonicalOfficial.textContent = analysis.official.canonical || "—";
    canonicalSuspicious.textContent =
      analysis.suspicious.canonical || "—";

    renderPatterns(analysis.patterns);
    renderRecommendations(analysis.recommendations);
  }

  function renderPatterns(patterns) {
    patternList.innerHTML = "";

    if (patterns.length === 0) {
      const message = document.createElement("li");
      message.className = "no-patterns";
      message.textContent =
        "No specific impersonation modification pattern was detected.";
      patternList.appendChild(message);
      return;
    }

    patterns.forEach((pattern) => {
      const item = document.createElement("li");
      item.className = "pattern-item";

      const icon = document.createElement("div");
      icon.className = "pattern-icon";
      icon.textContent = "!";

      const content = document.createElement("div");
      const strong = document.createElement("strong");
      const description = document.createElement("div");

      strong.textContent = pattern.label;
      strong.style.color = "var(--text)";
      description.textContent = pattern.detail;

      content.append(strong, description);
      item.append(icon, content);
      patternList.appendChild(item);
    });
  }

  function renderRecommendations(recommendations) {
    recommendationList.innerHTML = "";

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

  async function copyAnalysis() {
    if (!lastAnalysis) {
      showStatus("Run a comparison before copying the summary.", "error");
      return;
    }

    const patternText = lastAnalysis.patterns.length
      ? lastAnalysis.patterns
          .map((pattern) => `- ${pattern.label}: ${pattern.detail}`)
          .join("\n")
      : "- No specific modification patterns detected.";

    const recommendationText = lastAnalysis.recommendations
      .map((recommendation) => `- ${recommendation}`)
      .join("\n");

    const summary = [
      "FOOTPRINT USERNAME SIMILARITY ANALYSIS",
      "",
      `Official username: ${lastAnalysis.official.raw}`,
      `Checked username: ${lastAnalysis.suspicious.raw}`,
      `Platform: ${lastAnalysis.platform}`,
      `Risk score: ${lastAnalysis.score}/100`,
      `Risk level: ${lastAnalysis.risk.level}`,
      `Levenshtein similarity: ${Math.round(lastAnalysis.levenshteinSimilarity * 100)}%`,
      `Jaro-Winkler similarity: ${Math.round(lastAnalysis.jaroWinklerScore * 100)}%`,
      `Edit distance: ${lastAnalysis.distance}`,
      "",
      "Detected patterns:",
      patternText,
      "",
      "Recommended checks:",
      recommendationText,
      "",
      "Note: This similarity score is an early-warning indicator and is not proof that an account is fraudulent."
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      showStatus("Analysis summary copied.", "success");
    } catch (error) {
      const textArea = document.createElement("textarea");
      textArea.value = summary;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";

      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();

      showStatus("Analysis summary copied.", "success");
    }
  }

  function resetTool() {
    officialInput.value = "";
    suspiciousInput.value = "";
    platformInput.value = "Not specified";

    lastAnalysis = null;
    resultContent.hidden = true;
    emptyState.hidden = false;

    updateCounters();
    showStatus("Enter two usernames to begin.");
    officialInput.focus();
  }

  function updateCounters() {
    officialCounter.textContent =
      `${officialInput.value.length} / 64`;

    suspiciousCounter.textContent =
      `${suspiciousInput.value.length} / 64`;
  }

  function showStatus(message, type = "") {
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ""}`;
  }

  function levenshteinDistance(first, second) {
    if (first === second) {
      return 0;
    }

    if (first.length === 0) {
      return second.length;
    }

    if (second.length === 0) {
      return first.length;
    }

    let previousRow = Array.from(
      { length: second.length + 1 },
      (_, index) => index
    );

    let currentRow = new Array(second.length + 1);

    for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
      currentRow[0] = firstIndex;

      for (
        let secondIndex = 1;
        secondIndex <= second.length;
        secondIndex += 1
      ) {
        const substitutionCost =
          first[firstIndex - 1] === second[secondIndex - 1]
            ? 0
            : 1;

        currentRow[secondIndex] = Math.min(
          currentRow[secondIndex - 1] + 1,
          previousRow[secondIndex] + 1,
          previousRow[secondIndex - 1] + substitutionCost
        );
      }

      [previousRow, currentRow] = [currentRow, previousRow];
    }

    return previousRow[second.length];
  }

  function jaroSimilarity(first, second) {
    if (first === second) {
      return 1;
    }

    if (!first.length || !second.length) {
      return 0;
    }

    const matchDistance =
      Math.max(
        0,
        Math.floor(Math.max(first.length, second.length) / 2) - 1
      );

    const firstMatches = new Array(first.length).fill(false);
    const secondMatches = new Array(second.length).fill(false);

    let matches = 0;

    for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
      const start = Math.max(0, firstIndex - matchDistance);
      const end = Math.min(
        firstIndex + matchDistance + 1,
        second.length
      );

      for (
        let secondIndex = start;
        secondIndex < end;
        secondIndex += 1
      ) {
        if (secondMatches[secondIndex]) {
          continue;
        }

        if (first[firstIndex] !== second[secondIndex]) {
          continue;
        }

        firstMatches[firstIndex] = true;
        secondMatches[secondIndex] = true;
        matches += 1;
        break;
      }
    }

    if (matches === 0) {
      return 0;
    }

    let transpositions = 0;
    let secondIndex = 0;

    for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
      if (!firstMatches[firstIndex]) {
        continue;
      }

      while (!secondMatches[secondIndex]) {
        secondIndex += 1;
      }

      if (first[firstIndex] !== second[secondIndex]) {
        transpositions += 1;
      }

      secondIndex += 1;
    }

    transpositions /= 2;

    return (
      matches / first.length +
      matches / second.length +
      (matches - transpositions) / matches
    ) / 3;
  }

  function jaroWinkler(first, second) {
    const jaro = jaroSimilarity(first, second);

    let prefixLength = 0;
    const maximumPrefix = Math.min(4, first.length, second.length);

    while (
      prefixLength < maximumPrefix &&
      first[prefixLength] === second[prefixLength]
    ) {
      prefixLength += 1;
    }

    const scalingFactor = 0.1;

    return jaro +
      prefixLength * scalingFactor * (1 - jaro);
  }

  function commonPrefixLength(first, second) {
    const maximum = Math.min(first.length, second.length);
    let index = 0;

    while (
      index < maximum &&
      first[index] === second[index]
    ) {
      index += 1;
    }

    return index;
  }

  function isSingleAdjacentTransposition(first, second) {
    if (
      first.length !== second.length ||
      first.length < 2 ||
      first === second
    ) {
      return false;
    }

    const differences = [];

    for (let index = 0; index < first.length; index += 1) {
      if (first[index] !== second[index]) {
        differences.push(index);
      }
    }

    if (
      differences.length !== 2 ||
      differences[1] !== differences[0] + 1
    ) {
      return false;
    }

    const firstIndex = differences[0];
    const secondIndex = differences[1];

    return (
      first[firstIndex] === second[secondIndex] &&
      first[secondIndex] === second[firstIndex]
    );
  }

  function deduplicatePatterns(patterns) {
    const seen = new Set();

    return patterns.filter((pattern) => {
      if (seen.has(pattern.id)) {
        return false;
      }

      seen.add(pattern.id);
      return true;
    });
  }
});
