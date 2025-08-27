# LinkedIn Job Filter Chrome Extension

A Chrome extension that hides unwanted job postings on LinkedIn based on two filters:
1. **Promoted Jobs**
2. **Specific Company Names**

This helps you focus only on relevant job postings and avoid scams or jobs with high competition.

---

## 🚀 Features
- Automatically hide **Promoted** job postings.
- Hide job postings from **specific companies** (configurable).
- Lightweight and fast.
- Easy to enable/disable.

---

## 🛠️ Tech Stack
- **JavaScript** (Vanilla)
- **HTML & CSS**
- **Chrome Extensions API**
- **MutationObserver** (to detect dynamically loaded jobs)

---

## 📂 Project Structure
```
linkedin-job-filter/
│── manifest.json          # Chrome extension manifest file
│── background.js          # Handles events in the background
│── content.js             # Core logic to hide jobs
│── popup.html             # UI for settings (optional)
│── popup.js               # Logic for settings (optional)
│── styles.css             # Styles for popup UI
│── README.md              # Documentation
```

---

## ⚙️ How It Works
1. **content.js** runs on LinkedIn job pages.
2. It scans the DOM for job cards.
3. If the job is **Promoted** or from a blocked company, the extension hides it.
4. Uses **MutationObserver** to handle dynamically loaded job posts.

---

## 🔧 Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/linkedin-job-filter.git
   ```
2. Open **Chrome** and go to:
   ```
   chrome://extensions/
   ```
3. Enable **Developer Mode** (top right).
4. Click **Load unpacked**.
5. Select the project folder.
6. Navigate to LinkedIn Jobs and watch unwanted postings disappear.

---

## ⚙️ Configuration
- You can edit the `blockedCompanies` array in **content.js** to add/remove companies:
```js
const blockedCompanies = ["ABC Corp", "XYZ Ltd", "ScamCompany"];
```

---

## 📌 Next Steps
- [ ] Add settings UI for managing blocked companies.
- [ ] Sync settings using Chrome Storage API.
- [ ] Publish on Chrome Web Store.

---

## 📜 License
MIT License © 2025
