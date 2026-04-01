const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RUN_TIMEOUT_MS = Number(process.env.WORKSPACE_RUN_TIMEOUT_MS) || 10000;
const MAX_OUTPUT_BYTES = Number(process.env.WORKSPACE_RUN_MAX_OUTPUT_BYTES) || 128 * 1024;
const MAX_FILE_COUNT = Number(process.env.WORKSPACE_RUN_MAX_FILES) || 200;
const MAX_TOTAL_SOURCE_BYTES = Number(process.env.WORKSPACE_RUN_MAX_TOTAL_BYTES) || 1024 * 1024;
const TERMINAL_TIMEOUT_MS = Number(process.env.WORKSPACE_TERMINAL_TIMEOUT_MS) || 120000;
const MAX_TERMINAL_OUTPUT_BYTES = Number(process.env.WORKSPACE_TERMINAL_MAX_OUTPUT_BYTES) || 512 * 1024;
const MAX_TERMINAL_FILE_BYTES = Number(process.env.WORKSPACE_TERMINAL_MAX_FILE_BYTES) || 256 * 1024;
const MAX_TERMINAL_SYNC_BYTES = Number(process.env.WORKSPACE_TERMINAL_MAX_SYNC_BYTES) || 2 * 1024 * 1024;
const WORKSPACE_RUNTIME_ROOT = path.resolve(__dirname, '../.workspace-runtime');
const TERMINAL_RUNTIME_STATE_FILENAME = '.workspace-runtime-state.json';
const IGNORED_TERMINAL_DIRECTORIES = new Set([
    '.git',
    'node_modules',
    '.next',
    'dist',
    'build',
    'coverage',
    'target',
    '.turbo',
    '.cache',
    '.parcel-cache'
]);
const INTERNAL_TERMINAL_FILES = new Set([
    TERMINAL_RUNTIME_STATE_FILENAME
]);
const ALLOWED_EXTERNAL_TERMINAL_COMMANDS = new Set([
    'node',
    'npm',
    'npx',
    'pnpm',
    'yarn',
    'python',
    'python3',
    'pip',
    'pip3',
    'php',
    'ruby',
    'bash',
    'sh',
    'go',
    'gcc',
    'g++',
    'clang',
    'clang++',
    'java',
    'javac',
    'rustc',
    'cargo'
]);
const TERMINAL_BUILTIN_COMMANDS = new Set([
    'help',
    'pwd',
    'cd',
    'ls',
    'dir',
    'tree',
    'cat',
    'type',
    'mkdir',
    'touch',
    'rm',
    'del',
    'mv',
    'move',
    'rename',
    'cp',
    'copy',
    'echo'
]);

const normalizePath = (inputPath = '') =>
    String(inputPath)
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .trim();

const getFileExtension = (filePath = '') => path.posix.extname(filePath).slice(1).toLowerCase();

const isSafeRelativePath = (filePath = '') => {
    const normalizedPath = normalizePath(filePath);
    if (!normalizedPath) {
        return false;
    }

    const segments = normalizedPath.split('/');
    return segments.every(
        (segment) =>
            segment &&
            segment !== '.' &&
            segment !== '..' &&
            !/[<>:"|?*\u0000]/.test(segment)
    );
};

const buildCommandLabel = (command, args = []) =>
    [command, ...args]
        .filter(Boolean)
        .map((value) => {
            const stringValue = String(value);
            return /\s/.test(stringValue) ? `"${stringValue}"` : stringValue;
        })
        .join(' ');

const buildTerminalPathLabel = (relativePath = '') => (relativePath ? `/${relativePath}` : '/');

const splitOutputLines = (content = '') =>
    String(content)
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);

const createExecutionResult = ({
    success,
    language,
    entryPath,
    stage = 'run',
    message = '',
    command = '',
    stdout = '',
    stderr = '',
    exitCode = null,
    signal = null,
    durationMs = 0,
    availableRuntime = true
}) => ({
    success,
    language,
    entryPath,
    stage,
    message,
    command,
    stdout,
    stderr,
    exitCode,
    signal,
    durationMs,
    availableRuntime
});

const createTerminalExecutionResult = ({
    success,
    command = '',
    cwd = '',
    message = '',
    stdout = '',
    stderr = '',
    exitCode = null,
    signal = null,
    durationMs = 0,
    availableRuntime = true,
    updatedCodeFiles = [],
    packageState = null
}) => ({
    success,
    command,
    cwd,
    message,
    stdout,
    stderr,
    exitCode,
    signal,
    durationMs,
    availableRuntime,
    updatedCodeFiles,
    packageState
});

const parseCommandString = (command = '') => {
    const input = String(command || '').trim();
    if (!input) {
        return [];
    }

    const tokens = [];
    let current = '';
    let quote = null;

    for (const character of input) {
        if (!quote && ['|', '>', '<', '&', ';', '`', '\r', '\n'].includes(character)) {
            throw new Error('Pipes, redirects, and chained shell commands are not supported in the workspace terminal.');
        }

        if (quote) {
            if (character === quote) {
                quote = null;
            } else {
                current += character;
            }
            continue;
        }

        if (character === '"' || character === '\'') {
            quote = character;
            continue;
        }

        if (/\s/.test(character)) {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            continue;
        }

        current += character;
    }

    if (quote) {
        throw new Error('Close the open quote before running the terminal command.');
    }

    if (current.length > 0) {
        tokens.push(current);
    }

    return tokens;
};

