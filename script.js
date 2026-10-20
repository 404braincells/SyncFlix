
"use strict";

// ========================================
// Syncflix — YouTube watch-party prototype
// ========================================

const $ = (selector) => document.querySelector(selector);

const createRoomForm = $("#create-room-form");
const roomNameInput = $("#room-name");
const youtubeLinkInput = $("#youtube-link");
const formNote = $("#form-note");

const roomCodeInput = $("#room-code");
const joinRoomButton = $("#join-room-button");
const joinNote = $("#join-note");

const watchRoom = $("#watch-room");
const watchRoomName = $("#watch-room-name");
const watchRoomStatus = $("#watch-room-status");
const copyRoomLinkButton = $("#copy-room-link");

const videoContainer = $("#video-container");
const videoPlaceholder = $("#video-placeholder");
const videoTitle = $("#video-title");
const syncStatus = $("#sync-status");

const participantCount = $("#participant-count");
const participants = $("#participants");
const visibleRoomCode = $("#visible-room-code");
const copyRoomCodeButton = $("#copy-room-code");
const chatForm = $("#chat-form");
const chatInput = $("#chat-input");
const chatMessages = $("#chat-messages");
const emptyChat = $("#empty-chat");

const socket = io();


let currentRoom = null;
let player = null;
let isApplyingRemotePlayback = false;
let lastPlaybackUpdate = 0;
let displayName = sessionStorage.getItem("syncflix-name");

const welcomeModal = $("#welcome-modal");
const welcomeForm = $("#welcome-form");
const displayNameInput = $("#display-name");
const welcomeEmoji = $("#welcome-emoji");


let selectedEmoji = sessionStorage.getItem("syncflix-emoji") || "🍿";
let isCreatingRoom = false;
let hostPlayback = {
    currentTime: 0,
    playing: false
};

if (displayName) {
    welcomeModal.hidden = true;
    displayNameInput.value = displayName;
} else {
    welcomeModal.hidden = false;
}

welcomeEmoji.textContent = selectedEmoji;

document.querySelectorAll(".avatar-option").forEach((button) => {
    button.classList.toggle(
        "selected",
        button.dataset.emoji === selectedEmoji
    );

    button.addEventListener("click", () => {
        selectedEmoji = button.dataset.emoji;
        welcomeEmoji.textContent = selectedEmoji;

        document.querySelectorAll(".avatar-option").forEach((option) => {
            option.classList.toggle("selected", option === button);
        });
    });
});

welcomeForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = displayNameInput.value.trim().slice(0, 24);

    if (!name) {
        displayNameInput.focus();
        return;
    }

    displayName = name;
    sessionStorage.setItem("syncflix-name", displayName);
    sessionStorage.setItem("syncflix-emoji", selectedEmoji);

    welcomeModal.hidden = true;
});

// ----------------------------------------
// Helpers
// ----------------------------------------

function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.style.color = isError ? "#f0647d" : "";
}

function createRoomId() {
    // Generate a short room identifier.
    return crypto.randomUUID().replaceAll("-", "").slice(0, 8);
}

function getRoomUrl(roomId) {
    const url = new URL(window.location.href);
    url.hash = `room=${encodeURIComponent(roomId)}`;
    return url.toString();
}

// Accept standard YouTube watch, short, embed and shorts URLs.
function getYouTubeVideoId(rawUrl) {
    let url;

    try {
        url = new URL(rawUrl.trim());
    } catch {
        return null;
    }

    if (!["https:", "http:"].includes(url.protocol)) {
        return null;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    let videoId = null;

    if (host === "youtu.be") {
        videoId = url.pathname.split("/").filter(Boolean)[0];
    } else if (
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com" ||
        host === "youtube-nocookie.com"
    ) {
        if (url.pathname === "/watch") {
            videoId = url.searchParams.get("v");
        } else {
            const match = url.pathname.match(
                /^\/(?:embed|shorts|live)\/([^/?]+)/
            );

            if (match) {
                videoId = match[1];
            }
        }
    }

    // YouTube video IDs are normally 11 characters.
    return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)
        ? videoId
        : null;
}

