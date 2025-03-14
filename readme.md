# Sync FastGPT Dataset

## 项目描述
这是一个用于FastGPT数据集同步的工具，能够帮助用户在不同环境或存储位置之间同步数据集文件。支持增量同步和目录结构维护。

## 快速开始

### 安装依赖
```bash
npm install
```

### 运行项目
```bash
npm start
```

## 目录结构
```
sync-fastgpt-dataset/
├── config.json         # 配置文件
├── index.html          # 前端入口
├── main.js             # 主进程逻辑
├── renderer.js         # 渲染进程代码
├── syncDirectory.ts    # 同步核心逻辑（TypeScript）
├── package.json        # 项目依赖
└── ...
```

## 功能特性
- 跨平台支持（Windows/macOS/Linux）
- 支持增量同步（仅传输变更文件）

## 技术栈
- 主要语言：TypeScript
- 同步算法：基于目录树的差异对比
