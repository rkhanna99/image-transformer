// ---- Grab elements ----
const dropzone = document.getElementById('dropzone');
const imageInput = document.getElementById('imageInput');
const previewCanvas = document.getElementById('previewCanvas');
const previewImage = document.getElementById('previewImage');
const borderSlider = document.getElementById('borderSlider');
const borderValue = document.getElementById('borderValue');
const aspectButtons = document.querySelectorAll('[data-aspect]');
const controls = document.getElementById('controls');
const saveBtn = document.getElementById('saveImage');
const dropzoneText = document.getElementById('dropzoneText');
const resetButton = document.getElementById('resetButton');

// New elements for Bootswatch dropdown
const selectedAspectButton = document.getElementById('selectedAspectRatio');
const aspectSelect = document.getElementById('aspectRatio');
const customAspectInput = document.getElementById('customAspectRatio');
const aspectDropdownItems = document.querySelectorAll('.dropdown-item[data-value]');

console.log("=== Debug: Element References ===");
console.log("Elements loaded:", {
    dropzone, imageInput, previewCanvas, previewImage,
    borderSlider, borderValue, controls, saveBtn, dropzoneText, resetButton,
    selectedAspectButton, aspectSelect, customAspectInput
});

if (!dropzone) console.error("❌ Dropzone not found!");
if (!imageInput) console.error("❌ Image input not found!");

const ctx = previewCanvas?.getContext('2d', { willReadFrequently: true });

// Keep original image in memory for fast re-renders
let originalImage = null;
const MAX_PREVIEW = 800; // Reduced for better performance

// ---- Helpers ----
function parseAspect(str) {
    if (!str || str.toLowerCase() === 'custom') return null;
    const [w, h] = str.split(':').map(Number);
    if (!w || !h) return null;
    return w / h;
}

function getActiveAspectRatio() {
    // Use the hidden select value instead of button classes
    return parseAspect(aspectSelect ? aspectSelect.value : null);
}

// Draws the preview with current border settings
function drawPreview() {
    console.log("drawPreview called with border:", borderSlider?.value, "aspect:", aspectSelect?.value);
    if (!originalImage || !ctx || !previewCanvas) {
        console.warn("Cannot draw preview - missing elements or image");
        return;
    }

    const borderSize = borderSlider ? parseInt(borderSlider.value) : 0;
    const imgW = originalImage.naturalWidth;
    const imgH = originalImage.naturalHeight;
    
    // Calculate scaling
    const scale = Math.min(1, MAX_PREVIEW / Math.max(imgW, imgH));
    const scaledW = Math.round(imgW * scale);
    const scaledH = Math.round(imgH * scale);
    
    // Add border to canvas size
    const borderPixels = Math.round((borderSize / 100) * Math.max(scaledW, scaledH));
    const canvasW = scaledW + (borderPixels * 2);
    const canvasH = scaledH + (borderPixels * 2);
    
    // Set canvas size
    previewCanvas.width = canvasW;
    previewCanvas.height = canvasH;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvasW, canvasH);
    
    // Fill with white background (the border)
    if (borderPixels > 0) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasW, canvasH);
    }
    
    // Draw the image on top of the white background
    ctx.drawImage(originalImage, borderPixels, borderPixels, scaledW, scaledH);
    
    console.log("Preview drawn with border:", borderPixels, "pixels");
}

// ---- File selection + DnD ----
function handleSelectedFile(file) {
    console.log("handleSelectedFile called with:", file);
    if (!file) {
        console.warn("No file provided to handleSelectedFile");
        return;
    }
    
    if (!file.type.match('image.*')) {
        alert('Please select an image file (JPEG, PNG, etc.)');
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        console.log("FileReader loaded");
        const img = new Image();
        img.onload = () => {
            console.log("Image loaded into memory");
            originalImage = img;
            
            // Show canvas and hide dropzone text
            previewCanvas.classList.remove('d-none');
            dropzoneText.style.display = 'none';
            
            // Show controls and reset button
            if (controls) controls.style.display = 'block';
            if (resetButton) resetButton.style.display = 'block';
            
            dropzoneText.textContent = file.name;
            
            // Initial draw
            drawPreview();
        };
        img.onerror = () => {
            console.error("Failed to load image");
            alert('Failed to load the image. Please try another file.');
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        console.error("FileReader error");
        alert('Error reading file. Please try again.');
    };
    reader.readAsDataURL(file);
}

// ---- Aspect Ratio Dropdown Functionality ----
function setupAspectRatioDropdown() {
    if (!selectedAspectButton || !aspectSelect || !customAspectInput) {
        console.warn("Aspect ratio dropdown elements not found");
        return;
    }

    // Handle dropdown item clicks
    aspectDropdownItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const value = this.getAttribute('data-value');
            const text = this.textContent;
            
            // Update selected button text
            selectedAspectButton.textContent = text;
            
            // Update hidden select value
            aspectSelect.value = value;
            
            // Show/hide custom input
            if (value === 'Custom') {
                customAspectInput.classList.remove('d-none');
                customAspectInput.focus();
            } else {
                customAspectInput.classList.add('d-none');
                customAspectInput.classList.remove('is-invalid', 'is-valid');
            }
            
            console.log("Aspect ratio selected:", value);
            
            // Update preview if image is loaded
            if (originalImage) {
                drawPreview();
            }
        });
    });

    // Handle custom aspect ratio input
    customAspectInput.addEventListener('input', function() {
        // Validate custom aspect ratio format (e.g., "16:9")
        const pattern = /^\d+:\d+$/;
        if (pattern.test(this.value)) {
            this.classList.remove('is-invalid');
            this.classList.add('is-valid');
            
            // Update the selected button text to show custom value
            selectedAspectButton.textContent = this.value;
            
            // Update the hidden select value
            aspectSelect.value = this.value;
            
            // Update preview if image is loaded
            if (originalImage) {
                drawPreview();
            }
            
            console.log("Custom aspect ratio:", this.value);
        } else if (this.value.trim() !== '') {
            this.classList.remove('is-valid');
            this.classList.add('is-valid'); // Changed to is-valid for better UX
        } else {
            this.classList.remove('is-invalid', 'is-valid');
        }
    });

    // Also trigger change when the hidden select changes
    aspectSelect.addEventListener('change', function() {
        console.log("Aspect ratio form value:", this.value);
    });
}

