let editor;
let currentRepo = "";
let currentFilePath = "";
let currentFileSha = ""; 
let isForcedDesktop = false;

// Load bookmarks and convert legacy data safely
let rawSaved = JSON.parse(localStorage.getItem('gitEditor_savedRepos') || '[]');
let savedRepos = rawSaved.map(item => typeof item === 'string' ? { path: item, token: '' } : item);

// Elements Configuration
const menuBtn = document.getElementById('menuBtn');
const closeMenuBtn = document.getElementById('closeMenuBtn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const savedReposList = document.getElementById('savedReposList');
const repoInput = document.getElementById('repoInput');
const tokenInput = document.getElementById('tokenInput');
const saveFileBtn = document.getElementById('saveFileBtn');
const viewModeToggle = document.getElementById('viewModeToggle');
const viewModeIcon = document.getElementById('viewModeIcon');
const viewModeText = document.getElementById('viewModeText');

// --- Adaptive View Layout Processing (User Agent + Viewport Check) ---
function initDeviceResponsiveness() {
    // Check user agent string for mobile signatures
    const isMobileUserAgent = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth < 1024;

    if (isMobileUserAgent || isSmallScreen) {
        applyViewMode(false); // Default to Mobile view parameters
    } else {
        applyViewMode(true);  // Default to Desktop view parameters
    }
}

function applyViewMode(forceDesktop) {
    isForcedDesktop = forceDesktop;
    if (forceDesktop) {
        document.body.classList.remove('adaptive-view');
        document.body.classList.add('desktop-view');
        viewModeIcon.textContent = 'desktop_windows';
        viewModeText.textContent = 'Desktop Mode';
        closeSidebar();
    } else {
        document.body.classList.remove('desktop-view');
        document.body.classList.add('adaptive-view');
        viewModeIcon.textContent = 'smartphone';
        viewModeText.textContent = 'Mobile Mode';
    }
    // Trigger Monaco Editor layouts refresh to adapt bounding rectangles safely
    if (editor) setTimeout(() => editor.layout(), 100);
}

// Global UI Mode Toggler listener
viewModeToggle.addEventListener('click', () => {
    applyViewMode(!isForcedDesktop);
});

// Sidebar Mechanics
function openSidebar() {
    if (isForcedDesktop) return;
    sidebar.classList.remove('-translate-x-full');
    sidebarOverlay.classList.remove('opacity-0', 'pointer-events-none');
}

function closeSidebar() {
    sidebar.classList.add('-translate-x-full');
    sidebarOverlay.classList.add('opacity-0', 'pointer-events-none');
}

menuBtn.addEventListener('click', openSidebar);
closeMenuBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// Handle window resizing safely
window.addEventListener('resize', () => {
    if (!isForcedDesktop) {
        if (window.innerWidth >= 1024) {
            closeSidebar();
        }
    }
});

// Bookmarks Processing Engine
function renderSavedRepos() {
    savedReposList.innerHTML = '';
    if (savedRepos.length === 0) {
        savedReposList.innerHTML = '<p class="text-gray-600 text-xs italic px-2">No bookmarks saved.</p>';
        return;
    }

    savedRepos.forEach(item => {
        const el = document.createElement('div');
        el.className = 'flex items-center justify-between px-2 py-1 hover:bg-gray-800 rounded group transition';
        
        const repoLink = document.createElement('span');
        repoLink.className = 'text-xs text-indigo-300 cursor-pointer truncate flex-1 hover:text-indigo-200 flex items-center gap-1.5';
        repoLink.innerHTML = `<span class="material-symbols-outlined text-yellow-500 !text-sm">bookmark</span> <span class="truncate">${item.path}</span>`;
        
        repoLink.onclick = () => {
            repoInput.value = item.path;
            tokenInput.value = item.token || ''; 
            fetchRepoStructure();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition px-2 flex items-center justify-center cursor-pointer';
        deleteBtn.innerHTML = '<span class="material-symbols-outlined !text-sm">close</span>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            savedRepos = savedRepos.filter(r => r.path !== item.path);
            localStorage.setItem('gitEditor_savedRepos', JSON.stringify(savedRepos));
            renderSavedRepos();
        };

        el.appendChild(repoLink);
        el.appendChild(deleteBtn);
        savedReposList.appendChild(el);
    });
}

document.getElementById('saveRepoBtn').addEventListener('click', () => {
    const repo = repoInput.value.trim();
    const token = tokenInput.value.trim();
    
    if (!repo || !repo.includes('/')) return alert('Please enter a valid repo (username/repo).');
    
    const existingIndex = savedRepos.findIndex(r => r.path === repo);
    if (existingIndex > -1) {
        savedRepos[existingIndex].token = token;
    } else {
        savedRepos.push({ path: repo, token: token });
    }
    
    localStorage.setItem('gitEditor_savedRepos', JSON.stringify(savedRepos));
    renderSavedRepos();
    if (!isForcedDesktop && window.innerWidth < 1024) openSidebar();
});

// Monaco Editor Initialization
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
    editor = monaco.editor.create(document.getElementById('editorContainer'), {
        value: "// Auto-save is completely disabled.\n// Changes stay inside your browser memory until you manual save.\n",
        language: 'javascript',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 13,
        fontFamily: "'Fira Code', Consolas, Monaco, monospace",
        minimap: { enabled: false },
        wordWrap: "on",
        padding: { top: 12 },
        renderLineHighlight: 'all',
        cursorBlinking: 'smooth'
    });
    // Fire checking mechanics after editor successfully initialized
    initDeviceResponsiveness();
});

