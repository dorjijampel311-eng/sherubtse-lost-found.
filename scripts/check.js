const fs = require('fs');
const path = require('path');
const vm = require('vm');
const directories = ['config', 'controllers', 'routes', 'models', 'middleware', 'lib', 'services', 'scripts', 'test', 'public/js'];
const files = ['server.js', 'app.js', 'db.js', 'email.js', 'auth-codes.js', 'validation.js'];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (file.endsWith('.js')) files.push(file);
  }
}
directories.forEach(collect);
for (const file of files) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
console.log(`Syntax checks passed for ${files.length} JavaScript files.`);

const ejs = require('ejs');
const templates = fs.readdirSync('views').filter(file => file.endsWith('.ejs'));
for (const file of templates) {
  const filename = path.join('views', file);
  ejs.compile(fs.readFileSync(filename, 'utf8'), { filename });
}
console.log(`Template checks passed for ${templates.length} EJS views.`);