function getRoomIdFromInput(value) {
    const input = value.trim();

    if (!input) {
        return null;
    }

    // Accept a complete invite URL.
    try {
        const url = new URL(input);

        if (url.hash.startsWith("#room=")) {
            const id = url.hash.slice("#room=".length);

            return /^[a-zA-Z0-9_-]{8}$/.test(id)
                ? id
                : null;
        }
    } catch {
        // It may be a room code instead of a URL.
    }

    // Accept a raw room code.
    return /^[a-zA-Z0-9_-]{8}$/.test(input)
        ? input
        : null;
}

// ----------------------------------------
// YouTube player
// ----------------------------------------


function renderVideo(videoId) {
    if (player && typeof player.destroy === "function") {
        player.destroy();
        player = null;
    }

    videoContainer.replaceChildren();

    const playerElement = document.createElement("div");
    playerElement.id = "youtube-player";
    videoContainer.appendChild(playerElement);

    function createPlayer() {
        player = new YT.Player("youtube-player", {
            width: "100%",
            height: "100%",
            videoId: videoId,
            playerVars: {
                playsinline: 1,
                rel: 0
            },
            events: {
                onReady: () => {
                    videoTitle.textContent = "YouTube video";
                    syncStatus.textContent = "Player ready";
                },
      
                onStateChange: (event) => {
                    if (isApplyingRemotePlayback || !currentRoom) return;

                    // Only the host publishes playback changes.
                    if (socket.id !== currentRoom.hostId) {
    if (
        event.data === YT.PlayerState.PLAYING &&
        !hostPlayback.playing
    ) {
        syncStatus.textContent =
            "⏸ The host has paused the video. Please wait.";

        isApplyingRemotePlayback = true;
        player.pauseVideo();

        window.setTimeout(() => {
            isApplyingRemotePlayback = false;
        }, 700);
    }

    return;
}

                    if (
                        event.data === YT.PlayerState.PLAYING ||
                        event.data === YT.PlayerState.PAUSED
                    ) {
                        socket.emit("playback-update", {
                            currentTime: player.getCurrentTime(),
                            playing: event.data === YT.PlayerState.PLAYING
                        });
                    }
                },

                onError: (event) => {
                    console.error("YouTube player error:", event.data);
                    syncStatus.textContent = "Unable to load video";
                }

        } 
    });
}

    if (window.YT && window.YT.Player) {
        createPlayer();
    } else {
        window.onYouTubeIframeAPIReady = createPlayer;
    }
}

// ----------------------------------------
// Room interface
// ----------------------------------------

function openRoom({ roomId, name, videoId, create = false }) {
    isCreatingRoom = create;
    currentRoom = {
        id: roomId,
        name,
        videoId,
        hostId: null
    };

    watchRoomName.textContent = name;
    watchRoomStatus.textContent = "Room ready";
    participantCount.textContent = "Just you for now";
    visibleRoomCode.textContent = roomId;
    participants.replaceChildren();

    const participant = document.createElement("div");
    participant.className = "participant";

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = selectedEmoji;

    const nameLabel = document.createElement("span");
    nameLabel.textContent = displayName;

    const hostLabel = document.createElement("span");
    hostLabel.className = "host-label";
    hostLabel.textContent = "HOST";

    participant.append(avatar, nameLabel, hostLabel);
    participants.appendChild(participant);

    chatMessages.replaceChildren();
    chatMessages.appendChild(emptyChat);
    emptyChat.hidden = false;

    if (videoId) {
        renderVideo(videoId);
    } else {
        videoContainer.replaceChildren();
        videoPlaceholder.hidden = false;
        videoContainer.appendChild(videoPlaceholder);
        videoTitle.textContent = "No video selected";
        syncStatus.textContent = "Waiting for video";
    }

    watchRoom.hidden = false;
    watchRoom.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    // Reflect the room in the URL.
    history.replaceState(null, "", getRoomUrl(roomId));

    socket.emit("join-room", {
    roomId,
    username: displayName,
    emoji: selectedEmoji,
    roomName: name,
    videoId,
    create: isCreatingRoom
});
}

