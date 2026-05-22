let editor;
let currentRepo = "";
let currentFilePath = "";
let currentFileSha = ""; 
let isForcedDesktop = false;

// Bookmarks laden und konvertieren
let rawSaved = JSON.parse(localStorage.getItem('gitEditor_savedRepos') || '[]');
let savedRepos = rawSaved.map(item => typeof item === 'string' ? { path: item, token: '' } : item);

// Elemente deklarieren
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

// --- Responsive Modus-Erkennung ---
function initDeviceResponsiveness() {
    const isMobileUserAgent = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth < 1024;

    if (isMobileUserAgent || isSmallScreen) {
        applyViewMode(false); // Starte im Mobile-Modus
    } else {
        applyViewMode(true);  // Starte im Desktop-Modus
    }
}

function applyViewMode(forceDesktop) {
    isForcedDesktop = forceDesktop;
    if (forceDesktop) {
        document.body.classList.remove('adaptive-view');
        document.body.classList.add('desktop-view');
        viewModeIcon.textContent = 'desktop_windows';
        viewModeText.textContent = 'Desktop Mode';
        closeSidebar(); // Overlay schließen, falls offen
    } else {
        document.body.classList.remove('desktop-view');
        document.body.classList.add('adaptive-view');
        viewModeIcon.textContent = 'smartphone';
        viewModeText.textContent = 'Mobile Mode';
    }
    // Monaco Editor an die neue Breite anpassen
    if (editor) setTimeout(() => editor.layout(), 150);
}

// Event-Listener für den Modus-Umschalter oben rechts
viewModeToggle.addEventListener('click', () => {
    applyViewMode(!isForcedDesktop);
});

// Sidebar Funktionen (nur für Mobile/Adaptive View relevant)
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

window.addEventListener('resize', () => {
    if (!isForcedDesktop && window.innerWidth >= 1024) {
        closeSidebar();
    }
});

// --- Repository Lesezeichen / Bookmark-Liste (inkl. UNLIKE / DELETE) ---
function renderSavedRepos() {
    savedReposList.innerHTML = '';
    if (savedRepos.length === 0) {
        savedReposList.innerHTML = '<p class="text-gray-650 text-xs italic px-2 py-1">Keine Favoriten gespeichert.</p>';
        return;
    }

    savedRepos.forEach(item => {
        const el = document.createElement('div');
        el.className = 'flex items-center justify-between px-2 py-1 hover:bg-gray-800 rounded group transition gap-2';
        
        const repoLink = document.createElement('span');
        repoLink.className = 'text-xs text-indigo-300 cursor-pointer truncate flex-1 hover:text-indigo-200 flex items-center gap-1.5';
        repoLink.innerHTML = `<span class="material-symbols-outlined text-yellow-500 !text-sm">bookmark</span> <span class="truncate">${item.path}</span>`;
        
        repoLink.onclick = () => {
            repoInput.value = item.path;
            tokenInput.value = item.token || ''; 
            fetchRepoStructure();
        };

        // DER UNLIKE / LÖSCHEN-BUTTON (Mülleimer-Icon - permanent sichtbar)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'text-gray-500 hover:text-red-400 opacity-100 p-1 flex items-center justify-center cursor-pointer rounded hover:bg-gray-700 transition shrink-0';
        deleteBtn.innerHTML = '<span class="material-symbols-outlined !text-[16px]">delete</span>';
        deleteBtn.title = "Repository entfernen (Unlike)";
        
        deleteBtn.onclick = (e) => {
            e.stopPropagation(); // Verhindert, dass das Repo beim Löschen geladen wird
            savedRepos = savedRepos.filter(r => r.path !== item.path);
            localStorage.setItem('gitEditor_savedRepos', JSON.stringify(savedRepos));
            renderSavedRepos(); // Liste neu zeichnen
        };

        el.appendChild(repoLink);
        el.appendChild(deleteBtn);
        savedReposList.appendChild(el);
    });
}

// Repo zu Favoriten hinzufügen (Stern-Button)
document.getElementById('saveRepoBtn').addEventListener('click', () => {
    const repo = repoInput.value.trim();
    const token = tokenInput.value.trim();
    
    if (!repo || !repo.includes('/')) return alert('Bitte ein gültiges Repo angeben (user/repo).');
    
    const existingIndex = savedRepos.findIndex(r => r.path === repo);
    if (existingIndex > -1) {
        savedRepos[existingIndex].token = token;
    } else {
        savedRepos.push({ path: repo, token: token });
    }
    
    localStorage.setItem('gitEditor_savedRepos', JSON.stringify(savedRepos));
    renderSavedRepos();
});

