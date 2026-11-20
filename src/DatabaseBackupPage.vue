<template>
  <div class="bak-page">
    <header class="head">
      <h1>数据库备份 / 恢复</h1>
      <p class="sub">备份到应用专属文件目录，或从任意目录选择 .db 文件恢复</p>
    </header>

    <div v-if="isIOS" class="ios-tip">
      iOS 上备份会生成数据库文件，可通过下方「分享备份文件」导出到「文件」App 或微信等；恢复时选择之前导出的 .db 文件即可。日常数据备份也更推荐用「数据导入 / 导出」里的 Excel 导出。
    </div>

    <section class="card">
      <div class="card-title">备份数据库</div>
      <label class="field">
        <span>保存位置（应用文件目录下）</span>
        <input v-model="backupPath" type="text" placeholder="备份/futou_record_20261024.db" />
      </label>
      <button type="button" class="btn primary" :disabled="busy" @click="backup">
        {{ busy ? '处理中…' : '备份到应用文件目录' }}
      </button>
      <div class="hint">{{ locationHint }}</div>
      <button v-if="lastBackup" type="button" class="btn plain" :disabled="busy" @click="shareBackup">
        分享备份文件
      </button>
    </section>

    <section class="card">
      <div class="card-title">从文件恢复</div>
      <button type="button" class="btn danger" :disabled="busy" @click="pickFile">
        选择 .db 文件
      </button>
      <input ref="fileInput" type="file" accept=".db,.sqlite,.sqlite3" class="hidden" @change="onFileChange" />
      <div class="hint">恢复会用所选文件整体覆盖当前数据库，原有数据将丢失，请先备份</div>
    </section>

    <section v-if="messages.length" class="card">
      <div class="card-title">执行结果</div>
      <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.type">{{ m.text }}</div>
    </section>

    <section class="card">
      <div class="card-title">当前数据库</div>
      <div class="info">
        <div><span>文件名</span><b>{{ dbFileName }}</b></div>
        <div><span>位置</span><b>{{ dbLocationText }}</b></div>
        <div><span>平台</span><b>{{ platformLabel }}</b></div>
      </div>
    </section>
  </div>
</template>

