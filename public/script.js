const socket = io();

// Экраны
const screens = {
  home: document.getElementById('screen-home'),
  lobby: document.getElementById('screen-lobby'),
  select: document.getElementById('screen-select'),
  game: document.getElementById('screen-game')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// Элементы интерфейса
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');

const lobbyRoomCode = document.getElementById('lobby-room-code');
const playersCount = document.getElementById('players-count');
const lobbyPlayersList = document.getElementById('lobby-players-list');
const lobbyWaitMsg = document.getElementById('lobby-wait-msg');
const btnStartGame = document.getElementById('btn-start-game');
const winnerBanner = document.getElementById('winner-banner');

const selectionGrid = document.getElementById('selection-grid');
const selectionWaitingBanner = document.getElementById('selection-waiting-banner');

const modalConfirmSelect = document.getElementById('modal-confirm-select');
const confirmCharName = document.getElementById('confirm-char-name');
const btnConfirmCharYes = document.getElementById('btn-confirm-char-yes');
const btnConfirmCharNo = document.getElementById('btn-confirm-char-no');

const mySecretName = document.getElementById('my-secret-name');
const turnIndicator = document.getElementById('turn-indicator');
const gameBoardGrid = document.getElementById('game-board-grid');

const chatMessages = document.getElementById('chat-messages');
const questionControls = document.getElementById('question-controls');
const questionInput = document.getElementById('question-input');
const btnSendQuestion = document.getElementById('btn-send-question');

const answerControls = document.getElementById('answer-controls');
const customAnswerInput = document.getElementById('custom-answer-input');
const btnSendCustomAnswer = document.getElementById('btn-send-custom-answer');

const modalCardMenu = document.getElementById('modal-card-menu');
const menuCharTitle = document.getElementById('menu-char-title');
const btnCardGuess = document.getElementById('btn-card-guess');
const btnCardQuestion = document.getElementById('btn-card-question');
const btnCardEliminate = document.getElementById('btn-card-eliminate');
const btnCardCancel = document.getElementById('btn-card-cancel');

// Локальное состояние игрока
let pendingCharacterSelection = null;
let activeCardCharacter = null;
// Состояния карточек на поле: 'normal' | 'questionable' | 'eliminated'
let cardStates = {};

// --- 1. СОЗДАНИЕ И ВХОД В КОМНАТУ ---
btnCreateRoom.addEventListener('click', () => {
  const playerName = playerNameInput.value.trim() || 'Игрок 1';
  socket.emit('createRoom', { playerName });
});

btnJoinRoom.addEventListener('click', () => {
  const playerName = playerNameInput.value.trim() || 'Игрок 2';
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    alert('Введите код комнаты!');
    return;
  }
  socket.emit('joinRoom', { roomCode, playerName });
});

// Обновление состояния комнаты
socket.on('roomState', (room) => {
  renderLobby(room);
  showScreen('lobby');
});

socket.on('playerLeft', (room) => {
  alert('Второй игрок покинул комнату. Возвращаемся в лобби.');
  renderLobby(room);
  showScreen('lobby');
});

