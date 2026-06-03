document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('id');

    if (!shareId) {
        showErrorState("Invalid Link", "No share ID provided in the URL.");
        return;
    }

    // State
    let currentPath = '';
    let allFiles = [];
    let currentPreviewIndex = -1;
    let previewFilesList = [];

    // DOM
    const shareTitle = document.getElementById('share-title');
    const shareOwner = document.getElementById('share-owner');
    const fileGrid = document.getElementById('file-grid');
    const pathDisplay = document.getElementById('current-path-display');
    const backBtn = document.getElementById('back-btn');

    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const searchInput = document.getElementById('search-input');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    const themeToggles = [document.getElementById('sidebar-theme-toggle'), document.getElementById('header-theme-toggle')];

    // Preview
    const previewModal = document.getElementById('preview-modal');
    const closePreviewBtn = document.getElementById('close-preview-btn');
    const downloadPreviewBtn = document.getElementById('download-preview-btn');
    const previewFilename = document.getElementById('preview-filename');
    const previewContentWrapper = document.getElementById('preview-content-wrapper');
    const previewPrevBtn = document.getElementById('preview-prev-btn');
    const previewNextBtn = document.getElementById('preview-next-btn');

    // API Base
    const API_BASE = '/api/public/share';

    // --- UI Logic ---
    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
        });
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('app-theme', theme);
        const iconClass = theme === 'dark' ? 'ph-sun' : 'ph-moon';
        const text = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        
        themeToggles.forEach(btn => {
            if (btn) {
                if (btn.id === 'sidebar-theme-toggle') {
                    btn.innerHTML = `<i class="ph ${iconClass}"></i> ${text}`;
                } else {
                    btn.innerHTML = `<i class="ph ${iconClass}"></i>`;
                }
            }
        });
    }

    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        setTheme(prefersLight ? 'light' : 'dark');
    }

    themeToggles.forEach(btn => {
        if (btn) btn.addEventListener('click', (e) => {
            e.preventDefault();
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allFiles.filter(f => f.name.toLowerCase().includes(query));
            renderGridItems(filtered);
        });
    }

    // --- Upload Logic ---
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileUpload);
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
                        xhr.open('POST', `${API_BASE}/${shareId}/upload-chunk`);
                        
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

    // --- Core Logic ---
    async function initShare() {
        try {
            const res = await fetch(`${API_BASE}/${shareId}`);
            if (!res.ok) {
                if (res.status === 410) throw new Error("This share link has expired.");
                if (res.status === 404) throw new Error("Share link not found.");
                throw new Error("Failed to load share info.");
            }
            const data = await res.json();
            
            shareTitle.textContent = data.path;
            shareOwner.textContent = `Shared by ${data.owner}`;
            
            if (data.expiresAt) {
                const date = new Date(data.expiresAt);
                shareOwner.textContent += ` • Expires: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            }

            fetchFiles();
        } catch (err) {
            showErrorState("Link Unavailable", err.message);
        }
    }

    async function fetchFiles() {
        showLoading();
        try {
            const res = await fetch(`${API_BASE}/${shareId}/files?path=${encodeURIComponent(currentPath)}`);
            if (!res.ok) throw new Error('Failed to fetch files');
            allFiles = await res.json();
            
            // Apply search filter if active
            const query = searchInput ? searchInput.value.toLowerCase() : '';
            const filtered = query ? allFiles.filter(f => f.name.toLowerCase().includes(query)) : allFiles;
            
            renderGridItems(filtered);
            updateHeader();
        } catch (err) {
            console.error(err);
            fileGrid.innerHTML = `<div class="empty-state"><i class="ph ph-warning" style="font-size:2.5rem; color:var(--danger-color)"></i><p>Error loading files</p></div>`;
        }
    }

    function renderGridItems(files) {
        fileGrid.innerHTML = '';
        if (files.length === 0) {
            fileGrid.innerHTML = `<div class="empty-state"><i class="ph ph-folder-open" style="font-size:3rem; color:var(--text-secondary)"></i><p>This folder is empty</p></div>`;
            return;
        }

        files.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'item-card';
            card.style.cursor = 'pointer';
            
            let iconOrThumbnail = '';
            const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
            const fileUrl = `${API_BASE}/${shareId}/download?path=${encodeURIComponent(filePath)}`;
            
            if (file.isDirectory) {
                iconOrThumbnail = `<svg class="folder-svg" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
            } else {
                const ext = file.name.split('.').pop().toLowerCase();
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
            const sizeStr = file.isDirectory ? '' : formatBytes(file.size);

            card.innerHTML = `
                <div class="card-icon-wrapper">
                    ${iconOrThumbnail}
                </div>
                <div class="card-info" style="width:100%">
                    <div class="item-name-group" style="text-align: left;">
                        <span class="item-name" title="${file.name}">${file.name}</span>
                        <span class="item-date">${dateStr} ${sizeStr ? '• ' + sizeStr : ''}</span>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                if (file.isDirectory) {
                    currentPath = currentPath ? `${currentPath}/${file.name}` : file.name;
                    fetchFiles();
                } else {
                    previewFile(file.name);
                }
            });

            fileGrid.appendChild(card);
        });
    }

    function updateHeader() {
        if (currentPath) {
            const parts = currentPath.split('/');
            pathDisplay.textContent = parts[parts.length - 1];
            backBtn.classList.remove('hidden');
        } else {
            pathDisplay.textContent = 'Contents';
            backBtn.classList.add('hidden');
        }
    }

    backBtn.addEventListener('click', () => {
        if (!currentPath) return;
        const parts = currentPath.split('/');
        parts.pop();
        currentPath = parts.join('/');
        fetchFiles();
    });

    // --- Preview Logic ---
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
        previewPrevBtn.style.display = currentPreviewIndex > 0 ? 'flex' : 'none';
        previewNextBtn.style.display = (currentPreviewIndex !== -1 && currentPreviewIndex < previewFilesList.length - 1) ? 'flex' : 'none';
    }

    function previewFile(filename) {
        previewFilesList = allFiles.filter(f => !f.isDirectory);
        currentPreviewIndex = previewFilesList.findIndex(f => f.name === filename);
        updatePreviewNavButtons();

        const filePath = currentPath ? `${currentPath}/${filename}` : filename;
        const fileUrl = `${API_BASE}/${shareId}/download?path=${encodeURIComponent(filePath)}`;
        const downloadUrl = `${fileUrl}&download=true`;
        
        previewFilename.textContent = filename;
        previewModal.classList.remove('hidden');
        previewContentWrapper.innerHTML = '<div style="color:white; display:flex; flex-direction:column; align-items:center; gap:1rem;"><i class="ph ph-spinner ph-spin icon-spin" style="font-size:2rem;"></i> Loading preview...</div>';
        
        // Remove old download listener
        const newDownloadBtn = downloadPreviewBtn.cloneNode(true);
        downloadPreviewBtn.parentNode.replaceChild(newDownloadBtn, downloadPreviewBtn);
        newDownloadBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

        const ext = filename.split('.').pop().toLowerCase();
        
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            const img = new Image();
            img.onload = () => {
                previewContentWrapper.innerHTML = '';
                previewContentWrapper.appendChild(img);
            };
            img.onerror = () => {
                previewContentWrapper.innerHTML = '<div style="color:white;">Failed to load image</div>';
            };
            img.src = fileUrl;
        } 
        else if (['mp4', 'webm', 'mov'].includes(ext)) {
            previewContentWrapper.innerHTML = `
                <video controls autoplay style="max-width:100%; max-height:100%;">
                    <source src="${fileUrl}" type="video/${ext === 'mov' ? 'quicktime' : ext}">
                    Your browser does not support the video tag.
                </video>`;
        }
        else if (['mp3', 'wav', 'ogg'].includes(ext)) {
            previewContentWrapper.innerHTML = `
                <div style="background:var(--surface-color); padding:2rem; border-radius:var(--radius-lg); text-align:center;">
                    <i class="ph ph-music-notes" style="font-size:4rem; color:var(--primary-color); margin-bottom:1rem; display:block;"></i>
                    <audio controls autoplay style="width:300px; max-width:100%;">
                        <source src="${fileUrl}" type="audio/${ext}">
                        Your browser does not support the audio element.
                    </audio>
                </div>`;
        }
        else if (['txt', 'js', 'json', 'css', 'html', 'md', 'csv'].includes(ext)) {
            fetch(fileUrl)
                .then(r => r.text())
                .then(text => {
                    const pre = document.createElement('pre');
                    pre.style.color = "white";
                    pre.style.background = "var(--bg-color)";
                    pre.style.padding = "1rem";
                    pre.style.borderRadius = "var(--radius-md)";
                    pre.style.overflow = "auto";
                    pre.style.width = "100%";
                    pre.style.height = "100%";
                    pre.style.fontFamily = "'Inter', monospace";
                    pre.style.fontSize = "0.9rem";
                    pre.style.lineHeight = "1.5";
                    pre.textContent = text;
                    previewContentWrapper.innerHTML = '';
                    previewContentWrapper.appendChild(pre);
                })
                .catch(() => {
                    previewContentWrapper.innerHTML = '<div style="color:white;">Failed to load text file</div>';
                });
        }
        else {
            previewContentWrapper.innerHTML = `
                <div style="text-align:center; color:white;">
                    <i class="ph ph-file" style="font-size:4rem; margin-bottom:1rem; display:block;"></i>
                    <p style="margin-bottom:1.5rem;">No preview available for this file type.</p>
                    <a href="${downloadUrl}" download class="btn primary-btn" style="text-decoration:none; display:inline-block;">Download File</a>
                </div>
            `;
        }
    }

    // --- Helpers ---
    function showErrorState(title, message) {
        document.body.innerHTML = `
            <div class="expired-state">
                <i class="ph ph-warning-circle"></i>
                <h1 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 2rem;">${title}</h1>
                <p>${message}</p>
            </div>
        `;
    }

    function showLoading() {
        fileGrid.innerHTML = `
            <div class="loading-state">
                <i class="ph ph-spinner ph-spin icon-spin"></i>
                <p>Loading files...</p>
            </div>
        `;
    }

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.round(diffMs / 60000);
        const diffHours = Math.round(diffMs / 3600000);
        const diffDays = Math.round(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    }

    // Run
    initShare();
});
