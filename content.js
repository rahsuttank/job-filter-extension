// LinkedIn Job Filter - Content Script
class LinkedInJobFilter {
    constructor() {
        this.settings = {
            hidePromoted: true,
            blacklistedCompanies: [],
            hideMode: 'hide' // 'hide' or 'dim'
        };
        this.hiddenCount = 0;
        this.init();
    }

    async init() {
        await this.loadSettings();

        // Initialize simple pagination click detection
        this.initPaginationClickDetection();

        // Create floating button
        this.createFloatingButton();

        // Quick initial filter for visible jobs
        setTimeout(() => this.filterVisibleJobs(), 1000);

        // Auto-scan all jobs after page loads
        setTimeout(() => this.autoScanAllJobs(), 3000);

        // Light observation for new jobs
        this.observeChanges();
        console.log('LinkedIn Job Filter initialized');
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['hidePromoted', 'blacklistedCompanies', 'hideMode']);
            this.settings.hidePromoted = result.hidePromoted !== false; // default true
            this.settings.blacklistedCompanies = result.blacklistedCompanies || [];
            this.settings.hideMode = result.hideMode || 'hide'; // default hide
        } catch (error) {
            // Using default settings
        }
    }

    filterVisibleJobs() {
        // Quick filter for currently visible jobs only
        const jobCards = this.getJobCards();

        let newlyHidden = 0;
        jobCards.forEach(jobCard => {
            if (!jobCard.hasAttribute('data-filter-processed')) {
                jobCard.setAttribute('data-filter-processed', 'true');

                if (this.shouldHideJob(jobCard)) {
                    this.hideJob(jobCard);
                    newlyHidden++;
                }
            }
        });

        // Filter complete

        this.updateCounter();
    }

    async scanAllJobs(progressCallback) {
        // Reset all processed flags for fresh scan
        document.querySelectorAll('[data-filter-processed]').forEach(job => {
            job.removeAttribute('data-filter-processed');
        });

        const jobsContainer = this.getJobsContainer();
        if (!jobsContainer) {
            console.error('Could not find jobs container');
            return { success: false, error: 'Jobs container not found' };
        }

        let totalJobs = 0;
        let lastJobCount = 0;
        let stableCount = 0;
        const maxScrolls = 50; // Prevent infinite scrolling
        let scrollCount = 0;

        // Incremental scrolling approach - scroll in chunks to load all content
        const scrollStep = 500; // Scroll 500px at a time
        const waitTime = 600; // Wait 600ms between scrolls
        let currentScrollPosition = 100; // Start from 100px

        while (currentScrollPosition < jobsContainer.scrollHeight && scrollCount < maxScrolls) {
            // Scroll to current position
            const oldScrollTop = jobsContainer.scrollTop;
            jobsContainer.scrollTop = currentScrollPosition;

            // Wait for content to load
            await this.sleep(waitTime);

            // Check if new jobs were loaded
            const currentJobs = this.getJobCards();
            const newJobCount = currentJobs.length;

            if (progressCallback) {
                progressCallback(newJobCount, scrollCount);
            }

            // Update scroll height in case new content was loaded
            const newScrollHeight = jobsContainer.scrollHeight;

            if (newJobCount !== totalJobs) {
                totalJobs = newJobCount;
                stableCount = 0;
            } else {
                stableCount++;
            }

            // Move to next scroll position
            currentScrollPosition += scrollStep;
            scrollCount++;

            // If we've reached the bottom and no new jobs for a while, we're done
            if (currentScrollPosition >= newScrollHeight && stableCount >= 3) {
                break;
            }
        }

        // Final scroll to absolute bottom to catch any remaining content
        jobsContainer.scrollTop = jobsContainer.scrollHeight;
        await this.sleep(1000);

        // Final job count and filter all loaded jobs
        const finalJobs = this.getJobCards();
        totalJobs = finalJobs.length;

        let hiddenCount = 0;
        const allJobs = this.getJobCards();

        allJobs.forEach(jobCard => {
            jobCard.setAttribute('data-filter-processed', 'true');

            if (this.shouldHideJob(jobCard)) {
                this.hideJob(jobCard);
                hiddenCount++;
            }
        });

        this.updateCounter();

        console.log(`Scan complete: ${hiddenCount} jobs hidden out of ${totalJobs} total`);

        return {
            success: true,
            totalJobs,
            hiddenJobs: hiddenCount,
            scrolls: scrollCount
        };
    }

    getJobCards() {
        // Try multiple selectors to find job cards
        const selectors = [
            'li.scaffold-layout__list-item[data-occludable-job-id]',
            'li[data-occludable-job-id]'
        ];

        for (const selector of selectors) {
            const found = document.querySelectorAll(selector);
            if (found.length > 0) {
                return Array.from(found);
            }
        }

        return [];
    }

    getJobsContainer() {
        // Find the scrollable jobs container using DOM structure
        // LinkedIn structure: .scaffold-layout__list > header + scrollable-container

        // Method 1: Find scaffold-layout__list and get the container after header
        const scaffoldList = document.querySelector('.scaffold-layout__list');
        if (scaffoldList) {
            // Find the header element
            const header = scaffoldList.querySelector('header');
            if (header) {
                // Get the next sibling after header (the scrollable container)
                const scrollContainer = header.nextElementSibling;
                if (scrollContainer) {
                    return scrollContainer;
                }
            }

            // Fallback: try to find any scrollable child in scaffold-layout__list
            const children = Array.from(scaffoldList.children);
            for (const child of children) {
                // Skip header elements
                if (child.tagName.toLowerCase() === 'header') continue;

                // Look for elements that might be scrollable containers
                if (child.scrollHeight > child.clientHeight ||
                    child.style.overflow === 'auto' ||
                    child.style.overflowY === 'auto' ||
                    child.classList.toString().includes('scroll') ||
                    child.querySelector('li[data-occludable-job-id]')) {
                    return child;
                }
            }
        }

        // Method 2: Try original selectors as final fallback
        const fallbackSelectors = [
            '.jobs-search-results-list',
            'ul.GjoAkyOazLcNFWlLoIqzErpRGHIYJlShlaJI',
            '[class*="jobs-search-results"]'
        ];

        for (const selector of fallbackSelectors) {
            const container = document.querySelector(selector);
            if (container) {
                return container;
            }
        }

        console.error('Could not find jobs container');
        return null;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    shouldHideJob(jobCard) {
        // Check for promoted jobs
        if (this.settings.hidePromoted && this.isPromotedJob(jobCard)) {
            return true;
        }

        // Check for blacklisted companies
        if (this.isBlacklistedCompany(jobCard)) {
            return true;
        }

        return false;
    }

    isPromotedJob(jobCard) {
        // Try multiple selectors for promoted jobs
        const promotedSelectors = [
            'ul.job-card-list__footer-wrapper span[dir="ltr"]',
            '.job-card-container__footer-item span',
            'li.job-card-container__footer-item span'
        ];

        for (const selector of promotedSelectors) {
            const elements = jobCard.querySelectorAll(selector);
            for (const element of elements) {
                if (element.textContent.trim() === 'Promoted') {
                    return true;
                }
            }
        }

        return false;
    }

    isBlacklistedCompany(jobCard) {
        // Try multiple selectors for company names
        const companySelectors = [
            '.artdeco-entity-lockup__subtitle span',
            '.job-card-container__primary-description',
            '.artdeco-entity-lockup__subtitle'
        ];

        for (const selector of companySelectors) {
            const companyElement = jobCard.querySelector(selector);
            if (companyElement) {
                const companyName = companyElement.textContent.trim().toLowerCase();
                const isBlacklisted = this.settings.blacklistedCompanies.some(blacklisted =>
                    companyName.includes(blacklisted.toLowerCase())
                );
                if (isBlacklisted) {
                    return true;
                }
            }
        }

        return false;
    }

    hideJob(jobCard) {
        if (!jobCard.classList.contains('linkedin-filter-processed-job')) {
            jobCard.classList.add('linkedin-filter-processed-job');

            if (this.settings.hideMode === 'hide') {
                jobCard.classList.add('linkedin-filter-hidden');
                jobCard.style.display = 'none';
            } else {
                jobCard.classList.add('linkedin-filter-dimmed');
                jobCard.style.opacity = '0.3';
                jobCard.style.filter = 'grayscale(70%)';
            }

            this.hiddenCount++;
        }
    }

    showJob(jobCard) {
        if (jobCard.classList.contains('linkedin-filter-processed-job')) {
            jobCard.classList.remove('linkedin-filter-processed-job', 'linkedin-filter-hidden', 'linkedin-filter-dimmed');
            jobCard.style.display = '';
            jobCard.style.opacity = '';
            jobCard.style.filter = '';
            this.hiddenCount--;
        }
    }

    updateCounter() {
        // Remove existing counter
        const existingCounter = document.querySelector('.linkedin-filter-counter');
        if (existingCounter) {
            existingCounter.remove();
        }

        // Add new counter if jobs are hidden
        if (this.hiddenCount > 0) {
            const counter = document.createElement('div');
            counter.className = 'linkedin-filter-counter';
            counter.textContent = `${this.hiddenCount} jobs hidden`;

            const resultsHeader = document.querySelector('.jobs-search-results-list__header');
            if (resultsHeader) {
                resultsHeader.appendChild(counter);
            }
        }
    }

    observeChanges() {
        // Light observation for new jobs (much simpler than before)
        const observer = new MutationObserver(() => {
            // Just do a quick filter of any new visible jobs
            setTimeout(() => this.filterVisibleJobs(), 200);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    createFloatingButton() {
        // Remove existing button if any
        const existingButton = document.querySelector('.linkedin-filter-floating-btn');
        if (existingButton) {
            existingButton.remove();
        }

        // Create floating button
        const floatingBtn = document.createElement('div');
        floatingBtn.className = 'linkedin-filter-floating-btn';
        floatingBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
        `;
        floatingBtn.title = 'LinkedIn Job Filter';

        // Add click handler
        floatingBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFloatingPopup();
        });

        document.body.appendChild(floatingBtn);
    }

    toggleFloatingPopup() {
        const existingPopup = document.querySelector('.linkedin-filter-floating-popup');

        if (existingPopup) {
            existingPopup.remove();
            return;
        }

        this.createFloatingPopup();
    }

    createFloatingPopup() {
        const popup = document.createElement('div');
        popup.className = 'linkedin-filter-floating-popup';
        popup.style.cssText = `
            position: fixed;
            width: 280px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            border: 1px solid #e0e0e0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            z-index: 10001;
            font-size: 14px;
        `;

        popup.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e1e5e9; background: #f8f9fa; border-radius: 8px 8px 0 0;">
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #0073b1;">LinkedIn Job Filter</h3>
                <button class="floating-popup-close" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">&times;</button>
            </div>
            
            <div style="padding: 16px;">
                <div style="margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; cursor: pointer; gap: 8px;">
                        <input type="checkbox" id="floatingHidePromoted" ${this.settings.hidePromoted ? 'checked' : ''} style="margin: 0;">
                        Hide promoted jobs
                    </label>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">Blocked Companies</h3>
                    <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                        <input type="text" id="floatingCompanyInput" placeholder="Company name" style="flex: 1; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                        <button id="floatingAddCompany" style="padding: 6px 10px; background: #0073b1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Add</button>
                    </div>
                    <div id="floatingCompanyList" style="max-height: 100px; overflow-y: auto; border: 1px solid #e1e5e9; border-radius: 4px; background: #f8f9fa;"></div>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <button id="floatingScanAllJobs" style="width: 100%; padding: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600;">
                        <span class="scan-text">Scan All Jobs</span>
                        <span class="scan-progress" style="display: none;">
                            <span style="display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255, 255, 255, 0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 6px;"></span>Scanning...
                        </span>
                    </button>
                </div>
                
                <div id="floatingStats" style="padding: 8px; background: #f8f9fa; border-radius: 4px; font-size: 12px; text-align: center; border: 1px solid #e9ecef;">
                    ${this.hiddenCount > 0 ? `${this.hiddenCount} jobs hidden` : 'Ready to scan'}
                </div>
            </div>
        `;

        // Position popup near the floating button
        const floatingBtn = document.querySelector('.linkedin-filter-floating-btn');
        const btnRect = floatingBtn.getBoundingClientRect();

        popup.style.top = `${btnRect.top}px`;
        popup.style.right = '60px';

        document.body.appendChild(popup);

        // Setup event listeners for the floating popup
        this.setupFloatingPopupListeners(popup);

        // Update company list
        this.updateFloatingCompanyList();

        // Close popup when clicking outside
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick.bind(this), { once: true });
        }, 100);
    }

    handleOutsideClick(e) {
        const popup = document.querySelector('.linkedin-filter-floating-popup');
        if (popup && !popup.contains(e.target)) {
            popup.remove();
        }
    }

    setupFloatingPopupListeners(popup) {
        // Close button
        popup.querySelector('.floating-popup-close').addEventListener('click', () => {
            popup.remove();
        });

        // Hide promoted checkbox
        popup.querySelector('#floatingHidePromoted').addEventListener('change', (e) => {
            this.settings.hidePromoted = e.target.checked;
            this.saveSettings();
            this.updateSettings(this.settings);
        });

        // Add company
        const addBtn = popup.querySelector('#floatingAddCompany');
        const companyInput = popup.querySelector('#floatingCompanyInput');

        addBtn.addEventListener('click', () => {
            this.addCompanyFromFloating();
        });

        companyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addCompanyFromFloating();
            }
        });

        // Scan all jobs
        popup.querySelector('#floatingScanAllJobs').addEventListener('click', () => {
            this.scanAllJobsFromFloating();
        });
    }

    addCompanyFromFloating() {
        const input = document.querySelector('#floatingCompanyInput');
        const companyName = input.value.trim();

        if (companyName && !this.settings.blacklistedCompanies.includes(companyName)) {
            this.settings.blacklistedCompanies.push(companyName);
            input.value = '';
            this.updateFloatingCompanyList();
            this.saveSettings();
            this.updateSettings(this.settings);
        }
    }

    removeCompanyFromFloating(companyName) {
        this.settings.blacklistedCompanies = this.settings.blacklistedCompanies.filter(
            company => company !== companyName
        );
        this.updateFloatingCompanyList();
        this.saveSettings();
        this.updateSettings(this.settings);
    }

    updateFloatingCompanyList() {
        const companyList = document.querySelector('#floatingCompanyList');
        if (!companyList) return;

        if (this.settings.blacklistedCompanies.length === 0) {
            companyList.innerHTML = '<div style="padding: 12px; text-align: center; color: #6c757d; font-size: 12px; font-style: italic;">No companies added</div>';
            return;
        }

        companyList.innerHTML = '';

        this.settings.blacklistedCompanies.forEach(company => {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 8px;
                font-size: 13px;
                border-bottom: 1px solid #e9ecef;
            `;
            item.innerHTML = `
                <span>${company}</span>
                <button data-company="${company}" style="background: #dc3545; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 11px;">×</button>
            `;

            const removeBtn = item.querySelector('button');
            removeBtn.addEventListener('click', () => {
                this.removeCompanyFromFloating(company);
            });

            companyList.appendChild(item);
        });

        // Remove border from last item
        const lastItem = companyList.lastElementChild;
        if (lastItem) {
            lastItem.style.borderBottom = 'none';
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.sync.set(this.settings);
        } catch (error) {
            // Error saving settings
        }
    }

    async scanAllJobsFromFloating() {
        const popup = document.querySelector('.linkedin-filter-floating-popup');
        const scanButton = popup.querySelector('#floatingScanAllJobs');
        const scanText = scanButton.querySelector('.scan-text');
        const scanProgress = scanButton.querySelector('.scan-progress');

        // Update button state
        scanButton.disabled = true;
        scanText.style.display = 'none';
        scanProgress.style.display = 'inline';
        scanProgress.textContent = 'Starting scan...';

        try {
            const result = await this.scanAllJobs((totalJobs, scrollCount) => {
                scanProgress.textContent = `Found ${totalJobs} jobs (scroll ${scrollCount})`;
            });

            if (result.success) {
                this.updateFloatingStats(result.hiddenJobs);
                scanProgress.textContent = `Complete! ${result.hiddenJobs}/${result.totalJobs} jobs hidden`;

                setTimeout(() => {
                    this.resetFloatingScanButton();
                }, 2000);
            } else {
                throw new Error(result.error || 'Scan failed');
            }

        } catch (error) {
            console.error('Scan error:', error);
            scanProgress.textContent = 'Scan failed';
            scanProgress.style.color = '#dc3545';

            setTimeout(() => {
                this.resetFloatingScanButton();
            }, 2000);
        }
    }

    resetFloatingScanButton() {
        const popup = document.querySelector('.linkedin-filter-floating-popup');
        if (!popup) return;

        const scanButton = popup.querySelector('#floatingScanAllJobs');
        const scanText = scanButton.querySelector('.scan-text');
        const scanProgress = scanButton.querySelector('.scan-progress');

        scanButton.disabled = false;
        scanText.style.display = 'inline';
        scanProgress.style.display = 'none';
        scanProgress.style.color = '';
    }

    async autoScanAllJobs() {
        // Update floating button to show scanning state
        this.updateFloatingButtonState('scanning');

        try {
            const result = await this.scanAllJobs((totalJobs, scrollCount) => {
                // Update floating button with progress
                this.updateFloatingButtonState('scanning', `${totalJobs} jobs`);
            });

            if (result.success) {
                console.log(`Auto-scan complete: ${result.hiddenJobs}/${result.totalJobs} jobs hidden`);

                // Update floating button to show completion
                this.updateFloatingButtonState('complete', `${result.hiddenJobs} hidden`);

                // Reset to normal state after 3 seconds
                setTimeout(() => {
                    this.updateFloatingButtonState('normal');
                }, 3000);

            } else {
                console.error('Auto-scan failed:', result.error);
                this.updateFloatingButtonState('error');

                setTimeout(() => {
                    this.updateFloatingButtonState('normal');
                }, 3000);
            }

        } catch (error) {
            console.error('Auto-scan error:', error);
            this.updateFloatingButtonState('error');

            setTimeout(() => {
                this.updateFloatingButtonState('normal');
            }, 3000);
        } finally {
            this.isScanning = false;
        }
    }

    updateFloatingButtonState(state, text = '') {
        const floatingBtn = document.querySelector('.linkedin-filter-floating-btn');
        if (!floatingBtn) return;

        // Remove existing state classes
        floatingBtn.classList.remove('scanning', 'complete', 'error');

        switch (state) {
            case 'scanning':
                floatingBtn.classList.add('scanning');
                floatingBtn.innerHTML = `
                    <div class="scan-spinner"></div>
                `;
                floatingBtn.title = `Scanning jobs... ${text}`;
                break;

            case 'complete':
                floatingBtn.classList.add('complete');
                floatingBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                `;
                floatingBtn.title = `Scan complete: ${text}`;
                break;

            case 'error':
                floatingBtn.classList.add('error');
                floatingBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                `;
                floatingBtn.title = 'Scan failed - click to retry';
                break;

            default: // normal
                floatingBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                `;
                floatingBtn.title = 'LinkedIn Job Filter';
                break;
        }
    }

    initPaginationClickDetection() {
        this.isScanning = false;
        this.scanDebounceTimeout = null;

        // Targeted click listener for specific pagination elements
        document.addEventListener('click', (e) => {
            // Check for specific pagination button clicks
            const isPaginationClick =
                // Page number buttons (1, 2, 3, ...)
                e.target.closest('.jobs-search-pagination__indicator-button') ||
                // Next/Previous buttons
                e.target.closest('.jobs-search-pagination__button--next') ||
                e.target.closest('.jobs-search-pagination__button--previous') ||
                // General pagination area (fallback)
                e.target.closest('.jobs-search-pagination');

            if (isPaginationClick) {
                this.handlePageChange('pagination-click');
            }
        }, { passive: true });

        console.log('Pagination click detection initialized');
    }

    handlePageChange(source) {
        // Debounce multiple rapid page changes
        clearTimeout(this.scanDebounceTimeout);

        this.scanDebounceTimeout = setTimeout(() => {
            // Only proceed if we're on a jobs page
            if (!window.location.href.includes('/jobs/')) {
                return;
            }

            // Avoid multiple simultaneous scans
            if (this.isScanning) {
                return;
            }

            // Reset hidden count for new page
            this.hiddenCount = 0;

            // Update button to show page change scan
            this.updateFloatingButtonState('scanning', 'Page changed');

            // Start auto-scan with shorter delay for page changes
            setTimeout(() => {
                this.autoScanAllJobs('page-change');
            }, 1500);

        }, 800); // 800ms debounce to let LinkedIn load new content
    }

    async autoScanAllJobs(scanType = 'initial') {
        if (this.isScanning) {
            return;
        }

        this.isScanning = true;

        // Update floating button to show scanning state
        this.updateFloatingButtonState('scanning');

        try {
            const result = await this.scanAllJobs((totalJobs, scrollCount) => {
                // Update floating button with progress
                this.updateFloatingButtonState('scanning', `${totalJobs} jobs`);
            });

            if (result.success) {
                console.log(`Auto-scan complete (${scanType}): ${result.hiddenJobs}/${result.totalJobs} jobs hidden`);

                // Update floating button to show completion
                this.updateFloatingButtonState('complete', `${result.hiddenJobs} hidden`);

                // Reset to normal state after 3 seconds
                setTimeout(() => {
                    this.updateFloatingButtonState('normal');
                }, 3000);

            } else {
                console.error('Auto-scan failed:', result.error);
                this.updateFloatingButtonState('error');

                setTimeout(() => {
                    this.updateFloatingButtonState('normal');
                }, 3000);
            }

        } catch (error) {
            console.error('Auto-scan error:', error);
            this.updateFloatingButtonState('error');

            setTimeout(() => {
                this.updateFloatingButtonState('normal');
            }, 3000);
        } finally {
            this.isScanning = false;
        }
    }

    updateFloatingStats(hiddenCount) {
        const stats = document.querySelector('#floatingStats');
        if (!stats) return;

        if (hiddenCount > 0) {
            stats.textContent = `${hiddenCount} jobs hidden`;
            stats.style.background = '#d4edda';
            stats.style.borderColor = '#c3e6cb';
            stats.style.color = '#155724';
        } else {
            stats.textContent = 'No jobs hidden';
            stats.style.background = '#f8f9fa';
            stats.style.borderColor = '#e9ecef';
            stats.style.color = '#6c757d';
        }
    }

    // Public methods for popup communication
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.hiddenCount = 0;

        // Show all filtered jobs first and reset processed flag
        document.querySelectorAll('.linkedin-filter-processed-job').forEach(job => {
            this.showJob(job);
            job.removeAttribute('data-filter-processed');
        });

        // Reset all processed flags
        document.querySelectorAll('[data-filter-processed]').forEach(job => {
            job.removeAttribute('data-filter-processed');
        });

        // Re-filter with new settings
        this.filterVisibleJobs();

        // Update floating stats if popup is open
        this.updateFloatingStats(this.hiddenCount);
    }
}

// Initialize the filter
const jobFilter = new LinkedInJobFilter();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateSettings') {
        jobFilter.updateSettings(request.settings);
        sendResponse({ success: true, hiddenCount: jobFilter.hiddenCount });
    } else if (request.action === 'scanAllJobs') {
        // Handle async scan
        jobFilter.scanAllJobs((totalJobs, scrollCount) => {
            // Send progress updates
            chrome.runtime.sendMessage({
                action: 'scanProgress',
                totalJobs,
                scrollCount
            }).catch(() => { }); // Ignore errors if popup is closed
        }).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });

        return true; // Keep message channel open for async response
    }
});