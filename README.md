# Footprint 🐾

Footprint is a Chrome browser extension designed to help users browse more safely, protect their digital identity, and improve their cyber-hygiene awareness.

The extension combines website risk detection, image protection, username similarity checking, and browsing-safety insights in one simple interface.

## Features

### 🔍 URL & Website Scanner
- Automatically checks visited websites for possible risks.
- Uses VirusTotal results and phishing-related indicators.
- Provides an easy-to-understand website risk rating.
- Stores scan history for later review.

### 📥 Download Safety
- Helps users identify potentially unsafe downloads.
- Provides warnings before suspicious files are opened.

### 🖼️ AI-Resistant Image Protection
- Adds customizable visible watermarks.
- Embeds hidden ownership information.
- Applies experimental pixel-level protection.
- Helps discourage unauthorized image reuse.

### 👤 Username Similarity Checker
- Compares an official username with a suspicious username.
- Detects character substitutions, separators, numbers, and look-alike Unicode letters.
- Generates an explainable impersonation risk score.

### 🛡️ Cyber Hygiene Dashboard
- Reviews browsing habits using website scan history.
- Calculates an estimated cyber-hygiene score.
- Identifies repeated risky domains.
- Provides personalized safety recommendations.

## How It Works

1. Install the Footprint extension in Google Chrome.
2. Browse websites normally.
3. Footprint runs in the background and checks for possible risks.
4. Open the extension to access scan history, image protection, username checking, and cyber-hygiene tools.

## Installation

Footprint is currently installed manually as an unpacked Chrome extension.

1. Download or clone this repository:

```bash
git clone https://github.com/rivya1110-design/Footprint-2.0.git
```

2. Open Google Chrome.
3. Go to:

```text
chrome://extensions/
```

4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the folder containing the Footprint extension files.
7. Pin Footprint from the Chrome extensions menu.

## Website

The Footprint download page is available through GitHub Pages:

```text
https://rivya1110-design.github.io/Footprint-2.0/footprint-download.html
```

## Technologies Used

- HTML
- CSS
- JavaScript
- Chrome Extension Manifest V3
- Chrome Extension APIs
- VirusTotal API
- GitHub Pages

## Project Structure

```text
Footprint-2.0/
├── manifest.json
├── popup.html
├── popup.js
├── background.js
├── content.js
├── footprint-download.html
├── index.js
├── icon/
├── images/
└── README.md
```

The exact file structure may differ depending on the current version of the project.

## Privacy

Footprint is designed to support safer browsing without requiring users to create an account. Sensitive information should not be stored unnecessarily, and API keys should never be uploaded directly to a public GitHub repository.

Use environment-safe methods or restricted API configurations when connecting external services.

## Current Status

Footprint is under active development as a Final Year Project. Features may be improved, changed, or expanded during development.

## Future Improvements

- Publish Footprint on the Chrome Web Store.
- Improve website risk-scoring accuracy.
- Add stronger download analysis.
- Expand impersonation detection.
- Improve image ownership verification.
- Add more detailed cyber-hygiene reports.

## Author

**Rivyashiniy Jayaraj**  
Asia Pacific University of Technology & Innovation  
Final Year Project — 2026

## Disclaimer

Footprint is an educational cybersecurity awareness tool. Its results should be treated as guidance and not as a replacement for professional security software or a complete security assessment.

## License

This project is intended for academic and educational use. Add a license file before allowing redistribution or commercial use.
