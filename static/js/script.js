const dropzone = document.getElementById('dropzone');
const dropzoneText = document.getElementById('dropzoneText');
const imageInput = document.getElementById('imageInput');
const previewImage = document.getElementById('previewImage');
const resetButton = document.getElementById("resetButton");
const customAspectRatioInput = document.getElementById('customAspectRatio');

// New elements for Bootswatch dropdown (single-image / legacy)
const aspectButtons = document.querySelectorAll('[data-aspect]');
const selectedAspectButton = document.getElementById('selectedAspectRatio');
const customAspectInput = document.getElementById('customAspectRatio');
const aspectDropdownItems = document.querySelectorAll('.dropdown-item[data-value]');

let currentAspectRatio = 'Default'; // Default aspect ratio for single-image mode

// === Multi-image form carousel elements ===
const uploadForm = document.getElementById("uploadForm");
const formsCarouselWrapper = document.getElementById("formsCarouselWrapper");
const formsContainer = document.getElementById("formsContainer");
const formIndexDisplay = document.getElementById("formIndexDisplay");
const prevFormBtn = document.getElementById("prevForm");
const nextFormBtn = document.getElementById("nextForm");
const imageFormTemplate = document.getElementById("imageFormTemplate");

const imageListControls = document.getElementById("imageListControls");
const addMoreImagesBtn = document.getElementById("addMoreImagesBtn");

// Button to add more images
if (addMoreImagesBtn) {
    addMoreImagesBtn.addEventListener("click", () => {
        console.log("Add more images clicked");
        imageInput.click();
    });
}


// State for multi-image mode
let slides = [];          // array of .image-form-slide
let currentSlideIndex = 0;

function setResetButtonVisible(show) {
    if (resetButton) {
        resetButton.style.display = show ? "block" : "none";
    }
}

function hideDropzoneContainer() {
    const dropzoneContainer = document.getElementById("container");
    if (dropzoneContainer) {
        dropzoneContainer.classList.add("d-none");
    }
}

function showDropzoneContainer() {
    const dropzoneContainer = document.getElementById("container");
    if (dropzoneContainer) {
        dropzoneContainer.classList.remove("d-none");
    }
}

// =======================================================
// ===============  MULTI-IMAGE HELPERS  =================
// =======================================================

function handleNewFiles(files) {
    const fileList = Array.from(files || []);
    if (!fileList.length) return;

    if (!imageFormTemplate || !formsContainer || !formsCarouselWrapper) {
        console.log("Multi-image HTML not found, falling back to single-image behavior");
        displayImagePreview(fileList[0]);
        return;
    }

    fileList.forEach(file => {
        if (!file.type.startsWith("image/")) return;
        createSlideForFile(file);
    });

    if (slides.length > 0) {
        console.log(`${fileList.length} image(s) added, total slides: ${slides.length}`);
        currentSlideIndex = slides.length - 1; // jump to last added slide
        updateSlideVisibility();
        setResetButtonVisible(true);

        // NEW: hide the big dropzone container, show controls row
        hideDropzoneContainer();
        if (imageListControls) {
            imageListControls.classList.remove("d-none");
        }
    }
}

