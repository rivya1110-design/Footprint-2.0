document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const MAX_DIMENSION = 2200;
  const MAGIC = "FPW1";

  const protectTabBtn = document.getElementById("protectTabBtn");
  const verifyTabBtn = document.getElementById("verifyTabBtn");
  const protectPanel = document.getElementById("protectPanel");
  const verifyPanel = document.getElementById("verifyPanel");

  const imageInput = document.getElementById("imageInput");
  const ownerInput = document.getElementById("ownerInput");
  const protectionIdInput = document.getElementById("protectionIdInput");

  const visibleToggle = document.getElementById("visibleToggle");
  const invisibleToggle = document.getElementById("invisibleToggle");
  const noiseToggle = document.getElementById("noiseToggle");

  const visibleControls = document.getElementById("visibleControls");
  const noiseControls = document.getElementById("noiseControls");

  const watermarkTextInput = document.getElementById("watermarkTextInput");
  const opacityInput = document.getElementById("opacityInput");
  const opacityValue = document.getElementById("opacityValue");
  const sizeInput = document.getElementById("sizeInput");
  const sizeValue = document.getElementById("sizeValue");
  const positionInput = document.getElementById("positionInput");
  const tileToggle = document.getElementById("tileToggle");
  const noiseStrengthInput = document.getElementById("noiseStrengthInput");
  const noiseStrengthValue = document.getElementById("noiseStrengthValue");

  const applyBtn = document.getElementById("applyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const resetBtn = document.getElementById("resetBtn");
  const protectStatus = document.getElementById("protectStatus");

  const originalCanvas = document.getElementById("originalCanvas");
  const protectedCanvas = document.getElementById("protectedCanvas");
  const originalEmpty = document.getElementById("originalEmpty");
  const protectedEmpty = document.getElementById("protectedEmpty");

  const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
  const protectedContext = protectedCanvas.getContext("2d", { willReadFrequently: true });

  const verifyImageInput = document.getElementById("verifyImageInput");
  const verifyBtn = document.getElementById("verifyBtn");
  const verifyStatus = document.getElementById("verifyStatus");
  const verifyResult = document.getElementById("verifyResult");

  const analysisPanel = document.getElementById("perturbationAnalysis");
  const changedPixelCount = document.getElementById("changedPixelCount");
  const changedPixelPercent = document.getElementById("changedPixelPercent");
  const averageChannelChange = document.getElementById("averageChannelChange");
  const maximumChannelChange = document.getElementById("maximumChannelChange");
  const differenceCanvas = document.getElementById("differenceCanvas");

  let loadedImage = null;
  let outputReady = false;
  let originalFileBase = "protected-image";
  let currentProtectionId = createProtectionId();

  lockProtectionId(currentProtectionId);

  protectTabBtn.addEventListener("click", () => switchTab("protect"));
  verifyTabBtn.addEventListener("click", () => switchTab("verify"));

  imageInput.addEventListener("change", loadProtectionImage);
  verifyImageInput.addEventListener("change", () => {
    verifyBtn.disabled = !verifyImageInput.files?.[0];
    showStatus(verifyStatus, verifyBtn.disabled ? "Choose an image to verify." : "Image ready for verification.");
    resetVerificationResult();
  });

  visibleToggle.addEventListener("change", updateControlVisibility);
  noiseToggle.addEventListener("change", updateControlVisibility);
  opacityInput.addEventListener("input", () => {
    opacityValue.textContent = `${opacityInput.value}%`;
  });
  sizeInput.addEventListener("input", () => {
    sizeValue.textContent = sizeInput.value;
  });
  noiseStrengthInput.addEventListener("input", () => {
    noiseStrengthValue.textContent = noiseStrengthInput.value;
  });

  applyBtn.addEventListener("click", applyProtection);
  downloadBtn.addEventListener("click", downloadProtectedImage);
  resetBtn.addEventListener("click", resetProtectionTool);
  verifyBtn.addEventListener("click", verifyHiddenWatermark);

  updateControlVisibility();

  function switchTab(tabName) {
    const protectSelected = tabName === "protect";

    protectTabBtn.classList.toggle("active", protectSelected);
    verifyTabBtn.classList.toggle("active", !protectSelected);
    protectTabBtn.setAttribute("aria-selected", String(protectSelected));
    verifyTabBtn.setAttribute("aria-selected", String(!protectSelected));
    protectPanel.hidden = !protectSelected;
    verifyPanel.hidden = protectSelected;
  }

  function updateControlVisibility() {
    visibleControls.hidden = !visibleToggle.checked;
    noiseControls.hidden = !noiseToggle.checked;
  }

  async function loadProtectionImage() {
    const file = imageInput.files?.[0];

    if (!file) {
      resetImagePreview();
      return;
    }

    if (!file.type.startsWith("image/")) {
      showStatus(protectStatus, "Please choose a valid image file.", "error");
      resetImagePreview();
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showStatus(protectStatus, "The image is too large. Choose a file below 20 MB.", "error");
      resetImagePreview();
      return;
    }

    try {
      loadedImage = await fileToImage(file);
      originalFileBase = cleanFileName(file.name);
      lockProtectionId(createProtectionId());

      const { width, height } = calculateCanvasSize(
        loadedImage.naturalWidth,
        loadedImage.naturalHeight,
        MAX_DIMENSION
      );

      setCanvasSize(originalCanvas, width, height);
      setCanvasSize(protectedCanvas, width, height);

      originalContext.clearRect(0, 0, width, height);
      originalContext.drawImage(loadedImage, 0, 0, width, height);

      originalCanvas.hidden = false;
      originalEmpty.hidden = true;
      protectedCanvas.hidden = true;
      protectedEmpty.hidden = false;
      outputReady = false;

      applyBtn.disabled = false;
      downloadBtn.disabled = true;

      showStatus(
        protectStatus,
        `Loaded ${width} × ${height}. Select protection options and click Apply protection.`,
        "success"
      );
    } catch (error) {
      console.error(error);
      showStatus(protectStatus, "The selected image could not be loaded.", "error");
      resetImagePreview();
    }
  }

  function applyProtection() {
    if (!loadedImage) {
      showStatus(protectStatus, "Choose an image first.", "error");
      return;
    }

    const owner = ownerInput.value.trim();
    const protectionId = currentProtectionId;
    const useVisible = visibleToggle.checked;
    const useInvisible = invisibleToggle.checked;
    const useNoise = noiseToggle.checked;

    if (!owner) {
      showStatus(protectStatus, "Enter the owner or creator name.", "error");
      ownerInput.focus();
      return;
    }

    if (!useVisible && !useInvisible && !useNoise) {
      showStatus(protectStatus, "Select at least one protection method.", "error");
      return;
    }

    applyBtn.disabled = true;
    downloadBtn.disabled = true;
    showStatus(protectStatus, "Applying protection…");

    window.setTimeout(() => {
      try {
        protectedContext.clearRect(0, 0, protectedCanvas.width, protectedCanvas.height);
        protectedContext.drawImage(originalCanvas, 0, 0);

        let perturbationStats = null;

        if (useNoise) {
          const originalData = protectedContext.getImageData(
            0,
            0,
            protectedCanvas.width,
            protectedCanvas.height
          );

          const perturbedData = new ImageData(
            new Uint8ClampedArray(originalData.data),
            originalData.width,
            originalData.height
          );

          const noiseSeed = hashString(
            `${owner}|${protectionId}|${protectedCanvas.width}|${protectedCanvas.height}`
          );

          perturbationStats = applyStructuredPerturbation(
            perturbedData,
            Number(noiseStrengthInput.value),
            noiseSeed
          );

          protectedContext.putImageData(perturbedData, 0, 0);
          renderPerturbationAnalysis(originalData, perturbedData, perturbationStats);
        } else {
          clearPerturbationAnalysis();
        }

        let visibleText = null;

        if (useVisible) {
          visibleText = watermarkTextInput.value.trim() ||
            `© ${owner} • Protected by Footprint`;

          drawVisibleWatermark(protectedContext, protectedCanvas, {
            text: visibleText,
            opacity: Number(opacityInput.value) / 100,
            fontSize: Number(sizeInput.value),
            position: positionInput.value,
            tiled: tileToggle.checked
          });
        }

        /*
         * Every protected PNG receives a small checksum-protected Footprint
         * verification signature. This lets the verifier recognise visible-only,
         * perturbation-only and combined outputs.
         *
         * The full owner identity is stored only when the user enables the
         * Invisible ownership watermark option.
         */
        const metadata = {
          format: MAGIC,
          recordType: useInvisible ? "ownership" : "verification",
          owner: useInvisible ? owner : null,
          visibleOwnerLabel: useVisible ? owner : null,
          visibleText: useVisible ? visibleText : null,
          protectionId,
          createdAt: new Date().toISOString(),
          sourceTool: "Footprint",
          methods: {
            visibleWatermark: useVisible,
            invisibleWatermark: useInvisible,
            experimentalPerturbation: useNoise
          },
          perturbation: useNoise ? {
            algorithm: "edge-aware-wave-v1",
            strength: Number(noiseStrengthInput.value),
            changedPixels: perturbationStats.changedPixels,
            changedPercent: Number(perturbationStats.changedPercent.toFixed(2)),
            averageChannelChange: Number(perturbationStats.averageChannelChange.toFixed(3)),
            maximumChannelChange: perturbationStats.maximumChannelChange
          } : null
        };

        const encodedRecord = encodeOwnershipRecord(metadata);
        const finalImageData = protectedContext.getImageData(
          0,
          0,
          protectedCanvas.width,
          protectedCanvas.height
        );

        embedBytesInImage(finalImageData, encodedRecord);
        protectedContext.putImageData(finalImageData, 0, 0);

        protectedCanvas.hidden = false;
        protectedEmpty.hidden = true;
        outputReady = true;

        applyBtn.disabled = false;
        downloadBtn.disabled = false;

        const recordMessage = useInvisible
          ? ` Hidden ownership record: ${encodedRecord.length} bytes.`
          : ` Verification signature: ${encodedRecord.length} bytes.`;

        const aiMessage = useNoise
          ? ` Structured perturbation changed ${perturbationStats.changedPercent.toFixed(2)}% of pixels.`
          : "";

        showStatus(
          protectStatus,
          `Protection applied successfully.${recordMessage}${aiMessage} Download as PNG to preserve verification data.`,
          "success"
        );
      } catch (error) {
        console.error(error);
        applyBtn.disabled = false;
        showStatus(protectStatus, error.message || "Image protection failed.", "error");
      }
    }, 30);
  }

  function applyStructuredPerturbation(imageData, strength, seed) {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const safeStrength = Math.max(1, Math.min(8, Math.round(strength)));
    const random = createSeededRandom(seed);

    const luminance = new Float32Array(width * height);
    const waveX1 = new Float32Array(width);
    const waveX2 = new Float32Array(width);
    const waveY1 = new Float32Array(height);
    const waveY2 = new Float32Array(height);

    const phase1 = random() * Math.PI * 2;
    const phase2 = random() * Math.PI * 2;

    for (let x = 0; x < width; x += 1) {
      waveX1[x] = Math.sin(x * 0.083 + phase1);
      waveX2[x] = Math.cos(x * 0.037 + phase2);
    }

    for (let y = 0; y < height; y += 1) {
      waveY1[y] = Math.cos(y * 0.071 + phase2);
      waveY2[y] = Math.sin(y * 0.109 + phase1);
    }

    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const dataIndex = pixelIndex * 4;
      luminance[pixelIndex] =
        pixels[dataIndex] * 0.2126 +
        pixels[dataIndex + 1] * 0.7152 +
        pixels[dataIndex + 2] * 0.0722;
    }

    let changedPixels = 0;
    let totalChannelChange = 0;
    let maximumChannelChange = 0;

    const luminanceAt = (x, y) => {
      const safeX = Math.max(0, Math.min(width - 1, x));
      const safeY = Math.max(0, Math.min(height - 1, y));
      return luminance[safeY * width + safeX];
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        const dataIndex = pixelIndex * 4;

        if (pixels[dataIndex + 3] === 0) {
          continue;
        }

        const gradientX = Math.abs(
          luminanceAt(x + 1, y) - luminanceAt(x - 1, y)
        );
        const gradientY = Math.abs(
          luminanceAt(x, y + 1) - luminanceAt(x, y - 1)
        );

        const edgeStrength = Math.min(1, (gradientX + gradientY) / 150);
        const checker = (((x >> 1) + (y >> 1)) & 1) === 0 ? 1 : -1;
        const seededVariation = random() * 2 - 1;

        const waveSignal =
          0.34 * waveX1[x] +
          0.27 * waveY1[y] +
          0.18 * waveX2[x] * waveY2[y] +
          0.13 * checker +
          0.08 * seededVariation;

        const localAmplitude =
          safeStrength * (0.38 + edgeStrength * 0.72);

        let redDelta = Math.round(waveSignal * localAmplitude);
        let greenDelta = Math.round(
          (-0.72 * waveSignal + 0.22 * waveX2[x]) * localAmplitude
        );
        let blueDelta = Math.round(
          (0.54 * waveSignal - 0.26 * waveY2[y]) * localAmplitude
        );

        if (
          redDelta === 0 &&
          greenDelta === 0 &&
          blueDelta === 0 &&
          ((x + y + seed) & 3) === 0
        ) {
          redDelta = checker;
          greenDelta = -checker;
        }

        const originalRed = pixels[dataIndex];
        const originalGreen = pixels[dataIndex + 1];
        const originalBlue = pixels[dataIndex + 2];

        const newRed = clampChannel(originalRed + redDelta);
        const newGreen = clampChannel(originalGreen + greenDelta);
        const newBlue = clampChannel(originalBlue + blueDelta);

        const redChange = Math.abs(newRed - originalRed);
        const greenChange = Math.abs(newGreen - originalGreen);
        const blueChange = Math.abs(newBlue - originalBlue);
        const pixelChange = redChange + greenChange + blueChange;

        if (pixelChange > 0) {
          changedPixels += 1;
        }

        totalChannelChange += pixelChange;
        maximumChannelChange = Math.max(
          maximumChannelChange,
          redChange,
          greenChange,
          blueChange
        );

        pixels[dataIndex] = newRed;
        pixels[dataIndex + 1] = newGreen;
        pixels[dataIndex + 2] = newBlue;
      }
    }

    const totalPixels = width * height;

    return {
      changedPixels,
      changedPercent: totalPixels === 0
        ? 0
        : (changedPixels / totalPixels) * 100,
      averageChannelChange: totalPixels === 0
        ? 0
        : totalChannelChange / (totalPixels * 3),
      maximumChannelChange
    };
  }

  function renderPerturbationAnalysis(originalData, modifiedData, stats) {
    if (!analysisPanel || !differenceCanvas) {
      return;
    }

    changedPixelCount.textContent = stats.changedPixels.toLocaleString();
    changedPixelPercent.textContent = `${stats.changedPercent.toFixed(2)}%`;
    averageChannelChange.textContent = stats.averageChannelChange.toFixed(3);
    maximumChannelChange.textContent = String(stats.maximumChannelChange);

    const maxWidth = 720;
    const maxHeight = 360;
    const scale = Math.min(
      1,
      maxWidth / originalData.width,
      maxHeight / originalData.height
    );

    const heatmapWidth = Math.max(1, Math.round(originalData.width * scale));
    const heatmapHeight = Math.max(1, Math.round(originalData.height * scale));

    differenceCanvas.width = heatmapWidth;
    differenceCanvas.height = heatmapHeight;

    const context = differenceCanvas.getContext("2d");
    const heatmap = context.createImageData(heatmapWidth, heatmapHeight);

    for (let y = 0; y < heatmapHeight; y += 1) {
      const sourceY = Math.min(
        originalData.height - 1,
        Math.floor(y / scale)
      );

      for (let x = 0; x < heatmapWidth; x += 1) {
        const sourceX = Math.min(
          originalData.width - 1,
          Math.floor(x / scale)
        );

        const sourceIndex = (sourceY * originalData.width + sourceX) * 4;
        const targetIndex = (y * heatmapWidth + x) * 4;

        const difference = (
          Math.abs(originalData.data[sourceIndex] - modifiedData.data[sourceIndex]) +
          Math.abs(originalData.data[sourceIndex + 1] - modifiedData.data[sourceIndex + 1]) +
          Math.abs(originalData.data[sourceIndex + 2] - modifiedData.data[sourceIndex + 2])
        ) / 3;

        const amplified = Math.min(255, Math.round(difference * 30));

        heatmap.data[targetIndex] = Math.min(255, 18 + amplified);
        heatmap.data[targetIndex + 1] = Math.min(255, 8 + amplified * 0.28);
        heatmap.data[targetIndex + 2] = Math.min(255, 24 + amplified * 0.72);
        heatmap.data[targetIndex + 3] = 255;
      }
    }

    context.putImageData(heatmap, 0, 0);
    analysisPanel.hidden = false;
  }

  function clearPerturbationAnalysis() {
    if (!analysisPanel) {
      return;
    }

    analysisPanel.hidden = true;

    if (differenceCanvas) {
      const context = differenceCanvas.getContext("2d");
      context.clearRect(0, 0, differenceCanvas.width, differenceCanvas.height);
    }
  }

  function drawVisibleWatermark(context, canvas, options) {
    context.save();
    context.font = `700 ${options.fontSize}px Inter, Arial, sans-serif`;
    context.textBaseline = "middle";
    context.lineJoin = "round";

    if (options.tiled) {
      drawTiledWatermark(context, canvas, options);
    } else {
      drawSingleWatermark(context, canvas, options);
    }

    context.restore();
  }

  function drawSingleWatermark(context, canvas, options) {
    const padding = Math.max(12, Math.round(options.fontSize * 0.55));
    const metrics = context.measureText(options.text);
    const textWidth = metrics.width;
    const boxWidth = textWidth + padding * 2;
    const boxHeight = options.fontSize + padding * 1.25;
    const margin = Math.max(14, Math.round(canvas.width * 0.012));

    let x = margin;
    let y = margin;

    switch (options.position) {
      case "top-right":
        x = canvas.width - boxWidth - margin;
        y = margin;
        break;
      case "bottom-left":
        x = margin;
        y = canvas.height - boxHeight - margin;
        break;
      case "bottom-right":
        x = canvas.width - boxWidth - margin;
        y = canvas.height - boxHeight - margin;
        break;
      case "center":
        x = (canvas.width - boxWidth) / 2;
        y = (canvas.height - boxHeight) / 2;
        break;
      default:
        x = margin;
        y = margin;
    }

    x = Math.max(0, Math.min(canvas.width - boxWidth, x));
    y = Math.max(0, Math.min(canvas.height - boxHeight, y));

    context.globalAlpha = Math.min(0.85, options.opacity + 0.18);
    context.fillStyle = "rgba(24, 10, 25, 0.78)";
    drawRoundedRectangle(context, x, y, boxWidth, boxHeight, Math.max(8, options.fontSize / 2));
    context.fill();

    context.globalAlpha = options.opacity;
    context.lineWidth = Math.max(2, options.fontSize * 0.08);
    context.strokeStyle = "rgba(30, 10, 30, 0.9)";
    context.fillStyle = "rgb(255, 198, 249)";
    context.strokeText(options.text, x + padding, y + boxHeight / 2);
    context.fillText(options.text, x + padding, y + boxHeight / 2);
  }

  function drawTiledWatermark(context, canvas, options) {
    const spacingX = Math.max(220, context.measureText(options.text).width + 100);
    const spacingY = Math.max(130, options.fontSize * 4);

    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-Math.PI / 7);
    context.translate(-canvas.width / 2, -canvas.height / 2);
    context.globalAlpha = Math.min(0.55, options.opacity);
    context.fillStyle = "rgb(255, 198, 249)";
    context.strokeStyle = "rgba(30, 10, 30, 0.8)";
    context.lineWidth = Math.max(1, options.fontSize * 0.06);

    for (let y = -canvas.height; y < canvas.height * 2; y += spacingY) {
      for (let x = -canvas.width; x < canvas.width * 2; x += spacingX) {
        context.strokeText(options.text, x, y);
        context.fillText(options.text, x, y);
      }
    }
  }

  function encodeOwnershipRecord(metadata) {
    const encoder = new TextEncoder();
    const magicBytes = encoder.encode(MAGIC);
    const payloadBytes = encoder.encode(JSON.stringify(metadata));
    const checksum = hashBytes(payloadBytes);

    const record = new Uint8Array(4 + 4 + payloadBytes.length + 4);
    const view = new DataView(record.buffer);

    record.set(magicBytes, 0);
    view.setUint32(4, payloadBytes.length, false);
    record.set(payloadBytes, 8);
    view.setUint32(8 + payloadBytes.length, checksum, false);

    return record;
  }

  function embedBytesInImage(imageData, bytes) {
    const capacityBits = imageData.width * imageData.height * 3;
    const requiredBits = bytes.length * 8;

    if (requiredBits > capacityBits) {
      throw new Error("The image is too small to store the hidden ownership record.");
    }

    for (let bitIndex = 0; bitIndex < requiredBits; bitIndex += 1) {
      const byte = bytes[Math.floor(bitIndex / 8)];
      const bit = (byte >> (7 - (bitIndex % 8))) & 1;
      const channelIndex = getWritableChannelIndex(bitIndex);
      imageData.data[channelIndex] = (imageData.data[channelIndex] & 0xfe) | bit;
    }
  }

  async function verifyHiddenWatermark() {
    const file = verifyImageInput.files?.[0];

    if (!file) {
      showStatus(verifyStatus, "Choose an image first.", "error");
      return;
    }

    verifyBtn.disabled = true;
    showStatus(verifyStatus, "Checking pixel data…");

    try {
      const image = await fileToImage(file);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const metadata = extractOwnershipRecord(imageData);

      showVerificationSuccess(metadata);
      showStatus(
        verifyStatus,
        "Footprint protection record detected and checksum verified.",
        "success"
      );
    } catch (error) {
      console.error(error);
      showVerificationFailure(error.message || "No valid Footprint watermark was found.");
      showStatus(
        verifyStatus,
        "No valid Footprint protection record was detected.",
        "warning"
      );
    } finally {
      verifyBtn.disabled = false;
    }
  }

  function extractOwnershipRecord(imageData) {
    const headerBytes = readBytesFromImage(imageData, 8);
    const decoder = new TextDecoder();
    const magic = decoder.decode(headerBytes.slice(0, 4));

    if (magic !== MAGIC) {
      throw new Error("Footprint watermark signature not found.");
    }

    const headerView = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
    const payloadLength = headerView.getUint32(4, false);

    if (payloadLength < 2 || payloadLength > 65536) {
      throw new Error("The hidden watermark length is invalid.");
    }

    const totalBytes = 8 + payloadLength + 4;
    const capacityBytes = Math.floor((imageData.width * imageData.height * 3) / 8);

    if (totalBytes > capacityBytes) {
      throw new Error("The hidden watermark is incomplete.");
    }

    const fullRecord = readBytesFromImage(imageData, totalBytes);
    const payload = fullRecord.slice(8, 8 + payloadLength);
    const checksumView = new DataView(
      fullRecord.buffer,
      fullRecord.byteOffset + 8 + payloadLength,
      4
    );
    const storedChecksum = checksumView.getUint32(0, false);
    const calculatedChecksum = hashBytes(payload);

    if (storedChecksum !== calculatedChecksum) {
      throw new Error("The watermark was found but its checksum is damaged.");
    }

    const metadata = JSON.parse(decoder.decode(payload));

    if (
      !metadata ||
      metadata.format !== MAGIC ||
      !metadata.protectionId ||
      !metadata.methods
    ) {
      throw new Error("The Footprint verification record is invalid.");
    }

    return metadata;
  }

  function readBytesFromImage(imageData, byteCount) {
    const requiredBits = byteCount * 8;
    const capacityBits = imageData.width * imageData.height * 3;

    if (requiredBits > capacityBits) {
      throw new Error("The image is too small to contain a Footprint watermark.");
    }

    const bytes = new Uint8Array(byteCount);

    for (let bitIndex = 0; bitIndex < requiredBits; bitIndex += 1) {
      const channelIndex = getWritableChannelIndex(bitIndex);
      const bit = imageData.data[channelIndex] & 1;
      bytes[Math.floor(bitIndex / 8)] |= bit << (7 - (bitIndex % 8));
    }

    return bytes;
  }

  function getWritableChannelIndex(bitIndex) {
    const pixelIndex = Math.floor(bitIndex / 3);
    const channelOffset = bitIndex % 3;
    return pixelIndex * 4 + channelOffset;
  }

  function showVerificationSuccess(metadata) {
    const methods = [];

    if (metadata.methods?.visibleWatermark) methods.push("Visible watermark");
    if (metadata.methods?.invisibleWatermark) methods.push("Invisible watermark");
    if (metadata.methods?.experimentalPerturbation) methods.push("Experimental perturbation");

    verifyResult.className = "result-state detected";
    verifyResult.innerHTML = "";

    const heading = document.createElement("h3");
    heading.textContent = metadata.methods?.invisibleWatermark
      ? "✓ Footprint ownership watermark detected"
      : "✓ Footprint protection detected";

    const list = document.createElement("div");
    list.className = "result-list";

    appendResultItem(
      list,
      "Owner",
      metadata.owner ||
        metadata.visibleOwnerLabel ||
        "Not embedded (verification signature only)"
    );
    appendResultItem(list, "Protection ID", metadata.protectionId || "Not recorded");
    appendResultItem(list, "Created", formatDate(metadata.createdAt));
    appendResultItem(list, "Protection", methods.join(", ") || "Verification signature");
    appendResultItem(
      list,
      "Record type",
      metadata.recordType === "ownership"
        ? "Hidden ownership record"
        : "Footprint verification signature"
    );

    if (metadata.perturbation) {
      appendResultItem(
        list,
        "AI-resistance",
        `${metadata.perturbation.algorithm}, strength ${metadata.perturbation.strength}`
      );
      appendResultItem(
        list,
        "Pixels changed",
        `${metadata.perturbation.changedPercent}%`
      );
    }

    appendResultItem(list, "Integrity", "Checksum valid");

    verifyResult.append(heading, list);
  }

  function showVerificationFailure(message) {
    verifyResult.className = "result-state not-found";
    verifyResult.innerHTML = "";

    const heading = document.createElement("h3");
    heading.textContent = "No valid Footprint protection record found";

    const paragraph = document.createElement("p");
    paragraph.textContent = message;

    verifyResult.append(heading, paragraph);
  }

  function appendResultItem(container, label, value) {
    const row = document.createElement("div");
    row.className = "result-item";

    const strong = document.createElement("strong");
    strong.textContent = label;

    const span = document.createElement("span");
    span.textContent = value;

    row.append(strong, span);
    container.appendChild(row);
  }

  function downloadProtectedImage() {
    if (!outputReady || protectedCanvas.hidden) {
      showStatus(protectStatus, "Apply protection before downloading.", "error");
      return;
    }

    protectedCanvas.toBlob((blob) => {
      if (!blob) {
        showStatus(protectStatus, "The protected image could not be exported.", "error");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const methods = [];

      if (visibleToggle.checked) methods.push("visible");
      if (invisibleToggle.checked) methods.push("hidden");
      if (noiseToggle.checked) methods.push("ai");

      const methodLabel = methods.join("-");

      link.download =
          `${originalFileBase}-footprint-${methodLabel}-protected.png`;

      link.href = url;
      // link.download = `${originalFileBase}-footprint-protected.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus(protectStatus, "Protected PNG downloaded successfully.", "success");
    }, "image/png");
  }

  function resetProtectionTool() {
    imageInput.value = "";
    ownerInput.value = "";
    watermarkTextInput.value = "";
    lockProtectionId(createProtectionId());
    visibleToggle.checked = true;
    invisibleToggle.checked = true;
    noiseToggle.checked = true;
    tileToggle.checked = false;
    opacityInput.value = "45";
    sizeInput.value = "32";
    positionInput.value = "bottom-right";
    noiseStrengthInput.value = "3";
    opacityValue.textContent = "45%";
    sizeValue.textContent = "32";
    noiseStrengthValue.textContent = "3";
    updateControlVisibility();
    resetImagePreview();
    clearPerturbationAnalysis();
    showStatus(protectStatus, "Select an image to begin.");
  }

  function resetImagePreview() {
    loadedImage = null;
    outputReady = false;
    originalContext.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
    protectedContext.clearRect(0, 0, protectedCanvas.width, protectedCanvas.height);
    originalCanvas.hidden = true;
    protectedCanvas.hidden = true;
    originalEmpty.hidden = false;
    protectedEmpty.hidden = false;
    applyBtn.disabled = true;
    downloadBtn.disabled = true;
    clearPerturbationAnalysis();
  }

  function resetVerificationResult() {
    verifyResult.className = "result-state";
    verifyResult.textContent = "Upload a Footprint-protected PNG and select “Detect Footprint protection”.";
  }

  function showStatus(element, message, type = "") {
    element.textContent = message;
    element.className = `status${type ? ` ${type}` : ""}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "Not recorded") : date.toLocaleString();
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Invalid image file."));
      };

      image.src = objectUrl;
    });
  }

  function calculateCanvasSize(width, height, maxDimension) {
    if (width <= maxDimension && height <= maxDimension) {
      return { width, height };
    }

    const scale = Math.min(maxDimension / width, maxDimension / height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  function setCanvasSize(canvas, width, height) {
    canvas.width = width;
    canvas.height = height;
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function createProtectionId() {
    if (typeof crypto.randomUUID === "function") {
      return `FP-${crypto.randomUUID().toUpperCase()}`;
    }

    const randomValues = crypto.getRandomValues(new Uint32Array(4));
    const randomPart = Array.from(randomValues, value =>
      value.toString(16).toUpperCase().padStart(8, "0")
    ).join("-");

    return `FP-${randomPart}`;
  }

  function lockProtectionId(newProtectionId) {
    currentProtectionId = newProtectionId;

    protectionIdInput.value = currentProtectionId;
    protectionIdInput.readOnly = true;
    protectionIdInput.setAttribute("readonly", "");
    protectionIdInput.setAttribute("aria-readonly", "true");
    protectionIdInput.autocomplete = "off";
    protectionIdInput.spellcheck = false;
  }

  function cleanFileName(fileName) {
    const base = fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return base || "protected-image";
  }

  function hashString(value) {
    let hash = 2166136261;

    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  function hashBytes(bytes) {
    let hash = 2166136261;

    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  function createSeededRandom(initialSeed) {
    let seed = initialSeed >>> 0;

    return function seededRandom() {
      seed += 0x6d2b79f5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawRoundedRectangle(context, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);

    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + width, y, x + width, y + height, safeRadius);
    context.arcTo(x + width, y + height, x, y + height, safeRadius);
    context.arcTo(x, y + height, x, y, safeRadius);
    context.arcTo(x, y, x + width, y, safeRadius);
    context.closePath();
  }
});
