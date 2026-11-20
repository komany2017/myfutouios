import * as XLSX from 'xlsx';
import { DateTime } from 'luxon';
import { Filesystem } from '@capacitor/filesystem';
import { Printer } from '@capgo/capacitor-printer';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import {
  getExportDirectory,
  openExportedFile,
  readExportFile,
  getExportFileUri
} from './nativePlatform.js';

/**
 * 导出多个治疗记录到Excel文件
 * 
 * 功能说明：
 * 1. 根据日期范围生成对应的Excel文件名
 * 2. 将多个记录按列排列，日期从左到右
 * 3. 移动端：保存到Documents目录
 * 4. 浏览器端：创建Excel文件并下载
 * 5. 相同日期的数据只更新不新增列
 * 
 * @param {Array} records - 治疗记录数组
 * @returns {Promise<Object>} - 处理结果，包含success、message等字段
 */
/**
 * 按日期范围生成导出文件名（文件名中日期为 YYYYMMDD，无分隔符）
 */
export function buildRangeFileName(startDate, endDate) {
  const compact = s => String(s).replace(/[\/\-]/g, '');
  return `治疗记录_${compact(startDate)}_至_${compact(endDate)}.xlsx`;
}

export async function exportMultipleRecordsToExcel(records, dateRange = null, options = {}) {
  try {
    console.log(`[${new Date().toISOString()}] 开始导出多个治疗记录到Excel文件`);
    // 处理空数据情况
    const hasData = records && records.length > 0;
    
    console.log(`[${new Date().toISOString()}] 处理记录数: ${hasData ? records.length : 0} 条`);
    
    // 步骤1：生成Excel文件名（使用日期范围）
    let startDate, endDate;
    if (dateRange) {
      // 使用传入的日期范围
      startDate = dateRange.startDate;
      endDate = dateRange.endDate;
      console.log(`[${new Date().toISOString()}] 使用传入的日期范围: ${startDate} 至 ${endDate}`);
    } else if (hasData) {
      // 使用数据中的日期范围
      const sortedRecords = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
      startDate = sortedRecords[0].date;
      endDate = sortedRecords[sortedRecords.length - 1].date;
      console.log(`[${new Date().toISOString()}] 使用数据中的日期范围: ${startDate} 至 ${endDate}`);
    } else {
      // 默认使用当前日期（斜杠 YYYY/MM/DD，含今日；早 7 点前归属前一天）
      const pad = n => String(n).padStart(2, '0');
      const endObj = new Date();
      if (endObj.getHours() < 7) endObj.setDate(endObj.getDate() - 1);
      endDate = `${endObj.getFullYear()}/${pad(endObj.getMonth() + 1)}/${pad(endObj.getDate())}`;
      const startObj = new Date(endObj);
      startObj.setDate(startObj.getDate() - 27);
      startDate = `${startObj.getFullYear()}/${pad(startObj.getMonth() + 1)}/${pad(startObj.getDate())}`;
      console.log(`[${new Date().toISOString()}] 使用默认日期范围: ${startDate} 至 ${endDate}`);
    }
    
    // 文件名里日期格式：YYYYMMDD（无分隔符，最安全）
    const fileName = buildRangeFileName(startDate, endDate);
    console.log(`[${new Date().toISOString()}] 生成Excel文件名: ${fileName}`);

    // 步骤2：定义Excel工作表的表头结构
    const headers = [
      ['星期'],                    // 第0行：星期几
      ['日期'],                    // 第1行：治疗日期
      ['血压/心率'],                // 第2行：血压/心率（合并，格式如120/80/75）
      ['体重(不带水)'],            // 第3行：体重
      ['加热袋'],                  // 第4行：加热袋容量
      ['补充袋'],                  // 第5行：补充袋容量
      ['治疗方式'],                // 第6行：IPD/CCPD等
      ['总治疗量'],                // 第7行：总治疗量
      ['治疗时间'],                // 第8行：治疗时长
      ['单次注入量'],              // 第9行：每次注入量
      ['末袋注入量'],              // 第10行：最后注入量
      ['循环次数'],                // 第11行：治疗循环次数
      ['0周期超流量'],             // 第12行：0周期超滤量
      ['机器总超滤量'],            // 第13行：机器总超滤量
      ['日间手工注入量'],          // 第14行：日间手工注入量
      ['日间注入浓度'],            // 第15行：日间注入浓度
      ['手工超滤量'],              // 第16行：手工超滤量
      ['今日总超滤量'],            // 第17行：今日总超滤量（计算值）
      ['饮水量'],                   // 第18行：饮水量
      ['腹透液颜色']                // 第19行：腹透液颜色
    ];

    // 步骤3：创建新的工作簿
    const workbook = XLSX.utils.book_new();
    console.log(`[${new Date().toISOString()}] 创建新的Excel工作簿`);
    
    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    console.log(`[${new Date().toISOString()}] 创建Excel工作表并添加表头`);

    // 步骤4：获取工作表对象
    const sheet = workbook.Sheets['Sheet1'];

    // 步骤5：将工作表转换为二维数组格式，便于操作
    let rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`[${new Date().toISOString()}] 将工作表转换为二维数组格式，便于操作`);

    // 步骤6：定义关键行的索引
    const dateRowIndex = 1;      // 日期在行索引1（第二行）
    const weekdayRowIndex = 0;   // 星期在行索引0（第一行）

    // 步骤7：定义各数据字段对应的行索引
    const indices = {
      bloodPressureHeartRate: 2,     // 血压/心率（合并）
      weight: 3,                     // 体重
      heatingBag: 4,                 // 加热袋
      supplementBag: 5,              // 补充袋
      treatmentMethod: 6,           // 治疗方式
      totalTreatmentVolume: 7,      // 总治疗量
      treatmentTime: 8,              // 治疗时间
      singleInjectionVolume: 9,    // 单次注入量
      lastBagInjectionVolume: 10,    // 末袋注入量
      cycleCount: 11,                // 循环次数
      zeroCircleFlow: 12,            // 0周期超流量
      machineTotalFlow: 13,          // 机器总超滤量
      dayManualInjection: 14,        // 日间手工注入量
      dayInjectionConcentration: 15, // 日间注入浓度
      dayUltrafiltration: 16,        // 日间超滤量
      machinePlusManualFlow: 17,     // 机器+手工总超滤量
      waterIntake: 18,                // 饮水量
      dialysateColor: 19              // 腹透液颜色
    };

    // 步骤8：确保所有行都存在且是有效的数组
    for (let i = 0; i <= indices.waterIntake; i++) {
      if (!rows[i]) {
        rows[i] = [];
      }
    }

    // 步骤9：遍历所有记录并写入Excel
    console.log(`[${new Date().toISOString()}] 开始写入记录到Excel工作表`);
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const targetDate = record.date;
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      const weekday = record.weekday || weekdays[new Date(targetDate).getDay()];

      // 查找目标日期是否已存在
      let targetColumn = -1;

      // 遍历日期行，查找是否已存在相同日期
      if (rows.length > dateRowIndex) {
        for (let j = 1; j < rows[dateRowIndex].length; j++) {
          const cellValue = rows[dateRowIndex][j];
          const cellValueStr = String(cellValue).trim();
          const targetDateStr = String(targetDate).trim();
          
          if (cellValueStr === targetDateStr) {
            targetColumn = j;
            break;
          }
        }
      }

      // 如果没有找到目标日期，创建新列
      if (targetColumn === -1) {
        targetColumn = rows[0] ? rows[0].length : 1;
      }

      // 步骤10：确保所有行都有足够的列数
      rows.forEach((row, rowIndex) => {
        while (row.length <= targetColumn) {
          row.push('');
        }
      });

      // 填写日期和星期
      rows[dateRowIndex][targetColumn] = targetDate;
      rows[weekdayRowIndex][targetColumn] = weekday;

      // 填写数据
      // 血压/心率合并为一行，格式：收缩压/舒张压/心率（如120/80/75）
      rows[indices.bloodPressureHeartRate][targetColumn] = `${record.bloodPressure}/${record.heartRate}`;
      rows[indices.weight][targetColumn] = record.weight;
      rows[indices.heatingBag][targetColumn] = record.heatingBag || '2.5';
      rows[indices.supplementBag][targetColumn] = record.supplementBag || '2.5';
      rows[indices.treatmentMethod][targetColumn] = record.treatmentMethod || 'IPD';
      rows[indices.totalTreatmentVolume][targetColumn] = record.totalTreatmentVolume || '8000';
      rows[indices.treatmentTime][targetColumn] = record.treatmentTime || '10';
      rows[indices.singleInjectionVolume][targetColumn] = record.singleInjectionVolume || '2000';
      rows[indices.lastBagInjectionVolume][targetColumn] = record.lastBagInjectionVolume || '0';
      rows[indices.cycleCount][targetColumn] = record.cycleCount || '4';
      rows[indices.zeroCircleFlow][targetColumn] = record.zeroCircleFlow;
      rows[indices.machineTotalFlow][targetColumn] = record.machineTotalFlow;
      rows[indices.dayManualInjection][targetColumn] = record.dayManualInjection || '2000';
      rows[indices.dayInjectionConcentration][targetColumn] = record.dayInjectionConcentration || '艾烤糊精';
      rows[indices.dayUltrafiltration][targetColumn] = record.dayUltrafiltration;
      rows[indices.machinePlusManualFlow][targetColumn] = record.machinePlusManualFlow;
      rows[indices.waterIntake][targetColumn] = record.waterIntake;
      rows[indices.dialysateColor][targetColumn] = record.dialysateColor || '清亮';
    }
    console.log(`[${new Date().toISOString()}] 所有记录写入完成`);

    // 步骤11：转换二维数组为工作表
    const newWorksheet = XLSX.utils.aoa_to_sheet(rows);
    console.log(`[${new Date().toISOString()}] 将二维数组转换回Excel工作表`);

    // 步骤12：替换原工作表
    workbook.Sheets['Sheet1'] = newWorksheet;
    console.log(`[${new Date().toISOString()}] 更新工作表内容完成`);

    // 步骤13：保存文件
    const isMobile = Capacitor.isNativePlatform();
    let savePath = '';

    // 优先输出带样式的表格，失败时回退到原 SheetJS 格式
    let styledBuffer = null;
    try {
      styledBuffer = await buildStyledWorkbookBuffer(rows);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] 美化样式生成失败，回退原格式: ${error.message}`);
    }

    if (isMobile) {
      // 移动端：保存到应用专属文件目录（无需存储权限）
      console.log(`[${new Date().toISOString()}] 检测到移动平台，准备保存文件到应用文件目录`);
      const excelBuffer = styledBuffer || XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const base64Data = arrayBufferToBase64(excelBuffer);

      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: getExportDirectory(),
        recursive: true
      });

      console.log(`[${new Date().toISOString()}] Excel文件已保存到应用文件目录: ${fileName}`);
      savePath = `应用文件目录/${fileName}`;

      // 保存后用系统能力打开：Android 调起默认表格 App；iOS 走系统分享面板
      if (options.openFile !== false) {
        try {
          const { uri } = await Filesystem.getUri({ path: fileName, directory: getExportDirectory() });
          await openExportedFile(uri, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          console.log(`[${new Date().toISOString()}] 已调用系统能力打开文件: ${uri}`);
        } catch (error) {
          console.warn(`[${new Date().toISOString()}] 自动打开失败（用户可稍后手动打开）: ${error.message}`);
        }
      }
    } else if (styledBuffer) {
      // 浏览器端：带样式直接下载
      const blob = new Blob([styledBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      console.log(`[${new Date().toISOString()}] Excel文件已生成并触发下载: ${fileName}`);
    } else {
      // 浏览器端：直接下载文件
      console.log(`[${new Date().toISOString()}] 检测到浏览器平台，准备生成下载文件`);
      XLSX.writeFile(workbook, fileName);
      console.log(`[${new Date().toISOString()}] Excel文件已生成并触发下载: ${fileName}`);
    }

    return {
      success: true,
      message: isMobile
        ? `数据已成功导出到应用文件目录: ${fileName}`
        : `数据已成功导出到Excel文件: ${fileName}`,
      fileName: fileName,
      savePath: isMobile ? savePath : '',
      recordCount: records ? records.length : 0
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] 导出Excel文件失败，错误: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

/**
 * 将 ArrayBuffer 转换为 Base64 字符串
 * @param {ArrayBuffer} buffer - 要转换的 ArrayBuffer
 * @returns {string} - Base64 字符串
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 用 ExcelJS 生成带样式的表格（行列结构与原来完全一致，只加视觉层）
 * - 冻结首列 + 前两行，横向滚动/翻页时始终看得到「指标名」和「日期」
 * - 打印时每页重复首列与表头行（printTitlesColumn / printTitlesRow）
 */
async function buildStyledWorkbookBuffer(rows) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],
    pageSetup: {
      orientation: 'landscape',
      blackAndWhite: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesColumn: 'A:A',
      printTitlesRow: '1:2',
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      horizontalCentered: true
    }
  });

  const nCols = rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
  const line = { style: 'thin', color: { argb: 'FFBFC7D1' } };
  const border = { top: line, left: line, bottom: line, right: line };

  // 写入数据（列 A 是指标名，B 起是每一天）
  for (let r = 0; r < rows.length; r++) {
    const src = rows[r] || [];
    for (let c = 0; c < nCols; c++) {
      const cell = ws.getCell(r + 1, c + 1);
      const v = src[c];
      cell.value = (v === undefined || v === null) ? '' : v;
      cell.border = border;
      cell.font = { size: 10, name: 'Microsoft YaHei' };
      cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : 'center', wrapText: r < 2 };
      if (r < 2) {
        cell.font = { size: 10, bold: true, name: 'Microsoft YaHei', color: { argb: 'FF1F3A5F' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
      } else if (c === 0) {
        cell.font = { size: 10, bold: true, name: 'Microsoft YaHei', color: { argb: 'FF374151' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
      } else if (c % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFC' } };
      }
    }
  }

  // 紧凑布局：列宽、行高
  for (let c = 1; c <= nCols; c++) {
    ws.getColumn(c).width = c === 1 ? 15 : 8.5;
  }
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;
  for (let r = 3; r <= rows.length; r++) {
    ws.getRow(r).height = 17;
  }

  return wb.xlsx.writeBuffer();
}

/**
 * 把已导出的 Excel 文件转成 HTML 并调起系统打印（带预览）
 * @param {string} fileName Documents 目录下的导出文件名
 */
export async function printExportedExcel(fileName) {
  if (!fileName) throw new Error('请先导出 Excel 文件');

  const { data } = await readExportFile(fileName);
  const wb = XLSX.read(data, { type: 'base64' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Excel 内容为空');

  const table = XLSX.utils.sheet_to_html(ws, { id: 'printTable', editable: false });
  const title = String(fileName).replace(/\.xlsx$/i, '');
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body { font-family: "Microsoft YaHei", Arial, sans-serif; margin: 0; color: #000; background: #fff; }
  h1 { font-size: 14px; text-align: center; margin: 4px 0 8px; color: #000; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  td, th { border: 1px solid #000; padding: 2px 3px; font-size: 9px; text-align: center; word-break: break-all; color: #000; background: #fff; }
  tr:first-child td { font-weight: bold; border-bottom: 2px solid #000; }
  tr:nth-child(2) td { font-weight: bold; }
  td:first-child { font-weight: bold; text-align: left; border-right: 2px solid #000; }
</style></head>
<body><h1>${title}</h1>${table}</body></html>`;

  await Printer.printHtml({ name: title, html });
}

