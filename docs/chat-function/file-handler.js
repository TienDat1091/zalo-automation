// ========== FILE & IMAGE HANDLING FUNCTIONS ==========
// These functions handle file/image attachment for messages

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log(`📎 File selected: ${file.name} (${file.type})`);

    const isImage = file.type.startsWith('image/');
    const maxSize = 100 * 1024 * 1024; // 100MB for both images and files

    if (file.size > maxSize) {
        alert(`❌ File quá lớn! Giới hạn: 100MB`);
        event.target.value = '';
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        const preview = document.getElementById('attachmentPreview');
        const previewImage = document.getElementById('previewImage');
        const previewFile = document.getElementById('previewFile');

        if (isImage) {
            // Show image preview
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
            previewFile.style.display = 'none';

            // Store base64 data
            window.currentAttachment = {
                type: 'image',
                name: file.name,
                mimeType: file.type,
                data: e.target.result
            };
        } else {
            // Show file preview
            previewFile.querySelector('.file-name').textContent = file.name;
            previewFile.style.display = 'flex';
            previewImage.style.display = 'none';

            // Store base64 data
            window.currentAttachment = {
                type: 'file',
                name: file.name,
                mimeType: file.type,
                data: e.target.result
            };
        }

        preview.style.display = 'block';
        console.log('✅ Attachment preview shown');
    };

    reader.onerror = () => {
        console.error('❌ Failed to read file');
        alert('❌ Không thể đọc file');
    };

    reader.readAsDataURL(file);

    // Reset input
    event.target.value = '';
}

function removeAttachment() {
    const preview = document.getElementById('attachmentPreview');
    const previewImage = document.getElementById('previewImage');
    const previewFile = document.getElementById('previewFile');

    preview.style.display = 'none';
    previewImage.src = '';
    previewImage.style.display = 'none';
    previewFile.style.display = 'none';

    window.currentAttachment = null;

    console.log('✅ Attachment removed');
}

// ✅ NEW: Handle paste events for images
function handlePaste(event) {
    const items = event.clipboardData?.items;
    if (!items) return;

    // Look for image in clipboard
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
            event.preventDefault(); // Prevent default paste behavior

            const file = items[i].getAsFile();
            if (!file) continue;

            console.log(`📋 Pasted image: ${file.type}`);

            const maxSize = 100 * 1024 * 1024; // 100MB
            if (file.size > maxSize) {
                alert(`❌ Ảnh quá lớn! Giới hạn: 100MB`);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('attachmentPreview');
                const previewImage = document.getElementById('previewImage');
                const previewFile = document.getElementById('previewFile');

                // Show image preview
                previewImage.src = e.target.result;
                previewImage.style.display = 'block';
                previewFile.style.display = 'none';

                // Store base64 data
                window.currentAttachment = {
                    type: 'image',
                    name: `pasted-image-${Date.now()}.png`,
                    mimeType: file.type,
                    data: e.target.result
                };

                preview.style.display = 'block';
                console.log('✅ Pasted image preview shown');
            };

            reader.onerror = () => {
                console.error('❌ Failed to read pasted image');
                alert('❌ Không thể đọc ảnh đã paste');
            };

            reader.readAsDataURL(file);
            break; // Only handle first image
        }
    }
}

// ✅ Initialize paste event listener when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('paste', handlePaste);
        console.log('✅ Paste image listener initialized');
    }
});