// Create one slide per image
function createSlideForFile(file) {
    const clone = imageFormTemplate.content.cloneNode(true);
    const slide = clone.querySelector(".image-form-slide");

    if (!slide) {
        console.error("image-form-slide not found in template");
        return;
    }

    slide._file = file;
    slide._currentAspectRatio = "Default";

    const photoNameInput = slide.querySelector('[data-field="photoName"]');
    if (photoNameInput) {
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        photoNameInput.value = baseName;
    }

    setupAspectRatioForSlide(slide);

    // NEW: remove button behavior
    const removeBtn = slide.querySelector(".removeSlideBtn");
    if (removeBtn) {
        removeBtn.addEventListener("click", () => {
            const idx = slides.indexOf(slide);
            if (idx !== -1) {
                slides.splice(idx, 1);
            }
            slide.remove();

            if (currentSlideIndex >= slides.length) {
                currentSlideIndex = Math.max(0, slides.length - 1);
            }
            updateSlideVisibility();
        });
    }

    const slidePreview = slide.querySelector(".previewImage");
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataURL = e.target.result;

        if (slidePreview) {
            slidePreview.src = dataURL;
            slidePreview.classList.remove("d-none");
            slidePreview.style.display = "block";
        }

        const img = new Image();
        img.onload = () => {
            const width = img.width;
            const height = img.height;
            console.log(`Slide image dimensions: ${width}x${height}`);

            let orientation = 'square';
            if (width > height) orientation = 'landscape';
            else if (height > width) orientation = 'portrait';

            updateAspectRatioOptionsForSlide(slide, orientation);
        };
        img.src = dataURL;
    };
    reader.readAsDataURL(file);

    formsContainer.appendChild(slide);
    slides.push(slide);
}

// Setup dropdown + custom input behavior for a single slide
function setupAspectRatioForSlide(slide) {
    const selectedButton = slide.querySelector(".selectedAspectRatio");
    const customInput = slide.querySelector(".customAspectRatio");
    const menu = slide.querySelector(".aspectRatioMenu");

    slide._currentAspectRatio = "Default";

    if (menu && selectedButton) {
        menu.addEventListener("click", (e) => {
            e.preventDefault();
            const item = e.target.closest(".dropdown-item");
            if (!item) return;

            const value = item.getAttribute("data-value");
            const text = item.textContent;

            if (!value) return;

            if (value === "Custom") {
                customInput.classList.remove("d-none");
                customInput.focus();
            } else {
                selectedButton.textContent = text;
                slide._currentAspectRatio = value;
                if (customInput) {
                    customInput.classList.add("d-none");
                    customInput.value = "";
                    customInput.classList.remove("is-invalid", "is-valid");
                }
            }

            console.log("Slide aspect ratio selected:", slide._currentAspectRatio);
        });
    }

    if (customInput && selectedButton) {
        customInput.addEventListener("input", function () {
            const pattern = /^\d+:\d+$/;
            if (pattern.test(this.value)) {
                this.classList.remove("is-invalid");
                this.classList.add("is-valid");
                selectedButton.textContent = this.value;
                slide._currentAspectRatio = this.value;
                console.log("Slide custom aspect ratio:", this.value);
            } else if (this.value.trim() !== "") {
                this.classList.add("is-invalid");
                this.classList.remove("is-valid");
            } else {
                this.classList.remove("is-invalid", "is-valid");
            }
        });
    }

    // Getter used on submit
    slide.getAspectRatio = () => {
        if (customInput && !customInput.classList.contains("d-none") && customInput.value.trim() !== "") {
            return customInput.value.trim();
        }
        return slide._currentAspectRatio || "Default";
    };
}

// Orientation-specific aspect ratio options for a slide
function updateAspectRatioOptionsForSlide(slide, orientation) {
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

    const dropdownMenu = slide.querySelector(".aspectRatioMenu");
    const selectedButton = slide.querySelector(".selectedAspectRatio");
    const customInput = slide.querySelector(".customAspectRatio");

    if (!dropdownMenu || !selectedButton) return;

    dropdownMenu.innerHTML = "";

    options[orientation].forEach(option => {
        if (option.value === "Custom") {
            const divider = document.createElement("div");
            divider.className = "dropdown-divider";
            dropdownMenu.appendChild(divider);
        }

        const dropdownItem = document.createElement("a");
        dropdownItem.className = "dropdown-item";
        dropdownItem.href = "#";
        dropdownItem.setAttribute("data-value", option.value);
        dropdownItem.textContent = option.label;

        dropdownMenu.appendChild(dropdownItem);
    });

    // Re-wire click (we already have a menu listener, so no extra listeners needed here)

    // Match current value if possible
    let found = false;
    const current = slide._currentAspectRatio || "Default";

    options[orientation].forEach(option => {
        if (option.value === current) {
            selectedButton.textContent = option.label;
            found = true;
        }
    });

    if (!found && current && current !== "Default") {
        selectedButton.textContent = current;
        if (customInput) {
            customInput.value = current;
            customInput.classList.remove("d-none");
            customInput.classList.add("is-valid");
        }
    } else if (!current || current === "Default") {
        selectedButton.textContent = "Default";
        slide._currentAspectRatio = "Default";
        if (customInput) {
            customInput.classList.add("d-none");
            customInput.value = "";
            customInput.classList.remove("is-invalid", "is-valid");
        }
    }
}