document.getElementById('loadBtn').addEventListener('click', fetchRepoStructure);
repoInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchRepoStructure(); });

// Core GitHub Communication Layer
async function githubFetch(url, options = {}) {
    const token = tokenInput.value.trim();
    options.headers = options.headers || {};
    if (token) options.headers['Authorization'] = `token ${token}`;
    
    const response = await fetch(url, options);
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Request failed with status ${response.status}`);
    }
    return response.json();
}

async function fetchRepoStructure() {
    const repoPath = repoInput.value.trim();
    const treeContainer = document.getElementById('fileTree');
    const badge = document.getElementById('repoNameBadge');
    
    if (!repoPath || !repoPath.includes('/')) return alert('Please use "username/repository" format.');
    
    currentRepo = repoPath;
    treeContainer.innerHTML = '<div class="text-center pt-8"><span class="inline-block animate-spin text-indigo-400"><span class="material-symbols-outlined">sync</span></span><p class="text-indigo-400 text-xs mt-2">Loading tree...</p></div>';
    badge.textContent = repoPath.split('/')[1];
    
    if (!isForcedDesktop && window.innerWidth < 1024) openSidebar();

    try {
        const repoData = await githubFetch(`https://api.github.com/repos/${repoPath}`);
        const treeData = await githubFetch(`https://api.github.com/repos/${repoPath}/git/trees/${repoData.default_branch}?recursive=1`);
        
        const root = {};
        treeData.tree.forEach(item => {
            const parts = item.path.split('/');
            let current = root;
            parts.forEach((part, index) => {
                if (!current[part]) {
                    current[part] = index === parts.length - 1 ? { _type: item.type, _url: item.url, _path: item.path, _sha: item.sha } : {};
                }
                current = current[part];
            });
        });

        treeContainer.innerHTML = '';
        buildHtmlTree(root, treeContainer);
    } catch (error) {
        treeContainer.innerHTML = `<div class="bg-red-950 border border-red-900 p-3 text-red-400 text-xs">${error.message}</div>`;
        badge.textContent = "error";
    }
}

