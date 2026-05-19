// ========================
// INSTAGRAM DOWNLOADER
// ========================

const API_ENDPOINT = '/api/download';
const HEALTH_CHECK = '/api/health';

// DOM Elements
const downloadForm = document.getElementById('downloadForm');
const urlInput = document.getElementById('urlInput');
const downloadBtn = document.getElementById('downloadBtn');
const previewSection = document.getElementById('previewSection');
const errorAlert = document.getElementById('errorAlert');
const successAlert = document.getElementById('successAlert');
const errorMessage = document.getElementById('errorMessage');
const errorDetails = document.getElementById('errorDetails');
const successMessage = document.getElementById('successMessage');

const thumbnail = document.getElementById('thumbnail');
const videoOverlay = document.getElementById('videoOverlay');
const mediaTitle = document.getElementById('mediaTitle');
const mediaDesc = document.getElementById('mediaDesc');
const mediaDuration = document.getElementById('mediaDuration');
const mediaUploader = document.getElementById('mediaUploader');
const mediaSize = document.getElementById('mediaSize');
const downloadVideoBtn = document.getElementById('downloadVideoBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const shareBtn = document.getElementById('shareBtn');
const formatsContainer = document.getElementById('formatsContainer');
const formatsList = document.getElementById('formatsList');

let currentMediaData = null;

// ========================
// UTILITY FUNCTIONS
// ========================

/**
 * Format bytes to readable file size
 */
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format duration to HH:MM:SS
 */
function formatDuration(seconds) {
    if (!seconds) return '--:--';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Show error alert
 */
function showError(message, details = '') {
    errorMessage.textContent = message;
    if (details) {
        errorDetails.textContent = details;
        errorDetails.style.display = 'block';
    } else {
        errorDetails.style.display = 'none';
    }
    errorAlert.classList.remove('hidden');
    previewSection.classList.add('hidden');
}

/**
 * Show success alert
 */
function showSuccess(message) {
    successMessage.textContent = message;
    successAlert.classList.remove('hidden');
    setTimeout(() => {
        successAlert.classList.add('hidden');
    }, 3000);
}

/**
 * Close alert
 */
function closeAlert(alertId) {
    document.getElementById(alertId).classList.add('hidden');
}

/**
 * Show loading state
 */
function setLoading(isLoading) {
    downloadBtn.disabled = isLoading;
    const btnText = downloadBtn.querySelector('.btn-text');
    const btnLoader = downloadBtn.querySelector('.btn-loader');

    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.classList.remove('hidden');
    } else {
        btnText.style.display = 'flex';
        btnLoader.classList.add('hidden');
    }
}

/**
 * Reset form to initial state
 */
function resetForm() {
    urlInput.value = '';
    previewSection.classList.add('hidden');
    errorAlert.classList.add('hidden');
    successAlert.classList.add('hidden');
    currentMediaData = null;
    urlInput.focus();
}

/**
 * Toggle FAQ items
 */
function toggleFaq(element) {
    const faqItem = element.closest('.faq-item');
    const answer = faqItem.querySelector('.faq-answer');
    const isHidden = answer.classList.contains('hidden');

    // Close other open items
    document.querySelectorAll('.faq-item').forEach(item => {
        if (item !== faqItem) {
            item.classList.remove('active');
            item.querySelector('.faq-answer').classList.add('hidden');
        }
    });

    // Toggle current item
    if (isHidden) {
        faqItem.classList.add('active');
        answer.classList.remove('hidden');
    } else {
        faqItem.classList.remove('active');
        answer.classList.add('hidden');
    }
}

/**
 * Validate Instagram URL
 */
function isValidInstagramUrl(url) {
    const instagramRegex = /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/(p|reel|stories)\/([a-zA-Z0-9_-]+)/i;
    return instagramRegex.test(url.trim());
}

/**
 * Display media preview
 */
function displayMediaPreview(data) {
    if (!data) return;

    currentMediaData = data;

    // Update media info
    mediaTitle.textContent = data.title || 'Instagram Media';
    mediaDesc.textContent = data.description || '';
    mediaDuration.textContent = formatDuration(data.duration);
    mediaUploader.textContent = data.uploader || 'Unknown';
    mediaSize.textContent = formatFileSize(data.format?.filesize || 0);

    // Update thumbnail
    if (data.thumbnail) {
        thumbnail.src = data.thumbnail;
        thumbnail.alt = data.title || 'Media thumbnail';
    }

    // Show video overlay if it's a video
    if (data.duration > 0) {
        videoOverlay.classList.remove('hidden');
    } else {
        videoOverlay.classList.add('hidden');
    }

    // Display alternative formats if available
    if (data.formats && data.formats.length > 1) {
        formatsList.innerHTML = '';

        data.formats.slice(0, 5).forEach((format, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'format-btn';
            btn.innerHTML = `
                <span class="format-quality">${format.quality || 'Best'}</span>
                <span class="format-size">${formatFileSize(format.filesize)}</span>
            `;

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                downloadMedia(format.url, format.quality);
            });

            formatsList.appendChild(btn);
        });

        formatsContainer.classList.remove('hidden');
    } else {
        formatsContainer.classList.add('hidden');
    }

    // Show preview section
    previewSection.classList.remove('hidden');
    errorAlert.classList.add('hidden');

    // Scroll to preview
    setTimeout(() => {
        previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

/**
 * Download media file
 */
function downloadMedia(url, quality = 'best') {
    if (!url) {
        showError('Download link not available');
        return;
    }

    try {
        // Create a temporary link and trigger download
        const link = document.createElement('a');
        link.href = url;
        link.download = `instagram_${Date.now()}.mp4`;
        link.target = '_blank';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccess('✓ Download started! Check your downloads folder.');
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to start download', 'Please try copying the link and downloading manually.');
    }
}

/**
 * Copy download link to clipboard
 */
function copyDownloadLink() {
    if (!currentMediaData?.downloadUrl) {
        showError('Download link not available');
        return;
    }

    navigator.clipboard.writeText(currentMediaData.downloadUrl)
        .then(() => {
            showSuccess('✓ Download link copied to clipboard!');
        })
        .catch(() => {
            showError('Failed to copy link');
        });
}

/**
 * Share media
 */
function shareMedia() {
    if (!currentMediaData?.downloadUrl) {
        showError('Nothing to share');
        return;
    }

    const shareText = `Check out this content: ${currentMediaData.downloadUrl}`;

    if (navigator.share) {
        navigator.share({
            title: 'Instagram Content',
            text: shareText,
            url: currentMediaData.downloadUrl
        }).catch(err => console.log('Share error:', err));
    } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(shareText)
            .then(() => showSuccess('✓ Share link copied to clipboard!'))
            .catch(() => showError('Share not supported on this device'));
    }
}

/**
 * Fetch media from Instagram URL
 */
async function fetchInstagramMedia(url) {
    setLoading(true);
    errorAlert.classList.add('hidden');

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url.trim() })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to process the URL');
        }

        if (!data.data) {
            throw new Error('Invalid response format');
        }

        displayMediaPreview(data.data);

    } catch (error) {
        console.error('Fetch error:', error);

        let errorMsg = error.message || 'Failed to download media';

        if (error.message.includes('Failed to fetch')) {
            errorMsg = 'Cannot connect to server. Please check your connection.';
        } else if (error.message.includes('private')) {
            errorMsg = 'This account is private. Only public content can be downloaded.';
        } else if (error.message.includes('deleted')) {
            errorMsg = 'This post has been deleted or is unavailable.';
        }

        showError(errorMsg);
    } finally {
        setLoading(false);
    }
}