// Show one slide at a time
function updateSlideVisibility() {
    if (!formsCarouselWrapper || !formsContainer) return;

    if (slides.length === 0) {
        formsCarouselWrapper.classList.add("d-none");
        if (formIndexDisplay) formIndexDisplay.textContent = "0 / 0";

        // NEW: hide controls, show big dropzone again
        if (imageListControls) {
            imageListControls.classList.add("d-none");
        }
        showDropzoneContainer();

        return;
    }

    formsCarouselWrapper.classList.remove("d-none");
    if (imageListControls) {
        imageListControls.classList.remove("d-none");
    }

    slides.forEach((slide, idx) => {
        if (idx === currentSlideIndex) {
            slide.classList.add("active");
            slide.style.display = "block";
        } else {
            slide.classList.remove("active");
            slide.style.display = "none";
        }
    });

    if (formIndexDisplay) {
        formIndexDisplay.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
    }
}

// Carousel controls
if (prevFormBtn) {
    prevFormBtn.addEventListener("click", () => {
        if (slides.length === 0) return;
        currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
        updateSlideVisibility();
    });
}
if (nextFormBtn) {
    nextFormBtn.addEventListener("click", () => {
        if (slides.length === 0) return;
        currentSlideIndex = (currentSlideIndex + 1) % slides.length;
        updateSlideVisibility();
    });
}

// =======================================================
// ===============  DRAG & DROP / PREVIEW  ===============
// =======================================================

// Drag-and-drop behavior (now supports multiple files)
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
    console.log('File(s) dropped.');
    dropzone.style.backgroundColor = '';
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        handleNewFiles(files);
    }
});

// File input change (multiple)
imageInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
        handleNewFiles(files);
    }
});

