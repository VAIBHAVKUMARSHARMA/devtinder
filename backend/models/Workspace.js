const mongoose = require('mongoose');

const DEFAULT_JS_CODE = '// Write your code here...\n\nconsole.log("Welcome to your Collaborative Workspace!");\n';
const DEFAULT_HTML_CODE = `<main class="app">
  <h1>DevTinder Workspace</h1>
  <p>Edit HTML, CSS, and JS, then click Run to preview.</p>
  <button id="demoButton">Click me</button>
</main>`;
const DEFAULT_CSS_CODE = `body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 2rem;
  background: #f4f7fb;
}

.app {
  max-width: 560px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.12);
}

h1 {
  margin-top: 0;
  color: #0f172a;
}

button {
  margin-top: 1rem;
  border: none;
  background: #2563eb;
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  cursor: pointer;
}`;

const workspaceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a name for the workspace'],
        trim: true,
        maxlength: [100, 'Workspace name cannot be more than 100 characters']
    },
    description: {
        type: String,
        maxlength: [1000, 'Description cannot be more than 1000 characters'],
        default: ''
    },
    owner: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    members: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }],
    pendingMembers: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }],
    code: {
        type: String,
        default: DEFAULT_JS_CODE
    },
    codeFiles: {
        html: {
            type: String,
            default: DEFAULT_HTML_CODE
        },
        css: {
            type: String,
            default: DEFAULT_CSS_CODE
        },
        js: {
            type: String,
            default: DEFAULT_JS_CODE
        }
    }
}, { timestamps: true });

// Index for faster queries
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ members: 1 });

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;
