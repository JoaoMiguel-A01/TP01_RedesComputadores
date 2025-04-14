const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do middleware
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));



// Caminhos dos arquivos json para persistência
const usersFile = './users.json';
const roomsFile = './rooms.json';
const messagesFile = './messages.json';


// Função para inicializar um arquivo JSON caso não exista
function initializeFile(filePath, initialData = []) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2), 'utf8');
    console.log(`Arquivo '${filePath}' criado com sucesso.`);
  }
}

initializeFile(usersFile);
initializeFile(roomsFile);
initializeFile(messagesFile);

// Verifica se existem salas registradas; se não, cria a sala padrão.
let existingRooms = readJSON(roomsFile);
if (existingRooms.length === 0) {
  const defaultRoom = {
    id: "1",
    nome: "Sala Padrão",
    usuarios: [],
    criadoEm: new Date().toISOString()
  };
  existingRooms.push(defaultRoom);
  writeJSON(roomsFile, existingRooms);
  console.log("Sala Padrão criada.");
}

// Funções auxiliares para ler e escrever os arquivos JSON
function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error(`Erro ao ler o arquivo ${filePath}:`, error);
    return [];
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Erro ao escrever no arquivo ${filePath}:`, error);
  }
}


// Endpoints de Gerenciamento de Usuários
/*
  POST /users
  Registrar um novo usuário recebendo o login.
  Verifica se o mesmo já existe no arquivo.
*/
app.post('/users', (req, res) => {
  const { login } = req.body;
  if (!login) return res.status(400).json({ error: 'Login é obrigatório.' });
  
  const users = readJSON(usersFile);
  if (users.find(user => user.login === login)) {
    return res.status(400).json({ error: 'Login já está em uso.' });
  }
  
  const newUser = {
    id: String(users.length + 1),
    login,
    criadoEm: new Date().toISOString()
  };
  
  users.push(newUser);
  writeJSON(usersFile, users);
  res.status(201).json(newUser);
});

/*
  POST /users/login
  Autentica um usuário pelo login (sem credenciais adicionais).
*/
app.post('/users/login', (req, res) => {
  const { login } = req.body;
  if (!login) return res.status(400).json({ error: 'Login é obrigatório para autenticação.' });

  const users = readJSON(usersFile);
  const user = users.find(user => user.login === login);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }
  res.json(user);
});

/*
  GET /users/:userId
  Retorna as informações de um usuário específico.
*/
app.get('/users/:userId', (req, res) => {
  const { userId } = req.params;
  const users = readJSON(usersFile);
  const user = users.find(user => user.id === userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json(user);
});

app.get('/rooms', (req, res) => {
  const rooms = readJSON(roomsFile);
  res.json(rooms);
});

/*
  POST /rooms
  Cria uma nova sala de chat.
*/
app.post('/rooms', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da sala é obrigatório.' });
  
  const rooms = readJSON(roomsFile);
  const newRoom = {
    id: String(rooms.length + 1),
    nome,
    usuarios: [],
    criadoEm: new Date().toISOString()
  };
  
  rooms.push(newRoom);
  writeJSON(roomsFile, rooms);
  res.status(201).json(newRoom);
});

/*
  DELETE /rooms/:roomId
  Remove uma sala de chat.
*/
app.delete('/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const rooms = readJSON(roomsFile);
  const roomIndex = rooms.findIndex(room => room.id === roomId);
  if (roomIndex === -1) return res.status(404).json({ error: 'Sala não encontrada.' });
  
  rooms.splice(roomIndex, 1);
  writeJSON(roomsFile, rooms);
  res.json({ message: 'Sala removida com sucesso.' });
});

/*
  POST /rooms/:roomId/enter
  Permite que um usuário entre na sala de chat.
*/
app.post('/rooms/:roomId/enter', (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId é obrigatório para entrar na sala.' });

  const rooms = readJSON(roomsFile);
  const room = rooms.find(room => room.id === roomId);
  if (!room) return res.status(404).json({ error: 'Sala não encontrada.' });
  
  if (!room.usuarios.includes(userId)) {
    room.usuarios.push(userId);
    writeJSON(roomsFile, rooms);
  }
  
  res.json(room);
});

/*
  POST /rooms/:roomId/leave
  Permite que um usuário saia da sala de chat.
*/
app.post('/rooms/:roomId/leave', (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId é obrigatório para sair da sala.' });
  
  const rooms = readJSON(roomsFile);
  const room = rooms.find(room => room.id === roomId);
  if (!room) return res.status(404).json({ error: 'Sala não encontrada.' });
  
  room.usuarios = room.usuarios.filter(id => id !== userId);
  writeJSON(roomsFile, rooms);
  res.json(room);
});

/*
  DELETE /rooms/:roomId/users/:userId
  Remove um usuário de uma sala específica (operação administrativa).
*/
app.delete('/rooms/:roomId/users/:userId', (req, res) => {
  const { roomId, userId } = req.params;
  const rooms = readJSON(roomsFile);
  const room = rooms.find(room => room.id === roomId);
  if (!room) return res.status(404).json({ error: 'Sala não encontrada.' });
  
  room.usuarios = room.usuarios.filter(id => id !== userId);
  writeJSON(roomsFile, rooms);
  res.json(room);
});


// Endpoints de Mensagens (REST)
/*
  POST /messages/direct/:receiverId
  Envia uma mensagem direta para outro usuário.
*/
app.post('/messages/direct/:receiverId', (req, res) => {
  const { receiverId } = req.params;
  const { senderId, mensagem } = req.body;
  if (!senderId || !mensagem) {
    return res.status(400).json({ error: 'senderId e mensagem são obrigatórios.' });
  }
  
  const messages = readJSON(messagesFile);
  const newMessage = {
    id: String(messages.length + 1),
    type: 'direct',
    senderId,
    receiverId,
    conteudo: mensagem,
    timestamp: new Date().toISOString()
  };
  messages.push(newMessage);
  writeJSON(messagesFile, messages);
  res.status(201).json(newMessage);
});

/*
  POST /rooms/:roomId/messages
  Envia uma mensagem para uma sala de chat.
*/
app.post('/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  const { senderId, mensagem } = req.body;
  if (!senderId || !mensagem) {
    return res.status(400).json({ error: 'senderId e mensagem são obrigatórios.' });
  }
  
  // Opcional: Validar se o usuário faz parte da sala.
  const rooms = readJSON(roomsFile);
  const room = rooms.find(r => r.id === roomId);
  if (!room) return res.status(404).json({ error: 'Sala não encontrada.' });
  
  const messages = readJSON(messagesFile);
  const newMessage = {
    id: String(messages.length + 1),
    type: 'room',
    roomId,
    senderId,
    conteudo: mensagem,
    timestamp: new Date().toISOString()
  };
  messages.push(newMessage);
  writeJSON(messagesFile, messages);
  res.status(201).json(newMessage);
});

/*
  GET /rooms/:roomId/messages
  Recupera o histórico de mensagens da sala de chat.
*/
app.get('/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  const messages = readJSON(messagesFile);
  const roomMessages = messages.filter(message => message.roomId === roomId);
  res.json(roomMessages);
});


// Configuração do Socket.IO para Chat em Tempo Real
// Cria o servidor HTTP, anexando o Express
const server = http.createServer(app);
// Configura o Socket.IO com CORS liberado (ajuste conforme necessário)
const io = socketIo(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  console.log("Novo cliente conectado: ", socket.id);

  // Evento para entrar em uma sala via Socket.IO
  socket.on("joinRoom", ({ roomId, userId }) => {
    socket.join(roomId);
    console.log(`Usuário ${userId} entrou na sala ${roomId}`);
    // Notifica os membros da sala que um novo usuário entrou
    io.to(roomId).emit("userJoined", { roomId, userId });
  });

  // Evento para sair da sala
  socket.on("leaveRoom", ({ roomId, userId }) => {
    socket.leave(roomId);
    console.log(`Usuário ${userId} saiu da sala ${roomId}`);
    io.to(roomId).emit("userLeft", { roomId, userId });
  });

  // Evento para enviar mensagem para uma sala
  socket.on("sendRoomMessage", (data) => {
    // data deve conter: roomId, senderId, mensagem
    const { roomId, senderId, mensagem } = data;
    if (!roomId || !senderId || !mensagem) {
      socket.emit("error", { error: "roomId, senderId e mensagem são obrigatórios." });
      return;
    }
    // Validação simples para existência da sala
    const rooms = readJSON(roomsFile);
    const room = rooms.find(r => r.id === roomId);
    if (!room) {
      socket.emit("error", { error: "Sala não encontrada." });
      return;
    }
    const messages = readJSON(messagesFile);
    const newMessage = {
      id: String(messages.length + 1),
      type: "room",
      roomId,
      senderId,
      conteudo: mensagem,
      timestamp: new Date().toISOString()
    };
    messages.push(newMessage);
    writeJSON(messagesFile, messages);
    // Emite a nova mensagem para todos na sala
    io.to(roomId).emit("newRoomMessage", newMessage);
  });

  // Evento para enviar mensagem direta
  socket.on("sendDirectMessage", (data) => {
    const { receiverId, senderId, mensagem } = data;
    if (!receiverId || !senderId || !mensagem) {
      socket.emit("error", { error: "receiverId, senderId e mensagem são obrigatórios." });
      return;
    }
    const messages = readJSON(messagesFile);
    const newMessage = {
      id: String(messages.length + 1),
      type: "direct",
      senderId,
      receiverId,
      conteudo: mensagem,
      timestamp: new Date().toISOString()
    };
    messages.push(newMessage);
    writeJSON(messagesFile, messages);
    // Para mensagem direta, você pode optar por emitir para todos ou implementar uma lógica
    // que direciona a mensagem apenas ao socket correspondente ao receiverId (se mantiver mapeamento).
    io.emit("newDirectMessage", newMessage);
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado: " + socket.id);
  });
});


// Inicialização do Servidor com Socket.IO
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