// ---- Event Listeners ----

// Initialize aspect ratio dropdown
document.addEventListener('DOMContentLoaded', function() {
    setupAspectRatioDropdown();
});

// Click on dropzone -> open file picker
if (dropzone) {
    dropzone.addEventListener('click', (e) => {
        // Prevent triggering if clicking on child elements (except the file input)
        if (e.target === dropzone || e.target === dropzoneText) {
            console.log('✅ Dropzone clicked, opening file picker');
            if (imageInput) {
                imageInput.click();
            }
        }
    });
}

// File input change
if (imageInput) {
    imageInput.addEventListener('change', (e) => {
        console.log("Image input change event");
        const file = e.target.files && e.target.files[0];
        handleSelectedFile(file);
    });
}

// Drag over / leave / drop
if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
        dropzone.style.backgroundColor = '#f8f9fa';
    });
    
    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
        dropzone.style.backgroundColor = '';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
        dropzone.style.backgroundColor = '';
        
        const files = e.dataTransfer.files;
        console.log("Files dropped:", files);
        
        if (files && files.length > 0) {
            const file = files[0];
            if (imageInput) {
                // Create a new FileList-like object
                const dt = new DataTransfer();
                dt.items.add(file);
                imageInput.files = dt.files;
            }
            handleSelectedFile(file);
        }
    });
}

// ---- Live controls ----
if (borderSlider && borderValue) {
    // Initial border value display
    borderValue.textContent = borderSlider.value + '%';
    
    borderSlider.addEventListener('input', () => {
        const value = borderSlider.value;
        borderValue.textContent = value + '%';
        console.log("Border slider input:", value);
        drawPreview();
    });
}

// Aspect ratio buttons (old style - keeping for compatibility)
if (aspectButtons.length > 0) {
    aspectButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log("Aspect button clicked:", btn.dataset.aspect);
            // For compatibility, you might want to update the new dropdown too
            if (aspectSelect && selectedAspectButton) {
                aspectSelect.value = btn.dataset.aspect;
                selectedAspectButton.textContent = btn.textContent;
                drawPreview();
            }
        });
    });
}

// Reset button functionality
if (resetButton) {
    resetButton.addEventListener('click', function() {
        console.log("Reset button clicked");
        previewCanvas.classList.add('d-none');
        previewImage.classList.add('d-none');
        dropzoneText.style.display = 'block';
        dropzoneText.textContent = "Drag and drop an image here or click to upload";
        if (imageInput) imageInput.value = '';
        resetButton.style.display = 'none';
        if (controls) controls.style.display = 'none';
        originalImage = null;
        
        // Reset border slider
        if (borderSlider) {
            borderSlider.value = 0;
            if (borderValue) borderValue.textContent = '0%';
        }
        
        // Reset aspect ratio dropdown
        if (selectedAspectButton && aspectSelect) {
            selectedAspectButton.textContent = 'Default';
            aspectSelect.value = 'Default';
            if (customAspectInput) {
                customAspectInput.classList.add('d-none');
                customAspectInput.value = '';
                customAspectInput.classList.remove('is-invalid', 'is-valid');
            }
        }
        
        // Reset old aspect ratio buttons
        aspectButtons.forEach(b => b.classList.remove('active'));
    });
}

// ---- Form submission ----
const borderForm = document.getElementById('borderForm');
if (borderForm) {
    borderForm.addEventListener('submit', async (e) => {
        console.log("Form submitted");
        e.preventDefault();

        if (!imageInput || !imageInput.files || !imageInput.files[0]) {
            alert('Please select an image first');
            return;
        }

        const formData = new FormData();
        formData.append('image', imageInput.files[0]);
        formData.append('borderSize', borderSlider ? borderSlider.value : 0);
        
        // Add aspect ratio to form data
        if (aspectSelect) {
            let aspectValue = aspectSelect.value;
            // If custom input is visible and has valid value, use that instead
            if (aspectValue === 'Custom' && customAspectInput && 
                customAspectInput.value && !customAspectInput.classList.contains('is-invalid')) {
                aspectValue = customAspectInput.value;
            }
            formData.append('aspectRatio', aspectValue);
        }

        try {
            // Show loading
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) loadingScreen.style.display = 'flex';
            
            const response = await fetch('/white_border', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Failed to process border');

            const data = await response.json();
            console.log("Response JSON:", data);

            if (data.processed_image_url) {
                // Hide canvas and show the processed image
                previewCanvas.classList.add('d-none');
                previewImage.src = data.processed_image_url;
                previewImage.classList.remove('d-none');
            }
        } catch (err) {
            console.error("Form submission error:", err);
            alert("Something went wrong while processing the border.");
        } finally {
            // Hide loading
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) loadingScreen.style.display = 'none';
        }
    });
}

// Prevent form submission on enter key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && borderForm) {
        e.preventDefault();
    }
});

console.log("Border script loaded successfully");