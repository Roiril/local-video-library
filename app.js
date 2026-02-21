/**
 * Local Video Library — app.js
 * Uses idb (IndexedDB wrapper) loaded from esm.sh CDN
 */

import { openDB } from 'https://esm.sh/idb@8';

// ─── DB Setup ────────────────────────────────────────────────────────────────

const DB_NAME = 'video-library';
const STORE = 'videos';

const db = await openDB(DB_NAME, 1, {
    upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
            database.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
    },
});

// ─── DOM References ──────────────────────────────────────────────────────────

const addBtn = document.getElementById('add-btn');
const fileInput = document.getElementById('file-input');
const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('empty-state');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const playerOverlay = document.getElementById('player-overlay');
const playerVideo = document.getElementById('player-video');
const playerClose = document.getElementById('player-close');
const playerBackdrop = playerOverlay.querySelector('.player-backdrop');
const toast = document.getElementById('toast');

// ─── Toast Utility ───────────────────────────────────────────────────────────

let toastTimer;
function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('toast--error', isError);
    toast.classList.add('toast--show');
    toastTimer = setTimeout(() => toast.classList.remove('toast--show'), 3000);
}

// ─── Loading State ───────────────────────────────────────────────────────────

function setLoading(visible, text = 'サムネイルを生成中…') {
    loadingOverlay.hidden = !visible;
    loadingText.textContent = text;
}

// ─── Thumbnail Generation (Last Frame) ───────────────────────────────────────

/**
 * Extract the last frame of a video file as a JPEG Base64 data URL.
 * Seeks to (duration - 0.1s) to avoid black frames on some devices.
 *
 * @param {File} file
 * @returns {Promise<string>} dataURL
 */
function generateThumbnail(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');

        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.src = url;

        const cleanup = () => URL.revokeObjectURL(url);

        video.addEventListener('error', () => {
            cleanup();
            reject(new Error('動画の読み込みに失敗しました'));
        });

        video.addEventListener('loadedmetadata', () => {
            // Clamp to duration, seek just before the very end
            const seekTo = Math.max(0, video.duration - 0.1);
            video.currentTime = seekTo;
        });

        video.addEventListener('seeked', () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 360;
                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataURL = canvas.toDataURL('image/jpeg', 0.82);
                cleanup();
                resolve(dataURL);
            } catch (err) {
                cleanup();
                reject(err);
            }
        });
    });
}

// ─── IndexedDB Helpers ───────────────────────────────────────────────────────

async function saveVideo(file, thumbnail) {
    const record = {
        name: file.name,
        size: file.size,
        type: file.type,
        createdAt: Date.now(),
        thumbnail,          // Base64 JPEG string
        blob: file,    // Original File/Blob (persisted in IDB)
    };
    return db.add(STORE, record);
}

async function loadAllVideos() {
    return db.getAll(STORE);
}

async function deleteVideo(id) {
    return db.delete(STORE, id);
}

// ─── Gallery Rendering ───────────────────────────────────────────────────────

function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createGalleryItem(record) {
    const li = document.createElement('li');
    li.className = 'gallery-item';
    li.dataset.id = record.id;
    li.setAttribute('role', 'listitem');

    const img = document.createElement('img');
    img.src = record.thumbnail;
    img.alt = record.name;
    img.loading = 'lazy';
    img.decoding = 'async';

    const info = document.createElement('div');
    info.className = 'gallery-item-info';
    info.textContent = `${record.name}  ${formatFileSize(record.size)}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'gallery-item-delete';
    delBtn.setAttribute('aria-label', `${record.name} を削除`);
    delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

    li.append(img, info, delBtn);

    // Play on thumbnail click (not delete button)
    li.addEventListener('click', (e) => {
        if (e.target === delBtn || delBtn.contains(e.target)) return;
        openPlayer(record);
    });

    // Delete button
    delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteVideo(record.id);
        li.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        li.style.opacity = '0';
        li.style.transform = 'scale(0.9)';
        setTimeout(() => {
            li.remove();
            updateEmptyState();
        }, 250);
        showToast('削除しました');
    });

    return li;
}

function renderGallery(records) {
    gallery.innerHTML = '';
    // Show newest first
    [...records].reverse().forEach((rec) => {
        gallery.appendChild(createGalleryItem(rec));
    });
    updateEmptyState();
}

function updateEmptyState() {
    const hasItems = gallery.children.length > 0;
    emptyState.hidden = hasItems;
}

// ─── Video Player ────────────────────────────────────────────────────────────

let currentObjectURL = null;

function openPlayer(record) {
    // Revoke any previous object URL
    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
    }

    const blobURL = URL.createObjectURL(record.blob);
    currentObjectURL = blobURL;

    playerVideo.src = blobURL;
    playerOverlay.hidden = false;
    document.body.style.overflow = 'hidden';

    // Autoplay attempt
    playerVideo.play().catch(() => {
        // Browser may block autoplay without user gesture; video controls still available
    });
}

function closePlayer() {
    playerVideo.pause();
    playerVideo.src = '';
    playerOverlay.hidden = true;
    document.body.style.overflow = '';

    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
    }
}

playerClose.addEventListener('click', closePlayer);
playerBackdrop.addEventListener('click', closePlayer);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !playerOverlay.hidden) closePlayer();
});

// ─── File Addition Flow ───────────────────────────────────────────────────────

addBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = ''; // reset so same file can be re-added
    if (!files.length) return;

    setLoading(true);

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        loadingText.textContent = files.length > 1
            ? `サムネイルを生成中… (${i + 1} / ${files.length})`
            : 'サムネイルを生成中…';

        try {
            const thumbnail = await generateThumbnail(file);
            const id = await saveVideo(file, thumbnail);

            // Build record and prepend to gallery immediately
            const record = {
                id,
                name: file.name,
                size: file.size,
                type: file.type,
                createdAt: Date.now(),
                thumbnail,
                blob: file,
            };

            gallery.prepend(createGalleryItem(record));
            updateEmptyState();
        } catch (err) {
            console.error('Failed to process:', file.name, err);
            showToast(`「${file.name}」の処理に失敗しました`, true);
        }
    }

    setLoading(false);
    if (files.length > 1) showToast(`${files.length}件の動画を追加しました`);
});

// ─── Initial Load ─────────────────────────────────────────────────────────────

async function init() {
    try {
        const records = await loadAllVideos();
        renderGallery(records);
    } catch (err) {
        console.error('DB load error:', err);
        showToast('データの読み込みに失敗しました', true);
        updateEmptyState();
    }
}

init();

// ─── Service Worker Registration ─────────────────────────────────────────────

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
    });
}
