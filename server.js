// Polyfill for Array.prototype.flat (Node 10 support)
if (!Array.prototype.flat) {
  Array.prototype.flat = function(depth) {
    depth = depth === undefined ? 1 : depth;
    return depth > 0
      ? this.reduce((acc, val) => acc.concat(Array.isArray(val) ? val.flat(depth - 1) : val), [])
      : this.slice();
  };
}

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { Bonjour } = require('bonjour-service');
const crypto = require('crypto');

const app = express();
const PORT = 8443;

// SSL Certificate Options
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'mynodeapp.local-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'mynodeapp.local.pem'))
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Configuration
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// User Database Utilities
const USERS_FILE = path.join(__dirname, 'users.json');
const SHARES_FILE = path.join(__dirname, 'shares.json');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultAdmin = {
      username: 'admin',
      passwordHash: hashPassword(ADMIN_PASSWORD),
      role: 'admin'
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
    return [defaultAdmin];
  }
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadShares() {
  if (!fs.existsSync(SHARES_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SHARES_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveShares(shares) {
  fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
}

// Storage isolation utility
function getUserStorageFolder(username) {
  if (username === 'admin') {
    const adminFolder = path.join(__dirname, 'storage');
    if (!fs.existsSync(adminFolder)) {
      fs.mkdirSync(adminFolder, { recursive: true });
    }
    return adminFolder;
  }
  const userFolder = path.join(__dirname, 'storage', username);
  if (!fs.existsSync(userFolder)) {
    fs.mkdirSync(userFolder, { recursive: true });
  }
  return userFolder;
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const targetUsername = (username || 'admin').trim().toLowerCase();
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  const users = loadUsers();
  const user = users.find(u => u.username === targetUsername);
  
  if (user && user.passwordHash === hashPassword(password)) {
    const token = jwt.sign({ user: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = req.query.path || '';
    const userFolder = getUserStorageFolder(req.user.user);
    const fullPath = path.join(userFolder, uploadPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    cb(null, fullPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// API: Get files and folders
app.get('/api/files', authenticateToken, (req, res) => {
  const targetPath = req.query.path || '';
  const userFolder = getUserStorageFolder(req.user.user);
  const fullPath = path.join(userFolder, targetPath);

  // Prevent directory traversal
  if (!fullPath.startsWith(userFolder)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Directory not found' });
  }

  fs.readdir(fullPath, { withFileTypes: true }, async (err, items) => {
    if (err) return res.status(500).json({ error: 'Failed to read directory' });

    const util = require('util');
    const statAsync = util.promisify(fs.stat);

    try {
      const files = await Promise.all(items.map(async item => {
        const itemPath = path.join(fullPath, item.name);
        let stats;
        try {
          stats = await statAsync(itemPath);
        } catch (e) {
          stats = { size: 0, birthtime: new Date(), mtime: new Date() };
        }
        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          path: path.join(targetPath, item.name).replace(/\\/g, '/'),
          size: stats.size,
          createdAt: stats.birthtime || stats.mtime
        };
      }));
      res.json(files);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch file stats' });
    }
  });
});

// API: Upload files
app.post('/api/upload', authenticateToken, upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  res.json({ message: 'Files uploaded successfully', files: req.files.map(f => f.filename) });
});

// API: Chunked upload
const chunkStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = req.body.path || req.query.path || '';
    const userFolder = getUserStorageFolder(req.user.user);
    const fullPath = path.join(userFolder, uploadPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    cb(null, fullPath);
  },
  filename: function (req, file, cb) {
    cb(null, 'chunk_' + Date.now() + '_' + file.originalname);
  }
});
const uploadChunk = multer({ storage: chunkStorage });

app.post('/api/upload-chunk', authenticateToken, uploadChunk.single('chunk'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No chunk uploaded' });
  }

  const chunkIndex = parseInt(req.body.chunkIndex);
  const totalChunks = parseInt(req.body.totalChunks);
  const fileName = req.body.filename;
  const targetPath = req.body.path || '';
  
  const userFolder = getUserStorageFolder(req.user.user);
  const finalPath = path.join(userFolder, targetPath, fileName);
  const tempPath = finalPath + '.part';
  const chunkPath = req.file.path;

  // Prevent directory traversal
  if (!finalPath.startsWith(userFolder)) {
    if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    return res.status(403).json({ error: 'Access denied' });
  }

  const writeStream = fs.createWriteStream(tempPath, { flags: chunkIndex === 0 ? 'w' : 'a' });
  const readStream = fs.createReadStream(chunkPath);
  
  readStream.pipe(writeStream);
  
  writeStream.on('finish', () => {
    if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    
    if (chunkIndex === totalChunks - 1) {
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      fs.renameSync(tempPath, finalPath);
      res.json({ message: 'File uploaded completely', complete: true });
    } else {
      res.json({ message: 'Chunk received', complete: false });
    }
  });
  
  writeStream.on('error', (err) => {
    console.error('Stream write error:', err);
    if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    res.status(500).json({ error: 'Failed to append chunk' });
  });
});

// API: Create folder
app.post('/api/folder', authenticateToken, (req, res) => {
  const targetPath = req.body.path || '';
  const folderName = req.body.name;
  
  if (!folderName) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  const userFolder = getUserStorageFolder(req.user.user);
  const fullPath = path.join(userFolder, targetPath, folderName);

  // Prevent directory traversal
  if (!fullPath.startsWith(userFolder)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (fs.existsSync(fullPath)) {
    return res.status(400).json({ error: 'Folder already exists' });
  }

  fs.mkdir(fullPath, { recursive: true }, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to create folder' });
    res.json({ message: 'Folder created successfully' });
  });
});

// API: Create file
app.post('/api/file', authenticateToken, (req, res) => {
  const targetPath = req.body.path || '';
  const fileName = req.body.name;
  
  if (!fileName) {
    return res.status(400).json({ error: 'File name is required' });
  }

  const userFolder = getUserStorageFolder(req.user.user);
  const fullPath = path.join(userFolder, targetPath, fileName);

  // Prevent directory traversal
  if (!fullPath.startsWith(userFolder)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (fs.existsSync(fullPath)) {
    return res.status(400).json({ error: 'File already exists' });
  }

  fs.writeFile(fullPath, '', (err) => {
    if (err) return res.status(500).json({ error: 'Failed to create file' });
    res.json({ message: 'File created successfully' });
  });
});

// API: Update file content
app.put('/api/file', authenticateToken, (req, res) => {
  const targetPath = req.body.path;
  const content = req.body.content || '';
  
  if (!targetPath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  const userFolder = getUserStorageFolder(req.user.user);
  const fullPath = path.join(userFolder, targetPath);

  // Prevent directory traversal
  if (!fullPath.startsWith(userFolder)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  fs.writeFile(fullPath, content, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to save file' });
    res.json({ message: 'File saved successfully' });
  });
});

// API: Delete file or folder
app.delete('/api/delete', authenticateToken, (req, res) => {
  const targetPath = req.query.path;
  
  if (!targetPath) {
    return res.status(400).json({ error: 'Path is required' });
  }

  const userFolder = getUserStorageFolder(req.user.user);
  const fullPath = path.join(userFolder, targetPath);

  // Prevent directory traversal
  if (!fullPath.startsWith(userFolder) || fullPath === userFolder) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Item not found' });
  }

  fs.stat(fullPath, (err, stats) => {
    if (err) return res.status(500).json({ error: 'Failed to stat item' });

    if (stats.isDirectory()) {
      // Use fs.rm if available (Node 14.14+), else fallback to a simpler approach or error if not empty
      // Since user is on Node 10.19, we must use a recursive delete or just rmdir (which fails on non-empty)
      // Node 10 doesn't have fs.rmSync. We can use a custom function for recursive delete.
      const deleteFolderRecursive = function(directoryPath) {
        if (fs.existsSync(directoryPath)) {
          fs.readdirSync(directoryPath).forEach((file) => {
            const curPath = path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              deleteFolderRecursive(curPath);
            } else {
              fs.unlinkSync(curPath);
            }
          });
          fs.rmdirSync(directoryPath);
        }
      };

      try {
        deleteFolderRecursive(fullPath);
        res.json({ message: 'Folder deleted successfully' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete folder' });
      }
    } else {
      fs.unlink(fullPath, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to delete file' });
        res.json({ message: 'File deleted successfully' });
      });
    }
  });
});

// API: Rename file or folder
app.put('/api/rename', authenticateToken, (req, res) => {
  const targetPath = req.body.path || '';
  const oldName = req.body.oldName;
  const newName = req.body.newName;

  if (!oldName || !newName) {
    return res.status(400).json({ error: 'oldName and newName are required' });
  }

  const userFolder = getUserStorageFolder(req.user.user);
  const oldFullPath = path.join(userFolder, targetPath, oldName);
  const newFullPath = path.join(userFolder, targetPath, newName);

  if (!oldFullPath.startsWith(userFolder) || !newFullPath.startsWith(userFolder)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(oldFullPath)) {
    return res.status(404).json({ error: 'Item not found' });
  }

  if (fs.existsSync(newFullPath)) {
    return res.status(400).json({ error: 'Target name already exists' });
  }

  fs.rename(oldFullPath, newFullPath, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to rename item' });
    res.json({ message: 'Item renamed successfully' });
  });
});

// API: Download/View file
app.get('/api/download', authenticateToken, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  const userFolder = getUserStorageFolder(req.user.user);
  const fullPath = path.join(userFolder, filePath);

  if (!fullPath.startsWith(userFolder)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (req.query.download === 'true') {
    res.download(fullPath);
  } else {
    res.sendFile(fullPath);
  }
});

// API: Create a Share Link
app.post('/api/share', authenticateToken, (req, res) => {
  const targetPath = req.body.path;
  const expiresInHours = req.body.expiresInHours;
  
  if (!targetPath) return res.status(400).json({ error: 'Path is required' });

  const userFolder = getUserStorageFolder(req.user.user);
  const fullPath = path.join(userFolder, targetPath);

  if (!fullPath.startsWith(userFolder) || !fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Folder not found' });
  }
  
  if (!fs.statSync(fullPath).isDirectory()) {
    return res.status(400).json({ error: 'Path must be a directory' });
  }

  const shares = loadShares();
  const shareId = crypto.randomBytes(16).toString('hex');
  
  let expiresAt = null;
  if (expiresInHours) {
    expiresAt = Date.now() + (expiresInHours * 60 * 60 * 1000);
  }

  shares[shareId] = {
    owner: req.user.user,
    path: targetPath,
    expiresAt: expiresAt,
    createdAt: Date.now()
  };

  saveShares(shares);
  res.json({ shareId, url: `/share.html?id=${shareId}` });
});

// Middleware for Public Share Access
function validateShare(req, res, next) {
  const shareId = req.params.shareId;
  const shares = loadShares();
  const share = shares[shareId];

  if (!share) return res.status(404).json({ error: 'Share not found' });

  if (share.expiresAt && Date.now() > share.expiresAt) {
    delete shares[shareId];
    saveShares(shares);
    return res.status(410).json({ error: 'Share has expired' });
  }

  req.share = share;
  next();
}

// API: Get Shared Folder Info
app.get('/api/public/share/:shareId', validateShare, (req, res) => {
  res.json({ 
    owner: req.share.owner, 
    path: req.share.path.split('/').pop() || 'Shared Folder',
    expiresAt: req.share.expiresAt
  });
});

// API: Get files in Shared Folder
app.get('/api/public/share/:shareId/files', validateShare, (req, res) => {
  const subPath = req.query.path || '';
  const userFolder = getUserStorageFolder(req.share.owner);
  
  const shareBasePath = path.join(userFolder, req.share.path);
  const fullPath = path.join(shareBasePath, subPath);

  if (!fullPath.startsWith(shareBasePath)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Directory not found' });
  }

  fs.readdir(fullPath, { withFileTypes: true }, async (err, items) => {
    if (err) return res.status(500).json({ error: 'Failed to read directory' });

    const util = require('util');
    const statAsync = util.promisify(fs.stat);

    try {
      const files = await Promise.all(items.map(async item => {
        const itemPath = path.join(fullPath, item.name);
        let stats;
        try {
          stats = await statAsync(itemPath);
        } catch (e) {
          stats = { size: 0, birthtime: new Date(), mtime: new Date() };
        }
        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          path: path.join(subPath, item.name).replace(/\\/g, '/'),
          size: stats.size,
          createdAt: stats.birthtime || stats.mtime
        };
      }));
      res.json(files);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch file stats' });
    }
  });
});

// API: Download file from Shared Folder
app.get('/api/public/share/:shareId/download', validateShare, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  const userFolder = getUserStorageFolder(req.share.owner);
  const shareBasePath = path.join(userFolder, req.share.path);
  const fullPath = path.join(shareBasePath, filePath);

  if (!fullPath.startsWith(shareBasePath)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (req.query.download === 'true') {
    res.download(fullPath);
  } else {
    res.sendFile(fullPath);
  }
});

// API: Public Upload Chunk
const publicChunkStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = req.body.path || req.query.path || '';
    const userFolder = getUserStorageFolder(req.share.owner);
    const shareBasePath = path.join(userFolder, req.share.path);
    const fullPath = path.join(shareBasePath, uploadPath);
    
    if (!fullPath.startsWith(shareBasePath)) {
      return cb(new Error('Access denied'));
    }
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    cb(null, fullPath);
  },
  filename: function (req, file, cb) {
    cb(null, 'public_chunk_' + Date.now() + '_' + file.originalname);
  }
});
const publicUploadChunk = multer({ storage: publicChunkStorage });

