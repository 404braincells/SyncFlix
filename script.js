
const fileInput = document.getElementById("video-file");
const dropzone = document.querySelector(".upload-dropzone");
const uploadTitle = document.getElementById("upload-title");
const uploadDescription = document.getElementById("upload-description");
const roomNameInput = document.getElementById("room-name");
const createRoomForm = document.getElementById("create-room-form");
const formNote = document.getElementById("form-note");

const MAX_FILE_SIZE = 500 * 1024 * 1024;

let selectedVideo = null;
let previewUrl = null;

// Display file sizes in a readable format.
function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Show a message below the form.
function showMessage(message, isError = false) {
    formNote.textContent = message;
    formNote.style.color = isError ? "#e65b72" : "#a09da7";
}

// Validate a selected MP4.
function validateVideo(file) {
    if (!file) {
        showMessage("Please choose a video first.", true);
        return false;
    }

    const isMp4 =
        file.name.toLowerCase().endsWith(".mp4") &&
        (file.type === "video/mp4" || file.type === "");

    if (!isMp4) {
        showMessage("Please select an MP4 video.", true);
        return false;
    }

    if (file.size === 0) {
        showMessage("This file is empty. Choose another video.", true);
        return false;
    }

    if (file.size > MAX_FILE_SIZE) {
        showMessage("The video exceeds the 500 MB prototype limit.", true);
        return false;
    }

    return true;
}

// Update the upload area after a file is selected.
function handleVideoSelection(file) {
    if (!validateVideo(file)) {
        selectedVideo = null;
        fileInput.value = "";
        uploadTitle.textContent = "Choose a video file";
        uploadDescription.textContent =
            "Click here to browse your device";
        return;
    }

    selectedVideo = file;

    uploadTitle.textContent = file.name;
    uploadDescription.textContent = formatFileSize(file.size);

    showMessage(
        "Video selected. Create a room to preview it on this device."
    );
}

// File picker.
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];

    if (file) {
        handleVideoSelection(file);
    }
});

// Drag-and-drop support.
dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
});

dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-dragging");
});

dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");

    const file = event.dataTransfer.files[0];

    if (!file) {
        return;
    }

    handleVideoSelection(file);
});

// Release the previous preview URL when changing videos.
function releasePreviewUrl() {
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }
}

// Create a local video preview.
function showLocalRoom(file, roomName) {
    releasePreviewUrl();
    previewUrl = URL.createObjectURL(file);

    let room = document.getElementById("local-room");

    if (!room) {
        room = document.createElement("section");
        room.id = "local-room";
        room.className = "local-room";
        room.setAttribute("aria-live", "polite");

        document.getElementById("create-room").after(room);
    }

    room.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = roomName;

    const description = document.createElement("p");
    description.textContent =
        "Local preview · This room is not online or shareable yet.";

    description.style.color = "#a09da7";
    description.style.margin = "8px 0 20px";

    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.src = previewUrl;
    video.style.display = "block";
    video.style.width = "100%";
    video.style.maxWidth = "900px";
    video.style.maxHeight = "70vh";
    video.style.background = "#000";
    video.style.borderRadius = "6px";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close preview";
    closeButton.style.marginTop = "16px";
    closeButton.style.padding = "10px 14px";
    closeButton.style.background = "#202027";
    closeButton.style.color = "#f1f0f3";
    closeButton.style.border = "1px solid #303039";
    closeButton.style.borderRadius = "5px";

    closeButton.addEventListener("click", () => {
        video.pause();
        video.removeAttribute("src");
        video.load();

        releasePreviewUrl();
        room.remove();
    });

    room.append(heading, description, video, closeButton);

    room.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    showMessage(
        "Local preview opened. Uploading and online rooms are not implemented yet."
    );
}

// Handle room creation.
createRoomForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!selectedVideo || !validateVideo(selectedVideo)) {
        showMessage("Choose a valid MP4 before creating a room.", true);
        return;
    }

    const roomName =
        roomNameInput.value.trim() || "Movie night";

    showLocalRoom(selectedVideo, roomName);
});

// Release memory when leaving the page.
window.addEventListener("beforeunload", releasePreviewUrl);
