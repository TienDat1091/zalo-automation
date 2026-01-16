// ========== FILE & IMAGE HANDLING FUNCTIONS ==========
// These functions handle file/image attachment for messages

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log(`📎 File selected: ${file.name} (${file.type})`);

    const isImage = file.type.startsWith('image/');
    const maxSize = isImage ? 10 * 1024 * 1024 : 5 * 1024 * 1024; // 10MB for images, 5MB for files

    if (file.size > maxSize) {
        alert(`❌ File quá lớn! Giới hạn: ${isImage ? '10MB' : '5MB'}`);
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