app.post('/api/public/share/:shareId/upload-chunk', validateShare, publicUploadChunk.single('chunk'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No chunk uploaded' });
  }

  const chunkIndex = parseInt(req.body.chunkIndex);
  const totalChunks = parseInt(req.body.totalChunks);
  const fileName = req.body.filename;
  const targetPath = req.body.path || '';
  
  const userFolder = getUserStorageFolder(req.share.owner);
  const shareBasePath = path.join(userFolder, req.share.path);
  const finalPath = path.join(shareBasePath, targetPath, fileName);
  const tempPath = finalPath + '.part';
  const chunkPath = req.file.path;

  if (!finalPath.startsWith(shareBasePath)) {
    if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    return res.status(403).json({ error: 'Access denied' });
  }

  const writeStream = fs.createWriteStream(tempPath, { flags: chunkIndex === 0 ? 'w' : 'a' });
  const readStream = fs.createReadStream(chunkPath);
  
  readStream.pipe(writeStream);
  
  writeStream.on('finish', () => {
    if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    
    if (chunkIndex === totalChunks - 1) {
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      fs.renameSync(tempPath, finalPath);
      res.json({ message: 'File uploaded completely', complete: true });
    } else {
      res.json({ message: 'Chunk received', complete: false });
    }
  });
  
  writeStream.on('error', (err) => {
    console.error('Stream write error:', err);
    if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    res.status(500).json({ error: 'Failed to append chunk' });
  });
});