function renderLobby(room) {
  lobbyRoomCode.textContent = room.code;
  playersCount.textContent = room.players.length;
  lobbyPlayersList.innerHTML = '';

  room.players.forEach((p, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx + 1}. ${p.name} ${p.id === socket.id ? '(Вы)' : ''}`;
    lobbyPlayersList.appendChild(li);
  });

  if (room.players.length === 2) {
    lobbyWaitMsg.textContent = 'Оба игрока в комнате! Можно начинать.';
    btnStartGame.classList.remove('hidden');
  } else {
    lobbyWaitMsg.textContent = 'Ожидаем подключения второго игрока...';
    btnStartGame.classList.add('hidden');
  }
}

btnStartGame.addEventListener('click', () => {
  socket.emit('startGame');
});

// --- 2. ЭТАП ВЫБОРА СВОЕГО ПЕРСОНАЖА ---
socket.on('startCharacterSelection', ({ characters }) => {
  winnerBanner.classList.add('hidden');
  selectionWaitingBanner.classList.add('hidden');
  selectionGrid.classList.remove('hidden');
  selectionGrid.innerHTML = '';

  characters.forEach((charName) => {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `<div class="char-name">${charName}</div>`;
    card.addEventListener('click', () => {
      pendingCharacterSelection = charName;
      confirmCharName.textContent = charName;
      modalConfirmSelect.classList.remove('hidden');
    });
    selectionGrid.appendChild(card);
  });

  showScreen('select');
});

btnConfirmCharYes.addEventListener('click', () => {
  if (!pendingCharacterSelection) return;
  modalConfirmSelect.classList.add('hidden');
  socket.emit('confirmCharacter', { character: pendingCharacterSelection });
});

btnConfirmCharNo.addEventListener('click', () => {
  pendingCharacterSelection = null;
  modalConfirmSelect.classList.add('hidden');
});

socket.on('waitingForFriend', () => {
  selectionGrid.classList.add('hidden');
  selectionWaitingBanner.classList.remove('hidden');
});

// --- 3. НАЧАЛО ИГРЫ И ДОСКА ПЕРСОНАЖЕЙ ---
socket.on('gameStarted', ({ mySecret, characters, turn, turnPhase }) => {
  mySecretName.textContent = mySecret;
  chatMessages.innerHTML = '';
  cardStates = {};

  characters.forEach(c => {
    cardStates[c] = 'normal';
  });

  renderGameBoard(characters);
  updateTurnUI(turn, turnPhase);
  showScreen('game');
});

function renderGameBoard(characters) {
  gameBoardGrid.innerHTML = '';

  characters.forEach((charName) => {
    const state = cardStates[charName] || 'normal';
    const card = document.createElement('div');
    card.className = `char-card ${state === 'questionable' ? 'questionable' : ''} ${state === 'eliminated' ? 'eliminated' : ''}`;

    let badgeText = '';
    if (state === 'questionable') badgeText = '❓ Под вопросом';
    if (state === 'eliminated') badgeText = 'Убран';

    card.innerHTML = `
      <div class="char-name">${charName}</div>
      <span class="char-status-badge">${badgeText}</span>
    `;

    card.addEventListener('click', () => {
      openCardMenu(charName);
    });

    gameBoardGrid.appendChild(card);
  });
}

// Открытие меню карточки
function openCardMenu(charName) {
  activeCardCharacter = charName;
  menuCharTitle.textContent = charName;
  modalCardMenu.classList.remove('hidden');
}

btnCardCancel.addEventListener('click', () => {
  activeCardCharacter = null;
  modalCardMenu.classList.add('hidden');
});

// Действие: Оставить под вопросом
btnCardQuestion.addEventListener('click', () => {
  if (!activeCardCharacter) return;
  cardStates[activeCardCharacter] =
    cardStates[activeCardCharacter] === 'questionable' ? 'normal' : 'questionable';
  modalCardMenu.classList.add('hidden');
  renderGameBoard(Object.keys(cardStates));
});

// Действие: Убрать (перевернуть / сделать серым)
btnCardEliminate.addEventListener('click', () => {
  if (!activeCardCharacter) return;
  cardStates[activeCardCharacter] =
    cardStates[activeCardCharacter] === 'eliminated' ? 'normal' : 'eliminated';
  modalCardMenu.classList.add('hidden');
  renderGameBoard(Object.keys(cardStates));
});

// Действие: Угадать персонажа друга
btnCardGuess.addEventListener('click', () => {
  if (!activeCardCharacter) return;
  const charToGuess = activeCardCharacter;
  modalCardMenu.classList.add('hidden');
  socket.emit('guessCharacter', { character: charToGuess });
});

// Если не угадал — автоматически помечаем карточку как убранную
socket.on('guessWrong', ({ character }) => {
  cardStates[character] = 'eliminated';
  renderGameBoard(Object.keys(cardStates));
});

// --- 4. СИСТЕМА ОЧЕРЕДИ И ЧАТА ---
socket.on('turnUpdate', ({ turn, turnPhase }) => {
  updateTurnUI(turn, turnPhase);
});

function updateTurnUI(turnId, turnPhase) {
  const isMyQuestionTurn = (turnId === socket.id);

  turnIndicator.className = 'turn-banner';

  if (isMyQuestionTurn && turnPhase === 'ask') {
    // Моя очередь задавать вопрос
    turnIndicator.textContent = '🟢 Сейчас ваша очередь задавать вопрос!';
    turnIndicator.classList.add('my-turn');

    questionInput.disabled = false;
    questionInput.placeholder = 'Введите ваш вопрос другу...';
    btnSendQuestion.disabled = false;
    answerControls.classList.add('hidden');
  } else if (isMyQuestionTurn && turnPhase === 'answer') {
    // Я задал вопрос, жду ответа друга
    turnIndicator.textContent = '⏳ Ожидаем ответ от друга...';
    turnIndicator.classList.add('answer-turn');

    questionInput.disabled = true;
    questionInput.placeholder = 'Дождитесь ответа друга...';
    btnSendQuestion.disabled = true;
    answerControls.classList.add('hidden');
  } else if (!isMyQuestionTurn && turnPhase === 'ask') {
    // Очередь друга задавать вопрос
    turnIndicator.textContent = '🔴 Сейчас не ваша очередь задавать вопрос';
    turnIndicator.classList.add('not-my-turn');

    questionInput.disabled = true;
    questionInput.placeholder = 'Сейчас не ваша очередь задавать вопрос';
    btnSendQuestion.disabled = true;
    answerControls.classList.add('hidden');
  } else if (!isMyQuestionTurn && turnPhase === 'answer') {
    // Друг задал вопрос, моя очередь ответить!
    turnIndicator.textContent = '🟡 Друг задал вопрос! Ответьте в чате';
    turnIndicator.classList.add('answer-turn');

    questionInput.disabled = true;
    questionInput.placeholder = 'Сначала ответьте на вопрос друга выше';
    btnSendQuestion.disabled = true;
    answerControls.classList.remove('hidden');
  }
}

// Отправка вопроса
function sendQuestion() {
  const text = questionInput.value.trim();
  if (!text) return;
  socket.emit('askQuestion', { text });
  questionInput.value = '';
}

btnSendQuestion.addEventListener('click', sendQuestion);
questionInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendQuestion();
});

// Быстрые ответы «Да» / «Нет»
document.querySelectorAll('.answer-buttons .btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const answer = btn.getAttribute('data-answer');
    socket.emit('answerQuestion', { text: answer });
  });
});

// Произвольный ответ на вопрос
btnSendCustomAnswer.addEventListener('click', () => {
  const text = customAnswerInput.value.trim();
  if (!text) return;
  socket.emit('answerQuestion', { text });
  customAnswerInput.value = '';
});

// Отображение сообщений в чате
socket.on('chatMessage', (msg) => {
  const div = document.createElement('div');

  if (msg.type === 'system') {
    div.className = 'msg msg-system';
    div.textContent = msg.text;
  } else if (msg.type === 'question') {
    div.className = 'msg msg-question';
    div.innerHTML = `<div class="msg-sender">❓ Вопрос от ${msg.sender}:</div><div>${msg.text}</div>`;
  } else if (msg.type === 'answer') {
    div.className = 'msg msg-answer';
    div.innerHTML = `<div class="msg-sender">💬 Ответ от ${msg.sender}:</div><div><strong>${msg.text}</strong></div>`;
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// --- 5. ЗАВЕРШЕНИЕ ИГРЫ И ВОЗВРАТ В КОМНАТУ ---
socket.on('gameOver', ({ winnerId, winnerName, guessedCharacter, summary, room }) => {
  const iWon = (winnerId === socket.id);
  const title = iWon ? '🏆 ВЫ ПОБЕДИЛИ!' : `🎉 Победил игрок: ${winnerName}`;

  winnerBanner.innerHTML = `
    <strong>${title}</strong><br/>
    Угаданный персонаж: <b>${guessedCharacter}</b><br/>
    <small>${summary}</small>
  `;
  winnerBanner.classList.remove('hidden');

  renderLobby(room);
  showScreen('lobby');
});

socket.on('errorMsg', (msg) => {
  alert(msg);
});