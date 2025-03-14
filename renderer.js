const { ipcRenderer } = require('electron');

function selectDirectories() {
    ipcRenderer.invoke('select-directory').then(filePaths => {
        document.getElementById('directories').value = filePaths.join(',');
    });
}

async function initializeConfig() {
    try {
        const configContent = require('fs').readFileSync('config.json', 'utf8');
        const config = JSON.parse(configContent);
        document.getElementById('apiEndpoint').value = config.apiEndpoint || '';
        document.getElementById('apiKey').value = config.apiKey || '';
        document.getElementById('knowledgeBaseId').value = config.knowledgeBaseId || '';
        document.getElementById('directories').value = config.directories?.join(',') || '';
        document.getElementById('trainingType').value = config.trainingType || 'qa';
        document.getElementById('retryCount').value = config.retryCount?.toString() || '3';
    } catch (e) {
        alert('配置文件读取失败: ' + e.message);
    }
}

function saveConfig() {
    const config = {
        apiEndpoint: document.getElementById('apiEndpoint').value,
        apiKey: document.getElementById('apiKey').value,
        knowledgeBaseId: document.getElementById('knowledgeBaseId').value,
        directories: document.getElementById('directories').value.split(',').map(d => d.trim()),
        trainingType: document.getElementById('trainingType').value,
        retryCount: parseInt(document.getElementById('retryCount').value)
    };
    require('fs').writeFileSync('config.json', JSON.stringify(config, null, 2));
    alert('配置已保存');
}

document.addEventListener('DOMContentLoaded', initializeConfig);

async function startSync() {
    const syncBtn = document.getElementById('sync-btn');
    const stopBtn = document.getElementById('stop-btn');
    const loading = document.getElementById('loading');
    syncBtn.style.display = 'none';
    syncBtn.disabled = true;
    stopBtn.style.display = 'inline-block';
    loading.style.display = 'block';
    stopBtn.style.display = 'inline-block';
    loading.style.display = 'block';

    const config = {
        directories: document.getElementById('directories').value.split(',').map(d => d.trim()),
        trainingType: document.getElementById('trainingType').value,
        retryCount: parseInt(document.getElementById('retryCount').value)
    };

    ipcRenderer.invoke('start-sync', config);
}

async function stopSync() {
    const result = await ipcRenderer.invoke('stop-sync');
    if (result.success) {
        alert('同步已停止');
        document.getElementById('sync-btn').style.display = 'block';
        document.getElementById('stop-btn').style.display = 'none';
        document.getElementById('loading').style.display = 'none';
    }
}
