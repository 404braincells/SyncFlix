
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get("/health", (req, res) => {
    res.json({ status: "Syncflix backend is running" });
});

// Room data stays in memory for now.
const rooms = new Map();

function getParticipants(room) {
    return [...room.members.entries()].map(([id, user]) => ({
        id,
        username: user.username,
        emoji: user.emoji,
        isHost: id === room.hostId
    }));
}

function broadcastParticipants(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    io.to(roomId).emit("participants", getParticipants(room));
}

function leaveCurrentRoom(socket) {
    for (const [roomId, room] of rooms) {
        if (!room.members.has(socket.id)) continue;

        const user = room.members.get(socket.id);
        room.members.delete(socket.id);
        socket.leave(roomId);

        // Transfer host privileges if the host leaves.
        if (room.hostId === socket.id && room.members.size > 0) {
            room.hostId = room.members.keys().next().value;
        }

        if (room.members.size === 0) {
            rooms.delete(roomId);
        } else {
            broadcastParticipants(roomId);
            io.to(roomId).emit(
                "system-message",
                `${user.username} left the room.`
            );

            io.to(roomId).emit("room-state", {
                roomId,
                name: room.name,
                videoId: room.videoId,
                hostId: room.hostId
            });
        }
    }
}

io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    socket.on("join-room", (data = {}) => {
        const { roomId, username, roomName, videoId, create, emoji } = data;

        if (
            typeof roomId !== "string" ||
            !/^[a-zA-Z0-9_-]{8}$/.test(roomId)
        ) {
            socket.emit("error-message", "Invalid room code.");
            return;
        }

        const name =
            typeof username === "string" && username.trim()
                ? username.trim().slice(0, 24)
                : "Guest";

        // Leave the previous room if switching rooms.
        leaveCurrentRoom(socket);

        let room = rooms.get(roomId);

        if (!room) {
            // A new room must include its initial video.
            if (!create || typeof videoId !== "string" ||
                !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                socket.emit(
                    "error-message",
                    "Room not found. Ask the host to create it again."
                );
                return;
            }

            room = {
                name: typeof roomName === "string" && roomName.trim()
                    ? roomName.trim().slice(0, 60)
                    : "Movie night",
                videoId,
                hostId: socket.id,
                members: new Map()
            };

            rooms.set(roomId, room);
        }

        room.members.set(socket.id, {
            username: name,
            emoji: typeof emoji === "string" ? emoji.slice(0, 8) : "🍿"
        });

        socket.join(roomId);

        // Send the actual room details to this participant.
        socket.emit("room-state", {
            roomId,
            name: room.name,
            videoId: room.videoId,
            hostId: room.hostId
        });

        socket.emit("joined-room", { roomId, username: name });

        broadcastParticipants(roomId);
        io.to(roomId).emit("system-message", `${name} joined the room.`);

        console.log(`${name} joined room ${roomId}`);
    });

    socket.on("chat-message", (message) => {
        const roomEntry = [...rooms.entries()].find(
            ([, room]) => room.members.has(socket.id)
        );

        if (!roomEntry || typeof message !== "string") return;

        const [roomId, room] = roomEntry;
        const text = message.trim().slice(0, 500);

        if (!text) return;

        io.to(roomId).emit("chat-message", {
            username: room.members.get(socket.id).username,
            message: text
        });
    });

    socket.on("disconnect", () => {
        leaveCurrentRoom(socket);
        console.log("Disconnected:", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Syncflix running at http://localhost:${PORT}`);
});
