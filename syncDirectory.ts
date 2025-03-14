const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { glob } = require('glob');
const mime = require('mime-types');
const path = require('path');

interface FolderItem {
    _id: string;
    type: string;
    name: string;
}

type TrainingType = 'qa' | 'chunk';

declare global {
    interface GlobalThis {
        watchedDirectories: string[];
    }
}

const configPath = path.join(__dirname, '..', 'config.json');
const config = require(configPath);
(globalThis as any).watchedDirectories = (globalThis as any).watchedDirectories ?? ([] as string[]);

const client = axios.create({
    baseURL: config.apiEndpoint,
    timeout: 1000 * 60 * 5,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
    },
});

async function handleFileUpload(filePath: string, fileName: string, parentId: string | null, trainingType: string, retryCount: number): Promise<boolean> {
    const mimeType = mime.lookup(fileName);
    if (typeof mimeType === 'string' && mimeType.startsWith('image/')) {
        console.log(`Skipping image file: ${fileName}`);
        return false;
    }

    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    if (['pdf', 'docx', 'md', 'txt', 'html', 'csv'].includes(fileExtension ?? '')) {
        await retryablePostFile(fileName, filePath, parentId, trainingType, retryCount);
    } else {
        const text = fs.readFileSync(filePath, 'utf8');
        await retryablePostText(fileName, text.substring(0, 10 * 1000 * 1000), parentId, trainingType, retryCount);
    }
    console.log(`Uploaded: ${fileName}`);
    return true;
}

async function retryablePostFile(name: string, filePath: string, parentId: string | null, trainingType: string, retryCount: number): Promise<void> {
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    const fileStat = fs.statSync(filePath);
    const encodedName = encodeURIComponent(name);
    formData.append('file', fileStream, { knownLength: fileStat.size, filename: encodedName });
    formData.append('data', JSON.stringify({
        datasetId: config.knowledgeBaseId,
        parentId: parentId,
        name: name,
        trainingType: trainingType,
    }));

    await retryableRequest(() => client.post('/api/core/dataset/collection/create/localFile', formData, {
        headers: {
            ...formData.getHeaders(),
            'Content-Type': 'multipart/form-data',
        },
    }), retryCount);
}

async function retryablePostText(name: string, text: string, parentId: string | null, trainingType: string, retryCount: number): Promise<void> {
    await retryableRequest(() => client.post('/api/core/dataset/collection/create/text', {
        datasetId: config.knowledgeBaseId,
        parentId: parentId,
        name: name,
        text: text,
        trainingType: trainingType,
    }), retryCount);
}

