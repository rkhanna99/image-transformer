const dropzone = document.getElementById('dropzone');
const dropzoneText = document.getElementById('dropzoneText');
const imageInput = document.getElementById('imageInput');
const previewImage = document.getElementById('previewImage');
const resetButton = document.getElementById("resetButton");
const aspectRatioDropdown = document.getElementById('aspectRatio');
const customAspectRatioInput = document.getElementById('customAspectRatio');

// Drag-and-drop behavior
dropzone.addEventListener('click', () => {
    console.log('Dropzone clicked. Opening file picker.');
    imageInput.click();
});

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    console.log('Drag over detected.');
    dropzone.style.backgroundColor = '#e9ecef';
});

dropzone.addEventListener('dragleave', () => {
    console.log('Drag leave detected.');
    dropzone.style.backgroundColor = '';
});

dropzone.addEventListener('drop', (e) => {
    e.le.log('File dropped.');
    dropzone.style.backgroundColor = '';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        preventDefault();
    consoconsole.log(`File dropped: ${files[0].name}`);
        displayImagePreview(files[0]);
    }
});

imageInput.addEventListener('change', () => {
    console.log('File selected.');
    if (imageInput.files.length > 0) {
        console.log(`File selected: ${imageInput.files[0].name}`);
        displayImagePreview(imageInput.files[0]);
    }
});

imageInput.addEventListener('change', () => {
    if (imageInput.files.length > 0) {
        const file = imageInput.files[0];
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;

            img.onload = () => {
                const width = img.width;
                const height = img.height;

                console.log(`Image dimensions: ${width}x${height}`);

                // Determine orientation
                if (width > height) {
                    updateAspectRatioOptions('landscape');
                } else if (width < height) {
                    updateAspectRatioOptions('portrait');
                } else {
                    updateAspectRatioOptions('square');
                }
            };
        };

        reader.readAsDataURL(file);
    }
});

function updateAspectRatioOptions(orientation) {
    const options = {
        portrait: [
            { value: 'Default', label: 'Default' },
            { value: '4:5', label: '4:5' },
            { value: '2:3', label: '2:3' },
            { value: '3:4', label: '3:4' },
            { value: '9:16', label: '9:16' },
            { value: '8:10', label: '8:10' },
            { value: '11:14', label: '11:14' },
            { value: 'Custom', label: 'Custom...' }
        ],
        landscape: [
            { value: 'Default', label: 'Default' },
            { value: '5:4', label: '5:4' },
            { value: '3:2', label: '3:2' },
            { value: '4:3', label: '4:3' },
            { value: '16:9', label: '16:9' },
            { value: '10:8', label: '10:8' },
            { value: '14:11', label: '14:11' },
            { value: 'Custom', label: 'Custom...' }
        ],
        square: [
            { value: 'Default', label: 'Default' },
            { value: '1:1', label: '1:1' },
            { value: 'Custom', label: 'Custom...' }
        ]
    };

    // Clear current options
    aspectRatioDropdown.innerHTML = '';

    // Add new options based on orientation
    options[orientation].forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        aspectRatioDropdown.appendChild(opt);
    });

    console.log(`Aspect ratio options updated for ${orientation} orientation.`);
}

resetButton.addEventListener("click", () => {
    resetDropzone();
});

aspectRatioDropdown.addEventListener('change', () => {
    if (aspectRatioDropdown.value === 'Custom') {
        // Show custom aspect ratio input
        customAspectRatioInput.classList.remove('d-none');
        customAspectRatioInput.focus();
    } else {
        // Hide custom aspect ratio input and clear its value
        customAspectRatioInput.classList.add('d-none');
        customAspectRatioInput.value = '';
    }
});

function displayImagePreview(file) {
    console.log(`Attempting to preview file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = (e) => {
        console.log('FileReader loaded file successfully.');
        previewImage.src = e.target.result;
        previewImage.classList.remove('d-none');
        dropzoneText.textContent = file.name;
        console.log("Successfully uploaded the file")

        // Show the reset button
        resetButton.style.display = "block";
    };
    reader.onerror = (e) => {
        console.error('Error reading file:', e);
    };
    reader.readAsDataURL(file);
}

function resetDropzone() {
    // Reset the text, image preview, and hide the reset button
    dropzoneText.textContent = "Drag and drop an image here or click to upload";
    previewImage.style.display = "none";
    previewImage.src = "";
    resetButton.style.display = "none";

    // Clear the file input value
    fileInput.value = "";
}

// You can capture the aspect ratio selection here if needed
function getAspectRatio() {
    if (aspectRatioDropdown.value === 'Custom') {
        return customAspectRatioInput.value || null; // Return custom input or null if empty
    }
    return aspectRatioDropdown.value; // Return selected dropdown value
}