// Monaco Editor laden
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
    editor = monaco.editor.create(document.getElementById('editorContainer'), {
        value: "// GitEditor initialisiert.\n// Lade ein Repository, um Dateien zu bearbeiten.\n",
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
    // Erst nach Editor-Initialisierung das Layout berechnen
    initDeviceResponsiveness();
});

document.getElementById('loadBtn').addEventListener('click', fetchRepoStructure);
repoInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchRepoStructure(); });

// GitHub API Abrufe
async function githubFetch(url, options = {}) {
    const token = tokenInput.value.trim();
    options.headers = options.headers || {};
    if (token) options.headers['Authorization'] = `token ${token}`;
    
    const response = await fetch(url, options);
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Fehler: ${response.status}`);
    }
    return response.json();
}

async function fetchRepoStructure() {
    const repoPath = repoInput.value.trim();
    const treeContainer = document.getElementById('fileTree');
    const badge = document.getElementById('repoNameBadge');
    
    if (!repoPath || !repoPath.includes('/')) return alert('Format: "Nutzername/Repository"');
    
    currentRepo = repoPath;
    treeContainer.innerHTML = '<div class="text-center pt-8"><span class="inline-block animate-spin text-indigo-400"><span class="material-symbols-outlined">sync</span></span><p class="text-indigo-400 text-xs mt-2">Lade Dateibaum...</p></div>';
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
                    statusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-yellow-500"></span> <span class="text-yellow-400 font-bold truncate">${key} (Neue Datei)</span>`;
                    editor.setValue(item._localContent || `// Neue Datei: ${key}\n`);
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
            addFileBtn.className = 'text-gray-500 hover:text-indigo-400 opacity-100 lg:opacity-0 group-hover:opacity-100 transition p-1 flex items-center justify-center rounded hover:bg-gray-800 cursor-pointer';
            addFileBtn.innerHTML = `<span class="material-symbols-outlined !text-sm" title="Neue Datei in diesem Ordner">note_add</span>`;
            
            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content hidden';
            
            folderTitle.addEventListener('click', () => {
                const isHidden = folderContent.classList.toggle('hidden');
                folderHeader.querySelector('.folder-icon').textContent = isHidden ? 'folder' : 'folder_open';
            });

            addFileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileName = prompt(`Name der neuen Datei in "${key}":`);
                if (!fileName) return;

                if (!item[fileName]) {
                    item[fileName] = { _type: 'blob', _path: `${fullPath}/${fileName}`, _localContent: `// Datei in ${key}/\n`, _sha: "" };
                    folderContent.innerHTML = '';
                    folderContent.classList.remove('hidden');
                    folderHeader.querySelector('.folder-icon').textContent = 'folder_open';
                    buildHtmlTree(item, folderContent, fullPath);
                } else {
                    alert('Eine Datei mit diesem Namen existiert bereits.');
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
    statusEl.innerHTML = `<span class="inline-block animate-spin mr-1"><span class="material-symbols-outlined !text-xs">sync</span></span> Lade: ${filePath}...`;
    saveFileBtn.classList.add('hidden');

    try {
        const data = await githubFetch(blobUrl);
        const decodedContent = decodeURIComponent(atob(data.content.replace(/\n/g, '')).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        
        const ext = filePath.split('.').pop().toLowerCase();
        const langMap = { 'js':'javascript', 'ts':'typescript', 'html':'html', 'css':'css', 'json':'json', 'md':'markdown', 'py':'python', 'sh':'shell', 'rs':'rust', 'go':'go', 'cpp':'cpp', 'c':'c', 'yml':'yaml', 'yaml':'yaml' };
        
        statusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> <span class="text-indigo-400 font-bold truncate">${filePath.split('/').pop()}</span>`;
        editor.setValue(decodedContent);
        monaco.editor.setModelLanguage(editor.getModel(), langMap[ext] || 'plaintext');
        
        saveFileBtn.classList.remove('hidden');
    } catch (error) {
        statusEl.innerHTML = `❌ Fehler beim Laden`;
        alert(`Fehler: ${error.message}`);
    }
}

function safeUtoa(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
}

saveFileBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
        alert("Token benötigt, um Änderungen direkt auf GitHub zu sichern.");
        return;
    }

    const commitMessage = prompt("Commit-Nachricht eingeben:", `Update ${currentFilePath.split('/').pop()}`);
    if (commitMessage === null) return; 

    const originalBtnText = saveFileBtn.innerHTML;
    saveFileBtn.innerHTML = `<span class="material-symbols-outlined animate-spin !text-xs">sync</span> Speichere...`;
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
        alert("Erfolgreich committet!");
    } catch (error) {
        alert(`Commit fehlgeschlagen:\n${error.message}`);
    } finally {
        saveFileBtn.innerHTML = originalBtnText;
        saveFileBtn.disabled = false;
    }
});

// Initiale Liste rendern
renderSavedRepos();
