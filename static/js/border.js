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

// Carousel state for multiple images
let fileList = []; // Array<File>
let currentIndex = 0;
const carouselControls = document.getElementById('carouselControls');
const prevImageBtn = document.getElementById('prevImage');
const nextImageBtn = document.getElementById('nextImage');
const carouselIndex = document.getElementById('carouselIndex');

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

// If canvas drawing isn't available, show the img element as a fallback
function showFallbackImage(imgSrc) {
    if (previewCanvas) previewCanvas.classList.add('d-none');
    if (previewImage) {
        previewImage.src = imgSrc;
        previewImage.classList.remove('d-none');
    }
}

// ---- File selection + DnD ----
function handleSelectedFile(file) {
    console.log("handleSelectedFile called with:", file);
    if (!file) {
        console.warn("No file provided to handleSelectedFile");
        return;
    }

    // If a FileList or array was passed, handle multiple files first
    if (file instanceof FileList || Array.isArray(file)) {
        console.log("Adding multiple files:", Array.from(file).map(f => f.name));
        const addFiles = (files) => {
            const newFiles = Array.from(files);
            // Append new files to list
            fileList = fileList.concat(newFiles);

            // Update input.files so that form behavior remains compatible
            if (imageInput) {
                const dt = new DataTransfer();
                fileList.forEach(f => dt.items.add(f));
                imageInput.files = dt.files;
            }

            // Show first/newly added image if nothing is displayed
            if (!originalImage) {
                showFileAtIndex(0);
            } else {
                // Update carousel UI
                updateCarouselUI();
            }
        };

        addFiles(file);
        return;
    }

    // Single File handling - robustly check MIME type
    const mimeType = (file && file.type) ? String(file.type) : '';
    if (!mimeType.match(/^image\//)) {
        alert('Please select an image file (JPEG, PNG, etc.)');
        return;
    }

    // Accept either a single File or a FileList/Array of Files
    const addFiles = (files) => {
        const newFiles = Array.from(files);
        // Append new files to list
        fileList = fileList.concat(newFiles);

        // Update input.files so that form behavior remains compatible
        if (imageInput) {
            const dt = new DataTransfer();
            fileList.forEach(f => dt.items.add(f));
            imageInput.files = dt.files;
        }

        // Show first/newly added image if nothing is displayed
        if (!originalImage) {
            showFileAtIndex(0);
        } else {
            // Update carousel UI
            updateCarouselUI();
        }
    };
    // Single file provided
    addFiles([file]);
}

// Show file at given index in fileList
function showFileAtIndex(index) {
    if (!fileList || fileList.length === 0) return;
    index = Math.max(0, Math.min(index, fileList.length - 1));
    currentIndex = index;

    const file = fileList[currentIndex];
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;

            // If currentAspectRatio is Default, keep it so preview uses image's native ratio
            // Otherwise leave user-set ratio intact (applies to all images)
            if (!currentAspectRatio) currentAspectRatio = 'Default';

            // Update aspect options based on orientation of this image
            const width = img.width;
            const height = img.height;
            if (width > height) {
                updateAspectRatioOptions('landscape');
            } else if (width < height) {
                updateAspectRatioOptions('portrait');
            } else {
                updateAspectRatioOptions('square');
            }

            // Show canvas and controls
            const canvasContainer = document.querySelector('.canvas-container');
            if (canvasContainer) canvasContainer.classList.add('active');
            if (previewCanvas) previewCanvas.classList.remove('d-none');
            if (dropzoneText) dropzoneText.style.display = 'none';
            if (dropzone) dropzone.classList.add('has-image');
            if (controls) controls.style.display = 'block';
            if (resetButton) resetButton.style.display = 'block';

            dropzoneText.textContent = file.name;

            updateCarouselUI();
            // Try to draw on canvas; if ctx is missing, fall back to <img>
            if (ctx) {
                // Ensure canvas is visible and image element hidden
                if (previewCanvas) previewCanvas.classList.remove('d-none');
                if (previewImage) previewImage.classList.add('d-none');
                drawPreview();
            } else {
                console.warn('Canvas context not available; falling back to raw <img> preview');
                showFallbackImage(img.src);
            }
        };
        img.onerror = () => {
            alert('Failed to load the image. Please try another file.');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function updateCarouselUI() {
    if (!fileList || fileList.length <= 1) {
        if (carouselControls) carouselControls.classList.add('d-none');
    } else {
        if (carouselControls) carouselControls.classList.remove('d-none');
    }
    if (carouselIndex) {
        carouselIndex.textContent = `${currentIndex + 1} / ${fileList.length}`;
    }
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

// Carousel prev/next buttons
if (prevImageBtn) {
    prevImageBtn.addEventListener('click', (e) => {
        // Prevent the click from bubbling to the dropzone (which opens the file picker)
        e.stopPropagation();
        e.preventDefault();
        if (!fileList || fileList.length === 0) return;
        const nextIndex = (currentIndex - 1 + fileList.length) % fileList.length;
        showFileAtIndex(nextIndex);
    });
}
if (nextImageBtn) {
    nextImageBtn.addEventListener('click', (e) => {
        // Prevent the click from bubbling to the dropzone (which opens the file picker)
        e.stopPropagation();
        e.preventDefault();
        if (!fileList || fileList.length === 0) return;
        const nextIndex = (currentIndex + 1) % fileList.length;
        showFileAtIndex(nextIndex);
    });
}

// Prevent clicks inside the carousel controls container from opening the file picker
if (carouselControls) {
    carouselControls.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Click on dropzone -> open file picker (always allow adding files)
if (dropzone) {
    dropzone.addEventListener('click', (e) => {
        // Ignore clicks that originate from carousel controls so they don't open file picker
        if (e.target && (e.target.closest && (e.target.closest('#carouselControls') || e.target.closest('.carousel-controls') || e.target.closest('#prevImage') || e.target.closest('#nextImage')))) {
            console.log('Click inside carousel controls — ignoring dropzone open');
            return;
        }
        console.log('Dropzone clicked, opening file picker');
        if (imageInput) imageInput.click();
    });
}


// File input change - support multiple files
if (imageInput) {
    imageInput.addEventListener('change', (e) => {
        console.log("Image input change event (multiple support)");
        const files = e.target.files;
        if (files && files.length > 0) {
            handleSelectedFile(files);
        }
    });
}

// Drag over / leave / drop - always allow adding files
if (dropzone) {
    const handleDragEvents = (e) => {
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
                handleSelectedFile(files);
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
        // Clear file list and carousel UI
        fileList = [];
        currentIndex = 0;
        if (carouselControls) carouselControls.classList.add('d-none');
        if (carouselIndex) carouselIndex.textContent = '0 / 0';
        
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
        // Append all images (fileList) so backend can handle multiple images
        if (!fileList || fileList.length === 0) {
            alert('Please select at least one image');
            return;
        }
        fileList.forEach((f, idx) => {
            // use 'images' as the field name for multiple files
            formData.append('images', f, f.name);
        });

        formData.append('borderSize', borderSlider ? borderSlider.value : 0);

        // Add aspect ratio to form data (shared for all images)
        let aspectValue = currentAspectRatio;
        if (aspectValue === 'Custom' && customAspectInput && customAspectInput.value && !customAspectInput.classList.contains('is-invalid')) {
            aspectValue = customAspectInput.value;
        }
        formData.append('aspectRatio', aspectValue);

        // Log the form data being sent
        for (let pair of formData.entries()) {
            console.log(pair[0]+ ': ' + pair[1]);
        }

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

    // Preserve user's chosen aspect ratio when updating the options.
    // If currentAspectRatio matches one of the available options, set the button text accordingly.
    let found = false;
    options[orientation].forEach(option => {
        if (option.value === currentAspectRatio) {
            selectedAspectButton.textContent = option.label;
            found = true;
        }
    });
    // If not found and we have a custom value, show it in the custom input
    if (!found && currentAspectRatio && currentAspectRatio !== 'Default') {
        selectedAspectButton.textContent = currentAspectRatio;
        if (customAspectInput) {
            customAspectInput.value = currentAspectRatio;
            customAspectInput.classList.remove('d-none');
            customAspectInput.classList.add('is-valid');
        }
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