const resolveRelativeWorkspacePath = (cwd = '', target = '') => {
    const normalizedCwd = normalizePath(cwd);
    const rawTarget = String(target || '').trim().replace(/\\/g, '/');

    if (!rawTarget || rawTarget === '.') {
        return normalizedCwd;
    }

    const segments = rawTarget.startsWith('/') ? [] : normalizedCwd ? normalizedCwd.split('/') : [];

    for (const segment of rawTarget.split('/')) {
        if (!segment || segment === '.') {
            continue;
        }

        if (segment === '..') {
            if (segments.length === 0) {
                throw new Error('Cannot navigate outside the workspace root.');
            }
            segments.pop();
            continue;
        }

        segments.push(segment);
    }

    const nextPath = segments.join('/');
    if (nextPath && !isSafeRelativePath(nextPath)) {
        throw new Error(`Invalid workspace path: ${target}`);
    }

    return nextPath;
};

const resolveWorkspaceTarget = (workspaceDir, cwd = '', target = '') => {
    const relativePath = resolveRelativeWorkspacePath(cwd, target);
    const absolutePath = relativePath
        ? path.join(workspaceDir, ...relativePath.split('/'))
        : workspaceDir;

    return {
        relativePath,
        absolutePath,
        label: buildTerminalPathLabel(relativePath)
    };
};

const resolveWorkspaceCwd = async (workspaceDir, cwd = '') => {
    const resolvedTarget = resolveWorkspaceTarget(workspaceDir, '', cwd);
    const stats = await fs.stat(resolvedTarget.absolutePath).catch(() => null);

    if (!stats || !stats.isDirectory()) {
        throw new Error(`Directory not found: ${resolvedTarget.label}`);
    }

    return resolvedTarget;
};

const ensureWorkspaceEntries = (codeFiles = []) => {
    const entries = Array.isArray(codeFiles) ? codeFiles : [];
    let fileCount = 0;

    return entries
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }

            const type = entry.type === 'folder' ? 'folder' : 'file';
            const filePath = normalizePath(entry.path);

            if (!filePath) {
                return null;
            }

            if (!isSafeRelativePath(filePath)) {
                throw new Error(`Unsafe file path detected: ${entry.path}`);
            }

            if (type === 'file') {
                fileCount += 1;

                if (fileCount > MAX_FILE_COUNT) {
                    throw new Error(`Too many files in the workspace. Limit: ${MAX_FILE_COUNT}.`);
                }
            }

            return {
                type,
                path: filePath,
                content: type === 'file' && typeof entry.content === 'string' ? entry.content : ''
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }

            return a.path.localeCompare(b.path);
        });
};

const isTextBuffer = (buffer) => {
    if (!Buffer.isBuffer(buffer)) {
        return false;
    }

    const sample = buffer.subarray(0, Math.min(buffer.length, 1024));

    if (sample.includes(0)) {
        return false;
    }

    let suspiciousBytes = 0;
    for (const byte of sample) {
        const isCommonWhitespace = byte === 9 || byte === 10 || byte === 13;
        const isPrintableAscii = byte >= 32 && byte <= 126;
        const isExtendedByte = byte >= 128;

        if (!isCommonWhitespace && !isPrintableAscii && !isExtendedByte) {
            suspiciousBytes += 1;
        }
    }

    return suspiciousBytes <= Math.max(1, Math.floor(sample.length * 0.1));
};

const shouldIgnoreTerminalPath = (relativePath = '') =>
    normalizePath(relativePath)
        .split('/')
        .some((segment) => IGNORED_TERMINAL_DIRECTORIES.has(segment) || INTERNAL_TERMINAL_FILES.has(segment));

const collectWorkspaceEntries = async (workspaceDir) => {
    const entries = [];
    let totalBytes = 0;

    const walkDirectory = async (directoryPath, relativeDirectory = '') => {
        const children = await fs.readdir(directoryPath, { withFileTypes: true });
        const sortedChildren = [...children].sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) {
                return a.isDirectory() ? -1 : 1;
            }

            return a.name.localeCompare(b.name);
        });

        for (const child of sortedChildren) {
            if (child.name === '.' || child.name === '..' || INTERNAL_TERMINAL_FILES.has(child.name)) {
                continue;
            }

            const relativePath = normalizePath(relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name);
            if (!relativePath || shouldIgnoreTerminalPath(relativePath)) {
                continue;
            }

            const absolutePath = path.join(directoryPath, child.name);

            if (child.isDirectory()) {
                entries.push({
                    type: 'folder',
                    path: relativePath,
                    name: child.name,
                    content: ''
                });
                await walkDirectory(absolutePath, relativePath);
                continue;
            }

            if (!child.isFile()) {
                continue;
            }

            const fileBuffer = await fs.readFile(absolutePath);
            if (fileBuffer.length > MAX_TERMINAL_FILE_BYTES || !isTextBuffer(fileBuffer)) {
                continue;
            }

            if (totalBytes + fileBuffer.length > MAX_TERMINAL_SYNC_BYTES) {
                continue;
            }

            totalBytes += fileBuffer.length;
            entries.push({
                type: 'file',
                path: relativePath,
                name: child.name,
                content: fileBuffer.toString('utf8')
            });
        }
    };

    await walkDirectory(workspaceDir, '');

    return entries.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
        }

        return a.path.localeCompare(b.path);
    });
};

const sanitizeRuntimeToken = (value = '') =>
    String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');

const getWorkspaceRuntimeStatePath = (workspaceDir) =>
    path.join(workspaceDir, TERMINAL_RUNTIME_STATE_FILENAME);

