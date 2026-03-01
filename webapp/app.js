// ========================================
// Base64 Vault - App Logic
// ========================================

const SUPABASE_URL = 'https://fkzsmtlryhvccivhdapu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrenNtdGxyeWh2Y2NpdmhkYXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzM5MzAsImV4cCI6MjA4MjQwOTkzMH0.0_liolRCK4YVuBGxtaYZXiB59Rx-bZCTsea2T_Mp5lM';
const MAX_ENTRIES = 10;
const LARGE_PASTE_THRESHOLD = 2 * 1024 * 1024; // 2MB — intercept paste above this
const CHUNK_SIZE = 5 * 1024 * 1024;             // 5MB per Supabase POST
const PARALLEL_UPLOADS = 3;

const API_HEADERS = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

// ---- State ----
let storedContent = null;
let contentMode = 'textarea'; // 'textarea' | 'memory'

// ---- File Type Detection ----
const FILE_SIGNATURES = {
    'JVBERi': { type: 'pdf', icon: '📄', label: 'PDF' },
    'UEsDBB': { type: 'zip', icon: '📦', label: 'ZIP/DOCX/XLSX' },
    'UEsDBA': { type: 'zip', icon: '📦', label: 'ZIP/DOCX/XLSX' },
    'iVBORw': { type: 'png', icon: '🖼️', label: 'PNG' },
    '/9j/': { type: 'jpg', icon: '🖼️', label: 'JPEG' },
    'R0lGOD': { type: 'gif', icon: '🖼️', label: 'GIF' },
    'Qk0': { type: 'bmp', icon: '🖼️', label: 'BMP' },
    'AAAA': { type: 'mp4', icon: '🎬', label: 'MP4' },
    'SUkq': { type: 'tiff', icon: '🖼️', label: 'TIFF' },
    'TVZQ': { type: 'elf', icon: '⚙️', label: 'ELF Binary' },
    'PK': { type: 'zip', icon: '📦', label: 'ZIP' },
    'd29yZA': { type: 'docx', icon: '📝', label: 'Word' },
    'PCFET0': { type: 'html', icon: '🌐', label: 'HTML' },
    'PHN2Zw': { type: 'svg', icon: '🎨', label: 'SVG' },
    'eyJ': { type: 'json', icon: '📋', label: 'JSON' },
};

function detectFileType(base64Content) {
    const sample = typeof base64Content === 'string'
        ? base64Content.substring(0, 10000) : base64Content;
    const clean = cleanBase64(sample);
    if (!clean) return { type: 'unknown', icon: '📎', label: 'Unknown' };

    if (clean.startsWith('UEs')) {
        if (clean.includes('d29yZC') || clean.includes('dvcmQv') || clean.includes('3b3JkLw'))
            return { type: 'docx', icon: '📝', label: 'Word' };
        if (clean.includes('eGwv') || clean.includes('hsLw'))
            return { type: 'xlsx', icon: '📊', label: 'Excel' };
        if (clean.includes('cHB0Lw'))
            return { type: 'pptx', icon: '📽️', label: 'PowerPoint' };
        return { type: 'zip', icon: '📦', label: 'ZIP Archive' };
    }

    for (const [sig, info] of Object.entries(FILE_SIGNATURES)) {
        if (clean.startsWith(sig)) return info;
    }
    return { type: 'unknown', icon: '📎', label: 'Unknown' };
}

function cleanBase64(content) {
    return content
        .replace(/^data:[^;]+;base64,/, '')
        .replace(/-----BEGIN[^-]*-----/g, '')
        .replace(/-----END[^-]*-----/g, '')
        .replace(/[\s\r\n]/g, '')
        .trim();
}

