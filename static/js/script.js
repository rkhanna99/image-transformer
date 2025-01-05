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
    e.preventDefault();
    console.log('File dropped.');
    dropzone.style.backgroundColor = '';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        console.log(`File dropped: ${files[0].name}`);
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


function displayImagePreview(file) {
    console.log(`Attempting to preview file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = (e) => {
        console.log('FileReader loaded file successfully.');
        previewImage.src = e.target.result;
        previewImage.classList.remove('d-none');
        previewImage.style.display = "block"; // Ensure preview is visible
        dropzoneText.textContent = file.name;
        console.log("Successfully uploaded the file");

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
    imageInput.value = ""; // Fix clearing the file input
    console.log("Dropzone reset successfully.");
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

function getAspectRatio() {
    if (aspectRatioDropdown.value === 'Custom') {
        return customAspectRatioInput.value || null; // Return custom input or null if empty
    }
    return aspectRatioDropdown.value; // Return selected dropdown value
}

// Handle the form submission
document.getElementById("uploadForm").addEventListener("submit", async function (e) {
    e.preventDefault(); // Prevent default form submission behavior

    // Show the loading screen
    document.getElementById("loadingScreen").style.display = "flex";

    const formData = new FormData(this);

    try {
        const response = await fetch("/process-image", {
            method: "POST",
            body: formData,
        });

        if (response.ok) {
            // Redirect to results page with transformed image
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            // Save the image URL in sessionStorage (or pass it via server-side rendering)
            sessionStorage.setItem("transformedImageURL", url);

            // Redirect to results page
            window.location.href = "/results";
        } else {
            const error = await response.json();
            alert(`Error: ${error.error}`);
            document.getElementById("loadingScreen").style.display = "none"; // Hide loading screen on error
        }
    } catch (error) {
        console.error("Error:", error);
        alert("An unexpected error occurred.");
        document.getElementById("loadingScreen").style.display = "none"; // Hide loading screen on error
    }
});

// Handle the back button to return to the upload form
document.getElementById("backButton").addEventListener("click", function () {
    document.getElementById("uploadSection").style.display = "block";
    document.getElementById("resultSection").style.display = "none";

    // Clear the previous transformed image
    document.getElementById("transformedImage").src = "";
});

// Aspect ratio update logic
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
