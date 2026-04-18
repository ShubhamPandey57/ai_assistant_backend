const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',                                                                          // .pdf
  'text/plain',                                                                               // .txt
  'application/msword',                                                                       // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',                // .docx
  'application/vnd.ms-excel',                                                                // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',                     // .xlsx
  'application/vnd.ms-powerpoint',                                                           // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',             // .pptx
  'image/jpeg',                                                                              // .jpg, .jpeg
  'image/png',                                                                               // .png
  'image/webp',                                                                              // .webp
];

const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME_TYPES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type "${ext}". Allowed: PDF, TXT, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, WEBP.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

module.exports = upload;
module.exports.ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS;
