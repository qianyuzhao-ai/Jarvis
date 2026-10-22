const { app } = require('electron');
const { resolve, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const source = resolve(__dirname, '../..');
app.setAppPath(source);
import(pathToFileURL(join(source, 'out/main/index.js')).href).then(
  (entry) => Object.assign(module.exports, entry),
  (error) => {
    console.error(error);
    app.exit(1);
  },
);
