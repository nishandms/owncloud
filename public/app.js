document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentPath = history.state && history.state.path !== undefined ? history.state.path : '';
    let allFiles = []; // For searching
    
    // Selection state
    let selectedItems = new Map(); // Map of name -> file object
    let isSelectionMode = false;
    
    let sheetTargetFile = null; // Which file the bottom sheet is acting on
    let shareTargetFile = null; // Which file is being shared
    let currentPreviewIndex = -1;
    let previewFilesList = [];

    // DOM Elements
    const fileGrid = document.getElementById('file-grid');
    const pathDisplay = document.getElementById('current-path-display');
    const backBtn = document.getElementById('back-btn');
    
    // Selection UI
    const selectionActionBar = document.getElementById('selection-action-bar');
    const cancelSelectionBtn = document.getElementById('cancel-selection-btn');
    const selectionCount = document.getElementById('selection-count');
    const batchDownloadBtn = document.getElementById('batch-download-btn');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    
    // Actions
    const newFolderBtn = document.getElementById('new-folder-btn');
    const newFileBtn = document.getElementById('new-file-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    
    // Generic Modal
    const genericModal = document.getElementById('generic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    
    // Bottom Sheet
    const bottomSheetOverlay = document.getElementById('bottom-sheet-overlay');
    const sheetItemName = document.getElementById('sheet-item-name');
    const sheetDownloadBtn = document.getElementById('sheet-download-btn');
    const sheetRenameBtn = document.getElementById('sheet-rename-btn');
    const sheetDeleteBtn = document.getElementById('sheet-delete-btn');
    const sheetShareBtn = document.getElementById('sheet-share-btn');
    
    // Share Modal
    const shareModal = document.getElementById('share-modal');
    const shareSetup = document.getElementById('share-setup');
    const shareResult = document.getElementById('share-result');
    const shareExpiry = document.getElementById('share-expiry');
    const shareCancelBtn = document.getElementById('share-cancel-btn');
    const shareGenerateBtn = document.getElementById('share-generate-btn');
    const shareLinkInput = document.getElementById('share-link-input');
    const shareCopyBtn = document.getElementById('share-copy-btn');
    const shareCloseBtn = document.getElementById('share-close-btn');
    
    // Search
    const searchInput = document.getElementById('search-input');
    
    // Preview Modal
    const previewModal = document.getElementById('preview-modal');
    const closePreviewBtn = document.getElementById('close-preview-btn');
    const downloadPreviewBtn = document.getElementById('download-preview-btn');
    const previewFilename = document.getElementById('preview-filename');
    const previewContentWrapper = document.getElementById('preview-content-wrapper');
    const previewPrevBtn = document.getElementById('preview-prev-btn');
    const previewNextBtn = document.getElementById('preview-next-btn');

    // API Base
    const API_BASE = '/api';

    // Theme Management
    const sidebarThemeBtn = document.getElementById('sidebar-theme-toggle');
    const headerThemeBtn = document.getElementById('header-theme-toggle');
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('app-theme', theme);
        
        const iconClass = theme === 'dark' ? 'ph-sun' : 'ph-moon';
        const text = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        
        if (headerThemeBtn) headerThemeBtn.innerHTML = `<i class="ph ${iconClass}"></i>`;
        if (sidebarThemeBtn) sidebarThemeBtn.innerHTML = `<i class="ph ${iconClass}"></i> ${text}`;
    }

    function toggleTheme(e) {
        if (e) e.preventDefault();
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    }

    // Init Theme
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        setTheme(prefersLight ? 'light' : 'dark');
    }

    if (sidebarThemeBtn) sidebarThemeBtn.addEventListener('click', toggleTheme);
    if (headerThemeBtn) headerThemeBtn.addEventListener('click', toggleTheme);
    
    // Network Mode Management
    const networkToggle = document.getElementById('header-network-toggle');
    const networkModeText = document.getElementById('header-network-text');
    
    // Check for publicUrl in query params (passed when switching from Public to Local)
    const urlParams = new URLSearchParams(window.location.search);
    const passedPublicUrl = urlParams.get('publicUrl');
    if (passedPublicUrl) {
        localStorage.setItem('owncloud_public_url', passedPublicUrl);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/);
    
    if (networkModeText) {
        // Show current mode, or an action
        networkModeText.textContent = isLocal ? 'STARK GLOBAL' : 'JARVIS HOME';
    }

    if (networkToggle) {
        networkToggle.addEventListener('click', async (e) => {
            e.preventDefault();
            if (isLocal) {
                const publicUrl = localStorage.getItem('owncloud_public_url');
                if (publicUrl) {
                    window.location.href = publicUrl;
                } else {
                    if (typeof openAlertModal === 'function') openAlertModal("Info", "You are already connected via Local network.");
                }
                return;
            }

            try {
                networkToggle.style.opacity = '0.5';
                const res = await fetch(`${API_BASE}/server-ip`);
                const data = await res.json();
                if (data.ip) {
                    const localUrl = `https://${data.ip}:${data.port}?publicUrl=${encodeURIComponent(window.location.origin)}`;
                    // Store it here too, just in case
                    localStorage.setItem('owncloud_public_url', window.location.origin);
                    window.location.href = localUrl;
                } else {
                    if (typeof openAlertModal === 'function') openAlertModal("Error", "Could not get local IP.");
                }
            } catch (err) {
                if (typeof openAlertModal === 'function') openAlertModal("Error", "Failed to get server IP.");
            } finally {
                networkToggle.style.opacity = '1';
            }
        });
    }
    
    // Auth State
    let authToken = localStorage.getItem('owncloud_token');
    const loginScreen = document.getElementById('login-screen');
    const appWrapper = document.getElementById('app-wrapper');
    const bottomNav = document.getElementById('bottom-nav');
    const sidebar = document.getElementById('sidebar');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('header-logout-btn');

    cancelSelectionBtn.addEventListener('click', () => {
        isSelectionMode = false;
        selectedItems.clear();
        updateSelectionActionBar();
    });

    batchDeleteBtn.addEventListener('click', () => {
        if (selectedItems.size === 0) return;
        
        openConfirmModal('Delete Selected', `Are you sure you want to delete ${selectedItems.size} items?`, async () => {
            showLoading();
            let successCount = 0;
            
            for (const [name, file] of selectedItems.entries()) {
                const targetPath = currentPath ? `${currentPath}/${name}` : name;
                try {
                    const res = await apiFetch(`${API_BASE}/delete?path=${encodeURIComponent(targetPath)}`, {
                        method: 'DELETE'
                    });
                    if (res) successCount++;
                } catch (e) {
                    console.error("Failed to delete", name, e);
                }
            }
            
            isSelectionMode = false;
            selectedItems.clear();
            updateSelectionActionBar();
            
            if (typeof showToast === 'function') {
                showToast(`Deleted ${successCount} items`);
            }
            
            fetchFiles();
        });
    });

    batchDownloadBtn.addEventListener('click', async () => {
        if (selectedItems.size === 0) return;
        
        // Browsers might block multiple simultaneous downloads if not triggered by user directly,
        // but since this is in a click handler, the first one usually works and subsequent ones might prompt.
        let delay = 0;
        for (const [name, file] of selectedItems.entries()) {
            if (!file.isDirectory) {
                const targetPath = currentPath ? `${currentPath}/${name}` : name;
                const downloadUrl = `${API_BASE}/download?path=${encodeURIComponent(targetPath)}&token=${authToken}`;
                
                setTimeout(() => {
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }, delay);
                
                delay += 500; // stagger downloads slightly to prevent browser blocking
            }
        }
        
        isSelectionMode = false;
        selectedItems.clear();
        updateSelectionActionBar();
    });

    // Initialize App
    if (authToken) {
        showApp();
    } else {
        showLogin();
    }

    function decodeToken(token) {
        if (!token) return null;
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('Failed to decode token', e);
            return null;
        }
    }

    function updateUIForRole() {
        const payload = decodeToken(authToken);
        const isAdmin = payload && payload.role === 'admin';
        
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => {
            if (isAdmin) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        const avatarImg = document.querySelector('#header-logout-btn img');
        if (avatarImg && payload && payload.user) {
            avatarImg.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(payload.user)}`;
        }
    }

    function showApp() {
        loginScreen.classList.add('hidden');
        appWrapper.classList.remove('hidden');
        bottomNav.classList.remove('hidden');
        sidebar.classList.remove('hidden');
        updateUIForRole();
        switchTab('cloud');
    }

    function showLogin() {
        loginScreen.classList.remove('hidden');
        appWrapper.classList.add('hidden');
        bottomNav.classList.add('hidden');
        sidebar.classList.add('hidden');
    }

    function handleLogout() {
        localStorage.removeItem('owncloud_token');
        authToken = null;
        showLogin();
    }

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        loginError.style.display = 'none';
        
        try {
            const res = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok && data.token) {
                authToken = data.token;
                localStorage.setItem('owncloud_token', authToken);
                loginForm.reset();
                showApp();
            } else {
                loginError.textContent = data.error || 'Login failed';
                loginError.style.display = 'block';
            }
        } catch (err) {
            loginError.textContent = 'Server error';
            loginError.style.display = 'block';
        }
    });

    async function apiFetch(url, options = {}) {
        if (!options.headers) options.headers = {};
        if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
        
        const res = await fetch(url, options);
        if (res.status === 401 || res.status === 403) {
            handleLogout();
            throw new Error('Unauthorized');
        }
        return res;
    }

    // Functions
    async function fetchFiles() {
        showLoading();
        try {
            const res = await apiFetch(`${API_BASE}/files?path=${encodeURIComponent(currentPath)}`);
            if (!res.ok) throw new Error('Failed to fetch files');
            allFiles = await res.json();
            
            // Apply search filter if active
            const query = searchInput.value.toLowerCase();
            const filtered = query ? allFiles.filter(f => f.name.toLowerCase().includes(query)) : allFiles;
            
            renderGridItems(filtered);
            updateHeader();
            fetchStorageStats();
        } catch (err) {
            console.error(err);
            if (err.message !== 'Unauthorized') {
                fileGrid.innerHTML = `<div class="empty-state"><i class="ph ph-warning" style="font-size:2.5rem; color:var(--danger-color)"></i><p>Error loading files</p></div>`;
            }
        }
    }

    async function fetchStorageStats() {
        try {
            const res = await apiFetch(`${API_BASE}/storage-stats`);
            if (!res.ok) throw new Error('Failed to fetch storage stats');
            const data = await res.json();
            
            const formatBytes = (bytes) => {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
            };
            
            const usedStr = formatBytes(data.usedBytes);
            const maxGB = (data.maxBytes / (1024 * 1024 * 1024)).toFixed(0);
            
            let percentage = Math.round((data.usedBytes / data.maxBytes) * 100);
            if (percentage > 100) percentage = 100;
            
            const storageText = document.getElementById('storage-text');
            const waveWrapper = document.querySelector('.water-wrapper');
            
            if (storageText) {
                storageText.textContent = `Used ${usedStr} / ${maxGB} GB Total (${percentage}%)`;
            }
            if (waveWrapper) {
                waveWrapper.style.height = `${percentage}%`;
            }
        } catch (err) {
            console.error('Failed to update storage stats', err);
        }
    }

    async function fetchNetworkStats() {
        if (!authToken) return;
        try {
            const res = await apiFetch(`${API_BASE}/network-stats`);
            if (!res.ok) return;
            const data = await res.json();
            
            const formatBytes = (bytes) => {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
            };

            const rxSpeedEl = document.getElementById('rx-speed');
            const txSpeedEl = document.getElementById('tx-speed');
            if (rxSpeedEl) rxSpeedEl.textContent = formatBytes(data.rxSpeed) + '/s';
            if (txSpeedEl) txSpeedEl.textContent = formatBytes(data.txSpeed) + '/s';
        } catch (err) {
            // silent fail
        }
    }

    // Poll network stats
    setInterval(() => {
        if (authToken && !document.hidden && document.getElementById('cloud-section') && !document.getElementById('cloud-section').classList.contains('hidden')) {
            fetchNetworkStats();
        }
    }, 2000);

    // Event Listeners
    backBtn.addEventListener('click', navigateUp);
    
    // History API for directory navigation via back button
    history.replaceState({ path: currentPath }, '');
    
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.path !== undefined) {
            currentPath = e.state.path;
            searchInput.value = '';
            
            // Switch to cloud tab (this also calls fetchFiles())
            if (typeof switchTab === 'function') {
                switchTab('cloud');
            } else {
                fetchFiles();
            }
            
            // Close any open modals/overlays
            if (typeof closeBottomSheet === 'function') closeBottomSheet();
            ['preview-modal', 'generic-modal', 'editor-modal', 'confirm-modal', 'alert-modal', 'share-modal'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
        }
    });
    
    // Search Filter
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allFiles.filter(f => f.name.toLowerCase().includes(query));
        renderGridItems(filtered);
    });

    // Modals & Bottom Sheet
    bottomSheetOverlay.addEventListener('click', (e) => {
        if (e.target === bottomSheetOverlay) closeBottomSheet();
    });

    genericModal.addEventListener('click', (e) => {
        if (e.target === genericModal) genericModal.classList.add('hidden');
    });

    modalCancelBtn.addEventListener('click', () => {
        genericModal.classList.add('hidden');
    });

    // New Folder
    newFolderBtn.addEventListener('click', () => {
        openModal('New Folder', '', async (name) => {
            if (!name) return;
            try {
                const res = await apiFetch(`${API_BASE}/folder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: currentPath, name })
                });
                if (!res.ok) throw new Error('Failed to create folder');
                fetchFiles();
            } catch (err) {
                openAlertModal("Error", err.message);
            }
        });
    });

    // New File
    if (newFileBtn) {
        newFileBtn.addEventListener('click', () => {
            openModal('New File', 'newfile.txt', async (name) => {
                if (!name) return;
                try {
                    const res = await apiFetch(`${API_BASE}/file`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: currentPath, name })
                    });
                    if (!res.ok) throw new Error('Failed to create file');
                    fetchFiles();
                } catch (err) {
                    openAlertModal("Error", err.message);
                }
            });
        });
    }

    // Upload
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    // Preview
    closePreviewBtn.addEventListener('click', () => {
        previewModal.classList.add('hidden');
        previewContentWrapper.innerHTML = '';
    });

    if (previewPrevBtn) {
        previewPrevBtn.addEventListener('click', () => {
            if (currentPreviewIndex > 0) {
                previewFile(previewFilesList[currentPreviewIndex - 1].name);
            }
        });
    }

    if (previewNextBtn) {
        previewNextBtn.addEventListener('click', () => {
            if (currentPreviewIndex !== -1 && currentPreviewIndex < previewFilesList.length - 1) {
                previewFile(previewFilesList[currentPreviewIndex + 1].name);
            }
        });
    }

    function updatePreviewNavButtons() {
        if (!previewPrevBtn || !previewNextBtn) return;
        previewPrevBtn.style.display = currentPreviewIndex > 0 ? 'flex' : 'none';
        previewNextBtn.style.display = (currentPreviewIndex !== -1 && currentPreviewIndex < previewFilesList.length - 1) ? 'flex' : 'none';
    }

    // Bottom Sheet Actions
    sheetDownloadBtn.addEventListener('click', () => {
        if (!sheetTargetFile) return;
        const filePath = currentPath ? `${currentPath}/${sheetTargetFile.name}` : sheetTargetFile.name;
        
        const a = document.createElement('a');
        a.href = `${API_BASE}/download?path=${encodeURIComponent(filePath)}&download=true&token=${authToken}`;
        a.download = sheetTargetFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        closeBottomSheet();
    });

    if (sheetShareBtn) {
        sheetShareBtn.addEventListener('click', () => {
            if (!sheetTargetFile) return;
            if (!sheetTargetFile.isDirectory) {
                openAlertModal("Error", "Currently, only folders can be shared.");
                closeBottomSheet();
                return;
            }
            shareTargetFile = sheetTargetFile;
            closeBottomSheet();
            shareSetup.classList.remove('hidden');
            shareResult.classList.add('hidden');
            shareModal.classList.remove('hidden');
            shareExpiry.value = "24"; // default 1 day
        });
    }

    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) shareModal.classList.add('hidden');
        });
    }
    if (shareCancelBtn) shareCancelBtn.addEventListener('click', () => shareModal.classList.add('hidden'));
    if (shareCloseBtn) shareCloseBtn.addEventListener('click', () => shareModal.classList.add('hidden'));
    if (shareCopyBtn) {
        shareCopyBtn.addEventListener('click', () => {
            shareLinkInput.select();
            document.execCommand('copy');
            shareCopyBtn.innerHTML = '<i class="ph ph-check"></i>';
            setTimeout(() => shareCopyBtn.innerHTML = '<i class="ph ph-copy"></i>', 2000);
        });
    }

    if (shareGenerateBtn) {
        shareGenerateBtn.addEventListener('click', async () => {
            if (!shareTargetFile) return;
            const targetPath = currentPath ? `${currentPath}/${shareTargetFile.name}` : shareTargetFile.name;
            const expiresInHours = shareExpiry.value ? parseInt(shareExpiry.value) : null;
            
            shareGenerateBtn.disabled = true;
            shareGenerateBtn.textContent = 'Generating...';
            
            try {
                const res = await apiFetch(`${API_BASE}/share`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: targetPath, expiresInHours })
                });
                const data = await res.json();
                
                if (!res.ok) throw new Error(data.error || 'Failed to generate link');
                
                const fullUrl = window.location.origin + data.url;
                shareLinkInput.value = fullUrl;
                
                shareSetup.classList.add('hidden');
                shareResult.classList.remove('hidden');
            } catch (err) {
                openAlertModal("Error", err.message);
                shareModal.classList.add('hidden');
            } finally {
                shareGenerateBtn.disabled = false;
                shareGenerateBtn.textContent = 'Generate Link';
            }
        });
    }

    sheetRenameBtn.addEventListener('click', () => {
        if (!sheetTargetFile) return;
        const oldName = sheetTargetFile.name;
        closeBottomSheet();
        openModal('Rename Item', oldName, async (newName) => {
            if (!newName || newName === oldName) return;
            try {
                const res = await apiFetch(`${API_BASE}/rename`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: currentPath, oldName, newName })
                });
                if (!res.ok) throw new Error('Failed to rename');
                fetchFiles();
            } catch (err) {
                openAlertModal("Error", err.message);
            }
        });
    });

    sheetDeleteBtn.addEventListener('click', async () => {
        if (!sheetTargetFile) return;
        const name = sheetTargetFile.name;
        closeBottomSheet();
        openConfirmModal('Delete File', `Are you sure you want to delete "${name}"?`, async () => {
            try {
                const filePath = currentPath ? `${currentPath}/${name}` : name;
                const res = await apiFetch(`${API_BASE}/delete?path=${encodeURIComponent(filePath)}`, {
                    method: 'DELETE'
                });
                if (!res.ok) throw new Error('Failed to delete');
                fetchFiles();
            } catch (err) {
                openAlertModal("Error", err.message);
            }
        });
    });

    // End Functions
    function updateSelectionActionBar() {
        if (!isSelectionMode || selectedItems.size === 0) {
            selectionActionBar.classList.add('hidden');
            document.body.classList.remove('selection-mode');
            isSelectionMode = false;
            selectedItems.clear();
            // Deselect all visually
            document.querySelectorAll('.item-card.selected').forEach(c => c.classList.remove('selected'));
            return;
        }

        selectionActionBar.classList.remove('hidden');
        document.body.classList.add('selection-mode');
        selectionCount.textContent = `${selectedItems.size} selected`;

        // Check if any folders are selected
        let hasFolders = false;
        for (const [name, file] of selectedItems.entries()) {
            if (file.isDirectory) {
                hasFolders = true;
                break;
            }
        }
        
        if (hasFolders) {
            batchDownloadBtn.style.display = 'none';
        } else {
            batchDownloadBtn.style.display = 'flex';
        }
    }

    function toggleSelection(file, cardElement) {
        if (selectedItems.has(file.name)) {
            selectedItems.delete(file.name);
            cardElement.classList.remove('selected');
        } else {
            selectedItems.set(file.name, file);
            cardElement.classList.add('selected');
        }
        
        if (selectedItems.size === 0) {
            isSelectionMode = false;
        } else {
            isSelectionMode = true;
        }
        
        updateSelectionActionBar();
    }

    function renderGridItems(files) {
        fileGrid.innerHTML = '';
        if (files.length === 0) {
            fileGrid.innerHTML = `<div class="empty-state"><i class="ph ph-folder-open" style="font-size:3rem; color:var(--text-secondary)"></i><p>This folder is empty</p></div>`;
            return;
        }

        // Sort folders first, then alphabetically
        files.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'item-card';
            
            let iconOrThumbnail = '';
            const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
            
            if (file.isDirectory) {
                iconOrThumbnail = `<svg class="folder-svg" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
            } else {
                const ext = file.name.split('.').pop().toLowerCase();
                const fileUrl = `${API_BASE}/download?path=${encodeURIComponent(filePath)}&token=${authToken}`;
                
                if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                    iconOrThumbnail = `<img src="${fileUrl}" class="item-thumbnail" alt="thumbnail" loading="lazy">`;
                }
                else if (['mp4', 'webm', 'mov'].includes(ext)) {
                    iconOrThumbnail = `
                        <div style="position:relative; width:100%; height:100%;">
                            <video src="${fileUrl}#t=0.1" class="item-thumbnail" preload="metadata" muted playsinline></video>
                            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.2); border-radius:var(--radius-md);">
                                <i class="ph-fill ph-play-circle" style="font-size:2rem; color:white; opacity:0.8;"></i>
                            </div>
                        </div>
                    `;
                }
                else if (['mp3', 'wav', 'ogg'].includes(ext)) {
                    iconOrThumbnail = `<i class="ph ph-headphones item-icon"></i>`;
                }
                else {
                    iconOrThumbnail = `<i class="ph ph-file item-icon"></i>`;
                }
            }

            const dateStr = formatDate(file.createdAt);

            card.innerHTML = `
                <div class="selection-checkbox"></div>
                <div class="card-icon-wrapper">
                    ${iconOrThumbnail}
                </div>
                <div class="card-info" style="width:100%">
                    <div class="item-name-group" style="text-align: left;">
                        <span class="item-name" title="${file.name}">${file.name}</span>
                        <span class="item-date">${dateStr}</span>
                    </div>
                    <button class="more-btn"><i class="ph ph-dots-three-vertical"></i></button>
                </div>
            `;

            // Restore selection state if we are re-rendering during selection mode
            if (selectedItems.has(file.name)) {
                card.classList.add('selected');
            }

            // Handle More button
            const moreBtn = card.querySelector('.more-btn');
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isSelectionMode) return; // Disable more button in selection mode
                openBottomSheet(file);
            });

            // Touch support for long press
            let pressTimer;
            
            card.addEventListener('touchstart', (e) => {
                if (e.touches.length > 1) return; // Ignore multi-touch
                pressTimer = setTimeout(() => {
                    if (!isSelectionMode) {
                        isSelectionMode = true;
                        toggleSelection(file, card);
                    }
                }, 500); // 500ms for long press
            }, { passive: true });
            
            card.addEventListener('touchend', () => {
                clearTimeout(pressTimer);
            });
            card.addEventListener('touchmove', () => {
                clearTimeout(pressTimer);
            });
            
            // Prevent default context menu on long press
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });

            // Handle Card Click
            card.addEventListener('click', (e) => {
                // If checkbox clicked or ctrl/shift held, or already in selection mode
                if (e.target.closest('.selection-checkbox') || e.ctrlKey || e.metaKey || isSelectionMode) {
                    isSelectionMode = true;
                    toggleSelection(file, card);
                    return;
                }

                if (file.isDirectory) {
                    currentPath = currentPath ? `${currentPath}/${file.name}` : file.name;
                    history.pushState({ path: currentPath }, '');
                    searchInput.value = ''; // clear search on navigate
                    
                    // Clear selection on navigate
                    isSelectionMode = false;
                    selectedItems.clear();
                    updateSelectionActionBar();
                    
                    fetchFiles();
                } else {
                    previewFile(file.name);
                }
            });

            fileGrid.appendChild(card);
        });
    }

    function openBottomSheet(file) {
        sheetTargetFile = file;
        sheetItemName.textContent = file.name;
        
        const headerIcon = document.querySelector('.sheet-header i');
        headerIcon.className = file.isDirectory ? 'ph ph-folder item-icon folder-icon' : 'ph ph-file item-icon folder-icon';
        
        bottomSheetOverlay.classList.remove('hidden');
    }

    function closeBottomSheet() {
        bottomSheetOverlay.classList.add('hidden');
        sheetTargetFile = null;
    }

    function updateHeader() {
        if (currentPath) {
            const parts = currentPath.split('/');
            pathDisplay.textContent = parts[parts.length - 1];
            backBtn.classList.remove('hidden');
        } else {
            pathDisplay.textContent = 'Storage';
            backBtn.classList.add('hidden');
        }
    }

    function navigateUp() {
        if (!currentPath) return;
        // Instead of popping parts manually, we use history API to keep browser back button in sync
        history.back();
    }

    function openModal(title, initialValue, onConfirm) {
        modalTitle.textContent = title;
        modalInput.value = initialValue;
        genericModal.classList.remove('hidden');
        modalInput.focus();

        const handleConfirm = () => {
            const val = modalInput.value.trim();
            genericModal.classList.add('hidden');
            cleanup();
            onConfirm(val);
        };

        const handleEnter = (e) => {
            if (e.key === 'Enter') handleConfirm();
        };

        const cleanup = () => {
            modalConfirmBtn.removeEventListener('click', handleConfirm);
            modalInput.removeEventListener('keypress', handleEnter);
        };

        // Clear existing listeners by cloning and replacing if necessary, 
        // but since we only have one modal, we can just attach and clean up.
        modalConfirmBtn.addEventListener('click', handleConfirm, { once: true });
        modalInput.addEventListener('keypress', handleEnter);
        
        // Also cleanup on cancel
        modalCancelBtn.addEventListener('click', () => {
            cleanup();
        }, { once: true });
    }

    // Confirm Modal
    const confirmModalEl = document.getElementById('confirm-modal');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalMessage = document.getElementById('confirm-modal-message');
    const confirmModalCancelBtn = document.getElementById('confirm-modal-cancel-btn');
    const confirmModalConfirmBtn = document.getElementById('confirm-modal-confirm-btn');

    function openConfirmModal(title, message, onConfirm) {
        if (!confirmModalEl) return;
        confirmModalTitle.textContent = title;
        confirmModalMessage.textContent = message;
        confirmModalEl.classList.remove('hidden');

        const handleConfirm = () => {
            confirmModalEl.classList.add('hidden');
            cleanup();
            onConfirm();
        };

        const handleCancel = () => {
            confirmModalEl.classList.add('hidden');
            cleanup();
        };

        const cleanup = () => {
            confirmModalConfirmBtn.removeEventListener('click', handleConfirm);
            confirmModalCancelBtn.removeEventListener('click', handleCancel);
        };

        confirmModalConfirmBtn.addEventListener('click', handleConfirm);
        confirmModalCancelBtn.addEventListener('click', handleCancel);
    }

    // Alert Modal
    const alertModalEl = document.getElementById('alert-modal');
    const alertModalTitle = document.getElementById('alert-modal-title');
    const alertModalMessage = document.getElementById('alert-modal-message');
    const alertModalOkBtn = document.getElementById('alert-modal-ok-btn');

    function openAlertModal(title, message) {
        if (!alertModalEl) return;
        alertModalTitle.textContent = title;
        alertModalMessage.textContent = message;
        alertModalEl.classList.remove('hidden');

        const handleOk = () => {
            alertModalEl.classList.add('hidden');
            alertModalOkBtn.removeEventListener('click', handleOk);
        };

        alertModalOkBtn.addEventListener('click', handleOk);
    }

    async function handleFileUpload(e) {
        const files = e.target.files;
        if (!files.length) return;

        const toast = document.getElementById('upload-toast');
        const toastText = document.getElementById('upload-toast-text');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        
        toastText.textContent = `Uploading ${files.length} file(s)...`;
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        toast.classList.remove('hidden');

        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

        try {
            for (let f = 0; f < files.length; f++) {
                const file = files[f];
                const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
                
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const chunk = file.slice(start, end);

                    const formData = new FormData();
                    formData.append('filename', file.name);
                    formData.append('chunkIndex', i);
                    formData.append('totalChunks', totalChunks);
                    formData.append('path', currentPath);
                    formData.append('chunk', chunk, file.name);

                    await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', `${API_BASE}/upload-chunk`);
                        if (authToken) {
                            xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
                        }
                        
                        xhr.upload.onprogress = (event) => {
                            if (event.lengthComputable) {
                                const chunkLoaded = event.loaded;
                                const totalLoaded = start + chunkLoaded;
                                
                                const totalOverallSize = Array.from(files).reduce((acc, curr) => acc + curr.size, 0) || 1;
                                let previousFilesSize = 0;
                                for (let j = 0; j < f; j++) previousFilesSize += files[j].size;
                                
                                const overallPercent = Math.min(100, Math.round(((previousFilesSize + totalLoaded) / totalOverallSize) * 100));
                                
                                if (progressBar) progressBar.style.width = `${overallPercent}%`;
                                if (progressText) progressText.textContent = `${overallPercent}%`;
                            }
                        };
                        
                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                resolve();
                            } else if (xhr.status === 401 || xhr.status === 403) {
                                handleLogout();
                                reject(new Error('Unauthorized'));
                            } else {
                                reject(new Error('Upload failed'));
                            }
                        };
                        
                        xhr.onerror = () => reject(new Error('Network error during upload'));
                        
                        xhr.send(formData);
                    });
                }
            }
            fetchFiles();
        } catch (err) {
            console.error(err);
            openAlertModal("Error", 'Failed to upload files. Ensure you have a stable connection.');
        } finally {
            setTimeout(() => {
                toast.classList.add('hidden');
                fileInput.value = '';
            }, 1000);
        }
    }

    function showLoading() {
        fileGrid.innerHTML = `
            <div class="loading-state">
                <i class="ph ph-spinner ph-spin icon-spin"></i>
                <p>Loading files...</p>
            </div>
        `;
    }

    // Editor Modal
    const editorModal = document.getElementById('editor-modal');
    const editorTextarea = document.getElementById('editor-textarea');
    const editorFilename = document.getElementById('editor-filename');
    const editorSaveBtn = document.getElementById('editor-save-btn');
    const editorCancelBtn = document.getElementById('editor-cancel-btn');

    async function openTextEditor(filename, url) {
        try {
            const res = await apiFetch(url);
            if (!res.ok) throw new Error('Failed to load file content');
            const text = await res.text();
            
            editorFilename.textContent = filename;
            editorTextarea.value = text;
            editorModal.classList.remove('hidden');

            const handleSave = async () => {
                const newContent = editorTextarea.value;
                const filePath = currentPath ? `${currentPath}/${filename}` : filename;
                try {
                    const saveRes = await apiFetch(`${API_BASE}/file`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: filePath, content: newContent })
                    });
                    if (!saveRes.ok) throw new Error('Failed to save file');
                    editorModal.classList.add('hidden');
                    cleanup();
                    fetchFiles();
                } catch (err) {
                    openAlertModal('Error', err.message);
                }
            };

            const handleCancel = () => {
                editorModal.classList.add('hidden');
                cleanup();
            };

            const cleanup = () => {
                editorSaveBtn.removeEventListener('click', handleSave);
                editorCancelBtn.removeEventListener('click', handleCancel);
            };

            editorSaveBtn.addEventListener('click', handleSave);
            editorCancelBtn.addEventListener('click', handleCancel);

        } catch (err) {
            openAlertModal('Error', err.message);
        }
    }

    function previewFile(filename) {
        const query = searchInput.value.toLowerCase();
        const filtered = query ? allFiles.filter(f => f.name.toLowerCase().includes(query)) : allFiles;
        
        // Ensure folders are excluded and files are sorted as in the grid (folders first, then alphabetically, but since we exclude folders, just alphabetically)
        previewFilesList = filtered.filter(f => !f.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
        currentPreviewIndex = previewFilesList.findIndex(f => f.name === filename);
        updatePreviewNavButtons();

        const ext = filename.split('.').pop().toLowerCase();
        const filePath = currentPath ? `${currentPath}/${filename}` : filename;
        const fileUrl = `${API_BASE}/download?path=${encodeURIComponent(filePath)}&token=${authToken}`;
        
        previewContentWrapper.innerHTML = '';
        previewFilename.textContent = filename;
        
        // Remove existing listener if any to prevent multiple downloads from stacking
        const currentDownloadBtn = document.getElementById('download-preview-btn');
        const newDownloadBtn = currentDownloadBtn.cloneNode(true);
        currentDownloadBtn.parentNode.replaceChild(newDownloadBtn, currentDownloadBtn);
        newDownloadBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = `${API_BASE}/download?path=${encodeURIComponent(filePath)}&download=true&token=${authToken}`;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            previewContentWrapper.innerHTML = `<img src="${fileUrl}" class="preview-media" alt="preview">`;
            previewModal.classList.remove('hidden');
        } else if (['mp4', 'webm', 'mov'].includes(ext)) {
            previewContentWrapper.innerHTML = `<video src="${fileUrl}" class="preview-media" controls autoplay></video>`;
            previewModal.classList.remove('hidden');
        } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
            previewContentWrapper.innerHTML = `<audio src="${fileUrl}" class="preview-media" controls autoplay></audio>`;
            previewModal.classList.remove('hidden');
        } else if (['txt', 'md', 'csv', 'json', 'js', 'html', 'css'].includes(ext)) {
            openTextEditor(filename, fileUrl);
        } else {
            const a = document.createElement('a');
            a.href = `${API_BASE}/download?path=${encodeURIComponent(filePath)}&download=true&token=${authToken}`;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // --- User Management & Tab Navigation Additions ---

    function switchTab(tab) {
        const cloudBtnSidebar = document.getElementById('sidebar-cloud-btn');
        const usersBtnSidebar = document.getElementById('sidebar-users-btn');
        const aiBtnSidebar = document.getElementById('sidebar-ai-btn');
        const cloudBtnBottom = document.getElementById('bottom-cloud-btn');
        const usersBtnBottom = document.getElementById('bottom-users-btn');
        const aiBtnBottom = document.getElementById('bottom-ai-btn');
        
        const cloudSection = document.getElementById('cloud-section');
        const usersSection = document.getElementById('users-section');
        const aiSection = document.getElementById('ai-section');
        
        if (tab === 'cloud') {
            if (cloudSection) cloudSection.classList.remove('hidden');
            if (usersSection) usersSection.classList.add('hidden');
            if (aiSection) aiSection.classList.add('hidden');
            document.querySelector('.main-content').classList.remove('ai-mode');
            document.body.classList.remove('ai-mode');
            
            if (cloudBtnSidebar) cloudBtnSidebar.classList.add('active');
            if (usersBtnSidebar) usersBtnSidebar.classList.remove('active');
            if (aiBtnSidebar) aiBtnSidebar.classList.remove('active');
            if (cloudBtnBottom) cloudBtnBottom.classList.add('active');
            if (usersBtnBottom) usersBtnBottom.classList.remove('active');
            if (aiBtnBottom) aiBtnBottom.classList.remove('active');
            
            fetchFiles();
        } else if (tab === 'users') {
            if (cloudSection) cloudSection.classList.add('hidden');
            if (usersSection) usersSection.classList.remove('hidden');
            if (aiSection) aiSection.classList.add('hidden');
            document.querySelector('.main-content').classList.remove('ai-mode');
            document.body.classList.remove('ai-mode');
            
            if (cloudBtnSidebar) cloudBtnSidebar.classList.remove('active');
            if (usersBtnSidebar) usersBtnSidebar.classList.add('active');
            if (aiBtnSidebar) aiBtnSidebar.classList.remove('active');
            if (cloudBtnBottom) cloudBtnBottom.classList.remove('active');
            if (usersBtnBottom) usersBtnBottom.classList.add('active');
            if (aiBtnBottom) aiBtnBottom.classList.remove('active');
            
            fetchUsers();
        } else if (tab === 'ai') {
            if (cloudSection) cloudSection.classList.add('hidden');
            if (usersSection) usersSection.classList.add('hidden');
            if (aiSection) aiSection.classList.remove('hidden');
            document.querySelector('.main-content').classList.add('ai-mode');
            document.body.classList.add('ai-mode');
            
            if (cloudBtnSidebar) cloudBtnSidebar.classList.remove('active');
            if (usersBtnSidebar) usersBtnSidebar.classList.remove('active');
            if (aiBtnSidebar) aiBtnSidebar.classList.add('active');
            if (cloudBtnBottom) cloudBtnBottom.classList.remove('active');
            if (usersBtnBottom) usersBtnBottom.classList.remove('active');
            if (aiBtnBottom) aiBtnBottom.classList.add('active');
            
            const chatInput = document.getElementById('chat-input');
            if (chatInput) chatInput.focus();
        }
    }

    async function fetchUsers() {
        const usersGrid = document.getElementById('users-grid');
        if (!usersGrid) return;
        
        usersGrid.innerHTML = `
            <div class="loading-state">
                <i class="ph ph-spinner ph-spin icon-spin"></i>
                <p>Loading users...</p>
            </div>
        `;
        try {
            const res = await apiFetch(`${API_BASE}/admin/users`);
            if (!res.ok) throw new Error('Failed to fetch users');
            const users = await res.json();
            renderUsers(users);
        } catch (err) {
            console.error(err);
            usersGrid.innerHTML = `
                <div class="empty-state">
                    <i class="ph ph-warning" style="font-size:2.5rem; color:var(--danger-color)"></i>
                    <p>Failed to load users</p>
                </div>
            `;
        }
    }

    function renderUsers(users) {
        const usersGrid = document.getElementById('users-grid');
        if (!usersGrid) return;
        
        usersGrid.innerHTML = '';
        
        if (users.length === 0) {
            usersGrid.innerHTML = `
                <div class="empty-state">
                    <i class="ph ph-users" style="font-size:3rem; color:var(--text-secondary)"></i>
                    <p>No user accounts found</p>
                </div>
            `;
            return;
        }
        
        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'user-card';
            
            const isMasterAdmin = user.username === 'admin';
            
            card.innerHTML = `
                <div class="user-card-header">
                    <img src="https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.username)}" class="user-avatar" alt="Avatar">
                    <div class="user-details">
                        <span class="username" title="${user.username}">${user.username}</span>
                        <span class="role-badge ${user.role}">${user.role}</span>
                    </div>
                    ${!isMasterAdmin ? `
                        <button class="delete-user-btn" data-username="${user.username}" title="Delete User">
                            <i class="ph ph-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `;
            
            if (!isMasterAdmin) {
                const deleteBtn = card.querySelector('.delete-user-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const username = deleteBtn.getAttribute('data-username');
                        openConfirmModal('Delete Account', `Are you sure you want to delete account "${username}"?`, async () => {
                            try {
                                const res = await apiFetch(`${API_BASE}/admin/users/${username}`, {
                                    method: 'DELETE'
                                });
                                if (!res.ok) throw new Error('Failed to delete user');
                                fetchUsers();
                            } catch (err) {
                                openAlertModal("Error", err.message);
                            }
                        });
                    });
                }
            }
            
            usersGrid.appendChild(card);
        });
    }

    // Modal Events
    const createUserModal = document.getElementById('create-user-modal');
    const createUserModalBtn = document.getElementById('create-user-modal-btn');
    const createUserForm = document.getElementById('create-user-form');
    const createUserCancelBtn = document.getElementById('create-user-cancel-btn');
    const createUsernameInput = document.getElementById('create-username');
    const createPasswordInput = document.getElementById('create-password');
    const createUserError = document.getElementById('create-user-error');

    if (createUserModalBtn) {
        createUserModalBtn.addEventListener('click', () => {
            if (createUserForm) createUserForm.reset();
            if (createUserError) createUserError.style.display = 'none';
            if (createUserModal) createUserModal.classList.remove('hidden');
            if (createUsernameInput) createUsernameInput.focus();
        });
    }

    if (createUserCancelBtn) {
        createUserCancelBtn.addEventListener('click', () => {
            if (createUserModal) createUserModal.classList.add('hidden');
        });
    }

    if (createUserForm) {
        createUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = createUsernameInput.value.trim();
            const password = createPasswordInput.value.trim();
            if (createUserError) createUserError.style.display = 'none';
            
            try {
                const res = await apiFetch(`${API_BASE}/admin/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (res.ok) {
                    if (createUserModal) createUserModal.classList.add('hidden');
                    fetchUsers();
                } else {
                    if (createUserError) {
                        createUserError.textContent = data.error || 'Failed to create user';
                        createUserError.style.display = 'block';
                    }
                }
            } catch (err) {
                if (createUserError) {
                    createUserError.textContent = 'Server error';
                    createUserError.style.display = 'block';
                }
            }
        });
    }

    // Tab Listeners
    const cloudBtnSidebar = document.getElementById('sidebar-cloud-btn');
    const usersBtnSidebar = document.getElementById('sidebar-users-btn');
    const aiBtnSidebar = document.getElementById('sidebar-ai-btn');
    const cloudBtnBottom = document.getElementById('bottom-cloud-btn');
    const usersBtnBottom = document.getElementById('bottom-users-btn');
    const aiBtnBottom = document.getElementById('bottom-ai-btn');

    if (cloudBtnSidebar) cloudBtnSidebar.addEventListener('click', (e) => { e.preventDefault(); switchTab('cloud'); });
    if (usersBtnSidebar) usersBtnSidebar.addEventListener('click', (e) => { e.preventDefault(); switchTab('users'); });
    if (aiBtnSidebar) aiBtnSidebar.addEventListener('click', (e) => { e.preventDefault(); switchTab('ai'); });
    if (cloudBtnBottom) cloudBtnBottom.addEventListener('click', (e) => { e.preventDefault(); switchTab('cloud'); });
    if (usersBtnBottom) usersBtnBottom.addEventListener('click', (e) => { e.preventDefault(); switchTab('users'); });
    if (aiBtnBottom) aiBtnBottom.addEventListener('click', (e) => { e.preventDefault(); switchTab('ai'); });

    // === NETWORK WATCHDOG LOGIC ===
    let watchdogInterval;
    const forceScanBtn = document.getElementById('force-scan-btn');
    const threatStatusText = document.getElementById('threat-status-text');
    const networkGrid = document.getElementById('network-grid');

    if (forceScanBtn) {
        forceScanBtn.addEventListener('click', async () => {
            console.log("Initiate scan clicked!");
            try {
                const originalText = forceScanBtn.innerHTML;
                forceScanBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> SCANNING...';
                forceScanBtn.disabled = true;
                
                console.log("Sending POST request to /api/network/scan...");
                const response = await apiFetch(`${API_BASE}/network/scan`, { method: 'POST' });
                console.log("Scan initiated successfully", response);
                
                // Aggressive polling post-scan to catch async results
                let pollCount = 0;
                const fastPoll = setInterval(() => {
                    console.log(`Polling fetchWatchdogStatus... (${pollCount + 1}/5)`);
                    fetchWatchdogStatus();
                    pollCount++;
                    if (pollCount >= 5) {
                        clearInterval(fastPoll);
                        forceScanBtn.innerHTML = originalText;
                        forceScanBtn.disabled = false;
                        console.log("Finished fast polling after scan");
                    }
                }, 2000);
            } catch (err) {
                console.error('Scan initiation failed:', err);
                forceScanBtn.disabled = false;
            }
        });
    } else {
        console.warn("force-scan-btn element not found in DOM!");
    }

    async function fetchWatchdogStatus() {
        if (!authToken) return;
        try {
            const res = await apiFetch(`${API_BASE}/watchdog/status`);
            if (!res.ok) return;
            const data = await res.json();
            
            if (threatStatusText && data.assessment) {
                let badgeClass = 'status-secure';
                if (data.assessment.status === 'WARNING') badgeClass = 'status-warning';
                if (data.assessment.status === 'CRITICAL') badgeClass = 'status-critical';
                
                threatStatusText.innerHTML = `<span class="status-badge ${badgeClass}">${data.assessment.status || 'UNKNOWN'}</span> 
                                              <span style="color: var(--text-primary); margin-left: 0.5rem;">${data.assessment.message || 'No assessment available.'}</span>`;
            }

            if (networkGrid && data.logs) {
                networkGrid.innerHTML = data.logs.map(device => `
                    <div class="device-card">
                        <div class="device-header">
                            <i class="ph ph-desktop" style="font-size: 1.5rem; color: var(--accent-color);"></i>
                            <span class="device-ip">${device.ip}</span>
                        </div>
                        <div class="device-details">
                            <strong>MAC:</strong> ${device.mac}<br>
                            <strong>VENDOR:</strong> ${device.vendor || 'UNKNOWN'}<br>
                            <strong>LAST SEEN:</strong> ${new Date(device.timestamp).toLocaleTimeString()}<br>
                            ${device.details ? `<div style="margin-top: 0.5rem; background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: var(--radius-sm); font-size: 0.75rem; white-space: pre-wrap; overflow-x: auto; color: var(--text-primary); border: 1px solid rgba(0, 243, 255, 0.1);">${device.details}</div>` : '<div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);"><i class="ph ph-spinner ph-spin"></i> Scanning deep details...</div>'}
                        </div>
                    </div>
                `).join('');
            }
        } catch (err) {
            console.error('Failed to fetch watchdog status:', err);
        }
    }

    // Wrap the existing switchTab function to handle polling hooks
    const originalSwitchTab = switchTab;
    switchTab = function(tab) {
        originalSwitchTab(tab);
        if (tab === 'users') { // 'users' corresponds to the Protocols tab
            fetchWatchdogStatus();
            if (watchdogInterval) clearInterval(watchdogInterval);
            watchdogInterval = setInterval(fetchWatchdogStatus, 5000);
        } else {
            if (watchdogInterval) clearInterval(watchdogInterval);
        }
    };

    // AI Chat Logic
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatMessages = document.getElementById('chat-messages');
    const voiceInputBtn = document.getElementById('voice-input-btn');
    
    let wasVoiceInitiated = false;

    if (chatSendBtn && chatInput && chatMessages) {
        
        // Voice Input Logic
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        let isVoiceModeActive = false;
        let isProcessingResponse = false;
        let isSynthesizing = false;
        let recognition = null;
        let resetVoiceBtn = () => {};
        
        let accumulatedFinal = '';
        let lastSessionTranscript = '';
        let voiceInputTimeout = null;
        const VOICE_SEND_TIMEOUT = 3000;

        if (SpeechRecognition && voiceInputBtn) {
            recognition = new SpeechRecognition();
            recognition.continuous = false; // Force session boundaries to clear browser memory
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            resetVoiceBtn = () => {
                if (!isVoiceModeActive) {
                    voiceInputBtn.innerHTML = '<i class="ph ph-microphone" style="font-size: 1.2rem; color: var(--accent-color);"></i>';
                    voiceInputBtn.style.animation = '';
                } else if (isProcessingResponse || isSynthesizing) {
                    voiceInputBtn.innerHTML = '<i class="ph-fill ph-microphone-stage" style="font-size: 1.2rem; color: var(--accent-color);"></i>';
                    voiceInputBtn.style.animation = '';
                } else {
                    voiceInputBtn.innerHTML = '<i class="ph-fill ph-microphone" style="font-size: 1.2rem; color: var(--danger-color);"></i>';
                    voiceInputBtn.style.animation = 'pulse 1.5s infinite';
                }
            };

            recognition.onstart = () => {
                lastSessionTranscript = '';
                resetVoiceBtn();
            };

            recognition.onresult = (event) => {
                if (event.results.length > 0) {
                    // Take the absolute last element to ignore all browser duplication bugs
                    const lastResult = event.results[event.results.length - 1];
                    lastSessionTranscript = lastResult[0].transcript.trim();
                }
                
                chatInput.value = accumulatedFinal + (lastSessionTranscript ? (accumulatedFinal && !accumulatedFinal.endsWith(' ') && !lastSessionTranscript.startsWith(' ') ? ' ' : '') + lastSessionTranscript : '');
                
                clearTimeout(voiceInputTimeout);
                
                if (chatInput.value.trim()) {
                    voiceInputTimeout = setTimeout(() => {
                        wasVoiceInitiated = true;
                        try { recognition.stop(); } catch(e){}
                        sendChatMessage();
                    }, VOICE_SEND_TIMEOUT);
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                if (event.error === 'aborted') return; // Ignore intentional stops
                
                if (event.error === 'no-speech' && isVoiceModeActive && !isProcessingResponse && !isSynthesizing) {
                    try { recognition.start(); } catch(e){}
                } else {
                    isVoiceModeActive = false;
                    resetVoiceBtn();
                }
            };

            recognition.onend = () => {
                if (lastSessionTranscript) {
                    accumulatedFinal += (accumulatedFinal && !accumulatedFinal.endsWith(' ') && !lastSessionTranscript.startsWith(' ') ? ' ' : '') + lastSessionTranscript;
                    lastSessionTranscript = '';
                }
                
                if (isVoiceModeActive && !isProcessingResponse && !isSynthesizing) {
                    try { recognition.start(); } catch(e){}
                }
                resetVoiceBtn();
            };

            voiceInputBtn.addEventListener('click', () => {
                isVoiceModeActive = !isVoiceModeActive;
                if (isVoiceModeActive) {
                    accumulatedFinal = chatInput.value.trim() ? chatInput.value.trim() + ' ' : '';
                    lastSessionTranscript = '';
                    window.speechSynthesis.cancel();
                    try { recognition.start(); } catch(e){}
                } else {
                    window.speechSynthesis.cancel();
                    isSynthesizing = false;
                    try { recognition.stop(); } catch(e){}
                }
                resetVoiceBtn();
            });
        } else if (voiceInputBtn) {
            voiceInputBtn.style.display = 'none';
        }

        const appendMessage = (content, isUser) => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
            msgDiv.innerHTML = `
                <div class="message-avatar"><i class="ph ${isUser ? 'ph-user' : 'ph-robot'}"></i></div>
                <div class="message-content">${content.replace(/\n/g, '<br>')}</div>
            `;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };

        // Streaming Speech Synthesis State
        let utteranceQueue = [];
        let isSpeaking = false;
        let isResponseGenerationComplete = false;

        const processSpeechQueue = () => {
            if (isSpeaking) return;
            
            if (utteranceQueue.length === 0) {
                if (isResponseGenerationComplete) {
                    isSynthesizing = false;
                    isProcessingResponse = false;
                    if (isVoiceModeActive && recognition) {
                        try { recognition.start(); } catch(e){}
                    }
                    wasVoiceInitiated = false;
                    resetVoiceBtn();
                }
                return;
            }
            
            isSpeaking = true;
            isSynthesizing = true;
            resetVoiceBtn();
            
            const textToSpeak = utteranceQueue.shift();
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            const voices = window.speechSynthesis.getVoices();
            const englishVoices = voices.filter(v => v.lang.startsWith('en'));
            const maleVoice = englishVoices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('guy') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('mark') || v.name.toLowerCase().includes('jarvis'));
            if (maleVoice) utterance.voice = maleVoice;
            
            utterance.pitch = 0.8;
            utterance.rate = 1.05;
            
            const onSpeechEnd = () => {
                isSpeaking = false;
                window.jarvisUtterance = null;
                setTimeout(processSpeechQueue, 150); // Small gap between chunks
            };
            
            utterance.onend = onSpeechEnd;
            utterance.onerror = onSpeechEnd;
            
            window.jarvisUtterance = utterance;
            window.speechSynthesis.speak(utterance);
        };

        const queueSpeechChunk = (text) => {
            if (!text.trim()) return;
            if (isVoiceModeActive || wasVoiceInitiated) {
                utteranceQueue.push(text);
                processSpeechQueue();
            }
        };

        const speakAndRestart = (textToSpeak) => {
            isResponseGenerationComplete = true;
            queueSpeechChunk(textToSpeak);
            if (!isVoiceModeActive && !wasVoiceInitiated) {
                isProcessingResponse = false;
                isSynthesizing = false;
                if (isVoiceModeActive && recognition) {
                    try { recognition.start(); } catch(e){}
                }
                resetVoiceBtn();
            } else {
                processSpeechQueue(); // Ensure queue is being processed
            }
        };

        const sendChatMessage = async () => {
            const message = chatInput.value.trim();
            if (!message) return;
            
            clearTimeout(voiceInputTimeout);
            accumulatedFinal = '';
            lastSessionTranscript = '';
            chatInput.value = '';
            appendMessage(message, true);
            
            const typingDiv = document.createElement('div');
            typingDiv.className = 'message ai-message typing-indicator';
            typingDiv.innerHTML = `
                <div class="message-avatar"><i class="ph ph-robot"></i></div>
                <div class="message-content"><i class="ph ph-spinner ph-spin"></i> Processing...</div>
            `;
            chatMessages.appendChild(typingDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            isProcessingResponse = true;
            isResponseGenerationComplete = false;
            resetVoiceBtn();

            try {
                const res = await apiFetch(`${API_BASE}/ai/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                typingDiv.remove();
                
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const errMsg = 'Error: ' + (data.error || 'Failed to get response');
                    appendMessage(errMsg, false);
                    speakAndRestart(errMsg);
                    return;
                }

                const msgDiv = document.createElement('div');
                msgDiv.className = 'message ai-message';
                msgDiv.innerHTML = `
                    <div class="message-avatar"><i class="ph ph-robot"></i></div>
                    <div class="message-content"></div>
                `;
                chatMessages.appendChild(msgDiv);
                const contentDiv = msgDiv.querySelector('.message-content');
                
                const reader = res.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';
                let fullPlainText = '';
                let speechBuffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const parsed = JSON.parse(line);
                            let textChunk = '';
                            if (parsed.message && parsed.message.content) {
                                textChunk = parsed.message.content;
                            } else if (parsed.response) {
                                textChunk = parsed.response;
                            }
                            if (textChunk) {
                                fullPlainText += textChunk;
                                contentDiv.innerHTML += textChunk.replace(/\n/g, '<br>');
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                                
                                speechBuffer += textChunk;
                                // Chunk by punctuation or line breaks
                                let match;
                                while ((match = speechBuffer.match(/([^.?!,;:\n]+[.?!,;:\n]+)/))) {
                                    queueSpeechChunk(match[0]);
                                    speechBuffer = speechBuffer.substring(match.index + match[0].length);
                                }
                            }
                        } catch (e) {}
                    }
                }
                
                if (buffer.trim()) {
                    try {
                        const parsed = JSON.parse(buffer);
                        let textChunk = '';
                        if (parsed.message && parsed.message.content) {
                            textChunk = parsed.message.content;
                        } else if (parsed.response) {
                            textChunk = parsed.response;
                        }
                        if (textChunk) {
                            fullPlainText += textChunk;
                            contentDiv.innerHTML += textChunk.replace(/\n/g, '<br>');
                            speechBuffer += textChunk;
                        }
                    } catch (e) {}
                }
                
                if (speechBuffer.trim()) {
                    queueSpeechChunk(speechBuffer);
                }
                
                chatMessages.scrollTop = chatMessages.scrollHeight;
                isResponseGenerationComplete = true;
                processSpeechQueue(); // Trigger in case it was empty

            } catch (err) {
                typingDiv.remove();
                const errMsg = 'Error: Connection to J.A.R.V.I.S. core failed.';
                appendMessage(errMsg, false);
                speakAndRestart(errMsg);
            }
        };

        chatSendBtn.addEventListener('click', sendChatMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    }
});