const ensureWorkspaceRuntimeDir = async (workspaceId = '', runtimeScope = 'shared') => {
    const runtimeWorkspaceId = sanitizeRuntimeToken(workspaceId);
    const runtimeScopeId = sanitizeRuntimeToken(runtimeScope || 'shared') || 'shared';

    if (!runtimeWorkspaceId) {
        throw new Error('Workspace runtime is unavailable for this command.');
    }

    const runtimeDirectory = path.join(WORKSPACE_RUNTIME_ROOT, runtimeWorkspaceId, runtimeScopeId);
    await fs.mkdir(runtimeDirectory, { recursive: true });
    return runtimeDirectory;
};

const readWorkspaceRuntimeState = async (workspaceDir) => {
    try {
        const rawContent = await fs.readFile(getWorkspaceRuntimeStatePath(workspaceDir), 'utf8');
        const parsed = JSON.parse(rawContent);
        const trackedEntries = Array.isArray(parsed?.trackedEntries) ? parsed.trackedEntries : [];

        return trackedEntries.filter(
            (entry) =>
                entry &&
                typeof entry === 'object' &&
                (entry.type === 'file' || entry.type === 'folder') &&
                isSafeRelativePath(entry.path)
        );
    } catch (error) {
        return [];
    }
};

const writeWorkspaceRuntimeState = async (workspaceDir, trackedEntries = []) => {
    await fs.writeFile(
        getWorkspaceRuntimeStatePath(workspaceDir),
        JSON.stringify({ trackedEntries }, null, 2),
        'utf8'
    );
};

const syncWorkspaceEntriesToRuntime = async (workspaceDir, workspaceEntries = []) => {
    const trackedEntries = await readWorkspaceRuntimeState(workspaceDir);
    const nextTrackedEntries = workspaceEntries.map((entry) => ({
        type: entry.type,
        path: entry.path
    }));
    const nextTrackedKeys = new Set(
        nextTrackedEntries.map((entry) => `${entry.type}:${entry.path.toLowerCase()}`)
    );

    const entriesToRemove = trackedEntries
        .filter((entry) => !nextTrackedKeys.has(`${entry.type}:${entry.path.toLowerCase()}`))
        .sort((a, b) => {
            if (a.path.length !== b.path.length) {
                return b.path.length - a.path.length;
            }

            if (a.type !== b.type) {
                return a.type === 'file' ? -1 : 1;
            }

            return 0;
        });

    for (const entry of entriesToRemove) {
        const absolutePath = path.join(workspaceDir, ...normalizePath(entry.path).split('/'));
        await fs.rm(absolutePath, { recursive: true, force: true });
    }

    await writeWorkspaceFiles(workspaceDir, workspaceEntries);
    await writeWorkspaceRuntimeState(workspaceDir, nextTrackedEntries);
};

const getPackageManagerName = async (workspaceDir, packageJson = {}) => {
    if (typeof packageJson.packageManager === 'string' && packageJson.packageManager.trim()) {
        return packageJson.packageManager.split('@')[0];
    }

    const knownLockfiles = [
        ['pnpm-lock.yaml', 'pnpm'],
        ['yarn.lock', 'yarn'],
        ['package-lock.json', 'npm']
    ];

    for (const [fileName, packageManager] of knownLockfiles) {
        const exists = await fs.stat(path.join(workspaceDir, fileName)).then(() => true).catch(() => false);
        if (exists) {
            return packageManager;
        }
    }

    return 'npm';
};

const countInstalledPackages = async (nodeModulesDir) => {
    const children = await fs.readdir(nodeModulesDir, { withFileTypes: true }).catch(() => []);
    let packageCount = 0;

    for (const child of children) {
        if (child.name === '.bin') {
            continue;
        }

        if (child.isDirectory() && child.name.startsWith('@')) {
            const scopedPackages = await fs.readdir(path.join(nodeModulesDir, child.name), { withFileTypes: true }).catch(() => []);
            packageCount += scopedPackages.filter((entry) => entry.isDirectory()).length;
            continue;
        }

        if (child.isDirectory()) {
            packageCount += 1;
        }
    }

    return packageCount;
};

const readWorkspacePackageState = async (workspaceDir) => {
    const packageJsonPath = path.join(workspaceDir, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8').catch(() => '');

    if (!packageJsonContent) {
        return null;
    }

    let packageJson = null;
    try {
        packageJson = JSON.parse(packageJsonContent);
    } catch (error) {
        return {
            hasPackageJson: true,
            invalidPackageJson: true,
            packageManager: 'npm',
            hasNodeModules: false,
            installedPackageCount: 0,
            dependencyCount: 0,
            devDependencyCount: 0,
            scripts: []
        };
    }

    const dependencies = packageJson?.dependencies && typeof packageJson.dependencies === 'object'
        ? Object.keys(packageJson.dependencies)
        : [];
    const devDependencies = packageJson?.devDependencies && typeof packageJson.devDependencies === 'object'
        ? Object.keys(packageJson.devDependencies)
        : [];
    const scripts = packageJson?.scripts && typeof packageJson.scripts === 'object'
        ? Object.keys(packageJson.scripts)
        : [];
    const nodeModulesPath = path.join(workspaceDir, 'node_modules');
    const hasNodeModules = await fs.stat(nodeModulesPath).then((stats) => stats.isDirectory()).catch(() => false);

    return {
        hasPackageJson: true,
        invalidPackageJson: false,
        packageManager: await getPackageManagerName(workspaceDir, packageJson),
        name: typeof packageJson.name === 'string' ? packageJson.name : '',
        version: typeof packageJson.version === 'string' ? packageJson.version : '',
        dependencyCount: dependencies.length,
        devDependencyCount: devDependencies.length,
        scripts,
        hasNodeModules,
        installedPackageCount: hasNodeModules ? await countInstalledPackages(nodeModulesPath) : 0
    };
};

const spawnCommand = ({
    command,
    args = [],
    cwd,
    timeoutMs = RUN_TIMEOUT_MS,
    maxOutputBytes = MAX_OUTPUT_BYTES
}) =>
    new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let combinedBytes = 0;
        let timedOut = false;
        let truncated = false;

        const child = spawn(command, args, {
            cwd,
            env: process.env,
            windowsHide: true,
            shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
        });

        const appendChunk = (previous, chunk) => {
            if (truncated) {
                return previous;
            }

            const text = chunk.toString('utf8');
            const chunkBytes = Buffer.byteLength(text);
            const remainingBytes = maxOutputBytes - combinedBytes;

            if (remainingBytes <= 0) {
                truncated = true;
                child.kill();
                return previous;
            }

            if (chunkBytes <= remainingBytes) {
                combinedBytes += chunkBytes;
                return previous + text;
            }

            combinedBytes += remainingBytes;
            truncated = true;
            child.kill();
            return previous + Buffer.from(text).subarray(0, remainingBytes).toString('utf8');
        };

        child.stdout.on('data', (chunk) => {
            stdout = appendChunk(stdout, chunk);
        });

        child.stderr.on('data', (chunk) => {
            stderr = appendChunk(stderr, chunk);
        });

        const timeoutId = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);

        child.on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });

        child.on('close', (code, signal) => {
            clearTimeout(timeoutId);
            resolve({
                code,
                signal,
                stdout,
                stderr,
                timedOut,
                truncated,
                command: buildCommandLabel(command, args)
            });
        });
    });