// ---- Utilities ----
function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `~${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ---- UI Elements ----
const base64Input = document.getElementById('base64Input');
const filenameInput = document.getElementById('filenameInput');
const extSelect = document.getElementById('extSelect');
const charCount = document.getElementById('charCount');
const sizeEstimate = document.getElementById('sizeEstimate');
const submitBtn = document.getElementById('submitBtn');
const statusPill = document.getElementById('statusPill');
const largeBanner = document.getElementById('largeBanner');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

// ---- Paste Interception ----
base64Input.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text.length > LARGE_PASTE_THRESHOLD) {
        e.preventDefault();
        storedContent = text;
        contentMode = 'memory';

        const preview = text.substring(0, 300);
        base64Input.value = preview
            + '\n\n── Content too large for display ──\n'
            + 'Full content stored in memory. Click "Store to Cloud" to upload.';
        base64Input.classList.add('large-mode');

        updateContentStats(text);
        showLargeBanner(text.length);
    }
});

// ---- Debounced Input Handler ----
const handleInput = debounce(() => {
    if (contentMode !== 'textarea') return;
    const content = base64Input.value;
    const len = content.length;
    charCount.textContent = `${len.toLocaleString()} chars`;
    sizeEstimate.textContent = formatSize(Math.ceil(len * 3 / 4));

    if (len > 10) {
        const detected = detectFileType(content);
        if (detected.type !== 'unknown') extSelect.value = detected.type;
    }
}, 300);

base64Input.addEventListener('input', handleInput);

// ---- Banner & Progress ----
function updateContentStats(content) {
    const len = content.length;
    charCount.textContent = `${len.toLocaleString()} chars`;
    sizeEstimate.textContent = formatSize(Math.ceil(len * 3 / 4));
    if (len > 10) {
        const detected = detectFileType(content);
        if (detected.type !== 'unknown') extSelect.value = detected.type;
    }
}

function showLargeBanner(size) {
    largeBanner.style.display = 'flex';
    const chunks = Math.ceil(size / CHUNK_SIZE);
    largeBanner.querySelector('.banner-text').textContent =
        `Large content in memory — ${formatSize(Math.ceil(size * 3 / 4))} — will upload in ${chunks} chunks`;
}

function showProgress(pct) {
    progressBar.style.display = 'block';
    progressFill.style.width = `${pct}%`;
}

function hideProgress() {
    progressBar.style.display = 'none';
    progressFill.style.width = '0%';
}

// ---- Clear ----
function clearInput() {
    base64Input.value = '';
    base64Input.classList.remove('large-mode');
    filenameInput.value = '';
    charCount.textContent = '0 characters';
    sizeEstimate.textContent = '~0 KB';
    storedContent = null;
    contentMode = 'textarea';
    largeBanner.style.display = 'none';
    hideProgress();
}

// ---- Toast ----
function showToast(message, type = 'info', icon = '💡') {
    const toast = document.getElementById('toast');
    toast.querySelector('.toast-icon').textContent = icon;
    toast.querySelector('.toast-message').textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

// ---- Status ----
function setStatus(state, text) {
    statusPill.className = `status-pill ${state}`;
    statusPill.querySelector('.status-text').textContent = text;
}

// ---- Submit ----
const SUBMIT_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

async function submitBase64() {
    let userFilename = filenameInput.value.trim();
    const finalExt = extSelect.value;

    if (!userFilename) userFilename = `file_${Math.floor(Date.now() / 1000)}`;
    const baseName = userFilename.replace(/\.[^/.]+$/, '');
    const filename = `${baseName}.${finalExt}`;

    submitBtn.disabled = true;

    try {
        if (contentMode === 'memory' && storedContent) {
            // Large content stored in memory — chunked upload (raw, listener cleans)
            await uploadChunked(filename, finalExt, storedContent);
        } else {
            const content = base64Input.value.trim();
            if (!content) {
                showToast('Please paste some Base64 content!', 'error', '⚠️');
                return;
            }
            const cleanContent = cleanBase64(content);
            await uploadToSupabase(filename, finalExt, cleanContent);
        }

        showToast(`"${filename}" stored successfully!`, 'success', '🎉');
        clearInput();
        await cleanupOldEntries();
        await refreshEntries();

    } catch (err) {
        console.error('Submit error:', err);
        showToast(`Error: ${err.message}`, 'error', '❌');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${SUBMIT_ICON} Store to Cloud`;
        hideProgress();
    }
}

async function uploadChunked(filename, ext, content) {
    const totalChunks = Math.ceil(content.length / CHUNK_SIZE);
    const groupId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    let uploaded = 0;

    submitBtn.innerHTML = `<span class="spinner"></span> 0/${totalChunks}`;

    for (let i = 0; i < totalChunks; i += PARALLEL_UPLOADS) {
        const batch = [];
        const batchEnd = Math.min(i + PARALLEL_UPLOADS, totalChunks);

        for (let j = i; j < batchEnd; j++) {
            const chunk = content.slice(j * CHUNK_SIZE, (j + 1) * CHUNK_SIZE);
            batch.push(
                fetch(`${SUPABASE_URL}/rest/v1/base64_entries`, {
                    method: 'POST',
                    headers: API_HEADERS,
                    body: JSON.stringify({
                        filename,
                        content: chunk,
                        file_type: `chunk:${groupId}:${j}:${totalChunks}:${ext}`,
                        processed: false
                    })
                }).then(async res => {
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.message || `Chunk ${j + 1}/${totalChunks} failed`);
                    }
                    uploaded++;
                    const pct = Math.round(uploaded / totalChunks * 100);
                    submitBtn.innerHTML = `<span class="spinner"></span> ${uploaded}/${totalChunks}`;
                    showProgress(pct);
                })
            );
        }
        await Promise.all(batch);
    }
}

