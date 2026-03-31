const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RUN_TIMEOUT_MS = Number(process.env.WORKSPACE_RUN_TIMEOUT_MS) || 10000;
const MAX_OUTPUT_BYTES = Number(process.env.WORKSPACE_RUN_MAX_OUTPUT_BYTES) || 128 * 1024;
const MAX_FILE_COUNT = Number(process.env.WORKSPACE_RUN_MAX_FILES) || 200;
const MAX_TOTAL_SOURCE_BYTES = Number(process.env.WORKSPACE_RUN_MAX_TOTAL_BYTES) || 1024 * 1024;

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
    return segments.every((segment) => segment && segment !== '.' && segment !== '..');
};

const buildCommandLabel = (command, args = []) =>
    [command, ...args]
        .filter(Boolean)
        .map((value) => {
            const stringValue = String(value);
            return /\s/.test(stringValue) ? `"${stringValue}"` : stringValue;
        })
        .join(' ');

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

const spawnCommand = ({ command, args = [], cwd, timeoutMs = RUN_TIMEOUT_MS }) =>
    new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let combinedBytes = 0;
        let timedOut = false;
        let truncated = false;

        const child = spawn(command, args, {
            cwd,
            env: process.env,
            windowsHide: true
        });

        const appendChunk = (previous, chunk) => {
            if (truncated) {
                return previous;
            }

            const text = chunk.toString('utf8');
            const chunkBytes = Buffer.byteLength(text);
            const remainingBytes = MAX_OUTPUT_BYTES - combinedBytes;

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
                timeoutMs: options.timeoutMs
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

        const fileContent = typeof entry.content === 'string' ? entry.content : '';
        totalSourceBytes += Buffer.byteLength(fileContent, 'utf8');

        if (totalSourceBytes > MAX_TOTAL_SOURCE_BYTES) {
            throw new Error(`Workspace source is too large to run. Limit: ${MAX_TOTAL_SOURCE_BYTES} bytes.`);
        }

        const destinationPath = path.join(workspaceDir, ...normalizePath(entry.path).split('/'));
        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        await fs.writeFile(destinationPath, fileContent, 'utf8');
    }
};

const runWorkspaceCodeFiles = async ({ codeFiles = [], entryPath = '' }) => {
    const startedAt = Date.now();
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-run-'));

    try {
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

        await writeWorkspaceFiles(workspaceDir, fileEntries);

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
        await fs.rm(workspaceDir, { recursive: true, force: true });
    }
};

module.exports = {
    runWorkspaceCodeFiles,
    splitOutputLines
};