const runCandidateCommands = async (candidates = [], options = {}) => {
    const missingCommands = [];

    for (const candidate of candidates) {
        try {
            return await spawnCommand({
                command: candidate.command,
                args: candidate.args,
                cwd: options.cwd,
                timeoutMs: options.timeoutMs,
                maxOutputBytes: options.maxOutputBytes
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                missingCommands.push(candidate.command);
                continue;
            }

            throw error;
        }
    }

    return {
        missingCommands
    };
};

const resolveJavaExecution = ({ entryFile, entryAbsolutePath, workspaceDir }) => {
    const packageMatch = String(entryFile.content || '').match(/^\s*package\s+([\w.]+)\s*;/m);
    const className = path.basename(entryFile.path, '.java');

    if (packageMatch) {
        return {
            classpath: workspaceDir,
            mainClass: `${packageMatch[1]}.${className}`
        };
    }

    return {
        classpath: path.dirname(entryAbsolutePath),
        mainClass: className
    };
};

const createOutputBinaryPath = (workspaceDir, baseName) => {
    const executableName = process.platform === 'win32' ? `${baseName}.exe` : baseName;
    return path.join(workspaceDir, executableName);
};

const getExternalCommandCandidates = (command, args = []) => {
    if (process.platform !== 'win32') {
        return [{ command, args }];
    }

    const windowsCandidates = {
        npm: ['npm.cmd', 'npm'],
        npx: ['npx.cmd', 'npx'],
        pnpm: ['pnpm.cmd', 'pnpm'],
        yarn: ['yarn.cmd', 'yarn']
    };

    return (windowsCandidates[command] || [command]).map((candidateCommand) => ({
        command: candidateCommand,
        args
    }));
};

const formatDirectoryEntries = async (absolutePath) => {
    const children = await fs.readdir(absolutePath, { withFileTypes: true });

    return [...children]
        .filter((child) => !INTERNAL_TERMINAL_FILES.has(child.name))
        .sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) {
                return a.isDirectory() ? -1 : 1;
            }

            return a.name.localeCompare(b.name);
        })
        .map((child) => (child.isDirectory() ? `${child.name}/` : child.name))
        .join('\n');
};

const buildTreeOutput = async (absoluteRootPath, relativeDirectory = '') => {
    const lines = [buildTerminalPathLabel(relativeDirectory)];

    const walkDirectory = async (currentPath, relativePath = '', prefix = '') => {
        const children = (await fs.readdir(currentPath, { withFileTypes: true }))
            .filter((child) => {
                const childRelativePath = normalizePath(relativePath ? `${relativePath}/${child.name}` : child.name);
                return childRelativePath && !shouldIgnoreTerminalPath(childRelativePath);
            })
            .sort((a, b) => {
                if (a.isDirectory() !== b.isDirectory()) {
                    return a.isDirectory() ? -1 : 1;
                }

                return a.name.localeCompare(b.name);
            });

        for (let index = 0; index < children.length; index += 1) {
            const child = children[index];
            const isLast = index === children.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const childRelativePath = normalizePath(relativePath ? `${relativePath}/${child.name}` : child.name);
            const childPath = path.join(currentPath, child.name);

            lines.push(`${prefix}${connector}${child.name}${child.isDirectory() ? '/' : ''}`);

            if (child.isDirectory()) {
                await walkDirectory(childPath, childRelativePath, `${prefix}${isLast ? '    ' : '│   '}`);
            }
        }
    };

    await walkDirectory(absoluteRootPath, relativeDirectory, '');
    return lines.join('\n');
};

