class PopupManager {
  constructor() {
    this.settings = {
      hidePromoted: true,
      blacklistedCompanies: []
    };
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['hidePromoted', 'blacklistedCompanies']);
      this.settings.hidePromoted = result.hidePromoted !== false;
      this.settings.blacklistedCompanies = result.blacklistedCompanies || [];
    } catch (error) {
      console.log('Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set(this.settings);
      this.notifyContentScript();
    } catch (error) {
      console.log('Error saving settings:', error);
    }
  }

  async notifyContentScript() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url.includes('linkedin.com/jobs')) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'updateSettings',
          settings: this.settings
        });

        if (response && response.hiddenCount !== undefined) {
          this.updateStats(response.hiddenCount);
        }
      }
    } catch (error) {
      console.log('Could not communicate with content script:', error);
    }
  }

  setupEventListeners() {
    // Hide promoted checkbox
    const hidePromotedCheckbox = document.getElementById('hidePromoted');
    hidePromotedCheckbox.addEventListener('change', (e) => {
      this.settings.hidePromoted = e.target.checked;
      this.saveSettings();
    });

    // Add company button
    const addButton = document.getElementById('addCompany');
    const companyInput = document.getElementById('companyInput');

    addButton.addEventListener('click', () => {
      this.addCompany();
    });

    companyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addCompany();
      }
    });

    // Scan all jobs button
    const scanButton = document.getElementById('scanAllJobs');
    scanButton.addEventListener('click', () => {
      this.scanAllJobs();
    });
  }

  addCompany() {
    const input = document.getElementById('companyInput');
    const companyName = input.value.trim();

    if (companyName && !this.settings.blacklistedCompanies.includes(companyName)) {
      this.settings.blacklistedCompanies.push(companyName);
      input.value = '';
      this.updateCompanyList();
      this.saveSettings();
    }
  }

  removeCompany(companyName) {
    this.settings.blacklistedCompanies = this.settings.blacklistedCompanies.filter(
      company => company !== companyName
    );
    this.updateCompanyList();
    this.saveSettings();
  } upda
  teUI() {
    // Update checkbox
    document.getElementById('hidePromoted').checked = this.settings.hidePromoted;

    // Update company list
    this.updateCompanyList();
  }

  updateCompanyList() {
    const companyList = document.getElementById('companyList');
    companyList.innerHTML = '';

    this.settings.blacklistedCompanies.forEach(company => {
      const item = document.createElement('div');
      item.className = 'company-item';
      item.innerHTML = `
        <span>${company}</span>
        <button class="remove-btn" data-company="${company}">×</button>
      `;

      const removeBtn = item.querySelector('.remove-btn');
      removeBtn.addEventListener('click', () => {
        this.removeCompany(company);
      });

      companyList.appendChild(item);
    });
  }

  updateStats(hiddenCount) {
    const stats = document.getElementById('stats');

    if (hiddenCount > 0) {
      stats.className = 'stats success';
      stats.textContent = `${hiddenCount} jobs hidden`;
    } else {
      stats.className = 'stats';
      stats.textContent = 'No jobs hidden';
    }
  }

  async scanAllJobs() {
    const scanButton = document.getElementById('scanAllJobs');
    const scanText = scanButton.querySelector('.scan-text');
    const scanProgress = scanButton.querySelector('.scan-progress');

    // Update button state
    scanButton.disabled = true;
    scanText.style.display = 'none';
    scanProgress.style.display = 'inline';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url.includes('linkedin.com/jobs')) {
        throw new Error('Please navigate to LinkedIn jobs page');
      }

      // Listen for progress updates
      const progressListener = (message) => {
        if (message.action === 'scanProgress') {
          scanProgress.innerHTML = `<span class="spinner"></span>Found ${message.totalJobs} jobs`;
        }
      };

      chrome.runtime.onMessage.addListener(progressListener);

      // Start the scan
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'scanAllJobs'
      });

      // Remove progress listener
      chrome.runtime.onMessage.removeListener(progressListener);

      if (response.success) {
        this.updateStats(response.hiddenJobs);
        scanProgress.innerHTML = `Complete! ${response.hiddenJobs}/${response.totalJobs} hidden`;

        // Show success for 2 seconds, then reset
        setTimeout(() => {
          this.resetScanButton();
        }, 2000);
      } else {
        throw new Error(response.error || 'Scan failed');
      }

    } catch (error) {
      console.error('Scan error:', error);
      scanProgress.innerHTML = 'Scan failed';
      scanProgress.style.color = '#dc3545';

      setTimeout(() => {
        this.resetScanButton();
      }, 2000);
    }
  }

  resetScanButton() {
    const scanButton = document.getElementById('scanAllJobs');
    const scanText = scanButton.querySelector('.scan-text');
    const scanProgress = scanButton.querySelector('.scan-progress');

    scanButton.disabled = false;
    scanText.style.display = 'inline';
    scanProgress.style.display = 'none';
    scanProgress.style.color = '';
  }
}

// Initialize popup
new PopupManager();