<script>
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { initSQLite, closeSQLite, checkpointSQLite, DB_FILE_NAME } from './utils/sqliteDb.js';
import {
  IS_NATIVE,
  IS_IOS,
  PLATFORM_LABEL,
  getExportDirectory,
  locateDatabaseFile,
  clearDatabaseJournal
} from './utils/nativePlatform.js';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default {
  name: 'DatabaseBackupPage',
  data() {
    return {
      busy: false,
      backupPath: '',
      lastBackup: '',
      dbFileName: DB_FILE_NAME,
      messages: [],
      isNative: IS_NATIVE,
      isIOS: IS_IOS,
      platformLabel: PLATFORM_LABEL,
      dbLocationText: IS_IOS ? '应用 Documents / Library 私有目录' : '应用私有 databases 目录',
      locationHint: IS_NATIVE
        ? `文件保存在应用专属目录，可通过系统分享发送到其他位置。${PLATFORM_LABEL === 'iOS' ? '在 iOS 上也可通过「文件」App 访问。' : ''}`
        : 'Web 端备份功能不可用，请在原生 App 中使用。'
    };
  },
  created() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
    this.backupPath = `备份/futou_record_${stamp}.db`;
  },
  methods: {
    log(text, type = 'ok') {
      this.messages.push({ text, type });
    },
    safeName(name) {
      return String(name || '').replace(/^[\/\\]+/, '').replace(/\.\./g, '');
    },
    async backup() {
        if (!this.isNative) {
          this.log('备份功能需要原生 App 环境（Android 或 iOS）', 'err');
          return;
        }
      this.busy = true;
      this.messages = [];
      try {
        await initSQLite();
        await checkpointSQLite();
        const target = this.safeName(this.backupPath).trim() || `futou_record_${Date.now()}.db`;

        const dbLocation = await locateDatabaseFile(DB_FILE_NAME);
        const src = await Filesystem.readFile({ path: dbLocation.path, directory: dbLocation.directory });
        await Filesystem.writeFile({
          path: target,
          data: src.data,
          directory: getExportDirectory(),
          recursive: true
        });

        const kb = Math.round((src.data.length * 0.75) / 1024);
        this.lastBackup = target;
        this.log(`备份成功：应用文件目录/${target}（约 ${kb} KB，来源：${dbLocation.source}）`);
      } catch (error) {
        this.log(`备份失败：${error.message}`, 'err');
        console.error(`[${new Date().toISOString()}] 备份数据库失败`, error);
      } finally {
        this.busy = false;
      }
    },
    async shareBackup() {
      if (!this.lastBackup) return;
      try {
        const { uri } = await Filesystem.getUri({ path: this.lastBackup, directory: getExportDirectory() });
        await Share.share({
          title: String(this.lastBackup).split('/').pop(),
          files: [uri]
        });
      } catch (error) {
        this.log(`分享失败：${error.message}`, 'err');
      }
    },
    pickFile() {
      this.$refs.fileInput.click();
    },
    async onFileChange(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      this.busy = true;
      this.messages = [];
      try {
        const buffer = await file.arrayBuffer();
        const header = new TextDecoder().decode(new Uint8Array(buffer).slice(0, 16));
        if (!header.startsWith('SQLite format 3')) {
          throw new Error('不是有效的 SQLite 数据库文件');
        }

        await initSQLite();
        await closeSQLite();

        // 定位数据库真实路径（Android: databases/；iOS: Documents 或 Library，自动探测）
        const dbLocation = await locateDatabaseFile(DB_FILE_NAME);

        await Filesystem.writeFile({
          path: dbLocation.path,
          data: arrayBufferToBase64(buffer),
          directory: dbLocation.directory,
          recursive: true
        });

        // 清掉旧的 WAL/SHM，避免残留在日志文件里的数据覆盖刚恢复的库
        await clearDatabaseJournal(dbLocation);

        this.log(`恢复成功：${file.name}（${Math.round(buffer.byteLength / 1024)} KB，目标：${dbLocation.source}）`);
        this.log('应用即将重新加载以生效…', 'warn');
        setTimeout(() => window.location.reload(), 1200);
      } catch (error) {
        this.log(`恢复失败：${error.message}`, 'err');
        console.error(`[${new Date().toISOString()}] 恢复数据库失败`, error);
        this.busy = false;
      }
    }
  }
};
</script>

<style scoped>
.bak-page {
  min-height: 100vh;
  background: #f2f4f7;
  padding: 16px 14px 40px;
  box-sizing: border-box;
}
.head h1 {
  margin: 0;
  font-size: 20px;
  color: #1f2a37;
}
.head .sub {
  margin: 4px 0 14px;
  font-size: 12px;
  color: #6b7280;
}
.ios-tip {
  background: #fff7e6;
  border: 1px solid #ffd591;
  color: #ad4e00;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  margin-bottom: 14px;
}
.card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.06);
}
.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 10px;
}
.field {
  display: block;
  margin-bottom: 10px;
}
.field span {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}
.field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 13px;
  color: #111827;
  background: #fafafa;
}
.btn {
  width: 100%;
  padding: 11px 0;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  font-size: 14px;
}
.btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.btn.danger {
  background: #fff;
  border-color: #fca5a5;
  color: #b91c1c;
}
.btn.plain {
  background: #f2f4f7;
  border-color: #dfe3e8;
  color: #374151;
  margin-top: 8px;
}
.btn:disabled {
  opacity: 0.6;
}
.hidden {
  display: none;
}
.hint {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: #6b7280;
}
.msg {
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 8px;
  margin-bottom: 6px;
  word-break: break-all;
}
.msg.ok {
  background: #ecfdf5;
  color: #047857;
}
.msg.warn {
  background: #fffbeb;
  color: #b45309;
}
.msg.err {
  background: #fef2f2;
  color: #b91c1c;
}
.info div {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 0;
}
.info span {
  color: #6b7280;
}
.info b {
  color: #111827;
  font-weight: 500;
}
</style>
