const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {}; // Store room states

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create Room
    socket.on('create-room', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = {
            players: [{ id: socket.id, name: playerName, symbol: 'X' }],
            board: Array(9).fill(null),
            turn: 'X',
            status: 'waiting'
        };
        socket.join(roomId);
        socket.emit('room-created', { roomId, symbol: 'X' });
    });

    // Join Room
    socket.on('join-room', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (!room) {
            return socket.emit('error-msg', 'Room not found. Check Room ID.');
        }
        if (room.players.length >= 2) {
            return socket.emit('error-msg', 'Room is already full.');
        }

        room.players.push({ id: socket.id, name: playerName, symbol: 'O' });
        room.status = 'playing';
        socket.join(roomId);

        io.to(roomId).emit('game-start', {
            players: room.players,
            board: room.board,
            turn: room.turn
        });
    });

    // Make Game Move
    socket.on('make-move', ({ roomId, index, symbol }) => {
        const room = rooms[roomId];
        if (!room || room.status !== 'playing') return;
        if (room.board[index] !== null) return;
        if (room.turn !== symbol) return;

        room.board[index] = symbol;
        room.turn = symbol === 'X' ? 'O' : 'X';

        const winner = checkWinner(room.board);
        io.to(roomId).emit('update-game', {
            board: room.board,
            turn: room.turn,
            winner: winner,
            winningCombo: getWinningCombo(room.board)
        });
    });

    // Send Chat Message
    socket.on('send-message', ({ roomId, message, sender }) => {
        io.to(roomId).emit('receive-message', {
            message,
            sender,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // Restart Game
    socket.on('restart-game', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        room.board = Array(9).fill(null);
        room.turn = 'X';
        room.status = 'playing';
        io.to(roomId).emit('game-start', {
            players: room.players,
            board: room.board,
            turn: room.turn
        });
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('player-left');
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

function checkWinner(board) {
    const wins = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    for (let w of wins) {
        const [a, b, c] = w;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    if (board.every(cell => cell !== null)) return 'draw';
    return null;
}

function getWinningCombo(board) {
    const wins = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    for (let w of wins) {
        const [a, b, c] = w;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return w;
        }
    }
    return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
