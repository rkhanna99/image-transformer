const dropzone = document.getElementById('dropzone');
const dropzoneText = document.getElementById('dropzoneText');
const imageInput = document.getElementById('imageInput');
const previewImage = document.getElementById('previewImage');
const resetButton = document.getElementById("resetButton");
//const aspectRatioDropdown = document.getElementById('aspectRatio');
const customAspectRatioInput = document.getElementById('customAspectRatio');

// New elements for Bootswatch dropdown
const aspectButtons = document.querySelectorAll('[data-aspect]');
const selectedAspectButton = document.getElementById('selectedAspectRatio');
const customAspectInput = document.getElementById('customAspectRatio');
const aspectDropdownItems = document.querySelectorAll('.dropdown-item[data-value]');

let currentAspectRatio = 'Default'; // Default aspect ratio

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

    console.log("Reset button clicked");

    // Reset aspect ratio dropdown
        if (selectedAspectButton) {
            selectedAspectButton.textContent = 'Default';
            currentAspectRatio = 'Default';
            if (customAspectInput) {
                customAspectInput.classList.add('d-none');
                customAspectInput.value = '';
                customAspectInput.classList.remove('is-invalid', 'is-valid');
            }
        }
        
        // Reset old aspect ratio buttons
        aspectButtons.forEach(b => b.classList.remove('active'));
});

// Initialize aspect ratio dropdown
document.addEventListener('DOMContentLoaded', function() {
    setupAspectRatioDropdown();
});

// Aspect ratio buttons (old style - keeping for compatibility)
if (aspectButtons.length > 0) {
    aspectButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log("Aspect button clicked:", btn.dataset.aspect);
            // For compatibility, update the new dropdown too
            if (selectedAspectButton) {
                currentAspectRatio = btn.dataset.aspect;
                selectedAspectButton.textContent = btn.textContent;
                if (customAspectInput) {
                    customAspectInput.classList.add('d-none');
                }
                drawPreview();
            }
        });
    });
}

// ---- Aspect Ratio Dropdown Functionality ----
function setupAspectRatioDropdown() {
    if (!selectedAspectButton || !customAspectInput) {
        console.warn("Aspect ratio dropdown elements not found");
        return;
    }

    // Initial setup - we'll populate this dynamically when an image is loaded
    // The click handlers are now added in updateAspectRatioOptions
    
    // Handle custom aspect ratio input
    customAspectInput.addEventListener('input', function() {
        // Validate custom aspect ratio format (e.g., "16:9")
        const pattern = /^\d+:\d+$/;
        if (pattern.test(this.value)) {
            this.classList.remove('is-invalid');
            this.classList.add('is-valid');
            
            // Update the selected button text to show custom value
            selectedAspectButton.textContent = this.value;
            
            // Update current aspect ratio to custom value
            currentAspectRatio = this.value;
            
            console.log("Custom aspect ratio:", this.value);
        } else if (this.value.trim() !== '') {
            this.classList.remove('is-valid');
            this.classList.add('is-invalid');
        } else {
            this.classList.remove('is-invalid', 'is-valid');
        }
    });
}

// aspectRatioDropdown.addEventListener('change', () => {
//     if (aspectRatioDropdown.value === 'Custom') {
//         // Show custom aspect ratio input
//         customAspectRatioInput.classList.remove('d-none');
//         customAspectRatioInput.focus();
//     } else {
//         // Hide custom aspect ratio input and clear its value
//         customAspectRatioInput.classList.add('d-none');
//         customAspectRatioInput.value = '';
//     }
// });

// function getAspectRatio() {
//     if (aspectRatioDropdown.value === 'Custom') {
//         return customAspectRatioInput.value || null; // Return custom input or null if empty
//     }
//     return aspectRatioDropdown.value; // Return selected dropdown value
// }

