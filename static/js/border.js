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
const customAspectInput = document.getElementById('customAspectRatio');
const aspectDropdownItems = document.querySelectorAll('.dropdown-item[data-value]');

console.log("=== Debug: Element References ===");
console.log("Elements loaded:", {
    dropzone, imageInput, previewCanvas, previewImage,
    borderSlider, borderValue, controls, saveBtn, dropzoneText, resetButton,
    selectedAspectButton, customAspectInput
});

if (!dropzone) console.error("❌ Dropzone not found!");
if (!imageInput) console.error("❌ Image input not found!");

const ctx = previewCanvas?.getContext('2d', { willReadFrequently: true });

// Keep original image in memory for fast re-renders
let originalImage = null;
const MAX_PREVIEW = 800; // Reduced for better performance

// Store current aspect ratio
let currentAspectRatio = 'Default';

// ---- Helpers ----
function parseAspect(str) {
    if (!str || str === 'Default' || str === 'Custom') return null;
    const [w, h] = str.split(':').map(Number);
    if (!w || !h) return null;
    return w / h;
}

function getActiveAspectRatio() {
    return parseAspect(currentAspectRatio);
}

// Helper function to get target aspect ratio as tuple [width, height]
function getTargetAspectRatioTuple() {
    if (!currentAspectRatio || currentAspectRatio === 'Default' || currentAspectRatio === 'Custom') {
        return null;
    }
    const [w, h] = currentAspectRatio.split(':').map(Number);
    if (!w || !h) return null;
    return [w, h];
}

// Draws the preview with current border settings (matches Python logic exactly)
function drawPreview() {
    console.log("drawPreview called with border:", borderSlider?.value, "aspect:", currentAspectRatio);
    if (!originalImage || !ctx || !previewCanvas) {
        console.warn("Cannot draw preview - missing elements or image");
        return;
    }

    const borderSize = borderSlider ? parseInt(borderSlider.value) : 0;
    const imgW = originalImage.naturalWidth;
    const imgH = originalImage.naturalHeight;
    
    // Parse target aspect ratio
    let targetAspectRatioTuple = null;
    if (currentAspectRatio && currentAspectRatio !== 'Default' && currentAspectRatio !== 'Custom') {
        const [w, h] = currentAspectRatio.split(':').map(Number);
        if (w && h) {
            targetAspectRatioTuple = [w, h];
        }
    }
    
    // If no target aspect ratio or default, use original image aspect ratio
    let targetAspectRatioValue = imgW / imgH;
    if (targetAspectRatioTuple) {
        targetAspectRatioValue = targetAspectRatioTuple[0] / targetAspectRatioTuple[1];
    }
    
    // Calculate scaling for preview (applied after all calculations)
    const scale = Math.min(1, MAX_PREVIEW / Math.max(imgW, imgH));
    
    // Step 1: Calculate uniform border size (matches Python exactly)
    const uniformBorderSize = Math.floor(Math.min(imgW, imgH) * (borderSize / 100)) / 2;
    let borderedWidth = imgW + (uniformBorderSize * 2);
    let borderedHeight = imgH + (uniformBorderSize * 2);
    
    // Step 2: Adjust for aspect ratio if needed (matches Python exactly)
    let finalWidth = borderedWidth;
    let finalHeight = borderedHeight;
    let aspectPadding = { left: 0, top: 0, right: 0, bottom: 0 };
    
    if (targetAspectRatioTuple) {
        const currentAspect = borderedWidth / borderedHeight;
        
        if (currentAspect > targetAspectRatioValue) {
            // Too wide → pad top/bottom equally
            const newHeight = Math.round(borderedWidth / targetAspectRatioValue);
            const paddingNeeded = newHeight - borderedHeight;
            aspectPadding.top = Math.floor(paddingNeeded / 2);
            aspectPadding.bottom = paddingNeeded - aspectPadding.top;
            finalHeight = newHeight;
        } else if (currentAspect < targetAspectRatioValue) {
            // Too tall → pad left/right equally
            const newWidth = Math.round(borderedHeight * targetAspectRatioValue);
            const paddingNeeded = newWidth - borderedWidth;
            aspectPadding.left = Math.floor(paddingNeeded / 2);
            aspectPadding.right = paddingNeeded - aspectPadding.left;
            finalWidth = newWidth;
        }
    }
    
    // Apply scaling to final dimensions
    const scaledFinalWidth = Math.round(finalWidth * scale);
    const scaledFinalHeight = Math.round(finalHeight * scale);
    
    // Set canvas size to final scaled dimensions
    previewCanvas.width = scaledFinalWidth;
    previewCanvas.height = scaledFinalHeight;
    
    // Clear canvas with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, scaledFinalWidth, scaledFinalHeight);
    
    // Calculate scaled positions and dimensions
    const scaledImageX = Math.round((uniformBorderSize + aspectPadding.left) * scale);
    const scaledImageY = Math.round((uniformBorderSize + aspectPadding.top) * scale);
    const scaledImageWidth = Math.round(imgW * scale);
    const scaledImageHeight = Math.round(imgH * scale);
    
    // Draw the scaled image
    ctx.drawImage(originalImage, scaledImageX, scaledImageY, scaledImageWidth, scaledImageHeight);
    
    console.log("Preview drawn:", {
        originalSize: `${imgW}x${imgH}`,
        uniformBorder: uniformBorderSize,
        borderedSize: `${borderedWidth}x${borderedHeight}`,
        aspectPadding: aspectPadding,
        finalSize: `${finalWidth}x${finalHeight}`,
        scaledFinalSize: `${scaledFinalWidth}x${scaledFinalHeight}`,
        imagePosition: `${scaledImageX},${scaledImageY}`,
        imageSize: `${scaledImageWidth}x${scaledImageHeight}`,
        targetAspectRatio: targetAspectRatioValue
    });
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

            // Update the aspect ratio dropdown options based on the orientation of the image
            const width = img.width;
            const height = img.height;
            console.log(`Image dimensions: ${width}x${height}`);

            if (width > height) {
                updateAspectRatioOptions('landscape');
            } else if (width < height) {
                updateAspectRatioOptions('portrait');
            } else {
                updateAspectRatioOptions('square');
            }
            
            // Show canvas container and hide dropzone text
            const canvasContainer = document.querySelector('.canvas-container');
            if (canvasContainer) {
                canvasContainer.classList.add('active');
            }
            previewCanvas.classList.remove('d-none');
            dropzoneText.style.display = 'none';
            
            // Add class to indicate dropzone has an image
            if (dropzone) {
                dropzone.classList.add('has-image');
            }
            
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
            
            // Update preview if image is loaded
            if (originalImage) {
                drawPreview();
            }
            
            console.log("Custom aspect ratio:", this.value);
        } else if (this.value.trim() !== '') {
            this.classList.remove('is-valid');
            this.classList.add('is-invalid');
        } else {
            this.classList.remove('is-invalid', 'is-valid');
        }
    });
}