let accumulatedRx = 0;
let accumulatedTx = 0;
const activeSockets = new Set();
let lastCheckedRx = 0;
let lastCheckedTx = 0;
let currentSpeed = { rxSpeed: 0, txSpeed: 0 };

setInterval(() => {
  let totalRx = accumulatedRx;
  let totalTx = accumulatedTx;
  
  for (const socket of activeSockets) {
    totalRx += socket.bytesRead || 0;
    totalTx += socket.bytesWritten || 0;
  }
  
  if (lastCheckedRx !== 0 || lastCheckedTx !== 0) {
    currentSpeed.rxSpeed = Math.max(0, (totalRx - lastCheckedRx) / 2);
    currentSpeed.txSpeed = Math.max(0, (totalTx - lastCheckedTx) / 2);
  }
  
  lastCheckedRx = totalRx;
  lastCheckedTx = totalTx;
}, 2000);

app.get('/api/network-stats', authenticateToken, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  res.json(currentSpeed);
});

// Helper: Get directory size recursively
const getDirSize = (dirPath) => {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const files = fs.readdirSync(dirPath);
  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(dirPath, files[i]);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      size += getDirSize(filePath);
    } else {
      size += stats.size;
    }
  }
  return size;
};

// API: Get storage stats
app.get('/api/storage-stats', authenticateToken, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  try {
    const userFolder = getUserStorageFolder(req.user.user);
    const usedBytes = getDirSize(userFolder);
    const maxBytes = 10 * 1024 * 1024 * 1024; // 10 GB quota
    res.json({ usedBytes, maxBytes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate storage size' });
  }
});

// Admin Authentication Middleware
function authenticateAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
}