// ----------------------------------------
// Create room
// ----------------------------------------

createRoomForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const videoId = getYouTubeVideoId(youtubeLinkInput.value);

    if (!videoId) {
        showMessage(
            formNote,
            "Enter a valid YouTube video link.",
            true
        );
        youtubeLinkInput.focus();
        return;
    }

    const roomId = createRoomId();
    const name = roomNameInput.value.trim() || "Movie night";

    openRoom({
    roomId,
    name,
    videoId,
    create: true
    });

    showMessage(
        formNote,
        "Room created on this device. Online sharing needs a backend."
    );
});

// ----------------------------------------
// Join room
// ----------------------------------------

joinRoomButton.addEventListener("click", () => {
    const roomId = getRoomIdFromInput(roomCodeInput.value);

    if (!roomId) {
        showMessage(
            joinNote,
            "Enter a valid 8-character room code or invite link.",
            true
        );
        return;
    }

    // The frontend cannot retrieve another user's room data.
    // This only opens the room interface for the supplied ID.
    openRoom({
        roomId,
        name: "Watch party",
        videoId: null,
        create: false
    });

    showMessage(joinNote, "Connecting to room...");
});

// Allow Enter to join.
roomCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        joinRoomButton.click();
    }
});

// ----------------------------------------
// Copy invite link
// ----------------------------------------

copyRoomLinkButton.addEventListener("click", async () => {
    if (!currentRoom) {
        return;
    }

    const inviteUrl = getRoomUrl(currentRoom.id);

    try {
        await navigator.clipboard.writeText(inviteUrl);

        copyRoomLinkButton.textContent = "Link copied ✓";
    } catch {
        // Clipboard API can require HTTPS or localhost.
        window.prompt("Copy this invite link:", inviteUrl);
    }

    window.setTimeout(() => {
        copyRoomLinkButton.textContent = "Copy invite link";
    }, 1800);
});

// ----------------------------------------
// Basic local chat
// ----------------------------------------


function addChatMessage(username, message, isSystem = false) {
    if (emptyChat.isConnected) {
        emptyChat.remove();
    }

    const messageElement = document.createElement("div");
    messageElement.className = "chat-message";

    const header = document.createElement("div");
    header.className = "chat-message-header";

    const sender = document.createElement("span");
    sender.className = "chat-message-name";
    sender.textContent = username;

    const time = document.createElement("span");
    time.className = "chat-message-time";
    time.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    const text = document.createElement("p");
    text.className = "chat-message-text";
    text.textContent = message;

    if (isSystem) {
        text.style.fontStyle = "italic";
    }

    header.append(sender, time);
    messageElement.append(header, text);
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const message = chatInput.value.trim();

    if (!message || !currentRoom) return;

    socket.emit("chat-message", message);

    chatInput.value = "";
    chatInput.focus();
});

socket.on("chat-message", ({ username, message }) => {
    addChatMessage(username, message);
});

socket.on("system-message", (message) => {
    addChatMessage("System", message, true);
});

socket.on("participants", (members) => {
    if (!Array.isArray(members)) return;

    participantCount.textContent =
        `${members.length} participant${members.length === 1 ? "" : "s"} online`;

    participants.replaceChildren();

    members.forEach((member) => {
        const participant = document.createElement("div");
        participant.className = "participant";

        const avatar = document.createElement("span");
        avatar.className = "avatar";
        avatar.textContent = member.emoji || "🍿";

        const name = document.createElement("span");
        name.textContent = member.username;

        participant.append(avatar, name);

        if (member.isHost) {
            const hostLabel = document.createElement("span");
            hostLabel.className = "host-label";
            hostLabel.textContent = "HOST";
            participant.appendChild(hostLabel);
        }

        participants.appendChild(participant);
    });
});

