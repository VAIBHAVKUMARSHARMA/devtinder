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

const DEFAULT_WHITEBOARD_DATA = {
    nodes: [
        {
            id: 'node_idea',
            title: 'Idea',
            description: 'Define problem and scope',
            color: '#2563eb',
            x: 140,
            y: 130
        },
        {
            id: 'node_build',
            title: 'Build',
            description: 'Implement core features',
            color: '#16a34a',
            x: 460,
            y: 130
        },
        {
            id: 'node_review',
            title: 'Review',
            description: 'Test, QA and feedback loop',
            color: '#ea580c',
            x: 780,
            y: 130
        }
    ],
    links: [
        {
            id: 'link_idea_build',
            from: 'node_idea',
            to: 'node_build'
        },
        {
            id: 'link_build_review',
            from: 'node_build',
            to: 'node_review'
        }
    ]
};

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
        type: mongoose.Schema.Types.Mixed,
        default: () => ([
            {
                id: 'file_index_html',
                type: 'file',
                path: 'index.html',
                name: 'index.html',
                content: DEFAULT_HTML_CODE
            },
            {
                id: 'file_styles_css',
                type: 'file',
                path: 'styles.css',
                name: 'styles.css',
                content: DEFAULT_CSS_CODE
            },
            {
                id: 'file_script_js',
                type: 'file',
                path: 'script.js',
                name: 'script.js',
                content: DEFAULT_JS_CODE
            }
        ])
    },
    whiteboardData: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({
            nodes: DEFAULT_WHITEBOARD_DATA.nodes.map((node) => ({ ...node })),
            links: DEFAULT_WHITEBOARD_DATA.links.map((link) => ({ ...link }))
        })
    }
}, { timestamps: true });

// Index for faster queries
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ members: 1 });

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;