/**
 * 把已导出的 Excel 文件交给系统分享面板（可发送到微信、邮件或另存到其他目录）
 * @param {string} fileName 应用文件目录下的导出文件名
 */
export async function shareExportedFile(fileName) {
  if (!fileName) throw new Error('请先导出 Excel 文件');
  const { uri } = await getExportFileUri(fileName);
  await Share.share({
    title: String(fileName).replace(/\.xlsx$/i, ''),
    files: [uri]
  });
}

/**
 * 从Excel文件导入治疗记录到数据库
 *
 * 功能说明：
 * 1. 读取Excel文件（File对象、ArrayBuffer或base64字符串）
 * 2. 使用动态行索引检测，兼容历史/新文件结构
 * 3. 从每列提取一条记录（列1开始，跳过表头列）
 * 4. 调用saveTreatmentRecord写入数据库（put语义，相同日期覆盖）
 *
 * @param {File|ArrayBuffer|string} fileOrData - Excel文件（File对象、ArrayBuffer或二进制字符串）
 * @param {Function} saveRecord - 数据库保存函数（saveTreatmentRecord）
 * @returns {Promise<Object>} - 导入结果，包含success、count、records字段
 */
export async function importTreatmentRecordsFromExcel(fileOrData, saveRecord) {
  try {
    console.log(`[${new Date().toISOString()}] 开始从Excel文件导入治疗记录`);

    // 步骤1：读取Excel文件为工作簿
    let workbook;
    if (fileOrData instanceof ArrayBuffer) {
      workbook = XLSX.read(fileOrData, { type: 'array' });
    } else if (typeof fileOrData === 'string') {
      // 假定为二进制字符串或base64
      try {
        workbook = XLSX.read(fileOrData, { type: 'binary' });
      } catch (e) {
        workbook = XLSX.read(fileOrData, { type: 'base64' });
      }
    } else if (fileOrData && typeof fileOrData.arrayBuffer === 'function') {
      // File或Blob对象
      const buffer = await fileOrData.arrayBuffer();
      workbook = XLSX.read(buffer, { type: 'array' });
    } else {
      throw new Error('不支持的文件格式，请提供File对象、ArrayBuffer或二进制字符串');
    }

    // 步骤2：获取第一个工作表
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error('Excel文件中未找到工作表');
    }

    // 步骤3：将工作表转换为二维数组
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rows || rows.length === 0) {
      throw new Error('Excel文件内容为空');
    }
    console.log(`[${new Date().toISOString()}] Excel解析完成，共${rows.length}行`);

    // 步骤4：动态检测各数据行的索引（兼容历史/新文件结构）
    const rowLabels = {
      weekday: '星期',
      date: '日期',
      bloodPressureHeartRate: '血压/心率',
      weight: '体重(不带水)',
      heatingBag: '加热袋',
      supplementBag: '补充袋',
      treatmentMethod: '治疗方式',
      totalTreatmentVolume: '总治疗量',
      treatmentTime: '治疗时间',
      singleInjectionVolume: '单次注入量',
      lastBagInjectionVolume: '末袋注入量',
      cycleCount: '循环次数',
      zeroCircleFlow: '0周期超流量',
      machineTotalFlow: '机器总超滤量',
      dayManualInjection: '日间手工注入量',
      dayInjectionConcentration: '日间注入浓度',
      dayUltrafiltration: ['手工超滤量', '日间超滤量'],
      machinePlusManualFlow: ['今日总超滤量', '日总超滤量', '机器+手工总超滤量'],
      waterIntake: '饮水量',
      dialysateColor: '腹透液颜色'
    };

    const indices = {};
    const usedRows = new Set();
    Object.keys(rowLabels).forEach(key => {
      const labels = [].concat(rowLabels[key]);
      let found = -1;
      for (let i = 0; i < rows.length; i++) {
        if (usedRows.has(i)) continue;
        const cellLabel = String(rows[i] && rows[i][0] !== undefined ? rows[i][0] : '').trim();
        if (labels.includes(cellLabel)) { found = i; usedRows.add(i); break; }
      }
      indices[key] = found;
    });
    // 兼容旧文件：如果没有"血压/心率"行，使用"血压"行作为 fallback
    let legacyHeartRateIdx = -1;
    if (indices.bloodPressureHeartRate === -1) {
      for (let i = 0; i < rows.length; i++) {
        if (usedRows.has(i)) continue;
        const cellLabel = String(rows[i] && rows[i][0] !== undefined ? rows[i][0] : '').trim();
        if (cellLabel === '血压') {
          indices.bloodPressureHeartRate = i;
          usedRows.add(i);
          break;
        }
      }
      // 旧文件中查找"心率"行
      for (let i = 0; i < rows.length; i++) {
        if (usedRows.has(i)) continue;
        const cellLabel = String(rows[i] && rows[i][0] !== undefined ? rows[i][0] : '').trim();
        if (cellLabel === '心率') {
          legacyHeartRateIdx = i;
          usedRows.add(i);
          break;
        }
      }
    }

    // 必须有日期行才能导入
    if (indices.date === -1) {
      throw new Error('Excel文件中未找到"日期"行，无法识别数据格式');
    }
    console.log(`[${new Date().toISOString()}] 行索引检测完成: 日期=${indices.date}, 血压/心率=${indices.bloodPressureHeartRate}, 饮水量=${indices.waterIntake}`);

    // 步骤5：从每列提取记录（从列1开始，跳过表头列0）
    const dateRow = rows[indices.date] || [];
    const records = [];
    const numericFields = ['heartRate', 'weight', 'zeroCircleFlow', 'machineTotalFlow',
      'dayManualInjection', 'dayUltrafiltration', 'machinePlusManualFlow', 'waterIntake'];

    for (let col = 1; col < dateRow.length; col++) {
      const rawDate = dateRow[col];
      if (rawDate === undefined || rawDate === null || rawDate === '') continue;

      // 统一归一化：Excel 可能返回日期序列号数字、横杠字符串、斜杠字符串
      let dateValue;
      if (typeof rawDate === 'number') {
        // Excel 日期序列号 → JavaScript Date → 斜杠 YYYY/MM/DD
        const d = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
          const p = n => String(n).padStart(2, '0');
          dateValue = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
        } else {
          dateValue = String(rawDate).trim();
        }
      } else {
        dateValue = String(rawDate).trim()
          .replace(/\./g, '/')      // 2026.10.23 → 2026/10/23
          .replace(/-/g, '/');      // 2026-10-23 → 2026/10/23
      }

      const getValue = (key) => {
        const idx = indices[key];
        if (idx === -1 || !rows[idx]) return '';
        const val = rows[idx][col];
        return val !== undefined && val !== null ? val : '';
      };

      // 解析血压/心率：新格式"120/80/75"或旧格式"120/80"+独立心率行
      const combinedBP = String(getValue('bloodPressureHeartRate') || '').trim();
      let bloodPressure = '';
      let heartRate = '';
      if (combinedBP) {
        const parts = combinedBP.split('/');
        if (parts.length === 3) {
          // 新格式：收缩压/舒张压/心率
          bloodPressure = `${parts[0]}/${parts[1]}`;
          heartRate = parts[2];
        } else if (parts.length === 2) {
          // 旧格式：收缩压/舒张压，心率在独立行
          bloodPressure = combinedBP;
          if (legacyHeartRateIdx !== -1 && rows[legacyHeartRateIdx]) {
            heartRate = rows[legacyHeartRateIdx][col] !== undefined ? rows[legacyHeartRateIdx][col] : '';
          }
        } else {
          bloodPressure = combinedBP;
        }
      }

      const record = {
        date: dateValue,
        weekday: String(getValue('weekday') || ''),
        bloodPressure: bloodPressure,
        heartRate: heartRate,
        weight: getValue('weight'),
        heatingBag: String(getValue('heatingBag') || ''),
        supplementBag: String(getValue('supplementBag') || ''),
        treatmentMethod: String(getValue('treatmentMethod') || ''),
        totalTreatmentVolume: String(getValue('totalTreatmentVolume') || ''),
        treatmentTime: String(getValue('treatmentTime') || ''),
        singleInjectionVolume: String(getValue('singleInjectionVolume') || ''),
        lastBagInjectionVolume: String(getValue('lastBagInjectionVolume') || ''),
        cycleCount: String(getValue('cycleCount') || ''),
        zeroCircleFlow: getValue('zeroCircleFlow'),
        machineTotalFlow: getValue('machineTotalFlow'),
        dayManualInjection: getValue('dayManualInjection'),
        dayInjectionConcentration: String(getValue('dayInjectionConcentration') || ''),
        dayUltrafiltration: getValue('dayUltrafiltration'),
        machinePlusManualFlow: getValue('machinePlusManualFlow'),
        waterIntake: getValue('waterIntake'),
        dialysateColor: String(getValue('dialysateColor') || ''),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 数值字段转换
      numericFields.forEach(field => {
        if (record[field] !== '' && record[field] !== undefined && record[field] !== null) {
          const num = Number(record[field]);
          record[field] = isNaN(num) ? record[field] : num;
        }
      });

      records.push(record);
    }

    console.log(`[${new Date().toISOString()}] 从Excel提取到${records.length}条记录`);

    if (records.length === 0) {
      return {
        success: true,
        count: 0,
        records: [],
        message: 'Excel文件中未找到有效记录'
      };
    }

    // 步骤6：保存记录到数据库（put语义，相同日期覆盖）
    let savedCount = 0;
    const failedRecords = [];
    for (let i = 0; i < records.length; i++) {
      try {
        await saveRecord(records[i]);
        savedCount++;
      } catch (e) {
        console.error(`[${new Date().toISOString()}] 保存第${i + 1}条记录失败，日期: ${records[i].date}，错误: ${e.message}`);
        failedRecords.push({ date: records[i].date, error: e.message });
      }
    }

    console.log(`[${new Date().toISOString()}] 导入完成，成功${savedCount}条，失败${failedRecords.length}条`);

    return {
      success: true,
      count: savedCount,
      total: records.length,
      records: records,
      failed: failedRecords,
      message: `成功导入${savedCount}条记录${failedRecords.length > 0 ? `，${failedRecords.length}条失败` : ''}`
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] 导入Excel文件失败: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}