// API: List all users
app.get('/api/admin/users', authenticateToken, authenticateAdmin, (req, res) => {
  const users = loadUsers();
  const result = users.map(u => ({ username: u.username, role: u.role }));
  res.json(result);
});

// API: Create new user
app.post('/api/admin/users', authenticateToken, authenticateAdmin, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  
  const users = loadUsers();
  if (users.find(u => u.username === cleanUsername)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  
  const newUser = {
    username: cleanUsername,
    passwordHash: hashPassword(password),
    role: 'user'
  };
  users.push(newUser);
  saveUsers(users);
  
  // Pre-create user folder
  getUserStorageFolder(cleanUsername);
  
  res.json({ success: true, user: { username: cleanUsername, role: 'user' } });
});

// API: Delete user
app.delete('/api/admin/users/:username', authenticateToken, authenticateAdmin, (req, res) => {
  const targetUsername = req.params.username.trim().toLowerCase();
  if (targetUsername === 'admin') {
    return res.status(400).json({ error: 'Cannot delete master admin' });
  }
  
  let users = loadUsers();
  const userIndex = users.findIndex(u => u.username === targetUsername);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  users.splice(userIndex, 1);
  saveUsers(users);
  
  res.json({ success: true });
});

// Start server
const server = https.createServer(sslOptions, app);
server.timeout = 0; // Disable timeout for large uploads
server.keepAliveTimeout = 120000;

server.on('connection', (socket) => {
  activeSockets.add(socket);
  socket.on('close', () => {
    accumulatedRx += socket.bytesRead || 0;
    accumulatedTx += socket.bytesWritten || 0;
    activeSockets.delete(socket);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Cloud storage server running at https://0.0.0.0:${PORT}`);
  
  const bonjour = new Bonjour();
  bonjour.publish({ 
    name: 'My Node App', 
    type: 'https', 
    port: PORT,
    host: 'mynodeapp.local' 
  });
});
