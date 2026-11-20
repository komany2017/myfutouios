import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { Share } from '@capacitor/share';

/**
 * 原生平台适配层
 * ------------------------------------------------------------------
 * 统一处理 Android / iOS 之间文件目录与「打开文件」方式的差异：
 *  - 目录：Capacitor 中 EXTERNAL 在 iOS 上会映射到 Documents，两端都能用。
 *    这里封装成一个函数，便于将来针对 iOS 调整（如需规避 iCloud 备份可切 LibraryNoCloud）。
 *  - 打开文件：Android 用 FileOpener 调起默认表格 App；iOS 上 FileOpener 依赖
 *    Info.plist 注册 CFBundleDocumentTypes，对 xlsx 不可靠，改用系统分享面板（Share），
 *    用户可选择「存储到文件」或用 Numbers/WPS/微信等打开。
 */

export const PLATFORM = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
export const IS_IOS = PLATFORM === 'ios';
export const IS_ANDROID = PLATFORM === 'android';
export const IS_NATIVE = IS_IOS || IS_ANDROID;

/** 平台中文名，用于界面展示 */
export const PLATFORM_LABEL = IS_IOS ? 'iOS' : IS_ANDROID ? 'Android' : 'Web';

/** 导出/备份文件的可写目录（两端通用，集中管理便于维护） */
export function getExportDirectory() {
  return Directory.External; // iOS 上由 Capacitor 自动映射到 Documents
}

/** 平台友好的「文件所在位置」文案 */
export function getExportLocationText() {
  if (IS_IOS) return '应用「文件」目录（可在「文件」App 中找到）';
  if (IS_ANDROID) return `Android/data/${'com.komany.futou'}/files（应用专属目录）`;
  return '浏览器下载目录';
}

/**
 * 用系统能力打开一个已导出的文件。
 * @param {string} uri      Filesystem.getUri 得到的文件 URI
 * @param {string} fileName 文件名
 * @param {string} contentType MIME 类型
 */
export async function openExportedFile(uri, fileName, contentType) {
  if (IS_IOS) {
    // iOS：用系统分享面板，用户可选择用 Numbers / WPS / 存储到文件等方式打开
    await Share.share({
      title: String(fileName).replace(/\.xlsx$/i, ''),
      files: [uri]
    });
  } else {
    // Android：调起默认表格应用
    await FileOpener.open({
      filePath: uri,
      contentType: contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      openWithDefault: true
    });
  }
}

/**
 * 读取某目录下文件列表的封装（仅原生平台调用）
 */
export async function readExportDir() {
  return Filesystem.readdir({ path: '', directory: getExportDirectory() });
}

/**
 * 读取导出目录下某个文件（返回 base64）
 */
export async function readExportFile(path) {
  return Filesystem.readFile({ path, directory: getExportDirectory() });
}

/**
 * 写入导出目录下的文件（base64）
 */
export async function writeExportFile(path, data) {
  return Filesystem.writeFile({ path, data, directory: getExportDirectory(), recursive: true });
}

/**
 * 获取导出目录下某文件的系统 URI
 */
export async function getExportFileUri(path) {
  return Filesystem.getUri({ path, directory: getExportDirectory() });
}

/**
 * 定位 SQLite 数据库文件的真实位置（供备份/恢复使用）
 * ------------------------------------------------------------------
 * Android：插件把库放在 /data/data/<pkg>/databases，而 Directory.Data 指向
 *          /data/data/<pkg>/files，所以库在 ../databases/<file>（原逻辑，已验证）。
 * iOS：插件默认把库放在 Documents/<file>（Directory.Data 在 iOS 即 Documents）；
 *      若配置了 iosDatabaseLocation，则可能在 Library/CapacitorDatabase 下。
 *      各 iOS 版本/插件版本行为不完全一致，因此按候选顺序探测，返回第一个真实
 *      存在的位置；恢复时若都不存在，用第一个候选作为写入目标。
 *
 * @param {string} dbFileName 数据库文件名（如 futou_record_dbSQLite.db）
 * @returns {Promise<{path: string, directory: string, source: string}>}
 */
export async function locateDatabaseFile(dbFileName) {
  if (IS_ANDROID) {
    return { path: `../databases/${dbFileName}`, directory: Directory.Data, source: 'android-databases' };
  }

  if (IS_IOS) {
    const candidates = [
      { path: dbFileName, directory: Directory.Documents, source: 'ios-documents' },
      { path: `CapacitorDatabase/${dbFileName}`, directory: Directory.Library, source: 'ios-library-capacitor' },
      { path: dbFileName, directory: Directory.Library, source: 'ios-library' },
      { path: dbFileName, directory: Directory.Data, source: 'ios-data' }
    ];
    for (const c of candidates) {
      try {
        const stat = await Filesystem.stat({ path: c.path, directory: c.directory });
        if (stat && stat.size > 0) return c;
      } catch (e) {
        // 该候选不存在，继续下一个
      }
    }
    // 都没找到：返回首选候选，让调用方写入/提示
    return candidates[0];
  }

  // Web：抛错，由调用方处理
  throw new Error('当前平台不支持数据库文件备份/恢复');
}

/**
 * 删除数据库可能残留的 WAL/SHM 日志（路径需与 locateDatabaseFile 返回的一致）
 */
export async function clearDatabaseJournal(dbLocation) {
  for (const suffix of ['-wal', '-shm']) {
    try {
      await Filesystem.deleteFile({ path: `${dbLocation.path}${suffix}`, directory: dbLocation.directory });
    } catch (e) {
      // 文件可能本来就不存在，忽略
    }
  }
}