// Single-image preview helper (kept for backward compatibility)
function displayImagePreview(file) {
    console.log(`Attempting to preview file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = (e) => {
        console.log('FileReader loaded file successfully.');
        if (previewImage) {
            previewImage.src = e.target.result;
            previewImage.classList.remove('d-none');
            previewImage.style.display = "block"; 
        }
        hideDropzoneContainer();
        if (dropzoneText) {
            dropzoneText.textContent = file.name;
        }
        console.log("Successfully uploaded the file");
        setResetButtonVisible(true);
    };
    reader.onerror = (e) => {
        console.error('Error reading file:', e);
    };
    reader.readAsDataURL(file);
}

// Reset dropzone + carousel
function resetDropzone() {
    // Reset the text, image preview, and hide the reset button
    if (dropzoneText) {
        dropzoneText.textContent = "Drag and drop an image here or click to upload";
    }
    if (previewImage) {
        previewImage.style.display = "none";
        previewImage.src = "";
    }
    setResetButtonVisible(false);

    // Clear the file input value
    imageInput.value = "";
    console.log("Dropzone reset successfully.");

    // Clear multi-image state
    if (formsContainer) {
        formsContainer.innerHTML = "";
    }
    slides = [];
    currentSlideIndex = 0;
    updateSlideVisibility();

    showDropzoneContainer();
    if (imageListControls) {
        imageListControls.classList.add("d-none");
    }
}

if (resetButton) {
    resetButton.addEventListener("click", () => {
        resetDropzone();

        console.log("Reset button clicked");

        // Reset aspect ratio dropdown (single-image legacy)
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

// =======================================================
// ========  SINGLE-IMAGE ASPECT RATIO (LEGACY)  =========
// =======================================================

// Initialize aspect ratio dropdown
document.addEventListener('DOMContentLoaded', function () {
    if (selectedAspectButton && customAspectInput) {
        setupAspectRatioDropdown();
    }
});

function setupAspectRatioDropdown() {
    if (!selectedAspectButton || !customAspectInput) {
        console.warn("Aspect ratio dropdown elements not found (single-image mode)");
        return;
    }

    customAspectInput.addEventListener('input', function () {
        const pattern = /^\d+:\d+$/;
        if (pattern.test(this.value)) {
            this.classList.remove('is-invalid');
            this.classList.add('is-valid');
            selectedAspectButton.textContent = this.value;
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

// Aspect ratio buttons (old style - keeping for compatibility)
if (aspectButtons.length > 0) {
    aspectButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log("Aspect button clicked:", btn.dataset.aspect);
            if (selectedAspectButton) {
                currentAspectRatio = btn.dataset.aspect;
                selectedAspectButton.textContent = btn.textContent;
                if (customAspectInput) {
                    customAspectInput.classList.add('d-none');
                }
            }
            // drawPreview() was referenced previously; keep or remove as needed
            if (typeof drawPreview === "function") {
                drawPreview();
            }
        });
    });
}

// =======================================================
// ================  FORM SUBMISSION  ====================
// =======================================================

// Helper: single-image submit (original behavior)
async function submitSingleImageForm(formElem) {
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingScreen) loadingScreen.style.display = "flex";

    const formData = new FormData(formElem);

    formData.append("aspectRatio", currentAspectRatio);
    if (currentAspectRatio === 'Custom' || (/^\d+:\d+$/.test(currentAspectRatio) && customAspectInput && !customAspectInput.classList.contains('d-none'))) {
        const customValue = customAspectInput && customAspectInput.value ? customAspectInput.value : currentAspectRatio;
        formData.append("customAspectRatio", customValue);
    }

    for (let pair of formData.entries()) {
        console.log(`${pair[0]}: ${pair[1]}`);
    }

    try {
        const response = await fetch("/process-image", {
            method: "POST",
            body: formData,
        });

        if (response.ok) {
            // Let Flask serve the results page directly
            window.location.href = "/results";
        } else {
            const error = await response.json();
            alert(`Error: ${error.error}`);
            if (loadingScreen) loadingScreen.style.display = "none";
        }
    } catch (error) {
        console.error("Error:", error);
        alert("An unexpected error occurred.");
        if (loadingScreen) loadingScreen.style.display = "none";
    }
}

// Helper: multi-image submit (new behavior)
async function submitMultiImageForm(formElem) {
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingScreen) loadingScreen.style.display = "flex";

    const formData = new FormData();

    // Preserve any non per-image fields (e.g., CSRF)
    const baseFormData = new FormData(formElem);
    baseFormData.forEach((value, key) => {
        if (/^(image|images|address|latitude|longitude|photoName|aspectRatio|customAspectRatio)(\[|\b)/.test(key)) {
            return;
        }
        formData.append(key, value);
    });

    slides.forEach((slide, idx) => {
        const file = slide._file;
        if (file) {
            formData.append("images", file, file.name);
        }

        const address = slide.querySelector('[data-field="address"]')?.value || "";
        const latitude = slide.querySelector('[data-field="latitude"]')?.value || "";
        const longitude = slide.querySelector('[data-field="longitude"]')?.value || "";
        const photoName = slide.querySelector('[data-field="photoName"]')?.value || "";
        const aspectRatio = slide.getAspectRatio ? slide.getAspectRatio() : "Default";

        formData.append(`address[${idx}]`, address);
        formData.append(`latitude[${idx}]`, latitude);
        formData.append(`longitude[${idx}]`, longitude);
        formData.append(`photoName[${idx}]`, photoName);
        formData.append(`aspectRatio[${idx}]`, aspectRatio);
    });

    // Debug log
    for (let pair of formData.entries()) {
        console.log(`${pair[0]}: ${pair[1]}`);
    }

    try {
        // Adjust the URL and response handling to match your multi-image API
        const response = await fetch("/process-images", {
            method: "POST",
            body: formData,
        });

        if (response.ok) {
            // Let Flask serve the results page directly
            window.location.href = "/results";
        } else {
            const error = await response.json();
            alert(`Error: ${error.error || "Unknown error"}`);
            if (loadingScreen) loadingScreen.style.display = "none";
        }
    } catch (error) {
        console.error("Error:", error);
        alert("An unexpected error occurred.");
        if (loadingScreen) loadingScreen.style.display = "none";
    }
}

// Unified submit handler
if (uploadForm) {
    uploadForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        // If we have slide state and multi HTML, use multi-image path
        if (slides.length > 0 && imageFormTemplate && formsContainer && formsCarouselWrapper) {
            await submitMultiImageForm(this);
        } else {
            await submitSingleImageForm(this);
        }
    });
}

// Handle the reset all button (Just do a full reload)
const resetAllBtn = document.getElementById("resetAllBtn");
if (resetAllBtn) {
    resetAllBtn.addEventListener("click", function () {
        console.log("Reset all button clicked. Reloading the page.");
        location.reload();
    });
}

// Handle the back button to return to the upload form
const backButton = document.getElementById("backButton");
if (backButton) {
    backButton.addEventListener("click", function () {
        document.getElementById("uploadSection").style.display = "block";
        document.getElementById("resultSection").style.display = "none";
        document.getElementById("transformedImage").src = "";
    });
}

// =======================================================
// ===== Original updateAspectRatioOptions (single) ======
// (Kept as-is for backward compatibility elsewhere)
// =======================================================

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

    const dropdownMenu = document.querySelector('.dropdown-menu');
    if (!dropdownMenu) {
        console.error('Dropdown menu not found');
        return;
    }

    dropdownMenu.innerHTML = '';

    options[orientation].forEach(option => {
        if (option.value === 'Custom') {
            const divider = document.createElement('div');
            divider.className = 'dropdown-divider';
            dropdownMenu.appendChild(divider);
        }

        const dropdownItem = document.createElement('a');
        dropdownItem.className = 'dropdown-item';
        dropdownItem.href = '#';
        dropdownItem.setAttribute('data-value', option.value);
        dropdownItem.textContent = option.label;

        dropdownItem.addEventListener('click', function (e) {
            e.preventDefault();
            const value = this.getAttribute('data-value');
            const text = this.textContent;

            if (selectedAspectButton) selectedAspectButton.textContent = text;
            currentAspectRatio = value;

            if (customAspectInput) {
                if (value === 'Custom') {
                    customAspectInput.classList.remove('d-none');
                    customAspectInput.focus();
                } else {
                    customAspectInput.classList.add('d-none');
                    customAspectInput.classList.remove('is-invalid', 'is-valid');
                }
            }

            console.log("Aspect ratio selected:", value);
        });

        dropdownMenu.appendChild(dropdownItem);
    });

    let found = false;
    options[orientation].forEach(option => {
        if (option.value === currentAspectRatio && selectedAspectButton) {
            selectedAspectButton.textContent = option.label;
            found = true;
        }
    });

    if (!found && currentAspectRatio && currentAspectRatio !== 'Default') {
        if (selectedAspectButton) selectedAspectButton.textContent = currentAspectRatio;
        if (customAspectInput) {
            customAspectInput.value = currentAspectRatio;
            customAspectInput.classList.remove('d-none');
            customAspectInput.classList.add('is-valid');
        }
    } else if (!currentAspectRatio || currentAspectRatio === 'Default') {
        if (selectedAspectButton) selectedAspectButton.textContent = 'Default';
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

    window.aspectDropdownItems = dropdownMenu.querySelectorAll('.dropdown-item[data-value]');
    console.log(`Aspect ratio options updated for ${orientation} orientation.`);
}
