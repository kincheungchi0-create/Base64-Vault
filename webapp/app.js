// ========================================
// Base64 Vault - App Logic
// ========================================

const SUPABASE_URL = 'https://fkzsmtlryhvccivhdapu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrenNtdGxyeWh2Y2NpdmhkYXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzM5MzAsImV4cCI6MjA4MjQwOTkzMH0.0_liolRCK4YVuBGxtaYZXiB59Rx-bZCTsea2T_Mp5lM';
const MAX_ENTRIES = 10;

const API_HEADERS = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

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
    const clean = cleanBase64(base64Content);
    if (!clean) return { type: 'unknown', icon: '📎', label: 'Unknown' };

    // ZIP-based formats (ZIP, DOCX, XLSX, PPTX)
    // PK\x03\x04, PK\x05\x06, PK\x07\x08 all start with 'UEs' in Base64
    if (clean.startsWith('UEs')) {
        // We look for internal folder names which are characteristic of Office files.
        // These can appear at different alignments, so we check the most common variants.

        // Word: check for 'word/' folder
        if (clean.includes('d29yZC') || clean.includes('dvcmQv') || clean.includes('3b3JkLw')) {
            return { type: 'docx', icon: '📝', label: 'Word' };
        }
        // Excel: check for 'xl/' folder
        if (clean.includes('eGwv') || clean.includes('eGwv') || clean.includes('hsLw')) {
            return { type: 'xlsx', icon: '📊', label: 'Excel' };
        }
        // PowerPoint: check for 'ppt/' folder
        if (clean.includes('cHB0Lw') || clean.includes('cHB0Lw') || clean.includes('cHB0Lw')) {
            return { type: 'pptx', icon: '📽️', label: 'PowerPoint' };
        }

        return { type: 'zip', icon: '📦', label: 'ZIP Archive' };
    }

    // Other formats
    for (const [sig, info] of Object.entries(FILE_SIGNATURES)) {
        if (clean.startsWith(sig)) return info;
    }

    return { type: 'unknown', icon: '📎', label: 'Unknown' };
}

function getFileExtension(filename, detectedType) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext && ext !== filename.toLowerCase()) return ext;
    return detectedType || 'bin';
}

// ---- Clean Base64 ----
function cleanBase64(content) {
    return content
        .replace(/^data:[^;]+;base64,/, '') // Remove Data URI prefix
        .replace(/-----BEGIN[^-]*-----/g, '')
        .replace(/-----END[^-]*-----/g, '')
        .replace(/[\s\r\n]/g, '')
        .trim();
}

// ---- UI Updates ----
const base64Input = document.getElementById('base64Input');
const filenameInput = document.getElementById('filenameInput');
const extSelectorGroup = document.getElementById('extSelectorGroup');
const extSelect = document.getElementById('extSelect');
const charCount = document.getElementById('charCount');
const sizeEstimate = document.getElementById('sizeEstimate');
const fileTypeBadge = document.getElementById('fileTypeBadge');
const fileTypeText = document.getElementById('fileTypeText');
const submitBtn = document.getElementById('submitBtn');
const statusPill = document.getElementById('statusPill');

base64Input.addEventListener('input', () => {
    const content = base64Input.value;
    const len = content.length;
    charCount.textContent = `${len.toLocaleString()} characters`;

    const cleanLen = cleanBase64(content).length;
    const bytes = Math.ceil(cleanLen * 3 / 4);
    if (bytes < 1024) {
        sizeEstimate.textContent = `~${bytes} B`;
    } else if (bytes < 1024 * 1024) {
        sizeEstimate.textContent = `~${(bytes / 1024).toFixed(1)} KB`;
    } else {
        sizeEstimate.textContent = `~${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }

    if (len > 10) {
        const detected = detectFileType(content);
        // Automatically sync the dropdown to what we detected
        if (detected.type !== 'unknown') {
            extSelect.value = detected.type;
        }
    }
});

function clearInput() {
    base64Input.value = '';
    filenameInput.value = '';
    charCount.textContent = '0 characters';
    sizeEstimate.textContent = '~0 KB';
}

// ---- Toast ----
function showToast(message, type = 'info', icon = '💡') {
    const toast = document.getElementById('toast');
    toast.querySelector('.toast-icon').textContent = icon;
    toast.querySelector('.toast-message').textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

// ---- Supabase API ----
function setStatus(state, text) {
    statusPill.className = `status-pill ${state}`;
    statusPill.querySelector('.status-text').textContent = text;
}

async function submitBase64() {
    const content = base64Input.value.trim();
    let userFilename = filenameInput.value.trim();

    if (!content) {
        showToast('Please paste some Base64 content!', 'error', '⚠️');
        return;
    }

    const detected = detectFileType(content);

    // Always use the value from the dropdown (which was auto-set but the user can change)
    const finalExt = extSelect.value;

    // Auto-generate name if user left it blank
    if (!userFilename) {
        userFilename = `file_${Math.floor(Date.now() / 1000)}`;
    }

    // Combine user-provided name with extension
    const baseName = userFilename.replace(/\.[^/.]+$/, "");
    const filename = `${baseName}.${finalExt}`;

    const cleanContent = cleanBase64(content);

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Storing...';

    try {
        // Insert new entry
        const res = await fetch(`${SUPABASE_URL}/rest/v1/base64_entries`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify({
                filename: filename,
                content: cleanContent,
                file_type: finalExt,
                processed: false
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Failed to store');
        }

        showToast(`✅ "${filename}" stored successfully!`, 'success', '🎉');
        clearInput();

        // Cleanup: keep only last MAX_ENTRIES
        await cleanupOldEntries();

        // Refresh list
        await refreshEntries();

    } catch (err) {
        console.error('Submit error:', err);
        showToast(`Error: ${err.message}`, 'error', '❌');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Store to Cloud
    `;
    }
}

async function cleanupOldEntries() {
    try {
        // Get all entries sorted by created_at desc
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/base64_entries?select=id&order=created_at.desc`,
            { headers: API_HEADERS }
        );
        const entries = await res.json();

        if (entries.length > MAX_ENTRIES) {
            const idsToDelete = entries.slice(MAX_ENTRIES).map(e => e.id);
            // Delete old entries
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

async function refreshEntries() {
    const entriesList = document.getElementById('entriesList');
    const entryCount = document.getElementById('entryCount');

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/base64_entries?select=id,filename,file_type,created_at,processed&order=created_at.desc&limit=${MAX_ENTRIES}`,
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
        </div>
      `;
            return;
        }

        entriesList.innerHTML = entries.map((entry, i) => {
            const detected = FILE_SIGNATURES[Object.keys(FILE_SIGNATURES).find(sig => entry.file_type === FILE_SIGNATURES[sig].type)] || { icon: '📎', label: entry.file_type };
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
        </div>
      `;
        }).join('');

        setStatus('connected', 'Connected');

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
        html: '🌐', json: '📋', txt: '📃',
        unknown: '📎'
    };
    return icons[type] || '📎';
}

function getTimeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
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
            method: 'DELETE',
            headers: API_HEADERS
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
    // Auto-refresh every 10 seconds
    setInterval(refreshEntries, 10000);
});
