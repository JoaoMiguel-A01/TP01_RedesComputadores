const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const os = require('os'); // Para obter o IP local
const portfinder = require('portfinder'); // Para encontrar uma porta disponível

const app = express();

// Configuração do middleware
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// Caminhos dos arquivos json
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

// Verifica se existem salas registradas; se não, cria a sala padrão
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
  Registrar um novo usuário recebendo o login
  Verifica se o mesmo já existe no arquivo
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
  Autentica um usuário pelo login (sem credenciais adicionais)
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
  Retorna as informações de um usuário específico
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
  Cria uma nova sala de chat
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
  Remove uma sala de chat
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
  Permite que um usuário entre na sala de chat
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
  Permite que um usuário saia da sala de chat
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
  Remove um usuário de uma sala específica
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
  Envia uma mensagem direta para outro usuário
*/
app.post('/messages/direct/:receiverId', (req, res) => {
  const { receiverId } = req.params;
  const { senderId, mensagem } = req.body;

  if (!senderId || !mensagem) {
    return res.status(400).json({ error: 'senderId e mensagem são obrigatórios.' });
  }

  const users = readJSON(usersFile);
  const sender = users.find(user => user.id === senderId);
  const receiver = users.find(user => user.id === receiverId);

  if (!sender) {
    return res.status(404).json({ error: 'Usuário remetente não encontrado.' });
  }

  if (!receiver) {
    return res.status(404).json({ error: 'Usuário destinatário não encontrado.' });
  }

  const messages = readJSON(messagesFile);
  const newMessage = {
    id: String(messages.length + 1),
    type: 'direct',
    senderId,
    senderLogin: sender.login, // Inclui o nome de login do remetente
    receiverId,
    conteudo: mensagem,
    timestamp: new Date().toISOString()
  };

  messages.push(newMessage);
  writeJSON(messagesFile, messages);

  // Emite o evento de nova mensagem direta via Socket.IO
  io.emit("newDirectMessage", newMessage);

  res.status(201).json(newMessage);
});

/*
  POST /rooms/:roomId/messages
  Envia uma mensagem para uma sala de chat
*/
app.post('/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  const { senderId, mensagem } = req.body;
  if (!senderId || !mensagem) {
    return res.status(400).json({ error: 'senderId e mensagem são obrigatórios.' });
  }
  
  // Valida se o usuário faz parte da sala
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
  Recupera o histórico de mensagens da sala de chat
*/
app.get('/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;

  // Lê as mensagens e os usuários
  const messages = readJSON(messagesFile);
  const users = readJSON(usersFile);

  // Filtra as mensagens da sala específica
  const roomMessages = messages
    .filter(msg => msg.type === "room" && msg.roomId === roomId)
    .map(msg => {
      const sender = users.find(user => user.id === msg.senderId);
      return {
        ...msg,
        senderLogin: sender ? sender.login : "Desconhecido" // Adiciona o login do remetente
      };
    });

  res.json(roomMessages);
});

app.get('/messages/direct/:userId', (req, res) => {
  const { userId } = req.params;

  // Lê as mensagens e os usuários
  const messages = readJSON(messagesFile);
  const users = readJSON(usersFile);

  // Filtra as mensagens diretas enviadas ou recebidas pelo usuário
  const userMessages = messages
    .filter(msg => msg.type === "direct" && (msg.senderId === userId || msg.receiverId === userId))
    .map(msg => {
      const sender = users.find(user => user.id === msg.senderId);
      return {
        ...msg,
        senderLogin: sender ? sender.login : "Desconhecido" // Adiciona o login do remetente
      };
    });

  res.json(userMessages);
});

// Função para obter o IP local
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // Fallback para localhost
}

// Configuração dinâmica de porta e IP
const localIP = getLocalIPAddress();
portfinder.getPortPromise()
  .then(port => {
    const server = http.createServer(app);
    const io = socketIo(server, {
      cors: {
        origin: "*"
      }
    });

    // Configuração do Socket.IO
    io.on("connection", (socket) => {
      console.log("Novo cliente conectado: ", socket.id);

      socket.on("joinRoom", ({ roomId, userId }) => {
        socket.join(roomId);
        console.log(`Usuário ${userId} entrou na sala ${roomId}`);
        io.to(roomId).emit("userJoined", { roomId, userId });
      });

      // Enviar mensagem para uma sala
      socket.on("sendRoomMessage", ({ roomId, senderId, mensagem }) => {
        const rooms = readJSON(roomsFile);
        const room = rooms.find(r => r.id === roomId);
        if (!room) {
          console.error("Sala não encontrada:", roomId);
          return;
        }

        const users = readJSON(usersFile);
        const sender = users.find(user => user.id === senderId);
        if (!sender) {
          console.error("Usuário remetente não encontrado:", senderId);
          return;
        }

        const messages = readJSON(messagesFile);
        const newMessage = {
          id: String(messages.length + 1),
          type: "room",
          roomId,
          senderId,
          senderLogin: sender.login, // Inclui o login do remetente
          conteudo: mensagem,
          timestamp: new Date().toISOString()
        };

        messages.push(newMessage);
        writeJSON(messagesFile, messages);

        io.to(roomId).emit("newRoomMessage", newMessage); // Emite a mensagem com o login do remetente
      });

      // Enviar mensagem direta
      socket.on("newDirectMessage", ({ senderId, receiverId, mensagem }) => {
        const users = readJSON(usersFile);
        const sender = users.find(user => user.id === senderId);
        const receiver = users.find(user => user.id === receiverId);

        if (!sender || !receiver) {
          console.error("Usuário remetente ou destinatário não encontrado.");
          return;
        }

        const messages = readJSON(messagesFile);
        const newMessage = {
          id: String(messages.length + 1),
          type: "direct",
          senderId,
          senderLogin: sender.login, // Inclui o login do remetente
          receiverId,
          conteudo: mensagem,
          timestamp: new Date().toISOString()
        };

        messages.push(newMessage);
        writeJSON(messagesFile, messages);

        io.to(receiverId).emit("newDirectMessage", newMessage); // Emite a mensagem com o login do remetente
      });

      socket.on("disconnect", () => {
        console.log("Cliente desconectado: " + socket.id);
      });
    });

    app.get('/server-info', (req, res) => {
      res.json({ ip: localIP, port });
    });

    // Inicialização do servidor
    server.listen(port, localIP, () => {
      console.log(`Servidor rodando em http://${localIP}:${port}`);
    });
  })
  .catch(err => {
    console.error("Erro ao encontrar uma porta disponível:", err);
  });