// ---- Event Listeners ----

// Initialize aspect ratio dropdown
document.addEventListener('DOMContentLoaded', function() {
    setupAspectRatioDropdown();
});

// Click on dropzone -> open file picker (only when no image)
if (dropzone) {
    dropzone.addEventListener('click', (e) => {
        // Only handle clicks if dropzone doesn't have an image
        // and if clicking on dropzone itself or the text
        if (!dropzone.classList.contains('has-image') && 
            (e.target === dropzone || e.target === dropzoneText)) {
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

// Drag over / leave / drop - only when dropzone doesn't have image
if (dropzone) {
    const handleDragEvents = (e) => {
        // Only handle drag events if dropzone doesn't have an image
        if (!dropzone.classList.contains('has-image')) {
            e.preventDefault();
            e.stopPropagation();
            
            if (e.type === 'dragover') {
                dropzone.classList.add('dragover');
                dropzone.style.backgroundColor = '#f8f9fa';
            } else if (e.type === 'dragleave' || e.type === 'drop') {
                dropzone.classList.remove('dragover');
                dropzone.style.backgroundColor = '';
            }
            
            if (e.type === 'drop') {
                const files = e.dataTransfer.files;
                console.log("Files dropped:", files);
                
                if (files && files.length > 0) {
                    const file = files[0];
                    if (imageInput) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        imageInput.files = dt.files;
                    }
                    handleSelectedFile(file);
                }
            }
        }
    };

    dropzone.addEventListener('dragover', handleDragEvents);
    dropzone.addEventListener('dragleave', handleDragEvents);
    dropzone.addEventListener('drop', handleDragEvents);
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

// Reset button functionality
if (resetButton) {
    resetButton.addEventListener('click', function() {
        console.log("Reset button clicked");
        
        // Hide canvas container
        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.classList.remove('active');
        }
        previewCanvas.classList.add('d-none');
        previewImage.classList.add('d-none');
        
        // Restore dropzone functionality and text
        dropzoneText.style.display = 'block';
        dropzoneText.textContent = "Drag and drop an image here or click to upload";
        if (dropzone) {
            dropzone.classList.remove('has-image');
        }
        
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
        let aspectValue = currentAspectRatio;
        // If custom input is visible and has valid value, use that instead
        if (currentAspectRatio === 'Custom' && customAspectInput && 
            customAspectInput.value && !customAspectInput.classList.contains('is-invalid')) {
            aspectValue = customAspectInput.value;
        }
        formData.append('aspectRatio', aspectValue);

        try {
            // Show loading
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) loadingScreen.style.display = 'flex';
            
            const response = await fetch('/white-border', {
                method: 'POST',
                body: formData
            });

            // Check if response is JSON or HTML redirect
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                // Handle JSON response (success or error)
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to process border');
                }

                if (data.processed_image_url) {
                    // Hide canvas and show the processed image
                    previewCanvas.classList.add('d-none');
                    previewImage.src = data.processed_image_url;
                    previewImage.classList.remove('d-none');
                }
            } else {
                // Handle HTML response (redirect)
                // The server is redirecting us, so we should follow the redirect
                const redirectUrl = response.url;
                if (redirectUrl) {
                    window.location.href = redirectUrl;
                } else {
                    // If no redirect URL, try to parse the response as text
                    const text = await response.text();
                    if (text.includes('results_page')) {
                        // If the HTML contains results page, redirect to results
                        window.location.href = '/results';
                    } else {
                        throw new Error('Unexpected response from server');
                    }
                }
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
            
            // Update preview if image is loaded
            if (originalImage) {
                drawPreview();
            }
        });
        
        dropdownMenu.appendChild(dropdownItem);
    });

    // Reset to default selection
    selectedAspectButton.textContent = 'Default';
    currentAspectRatio = 'Default';
    if (customAspectInput) {
        customAspectInput.classList.add('d-none');
        customAspectInput.value = '';
        customAspectInput.classList.remove('is-invalid', 'is-valid');
    }

    // Update the aspectDropdownItems variable for future reference
    window.aspectDropdownItems = dropdownMenu.querySelectorAll('.dropdown-item[data-value]');

    console.log(`Aspect ratio options updated for ${orientation} orientation.`);
}