const runTerminalBuiltinCommand = async ({
    workspaceDir,
    cwd = '',
    commandName,
    args = []
}) => {
    switch (commandName) {
    case 'help':
        return {
            success: true,
            cwd,
            stdout: [
                'Built-in commands:',
                '  help, pwd, cd, ls, dir, tree, cat, type, mkdir, touch, rm, del, mv, move, rename, cp, copy, echo',
                '',
                'Allowed external commands:',
                `  ${[...ALLOWED_EXTERNAL_TERMINAL_COMMANDS].sort().join(', ')}`,
                '',
                'Tip: use "clear" or "cls" in the terminal panel to clear the screen.'
            ].join('\n')
        };
    case 'pwd':
        return {
            success: true,
            cwd,
            stdout: buildTerminalPathLabel(cwd)
        };
    case 'cd': {
        if (args.length > 1) {
            throw new Error('The cd command accepts only one target directory.');
        }

        const nextPath = resolveRelativeWorkspacePath(cwd, args[0] || '');
        const nextCwd = await resolveWorkspaceCwd(workspaceDir, nextPath);
        return {
            success: true,
            cwd: nextCwd.relativePath,
            stdout: ''
        };
    }
    case 'ls':
    case 'dir': {
        const target = resolveWorkspaceTarget(workspaceDir, cwd, args[0] || '');
        const stats = await fs.stat(target.absolutePath).catch(() => null);

        if (!stats) {
            throw new Error(`Path not found: ${target.label}`);
        }

        if (stats.isFile()) {
            return {
                success: true,
                cwd,
                stdout: path.basename(target.absolutePath)
            };
        }

        return {
            success: true,
            cwd,
            stdout: await formatDirectoryEntries(target.absolutePath)
        };
    }
    case 'tree': {
        const target = resolveWorkspaceTarget(workspaceDir, cwd, args[0] || '');
        const stats = await fs.stat(target.absolutePath).catch(() => null);

        if (!stats || !stats.isDirectory()) {
            throw new Error(`Directory not found: ${target.label}`);
        }

        return {
            success: true,
            cwd,
            stdout: await buildTreeOutput(target.absolutePath, target.relativePath)
        };
    }
    case 'cat':
    case 'type': {
        if (args.length === 0) {
            throw new Error(`Usage: ${commandName} <file>`);
        }

        const chunks = [];

        for (let index = 0; index < args.length; index += 1) {
            const target = resolveWorkspaceTarget(workspaceDir, cwd, args[index]);
            const stats = await fs.stat(target.absolutePath).catch(() => null);

            if (!stats || !stats.isFile()) {
                throw new Error(`File not found: ${target.label}`);
            }

            const fileBuffer = await fs.readFile(target.absolutePath);
            if (!isTextBuffer(fileBuffer)) {
                throw new Error(`Cannot display binary file: ${target.label}`);
            }

            if (args.length > 1) {
                chunks.push(`==> ${target.label} <==`);
            }

            chunks.push(fileBuffer.toString('utf8'));
        }

        return {
            success: true,
            cwd,
            stdout: chunks.join('\n')
        };
    }
    case 'mkdir': {
        const recursive = args.includes('-p');
        const targets = args.filter((value) => value !== '-p');

        if (targets.length === 0) {
            throw new Error('Usage: mkdir [-p] <folder>');
        }

        for (const targetPath of targets) {
            const target = resolveWorkspaceTarget(workspaceDir, cwd, targetPath);
            await fs.mkdir(target.absolutePath, { recursive });
        }

        return {
            success: true,
            cwd,
            message: `Created ${targets.length} folder${targets.length === 1 ? '' : 's'}.`
        };
    }
    case 'touch': {
        if (args.length === 0) {
            throw new Error('Usage: touch <file>');
        }

        for (const targetPath of args) {
            const target = resolveWorkspaceTarget(workspaceDir, cwd, targetPath);
            await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
            await fs.writeFile(target.absolutePath, '', { flag: 'a' });
            const now = new Date();
            await fs.utimes(target.absolutePath, now, now).catch(() => {});
        }

        return {
            success: true,
            cwd,
            message: `Touched ${args.length} file${args.length === 1 ? '' : 's'}.`
        };
    }
    case 'rm':
    case 'del': {
        const recursive = args.includes('-r') || args.includes('-rf') || args.includes('/s');
        const force = args.includes('-f') || args.includes('-rf') || args.includes('/q');
        const targets = args.filter((value) => !['-r', '-f', '-rf', '/s', '/q'].includes(value));

        if (targets.length === 0) {
            throw new Error(`Usage: ${commandName} [-r] [-f] <path>`);
        }

        for (const targetPath of targets) {
            const target = resolveWorkspaceTarget(workspaceDir, cwd, targetPath);
            const stats = await fs.stat(target.absolutePath).catch(() => null);

            if (!stats) {
                if (force) {
                    continue;
                }
                throw new Error(`Path not found: ${target.label}`);
            }

            if (stats.isDirectory() && !recursive) {
                throw new Error(`Cannot remove directory without -r: ${target.label}`);
            }

            await fs.rm(target.absolutePath, {
                recursive: stats.isDirectory(),
                force
            });
        }

        return {
            success: true,
            cwd,
            message: `Removed ${targets.length} item${targets.length === 1 ? '' : 's'}.`
        };
    }
    case 'mv':
    case 'move':
    case 'rename': {
        if (args.length !== 2) {
            throw new Error(`Usage: ${commandName} <source> <destination>`);
        }

        const source = resolveWorkspaceTarget(workspaceDir, cwd, args[0]);
        const destination = resolveWorkspaceTarget(workspaceDir, cwd, args[1]);
        await fs.access(source.absolutePath).catch(() => {
            throw new Error(`Path not found: ${source.label}`);
        });
        await fs.mkdir(path.dirname(destination.absolutePath), { recursive: true });
        await fs.rename(source.absolutePath, destination.absolutePath);

        return {
            success: true,
            cwd,
            message: `Moved ${source.label} to ${destination.label}.`
        };
    }
    case 'cp':
    case 'copy': {
        const recursive = args.includes('-r') || args.includes('-R');
        const targets = args.filter((value) => !['-r', '-R'].includes(value));

        if (targets.length !== 2) {
            throw new Error(`Usage: ${commandName} [-r] <source> <destination>`);
        }

        const source = resolveWorkspaceTarget(workspaceDir, cwd, targets[0]);
        const destination = resolveWorkspaceTarget(workspaceDir, cwd, targets[1]);
        const sourceStats = await fs.stat(source.absolutePath).catch(() => null);

        if (!sourceStats) {
            throw new Error(`Path not found: ${source.label}`);
        }

        if (sourceStats.isDirectory() && !recursive) {
            throw new Error(`Cannot copy directory without -r: ${source.label}`);
        }

        await fs.mkdir(path.dirname(destination.absolutePath), { recursive: true });
        await fs.cp(source.absolutePath, destination.absolutePath, {
            recursive: sourceStats.isDirectory(),
            force: true
        });

        return {
            success: true,
            cwd,
            message: `Copied ${source.label} to ${destination.label}.`
        };
    }
    case 'echo':
        return {
            success: true,
            cwd,
            stdout: args.join(' ')
        };
    default:
        throw new Error(`Unsupported terminal command: ${commandName}`);
    }
};