// Handle the form submission
document.getElementById("uploadForm").addEventListener("submit", async function (e) {
    e.preventDefault(); // Prevent default form submission behavior

    // Show the loading screen
    document.getElementById("loadingScreen").style.display = "flex";

    // Set the request up
    const formData = new FormData(this);

    formData.append("aspectRatio", currentAspectRatio); // Append the selected aspect ratio
    // If the user selected Custom, also append the custom value
    if (currentAspectRatio === 'Custom' || (/^\d+:\d+$/.test(currentAspectRatio) && customAspectInput && !customAspectInput.classList.contains('d-none'))) {
        // Use the value from the custom input if available, otherwise use currentAspectRatio
        const customValue = customAspectInput && customAspectInput.value ? customAspectInput.value : currentAspectRatio;
        formData.append("customAspectRatio", customValue);
    }

    // Log the form data for debugging
    for (let pair of formData.entries()) {
        console.log(`${pair[0]}: ${pair[1]}`);
    }

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

// Handle the reset all button (Just do a full reload)
document.getElementById("resetAllBtn").addEventListener("click", function () {
    console.log("Reset all button clicked. Reloading the page.");
    location.reload(); // Reload the page to reset everything
});

// Handle the back button to return to the upload form (No back button functionality yet)
document.getElementById("backButton").addEventListener("click", function () {
    document.getElementById("uploadSection").style.display = "block";
    document.getElementById("resultSection").style.display = "none";

    // Clear the previous transformed image
    document.getElementById("transformedImage").src = "";
});

// Aspect ratio update logic for Bootswatch dropdown
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

    // Get the dropdown menu element
    const dropdownMenu = document.querySelector('.dropdown-menu');
    if (!dropdownMenu) {
        console.error('Dropdown menu not found');
        return;
    }

    // Clear current dropdown items
    dropdownMenu.innerHTML = '';

    // Add new dropdown items based on orientation
    options[orientation].forEach(option => {
        if (option.value === 'Custom') {
            // Add divider before Custom option
            const divider = document.createElement('div');
            divider.className = 'dropdown-divider';
            dropdownMenu.appendChild(divider);
        }
        
        const dropdownItem = document.createElement('a');
        dropdownItem.className = 'dropdown-item';
        dropdownItem.href = '#';
        dropdownItem.setAttribute('data-value', option.value);
        dropdownItem.textContent = option.label;
        
        // Add click event listener
        dropdownItem.addEventListener('click', function(e) {
            e.preventDefault();
            const value = this.getAttribute('data-value');
            const text = this.textContent;
            
            // Update selected button text
            selectedAspectButton.textContent = text;
            
            // Update current aspect ratio
            currentAspectRatio = value;
            
            // Show/hide custom input
            if (value === 'Custom') {
                customAspectInput.classList.remove('d-none');
                customAspectInput.focus();
            } else {
                customAspectInput.classList.add('d-none');
                customAspectInput.classList.remove('is-invalid', 'is-valid');
            }
            
            console.log("Aspect ratio selected:", value);
        });
        
        dropdownMenu.appendChild(dropdownItem);
    });


    // Set the selected button text and custom input based on currentAspectRatio
    let found = false;
    options[orientation].forEach(option => {
        if (option.value === currentAspectRatio) {
            selectedAspectButton.textContent = option.label;
            found = true;
        }
    });
    // If not found, check if it's a custom value
    if (!found && currentAspectRatio && currentAspectRatio !== 'Default') {
        selectedAspectButton.textContent = currentAspectRatio;
        customAspectInput.value = currentAspectRatio;
        customAspectInput.classList.remove('d-none');
        customAspectInput.classList.add('is-valid');
    } else if (!currentAspectRatio || currentAspectRatio === 'Default') {
        selectedAspectButton.textContent = 'Default';
        currentAspectRatio = 'Default';
        if (customAspectInput) {
            customAspectInput.classList.add('d-none');
            customAspectInput.value = '';
            customAspectInput.classList.remove('is-invalid', 'is-valid');
        }
    } else {
        if (customAspectInput) {
            customAspectInput.classList.add('d-none');
            customAspectInput.value = '';
            customAspectInput.classList.remove('is-invalid', 'is-valid');
        }
    }

    // Update the aspectDropdownItems variable for future reference
    window.aspectDropdownItems = dropdownMenu.querySelectorAll('.dropdown-item[data-value]');

    console.log(`Aspect ratio options updated for ${orientation} orientation.`);
}