async function uploadToSupabase(filename, ext, cleanContent) {
    submitBtn.innerHTML = '<span class="spinner"></span> Storing...';

    const res = await fetch(`${SUPABASE_URL}/rest/v1/base64_entries`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({
            filename: filename,
            content: cleanContent,
            file_type: ext,
            processed: false
        })
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to store');
    }
}

// ---- Cleanup (skip chunk entries) ----
async function cleanupOldEntries() {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/base64_entries?select=id&file_type=not.like.chunk:*&order=created_at.desc`,
            { headers: API_HEADERS }
        );
        const entries = await res.json();

        if (entries.length > MAX_ENTRIES) {
            const idsToDelete = entries.slice(MAX_ENTRIES).map(e => e.id);
            for (const id of idsToDelete) {
                await fetch(`${SUPABASE_URL}/rest/v1/base64_entries?id=eq.${id}`, {
                    method: 'DELETE',
                    headers: API_HEADERS
                });
            }
        }
    } catch (err) {
        console.error('Cleanup error:', err);
    }
}

// ---- Entries list (hide chunk rows) ----
async function refreshEntries() {
    const entriesList = document.getElementById('entriesList');
    const entryCount = document.getElementById('entryCount');

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/base64_entries?select=id,filename,file_type,created_at,processed&file_type=not.like.chunk:*&order=created_at.desc&limit=${MAX_ENTRIES}`,
            { headers: API_HEADERS }
        );

        if (!res.ok) throw new Error('Failed to fetch entries');

        const entries = await res.json();
        entryCount.textContent = `(${entries.length}/${MAX_ENTRIES})`;
        setStatus('connected', 'Connected');

        if (entries.length === 0) {
            entriesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>No entries yet. Paste some Base64 content above!</p>
                </div>`;
            return;
        }

        entriesList.innerHTML = entries.map((entry, i) => {
            const icon = getIconForType(entry.file_type);
            const timeAgo = getTimeAgo(entry.created_at);
            const statusClass = entry.processed ? 'processed' : 'pending';
            const statusText = entry.processed ? '✓ Converted' : '⏳ Pending';

            return `
                <div class="entry-card" style="animation-delay: ${i * 0.06}s">
                    <div class="entry-icon">${icon}</div>
                    <div class="entry-info">
                        <div class="entry-filename">${escapeHtml(entry.filename)}</div>
                        <div class="entry-meta">
                            <span class="type-tag">${entry.file_type.toUpperCase()}</span>
                            <span>${timeAgo}</span>
                        </div>
                    </div>
                    <div class="entry-status ${statusClass}">${statusText}</div>
                    <div class="entry-actions">
                        <button class="btn btn-danger" onclick="deleteEntry(${entry.id})">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        </button>
                    </div>
                </div>`;
        }).join('');

    } catch (err) {
        console.error('Fetch error:', err);
        setStatus('error', 'Error');
        showToast(`Connection error: ${err.message}`, 'error', '❌');
    }
}

function getIconForType(type) {
    const icons = {
        pdf: '📄', zip: '📦', docx: '📝', xlsx: '📊', pptx: '📽️',
        png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', bmp: '🖼️', svg: '🎨',
        mp4: '🎬', mp3: '🎵', wav: '🎵',
        html: '🌐', json: '📋', txt: '📃', unknown: '📎'
    };
    return icons[type] || '📎';
}

function getTimeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function deleteEntry(id) {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/base64_entries?id=eq.${id}`, {
            method: 'DELETE', headers: API_HEADERS
        });
        showToast('Entry deleted', 'info', '🗑️');
        await refreshEntries();
    } catch (err) {
        showToast(`Delete error: ${err.message}`, 'error', '❌');
    }
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    refreshEntries();
    setInterval(refreshEntries, 10000);
});