// ========================
// EVENT LISTENERS
// ========================

/**
 * Form submission
 */
downloadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const url = urlInput.value.trim();

    // Validation
    if (!url) {
        showError('Please enter an Instagram URL');
        return;
    }

    if (!isValidInstagramUrl(url)) {
        showError('Invalid Instagram URL', 'Please enter a valid Instagram post, reel, or story link');
        return;
    }

    await fetchInstagramMedia(url);
});

/**
 * Download button
 */
downloadVideoBtn.addEventListener('click', () => {
    if (currentMediaData?.downloadUrl) {
        downloadMedia(currentMediaData.downloadUrl);
    } else {
        showError('Download link not available');
    }
});

/**
 * Copy link button
 */
copyLinkBtn.addEventListener('click', copyDownloadLink);

/**
 * Share button
 */
shareBtn.addEventListener('click', shareMedia);

/**
 * URL input validation (real-time)
 */
urlInput.addEventListener('input', () => {
    const url = urlInput.value.trim();
    if (url && !isValidInstagramUrl(url)) {
        urlInput.style.borderColor = '#e74c3c';
    } else {
        urlInput.style.borderColor = '';
    }
});

/**
 * Keyboard shortcut: Enter to download
 */
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        downloadForm.dispatchEvent(new Event('submit'));
    }
});

// ========================
// INITIALIZATION
// ========================

/**
 * Check if server is running
 */
async function checkServerHealth() {
    try {
        const response = await fetch(HEALTH_CHECK);
        const data = await response.json();
        console.log('✓ Server health check passed:', data);
    } catch (error) {
        console.warn('⚠️ Server health check failed:', error.message);
        showError(
            'Server Connection Error',
            'The server is not responding. Please make sure it is running on localhost:3000'
        );
    }
}

/**
 * Initialize the application
 */
function initializeApp() {
    console.log('🚀 ReelSnap Application Initialized');

    // Focus input field
    urlInput.focus();

    // Check server health on load (with delay to allow server startup)
    setTimeout(checkServerHealth, 1000);

    // Add event delegation for dynamically added elements
    document.addEventListener('click', (e) => {
        if (e.target.closest('.faq-question')) {
            toggleFaq(e.target.closest('.faq-question'));
        }
    });
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// ========================
// EXPORT FOR TESTING
// ========================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatFileSize,
        formatDuration,
        isValidInstagramUrl,
        fetchInstagramMedia,
        downloadMedia
    };
}
