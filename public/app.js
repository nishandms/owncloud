document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentPath = history.state && history.state.path !== undefined ? history.state.path : '';
    let allFiles = []; // For searching
    let sheetTargetFile = null; // Which file the bottom sheet is acting on
    let currentPreviewIndex = -1;
    let previewFilesList = [];

    // DOM Elements
    const fileGrid = document.getElementById('file-grid');
    const pathDisplay = document.getElementById('current-path-display');
    const backBtn = document.getElementById('back-btn');
    
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
    
    // Auth State
    let authToken = localStorage.getItem('owncloud_token');
    const loginScreen = document.getElementById('login-screen');
    const appWrapper = document.getElementById('app-wrapper');
    const bottomNav = document.getElementById('bottom-nav');
    const sidebar = document.getElementById('sidebar');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('header-logout-btn');

    // Init App
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
            ['preview-modal', 'generic-modal', 'editor-modal', 'confirm-modal', 'alert-modal'].forEach(id => {
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

            // Handle More button
            const moreBtn = card.querySelector('.more-btn');
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openBottomSheet(file);
            });

            // Handle Card Click
            card.addEventListener('click', () => {
                if (file.isDirectory) {
                    currentPath = currentPath ? `${currentPath}/${file.name}` : file.name;
                    history.pushState({ path: currentPath }, '');
                    searchInput.value = ''; // clear search on navigate
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

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        const toast = document.getElementById('upload-toast');
        document.getElementById('upload-toast-text').textContent = `Uploading ${files.length} file(s)...`;
        toast.classList.remove('hidden');

        try {
            const res = await apiFetch(`${API_BASE}/upload?path=${encodeURIComponent(currentPath)}`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error('Upload failed');
            fetchFiles();
        } catch (err) {
            console.error(err);
            openAlertModal("Error", 'Failed to upload files');
        } finally {
            toast.classList.add('hidden');
            fileInput.value = '';
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
        const cloudBtnBottom = document.getElementById('bottom-cloud-btn');
        const usersBtnBottom = document.getElementById('bottom-users-btn');
        
        const cloudSection = document.getElementById('cloud-section');
        const usersSection = document.getElementById('users-section');
        
        if (tab === 'cloud') {
            if (cloudSection) cloudSection.classList.remove('hidden');
            if (usersSection) usersSection.classList.add('hidden');
            
            if (cloudBtnSidebar) cloudBtnSidebar.classList.add('active');
            if (usersBtnSidebar) usersBtnSidebar.classList.remove('active');
            if (cloudBtnBottom) cloudBtnBottom.classList.add('active');
            if (usersBtnBottom) usersBtnBottom.classList.remove('active');
            
            fetchFiles();
        } else if (tab === 'users') {
            if (cloudSection) cloudSection.classList.add('hidden');
            if (usersSection) usersSection.classList.remove('hidden');
            
            if (cloudBtnSidebar) cloudBtnSidebar.classList.remove('active');
            if (usersBtnSidebar) usersBtnSidebar.classList.add('active');
            if (cloudBtnBottom) cloudBtnBottom.classList.remove('active');
            if (usersBtnBottom) usersBtnBottom.classList.add('active');
            
            fetchUsers();
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
    const cloudBtnBottom = document.getElementById('bottom-cloud-btn');
    const usersBtnBottom = document.getElementById('bottom-users-btn');

    if (cloudBtnSidebar) cloudBtnSidebar.addEventListener('click', (e) => { e.preventDefault(); switchTab('cloud'); });
    if (usersBtnSidebar) usersBtnSidebar.addEventListener('click', (e) => { e.preventDefault(); switchTab('users'); });
    if (cloudBtnBottom) cloudBtnBottom.addEventListener('click', (e) => { e.preventDefault(); switchTab('cloud'); });
    if (usersBtnBottom) usersBtnBottom.addEventListener('click', (e) => { e.preventDefault(); switchTab('users'); });
});