const RUNNER_CONFIGS = {
    js: {
        language: 'JavaScript',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'node', args: ['--no-warnings', entryAbsolutePath] }
            ]
        })
    },
    mjs: {
        language: 'JavaScript',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'node', args: ['--no-warnings', entryAbsolutePath] }
            ]
        })
    },
    cjs: {
        language: 'JavaScript',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'node', args: ['--no-warnings', entryAbsolutePath] }
            ]
        })
    },
    ts: {
        language: 'TypeScript',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'node', args: ['--no-warnings', '--experimental-strip-types', entryAbsolutePath] }
            ]
        })
    },
    py: {
        language: 'Python',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'python', args: [entryAbsolutePath] },
                { command: 'python3', args: [entryAbsolutePath] }
            ]
        })
    },
    rb: {
        language: 'Ruby',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'ruby', args: [entryAbsolutePath] }
            ]
        })
    },
    php: {
        language: 'PHP',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'php', args: [entryAbsolutePath] }
            ]
        })
    },
    go: {
        language: 'Go',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'go', args: ['run', entryAbsolutePath] }
            ]
        })
    },
    rs: {
        language: 'Rust',
        createPlan: ({ entryAbsolutePath, workspaceDir }) => {
            const outputPath = createOutputBinaryPath(workspaceDir, 'workspace-rust-run');
            return {
                compile: [
                    [
                        { command: 'rustc', args: [entryAbsolutePath, '-o', outputPath] }
                    ]
                ],
                run: [
                    { command: outputPath, args: [] }
                ]
            };
        }
    },
    sh: {
        language: 'Shell',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'bash', args: [entryAbsolutePath] }
            ]
        })
    },
    bash: {
        language: 'Shell',
        createPlan: ({ entryAbsolutePath }) => ({
            compile: [],
            run: [
                { command: 'bash', args: [entryAbsolutePath] }
            ]
        })
    },
    c: {
        language: 'C',
        createPlan: ({ entryAbsolutePath, workspaceDir }) => {
            const outputPath = createOutputBinaryPath(workspaceDir, 'workspace-c-run');
            return {
                compile: [
                    [
                        { command: 'gcc', args: [entryAbsolutePath, '-o', outputPath] },
                        { command: 'clang', args: [entryAbsolutePath, '-o', outputPath] }
                    ]
                ],
                run: [
                    { command: outputPath, args: [] }
                ]
            };
        }
    },
    cpp: {
        language: 'C++',
        createPlan: ({ entryAbsolutePath, workspaceDir }) => {
            const outputPath = createOutputBinaryPath(workspaceDir, 'workspace-cpp-run');
            return {
                compile: [
                    [
                        { command: 'g++', args: [entryAbsolutePath, '-o', outputPath] },
                        { command: 'clang++', args: [entryAbsolutePath, '-o', outputPath] }
                    ]
                ],
                run: [
                    { command: outputPath, args: [] }
                ]
            };
        }
    },
    cxx: {
        language: 'C++',
        createPlan: ({ entryAbsolutePath, workspaceDir }) => {
            const outputPath = createOutputBinaryPath(workspaceDir, 'workspace-cxx-run');
            return {
                compile: [
                    [
                        { command: 'g++', args: [entryAbsolutePath, '-o', outputPath] },
                        { command: 'clang++', args: [entryAbsolutePath, '-o', outputPath] }
                    ]
                ],
                run: [
                    { command: outputPath, args: [] }
                ]
            };
        }
    },
    cc: {
        language: 'C++',
        createPlan: ({ entryAbsolutePath, workspaceDir }) => {
            const outputPath = createOutputBinaryPath(workspaceDir, 'workspace-cc-run');
            return {
                compile: [
                    [
                        { command: 'g++', args: [entryAbsolutePath, '-o', outputPath] },
                        { command: 'clang++', args: [entryAbsolutePath, '-o', outputPath] }
                    ]
                ],
                run: [
                    { command: outputPath, args: [] }
                ]
            };
        }
    },
    java: {
        language: 'Java',
        createPlan: ({ entryFile, entryAbsolutePath, workspaceDir }) => {
            const javaExecution = resolveJavaExecution({
                entryFile,
                entryAbsolutePath,
                workspaceDir
            });

            return {
                compile: [
                    [
                        { command: 'javac', args: [entryAbsolutePath] }
                    ]
                ],
                run: [
                    { command: 'java', args: ['-cp', javaExecution.classpath, javaExecution.mainClass] }
                ]
            };
        }
    }
};

const SUPPORTED_EXTENSIONS = Object.keys(RUNNER_CONFIGS).sort();