function buildHtmlTree(node, container, currentPath = "") {
    const keys = Object.keys(node).sort((a, b) => {
        const aIsDir = node[a]._type !== 'blob';
        const bIsDir = node[b]._type !== 'blob';
        return (aIsDir && !bIsDir) ? -1 : (!aIsDir && bIsDir) ? 1 : a.localeCompare(b);
    });

    keys.forEach(key => {
        if (key === '_type' || key === '_url' || key === '_path' || key === '_sha') return;
        const item = node[key];
        const itemEl = document.createElement('div');
        const fullPath = currentPath ? `${currentPath}/${key}` : key;

        if (item._type === 'blob') {
            itemEl.className = 'flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white cursor-pointer transition text-xs truncate';
            itemEl.innerHTML = `<span class="material-symbols-outlined text-indigo-400 !text-[16px]">description</span> <span class="truncate">${key}</span>`;
            itemEl.addEventListener('click', () => {
                currentFilePath = item._path;
                if (item._url) {
                    fetchFileContent(item._path, item._url, item._sha);
                } else {
                    currentFileSha = ""; 
                    const statusEl = document.getElementById('fileStatus');
                    statusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-yellow-500"></span> <span class="text-yellow-400 font-bold truncate">${key} (New File)</span>`;
                    editor.setValue(item._localContent || `// Created file: ${key}\n`);
                    saveFileBtn.classList.remove('hidden');
                }
                if (!isForcedDesktop && window.innerWidth < 1024) closeSidebar();
            });
        } else {
            itemEl.className = 'text-xs';
            const folderHeader = document.createElement('div');
            folderHeader.className = 'flex items-center justify-between px-3 py-1.5 hover:bg-gray-850 rounded text-gray-300 font-semibold cursor-pointer transition group';
            
            const folderTitle = document.createElement('div');
            folderTitle.className = 'flex items-center gap-2 truncate';
            folderTitle.innerHTML = `<span class="material-symbols-outlined text-yellow-500 !text-[16px] folder-icon">folder</span> <span class="truncate">${key}</span>`;
            
            const addFileBtn = document.createElement('button');
            addFileBtn.className = 'text-gray-500 hover:text-indigo-400 lg:opacity-0 group-hover:opacity-100 transition p-1 flex items-center justify-center rounded hover:bg-gray-800 cursor-pointer';
            addFileBtn.innerHTML = `<span class="material-symbols-outlined !text-sm" title="New file in this folder">note_add</span>`;
            
            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content hidden';
            
            folderTitle.addEventListener('click', () => {
                const isHidden = folderContent.classList.toggle('hidden');
                folderHeader.querySelector('.folder-icon').textContent = isHidden ? 'folder' : 'folder_open';
            });

            addFileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileName = prompt(`Enter name for the new file inside "${key}":`);
                if (!fileName) return;

                if (!item[fileName]) {
                    item[fileName] = { _type: 'blob', _path: `${fullPath}/${fileName}`, _localContent: `// New file inside ${key}/\n`, _sha: "" };
                    folderContent.innerHTML = '';
                    folderContent.classList.remove('hidden');
                    folderHeader.querySelector('.folder-icon').textContent = 'folder_open';
                    buildHtmlTree(item, folderContent, fullPath);
                } else {
                    alert('A file or folder with this name already exists.');
                }
            });

            folderHeader.appendChild(folderTitle);
            folderHeader.appendChild(addFileBtn);
            itemEl.appendChild(folderHeader);
            itemEl.appendChild(folderContent);
            buildHtmlTree(item, folderContent, fullPath);
        }
        container.appendChild(itemEl);
    });
}

async function fetchFileContent(filePath, blobUrl, sha) {
    currentFileSha = sha;
    const statusEl = document.getElementById('fileStatus');
    statusEl.innerHTML = `<span class="inline-block animate-spin mr-1"><span class="material-symbols-outlined !text-xs">sync</span></span> Loading: ${filePath}...`;
    saveFileBtn.classList.add('hidden');

    try {
        const data = await githubFetch(blobUrl);
        const decodedContent = decodeURIComponent(atob(data.content.replace(/\n/g, '')).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        
        const ext = filePath.split('.').pop().toLowerCase();
        const langMap = { 'js':'javascript', 'ts':'typescript', 'html':'html', 'css':'css', 'json':'json', 'md':'markdown', 'py':'python', 'sh':'shell', 'rs':'rust', 'go':'go', 'cpp':'cpp', 'c':'c', 'yml':'yaml', 'yaml':'yaml' };
        
        statusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> <span class="text-indigo-400 font-bold truncate">${filePath.split('/').pop()}</span> <span class="text-gray-500 text-[10px] truncate">(${filePath})</span>`;
        editor.setValue(decodedContent);
        monaco.editor.setModelLanguage(editor.getModel(), langMap[ext] || 'plaintext');
        
        saveFileBtn.classList.remove('hidden');
    } catch (error) {
        statusEl.innerHTML = `❌ Error loading file`;
        alert(`Error: ${error.message}`);
    }
}

function safeUtoa(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
}

// Save Action Listener
saveFileBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
        alert("Authentication Required:\nPlease provide a GitHub Token with 'repo' scope at the top to save changes directly to GitHub.");
        return;
    }

    const commitMessage = prompt("Enter commit message:", `Update ${currentFilePath.split('/').pop()}`);
    if (commitMessage === null) return; 

    const originalBtnText = saveFileBtn.innerHTML;
    saveFileBtn.innerHTML = `<span class="material-symbols-outlined animate-spin !text-xs">sync</span> Saving...`;
    saveFileBtn.disabled = true;

    try {
        const url = `https://api.github.com/repos/${currentRepo}/contents/${currentFilePath}`;
        const payload = {
            message: commitMessage || "Updated file via Web Editor",
            content: safeUtoa(editor.getValue())
        };
        
        if (currentFileSha) {
            payload.sha = currentFileSha;
        }

        const responseData = await githubFetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        currentFileSha = responseData.content.sha;
        alert("Success! Changes committed to GitHub.");
    } catch (error) {
        alert(`Commit Failed:\n${error.message}`);
    } finally {
        saveFileBtn.innerHTML = originalBtnText;
        saveFileBtn.disabled = false;
    }
});

// Run bookmarks generation initially
renderSavedRepos();
