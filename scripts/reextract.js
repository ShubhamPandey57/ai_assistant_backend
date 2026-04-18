const mongoose = require('mongoose');
const path = require('path');
const pdfParse = require('pdf-parse');
const fs = require('fs');
require('dotenv').config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const docs = await mongoose.connection.db.collection('documents').find({}).toArray();
  console.log(`Found ${docs.length} document(s) to process`);

  for (const doc of docs) {
    console.log('\n--- Processing:', doc.originalName);
    const absPath = path.resolve(doc.filepath);
    console.log('Path:', absPath);
    console.log('File exists:', fs.existsSync(absPath));

    if (!fs.existsSync(absPath)) {
      console.log('SKIPPING - file not found on disk');
      continue;
    }

    let extractedText = '';
    try {
      const buf = fs.readFileSync(absPath);
      const data = await pdfParse(buf);
      extractedText = (data.text || '').trim();
      console.log('Extracted chars:', extractedText.length);
      if (extractedText.length > 0) {
        console.log('Preview:', extractedText.substring(0, 200));
      } else {
        extractedText = '[Image-based PDF: no selectable text layer found. AI features limited.]';
        console.log('NOTE: Image-based PDF, no text extracted');
      }
    } catch (e) {
      extractedText = '[PDF extraction failed: ' + e.message + ']';
      console.log('Extraction error:', e.message);
    }

    await mongoose.connection.db.collection('documents').updateOne(
      { _id: doc._id },
      { $set: { extractedText: extractedText } }
    );
    console.log('Updated in DB');
  }

  console.log('\nDone!');
  mongoose.disconnect();
};

run().catch(err => { console.error(err); process.exit(1); });