const ensureCodeFilesAreRunnable = (codeFiles = []) => {
    const fileEntries = codeFiles.filter((entry) => entry && entry.type === 'file');

    if (fileEntries.length === 0) {
        throw new Error('Create at least one file before running code.');
    }

    if (fileEntries.length > MAX_FILE_COUNT) {
        throw new Error(`Too many files to run at once. Limit: ${MAX_FILE_COUNT}.`);
    }

    return fileEntries;
};

const resolveEntryFile = (fileEntries = [], requestedEntryPath = '') => {
    if (requestedEntryPath) {
        const normalizedEntryPath = normalizePath(requestedEntryPath).toLowerCase();
        const matchingFile = fileEntries.find((entry) => entry.path.toLowerCase() === normalizedEntryPath);

        if (!matchingFile) {
            throw new Error('The selected run file was not found in the workspace.');
        }

        return matchingFile;
    }

    const runnableEntry = fileEntries.find((entry) => SUPPORTED_EXTENSIONS.includes(getFileExtension(entry.path)));
    return runnableEntry || fileEntries[0];
};

const writeWorkspaceFiles = async (workspaceDir, fileEntries = []) => {
    let totalSourceBytes = 0;

    for (const entry of fileEntries) {
        if (!isSafeRelativePath(entry.path)) {
            throw new Error(`Unsafe file path detected: ${entry.path}`);
        }

        const destinationPath = path.join(workspaceDir, ...normalizePath(entry.path).split('/'));
        if (entry.type === 'folder') {
            await fs.mkdir(destinationPath, { recursive: true });
            continue;
        }

        const fileContent = typeof entry.content === 'string' ? entry.content : '';
        totalSourceBytes += Buffer.byteLength(fileContent, 'utf8');

        if (totalSourceBytes > MAX_TOTAL_SOURCE_BYTES) {
            throw new Error(`Workspace source is too large to run. Limit: ${MAX_TOTAL_SOURCE_BYTES} bytes.`);
        }

        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        await fs.writeFile(destinationPath, fileContent, 'utf8');
    }
};

const runWorkspaceCodeFiles = async ({
    codeFiles = [],
    entryPath = '',
    workspaceId = '',
    runtimeScope = 'shared'
}) => {
    const startedAt = Date.now();
    const fileEntries = ensureCodeFilesAreRunnable(codeFiles);
    const entryFile = resolveEntryFile(fileEntries, entryPath);
    const extension = getFileExtension(entryFile.path);
    const runner = RUNNER_CONFIGS[extension];

    if (!runner) {
        return createExecutionResult({
            success: false,
            language: extension ? extension.toUpperCase() : 'Unknown',
            entryPath: entryFile.path,
            stage: 'configuration',
            message: `This file type is not runnable yet. Supported server-run extensions: ${SUPPORTED_EXTENSIONS.join(', ')}.`,
            durationMs: Date.now() - startedAt,
            availableRuntime: false
        });
    }

    const usePersistentRuntime =
        Boolean(String(workspaceId || '').trim()) &&
        ['js', 'mjs', 'cjs', 'ts'].includes(extension);
    const workspaceDir = usePersistentRuntime
        ? await ensureWorkspaceRuntimeDir(workspaceId, runtimeScope)
        : await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-run-'));

    try {
        if (usePersistentRuntime) {
            const workspaceEntries = ensureWorkspaceEntries(codeFiles);
            await syncWorkspaceEntriesToRuntime(workspaceDir, workspaceEntries);
        } else {
            await writeWorkspaceFiles(workspaceDir, fileEntries);
        }

        const entryAbsolutePath = path.join(workspaceDir, ...normalizePath(entryFile.path).split('/'));
        const plan = runner.createPlan({
            entryFile,
            entryAbsolutePath,
            workspaceDir
        });

        for (const compileCandidates of plan.compile) {
            const compileResult = await runCandidateCommands(compileCandidates, {
                cwd: workspaceDir,
                timeoutMs: RUN_TIMEOUT_MS
            });

            if (compileResult.missingCommands) {
                return createExecutionResult({
                    success: false,
                    language: runner.language,
                    entryPath: entryFile.path,
                    stage: 'compile',
                    message: `The server does not have the required ${runner.language} compiler/runtime installed.`,
                    durationMs: Date.now() - startedAt,
                    availableRuntime: false
                });
            }

            if (compileResult.timedOut) {
                return createExecutionResult({
                    success: false,
                    language: runner.language,
                    entryPath: entryFile.path,
                    stage: 'compile',
                    message: 'Compilation timed out.',
                    command: compileResult.command,
                    stdout: compileResult.stdout,
                    stderr: compileResult.stderr,
                    exitCode: compileResult.code,
                    signal: compileResult.signal,
                    durationMs: Date.now() - startedAt
                });
            }

            if (compileResult.code !== 0) {
                return createExecutionResult({
                    success: false,
                    language: runner.language,
                    entryPath: entryFile.path,
                    stage: 'compile',
                    message: `Compilation failed with exit code ${compileResult.code}.`,
                    command: compileResult.command,
                    stdout: compileResult.stdout,
                    stderr: compileResult.stderr,
                    exitCode: compileResult.code,
                    signal: compileResult.signal,
                    durationMs: Date.now() - startedAt
                });
            }
        }

        const runResult = await runCandidateCommands(plan.run, {
            cwd: workspaceDir,
            timeoutMs: RUN_TIMEOUT_MS
        });

        if (runResult.missingCommands) {
            return createExecutionResult({
                success: false,
                language: runner.language,
                entryPath: entryFile.path,
                stage: 'run',
                message: `The server does not have the required ${runner.language} runtime installed.`,
                durationMs: Date.now() - startedAt,
                availableRuntime: false
            });
        }

        if (runResult.timedOut) {
            return createExecutionResult({
                success: false,
                language: runner.language,
                entryPath: entryFile.path,
                stage: 'run',
                message: 'Execution timed out.',
                command: runResult.command,
                stdout: runResult.stdout,
                stderr: runResult.stderr,
                exitCode: runResult.code,
                signal: runResult.signal,
                durationMs: Date.now() - startedAt
            });
        }

        if (runResult.truncated) {
            return createExecutionResult({
                success: false,
                language: runner.language,
                entryPath: entryFile.path,
                stage: 'run',
                message: 'Execution output exceeded the size limit and was stopped.',
                command: runResult.command,
                stdout: runResult.stdout,
                stderr: runResult.stderr,
                exitCode: runResult.code,
                signal: runResult.signal,
                durationMs: Date.now() - startedAt
            });
        }

        return createExecutionResult({
            success: runResult.code === 0,
            language: runner.language,
            entryPath: entryFile.path,
            stage: 'run',
            message: runResult.code === 0 ? 'Execution completed.' : `Execution exited with code ${runResult.code}.`,
            command: runResult.command,
            stdout: runResult.stdout,
            stderr: runResult.stderr,
            exitCode: runResult.code,
            signal: runResult.signal,
            durationMs: Date.now() - startedAt
        });
    } finally {
        if (!usePersistentRuntime) {
            await fs.rm(workspaceDir, { recursive: true, force: true });
        }
    }
};

