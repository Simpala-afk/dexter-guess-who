const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Список из 20 персонажей сериала «Декстер»
const DEXTER_CHARACTERS = [
  "Декстер Морган",
  "Дебра Морган",
  "Гарри Морган",
  "Джеймс Доакс",
  "Анхель Батиста",
  "Винс Масука",
  "Мария ЛаГуэрта",
  "Джоуи Куинн",
  "Рита Беннетт",
  "Артур Митчелл (Троица)",
  "Брайан Мозер",
  "Ханна МакКей",
  "Лайла Турней",
  "Мигель Прадо",
  "Фрэнк Лэнди",
  "Томас Мэттьюс",
  "Джордан Чейз",
  "Исаак Сирко",
  "Эвелин Вогель",
  "Люмен Пирс"
];

// Хранилище всех активных комнат
const rooms = {};

// Генератор гарантированно уникального 5-значного кода комнаты
function generateUniqueCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]);
  return code;
}

io.on('connection', (socket) => {
  // Создание комнаты
  socket.on('createRoom', ({ playerName }) => {
    const code = generateUniqueCode();
    rooms[code] = {
      code,
      state: 'lobby', // 'lobby' | 'selecting' | 'playing'
      players: [{
        id: socket.id,
        name: playerName.trim() || 'Игрок 1',
        secretChar: null
      }],
      turn: null,        // ID игрока, чья очередь задавать вопрос
      turnPhase: 'ask',  // 'ask' (ожидание вопроса) | 'answer' (ожидание ответа)
      guessedThisTurn: false
    };

    socket.join(code);
    socket.roomCode = code;
    io.to(code).emit('roomState', rooms[code]);
  });

  // Присоединение к комнате
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const code = (roomCode || '').trim().toUpperCase();
    const room = rooms[code];

    if (!room) {
      socket.emit('errorMsg', 'Комната с таким кодом не найдена.');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('errorMsg', 'В этой комнате уже есть 2 игрока.');
      return;
    }
    if (room.state !== 'lobby') {
      socket.emit('errorMsg', 'Игра в этой комнате уже идёт.');
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName.trim() || 'Игрок 2',
      secretChar: null
    });

    socket.join(code);
    socket.roomCode = code;
    io.to(code).emit('roomState', room);
  });

  // Нажатие на кнопку «Начать игру» в комнате
  socket.on('startGame', () => {
    const room = rooms[socket.roomCode];
    if (!room || room.players.length < 2) return;

    room.state = 'selecting';
    room.players.forEach(p => p.secretChar = null);

    io.to(room.code).emit('startCharacterSelection', {
      characters: DEXTER_CHARACTERS
    });
  });

  // Подтверждение выбора своего персонажа
  socket.on('confirmCharacter', ({ character }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'selecting') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.secretChar = character;

    // Проверяем, выбрали ли оба игрока
    const bothSelected = room.players.every(p => p.secretChar !== null);

    if (!bothSelected) {
      // Сообщаем выбравшему игроку, что нужно подождать друга
      socket.emit('waitingForFriend');
    } else {
      // Оба выбрали -> запускаем игру и случайно определяем первого спрашивающего
      room.state = 'playing';
      const randomIndex = Math.floor(Math.random() * 2);
      room.turn = room.players[randomIndex].id;
      room.turnPhase = 'ask';
      room.guessedThisTurn = false;

      room.players.forEach(p => {
        io.to(p.id).emit('gameStarted', {
          mySecret: p.secretChar,
          characters: DEXTER_CHARACTERS,
          turn: room.turn,
          turnPhase: room.turnPhase,
          players: room.players.map(pl => ({ id: pl.id, name: pl.name }))
        });
      });

      const firstPlayer = room.players[randomIndex];
      io.to(room.code).emit('chatMessage', {
        type: 'system',
        text: `Игра началась! Первым задаёт вопрос: ${firstPlayer.name}.`
      });
    }
  });

  // Отправка вопроса в чат
  socket.on('askQuestion', ({ text }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'playing') return;

    if (room.turn !== socket.id || room.turnPhase !== 'ask') {
      socket.emit('errorMsg', 'Сейчас не ваша очередь задавать вопрос!');
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    room.turnPhase = 'answer';

    io.to(room.code).emit('chatMessage', {
      type: 'question',
      sender: player.name,
      senderId: player.id,
      text: text.trim()
    });

    io.to(room.code).emit('turnUpdate', {
      turn: room.turn,
      turnPhase: room.turnPhase
    });
  });

  // Ответ на вопрос друга («Да» / «Нет» / свой текст)
  socket.on('answerQuestion', ({ text }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'playing') return;

    // Отвечать должен тот игрок, КОТОРОМУ задали вопрос
    if (room.turn === socket.id || room.turnPhase !== 'answer') {
      socket.emit('errorMsg', 'Сейчас не ваша очередь отвечать!');
      return;
    }

    const responder = room.players.find(p => p.id === socket.id);

    io.to(room.code).emit('chatMessage', {
      type: 'answer',
      sender: responder.name,
      senderId: responder.id,
      text: text.trim()
    });

    // После ответа очередь задавать следующий вопрос переходит к ответившему игроку
    room.turn = responder.id;
    room.turnPhase = 'ask';
    room.guessedThisTurn = false;

    io.to(room.code).emit('turnUpdate', {
      turn: room.turn,
      turnPhase: room.turnPhase
    });
  });

  // Попытка угадать персонажа друга через меню карточки
  socket.on('guessCharacter', ({ character }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    const opponent = room.players.find(p => p.id !== socket.id);
    if (!player || !opponent) return;

    if (opponent.secretChar === character) {
      // ПОБЕДА! Игрок угадал персонажа друга
      room.state = 'lobby';
      const p1 = room.players[0];
      const p2 = room.players[1];

      io.to(room.code).emit('gameOver', {
        winnerId: player.id,
        winnerName: player.name,
        guessedCharacter: character,
        summary: `${p1.name} загадывал: «${p1.secretChar}» | ${p2.name} загадывал: «${p2.secretChar}»`,
        room
      });

      // Сбрасываем загаданных персонажей для новой партии
      room.players.forEach(p => p.secretChar = null);
    } else {
      // ОШИБКА! Персонаж не тот
      io.to(room.code).emit('chatMessage', {
        type: 'system',
        text: `❌ ${player.name} предположил(а), что это «${character}», но не угадал(а)!`
      });

      socket.emit('guessWrong', { character });

      // Если игрок ошибся в свой ход вопроса, ход сразу переходит к сопернику
      if (room.turn === socket.id && room.turnPhase === 'ask') {
        room.turn = opponent.id;
        room.turnPhase = 'ask';
        io.to(room.code).emit('turnUpdate', {
          turn: room.turn,
          turnPhase: room.turnPhase
        });
        io.to(room.code).emit('chatMessage', {
          type: 'system',
          text: `Из-за неверной догадки очередь вопроса переходит к игроку ${opponent.name}.`
        });
      }
    }
  });

  // Выход игрока / разрыв соединения
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;

    const room = rooms[code];
    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      delete rooms[code];
    } else {
      room.state = 'lobby';
      room.players.forEach(p => p.secretChar = null);
      io.to(code).emit('playerLeft', room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});