async function retryableRequest<T>(requestFn: () => Promise<T>, retryCount: number): Promise<T> {
    for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
            return await requestFn();
        } catch (error) {
            if (attempt < retryCount) {
                const delay = 1000 * Math.pow(2, attempt);
                console.log(`Retry attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
    throw new Error('Retry limit exceeded');
}

function getList(page: number, size: number = 10, searchText: string = '', parentId: string | null = null) {
    return client.post('/api/core/dataset/collection/listV2', {
        offset: (page - 1) * size,
        pageSize: size,
        datasetId: config.knowledgeBaseId,
        parentId: parentId,
        searchText: searchText,
    });
}

function postFolder(name: string, parentId: string | null = null) {
    return client.post('/api/core/dataset/collection/create', {
        datasetId: config.knowledgeBaseId,
        parentId: parentId,
        name: name,
        type: 'folder'
    });
}

async function deleteDoc(id: string) {
    return client.delete('/api/core/dataset/collection/delete', {
        params: {
            id: id,
        },
    });
}

interface RemoteFileItem {
    name: string;
    _id: string;
}

async function syncDirectory(directoryPath: string, parentId: string | null, trainingType: string, retryCount: number): Promise<void> {
    const rootFolderName: string = path.basename(directoryPath);
    const rootFolderId: string = await getOrCreateFolder(rootFolderName, parentId, retryCount);
    const remoteFiles = await getList(1, 50, '', rootFolderId);
    const localFiles: string[] = (await glob.sync(`${directoryPath}/*`, { ignore: ['.*'] }) as string[]).filter(file => {
        const fileName = path.basename(file);
        return fileName[0] !== '.' && fileName !== '.' && fileName !== '..';
    });

    const localRelativePaths: string[] = localFiles.map((file: string) => path.relative(path.posix.normalize(directoryPath), path.posix.normalize(file)));

    const remoteFileMap = new Map<string, string>(
        (remoteFiles.data.data.list as RemoteFileItem[]).map((item: RemoteFileItem) => [item.name, item._id])
    );

    for (const [fileName, fileId] of remoteFileMap) {
        if (!localRelativePaths.includes(fileName)) {
            await retryableDelete(fileId as string, retryCount);
        }
    }

    for (const file of localFiles) {
        const relativePath: string = path.relative(path.posix.normalize(directoryPath), path.posix.normalize(file));
        const fileName: string = path.basename(file);
        const parentPath: string = path.dirname(relativePath);
        let currentParentId: string = rootFolderId;

        if (parentPath && parentPath !== '.') {
            const pathSegments: string[] = parentPath.split(path.sep).filter(segment => segment !== '');
            for (const segment of pathSegments) {
                const folderId = await getOrCreateFolder(segment, currentParentId, retryCount);
                currentParentId = folderId;
            }
        }

        if ((await fs.promises.lstat(file)).isDirectory()) {
            const folderId = await getOrCreateFolder(fileName, currentParentId, retryCount);
            await syncDirectory(file, folderId, trainingType, retryCount);
        } else {
            if (await handleFileUpload(file, relativePath, currentParentId, trainingType, retryCount)) {
                console.log(`Uploaded: ${relativePath}`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

async function retryablePostFolder(name: string, parentId: string | null, retryCount: number): Promise<any> {
    return await retryableRequest(() => postFolder(name, parentId), retryCount);
}

async function retryableDelete(fileId: string, retryCount: number): Promise<void> {
    await retryableRequest(() => deleteDoc(fileId), retryCount);
}

async function getOrCreateFolder(folderName: string, parentId: string | null, retryCount: number): Promise<string> {
    const res = await getList(1, 10, '', parentId);
    const existingFolder = res.data.data.list.find((item: FolderItem) => item.type === 'folder' && item.name === folderName);
    if (existingFolder) {
        return existingFolder._id;
    } else {
        const res = await retryablePostFolder(folderName, parentId, retryCount);
        return res.data.data;
    }
}

async function syncFileOrDirectory(filePath: string, parentId: string | null, trainingType: string, retryCount: number): Promise<void> {
    if ((await fs.promises.lstat(filePath)).isDirectory()) {
        const folderName: string = path.basename(filePath);
        const folderId: string = await getOrCreateFolder(folderName, parentId, retryCount);
        await syncDirectory(filePath, folderId, trainingType, retryCount);
    } else {
        const fileName: string = path.basename(filePath);
        if (await handleFileUpload(filePath, fileName, parentId, trainingType, retryCount)) {
            console.log(`Uploaded: ${fileName}`);
        }
    }
}

let watchersMap = new Map<string, () => void>();
function watchDirectoryChanges(directoryPath: string, parentId: string | null, trainingType: string, retryCount: number): void {
    if (watchersMap.has(directoryPath)) {
        return;
    }
    console.log(`Watching ${directoryPath} for changes...`);
    const processedItems: { [key: string]: boolean } = {};
    const syncDelay = 1000 * 1;

    function scheduleSync(filename: string) {
        setTimeout(async () => {
            if (!processedItems[filename]) {
                const fullPath = `${directoryPath}/${filename}`;
                if (fs.existsSync(fullPath)) {
                    await syncFileOrDirectory(fullPath, parentId, trainingType, retryCount);
                }
                processedItems[filename] = true;
            }
        }, syncDelay);
    }

    const watcher = fs.watch(directoryPath, (eventType: string, filename: string | undefined) => {
        if (filename) {
            scheduleSync(filename);
        }
    });
    watchersMap.set(directoryPath, () => watcher.close());
}

export async function startSync(directoryPaths: string[], trainingType: TrainingType, retryCount: number) {
    const uniqueDirs = Array.from(new Set(directoryPaths));
    for (const dir of uniqueDirs) {
        try {
            await syncDirectory(dir, null, trainingType, retryCount);
            if (!watchersMap.has(dir)) {
                console.log(`Starting watcher for ${dir}`);
                watchDirectoryChanges(dir, null, trainingType, retryCount);
            }
        } catch (error) {
            console.error(`Sync failed for directory ${dir}:`, error);
        }
    }
}

export function stopSync() {
    console.log("Stopping sync...");
    for (const [, closer] of watchersMap) {
        closer();
    }
    watchersMap.clear();
}