const runWorkspaceTerminalCommand = ({
    workspaceId = '',
    runtimeScope = 'shared',
    codeFiles = [],
    command = '',
    cwd = ''
}) => {
    const startedAt = Date.now();
    const trimmedCommand = String(command || '').trim();
    
    return ensureWorkspaceRuntimeDir(workspaceId, runtimeScope).then(async (workspaceDir) => {
        try {
            if (!trimmedCommand) {
                throw new Error('Enter a terminal command to run.');
            }

            const workspaceEntries = ensureWorkspaceEntries(codeFiles);
            await syncWorkspaceEntriesToRuntime(workspaceDir, workspaceEntries);

            const normalizedCwd = await resolveWorkspaceCwd(workspaceDir, cwd);
            const parsedCommand = parseCommandString(trimmedCommand);

            if (parsedCommand.length === 0) {
                throw new Error('Enter a terminal command to run.');
            }

            const [commandName, ...args] = parsedCommand;
            const normalizedCommandName = commandName.toLowerCase();
            let executionResult;

            if (TERMINAL_BUILTIN_COMMANDS.has(normalizedCommandName)) {
                executionResult = await runTerminalBuiltinCommand({
                    workspaceDir,
                    cwd: normalizedCwd.relativePath,
                    commandName: normalizedCommandName,
                    args
                });
            } else if (ALLOWED_EXTERNAL_TERMINAL_COMMANDS.has(normalizedCommandName)) {
                const externalResult = await runCandidateCommands(
                    getExternalCommandCandidates(normalizedCommandName, args),
                    {
                        cwd: normalizedCwd.absolutePath,
                        timeoutMs: TERMINAL_TIMEOUT_MS,
                        maxOutputBytes: MAX_TERMINAL_OUTPUT_BYTES
                    }
                );

                if (externalResult.missingCommands) {
                    return createTerminalExecutionResult({
                        success: false,
                        command: trimmedCommand,
                        cwd: normalizedCwd.relativePath,
                        message: `The server does not have "${normalizedCommandName}" installed.`,
                        durationMs: Date.now() - startedAt,
                        availableRuntime: false
                    });
                }

                executionResult = {
                    success: externalResult.code === 0 && !externalResult.timedOut && !externalResult.truncated,
                    command: externalResult.command,
                    cwd: normalizedCwd.relativePath,
                    stdout: externalResult.stdout,
                    stderr: externalResult.stderr,
                    exitCode: externalResult.code,
                    signal: externalResult.signal,
                    message: externalResult.timedOut
                        ? 'Terminal command timed out.'
                        : externalResult.truncated
                            ? 'Terminal output exceeded the size limit and was stopped.'
                            : externalResult.code === 0
                                ? ''
                                : `Terminal command exited with code ${externalResult.code}.`,
                    availableRuntime: true
                };
            } else {
                return createTerminalExecutionResult({
                    success: false,
                    command: trimmedCommand,
                    cwd: normalizedCwd.relativePath,
                    message: `Command "${commandName}" is not supported in the workspace terminal yet.`,
                    durationMs: Date.now() - startedAt,
                    availableRuntime: false
                });
            }

            const updatedCodeFiles = await collectWorkspaceEntries(workspaceDir);
            const packageState = await readWorkspacePackageState(workspaceDir);

            return createTerminalExecutionResult({
                success: executionResult.success,
                command: executionResult.command || trimmedCommand,
                cwd: executionResult.cwd ?? normalizedCwd.relativePath,
                message: executionResult.message || '',
                stdout: executionResult.stdout || '',
                stderr: executionResult.stderr || '',
                exitCode: executionResult.exitCode ?? null,
                signal: executionResult.signal ?? null,
                durationMs: Date.now() - startedAt,
                availableRuntime: executionResult.availableRuntime !== false,
                updatedCodeFiles,
                packageState
            });
        } catch (error) {
            return createTerminalExecutionResult({
                success: false,
                command: trimmedCommand,
                cwd: normalizePath(cwd),
                message: error.message || 'Terminal command failed.',
                durationMs: Date.now() - startedAt,
                availableRuntime: true
            });
        }
    });
};

module.exports = {
    runWorkspaceCodeFiles,
    runWorkspaceTerminalCommand,
    splitOutputLines
};