socket.on("joined-room", ({ roomId }) => {
    if (currentRoom?.id === roomId) {
        watchRoomStatus.textContent = "Connected";
    }
});

socket.on("error-message", (message) => {
    watchRoomStatus.textContent = message;
});
copyRoomCodeButton.addEventListener("click", async () => {
    if (!currentRoom) return;

    try {
        await navigator.clipboard.writeText(currentRoom.id);
        copyRoomCodeButton.textContent = "Copied!";

        setTimeout(() => {
            copyRoomCodeButton.textContent = "Copy code";
        }, 1500);
    } catch {
        window.prompt("Copy your room code:", currentRoom.id);
    }
});
// ----------------------------------------
// Reopen a room URL
// ----------------------------------------

function restoreRoomFromUrl() {
    const hash = window.location.hash;

    if (!hash.startsWith("#room=")) {
        return;
    }

    const roomId = hash.slice("#room=".length);

    if (!/^[a-zA-Z0-9_-]{8}$/.test(roomId)) {
        return;
    }

    // Room details aren't persisted or shared yet.
    openRoom({
        roomId,
        name: "Watch party",
        videoId: null
    });
}

restoreRoomFromUrl();

socket.on("room-state", ({ roomId, name, videoId, hostId }) => {
    if (!currentRoom || currentRoom.id !== roomId) return;

    currentRoom.name = name;
    currentRoom.videoId = videoId;
    currentRoom.hostId = hostId;

    watchRoomName.textContent = name;
    visibleRoomCode.textContent = roomId;

    if (videoId && currentRoom.videoId !== videoId) {
        renderVideo(videoId);
    } else if (videoId && videoTitle.textContent !== "YouTube video") {
        renderVideo(videoId);
    }
});
socket.on("playback-update", (data) => {
    if (!player || !currentRoom) return;
    if (socket.id === currentRoom.hostId) return;

    hostPlayback = data;

    isApplyingRemotePlayback = true;

    const currentTime = player.getCurrentTime();

    if (Math.abs(currentTime - data.currentTime) > 1.5) {
        player.seekTo(data.currentTime, true);
    }

    if (data.playing) {
        player.playVideo();
        syncStatus.textContent = "Playing with host";
    } else {
        player.pauseVideo();
        syncStatus.textContent = "⏸ Host paused — please wait";
    }

    window.setTimeout(() => {
        isApplyingRemotePlayback = false;
    }, 700);
});


window.setInterval(() => {
    if (!player || !currentRoom || !currentRoom.hostId) return;
    if (socket.id === currentRoom.hostId) return;
    if (!hostPlayback || hostPlayback.playing) return;

    const state = player.getPlayerState();

    if (state === YT.PlayerState.PLAYING ||
        state === YT.PlayerState.BUFFERING) {
        isApplyingRemotePlayback = true;
        player.pauseVideo();

        syncStatus.textContent =
            "⏸ The host has paused. Please wait for them to resume.";

        window.setTimeout(() => {
            isApplyingRemotePlayback = false;
        }, 300);
    }
}, 300);
// Keep viewers updated with the host's current position.
window.setInterval(() => {
    if (!player || !currentRoom) return;
    if (socket.id !== currentRoom.hostId) return;

    const state = player.getPlayerState();

    if (
        state !== YT.PlayerState.PLAYING &&
        state !== YT.PlayerState.PAUSED
    ) {
        return;
    }

    socket.emit("playback-update", {
        currentTime: player.getCurrentTime(),
        playing: state === YT.PlayerState.PLAYING
    });
}, 1000);