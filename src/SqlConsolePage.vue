<template>
  <div class="sql-page">
    <header class="head">
      <h1>SQL 控制台</h1>
      <p class="sub">直接对本地 SQLite 执行语句，改动后会立即生效</p>
    </header>

    <section class="panel">
      <textarea
        v-model="sql"
        class="editor"
        spellcheck="false"
        placeholder="SELECT * FROM treatment_records ORDER BY date DESC LIMIT 10;"
      ></textarea>

      <div class="actions">
        <button type="button" class="btn primary" :disabled="running" @click="execute">
          {{ running ? '执行中…' : '执行' }}
        </button>
        <button type="button" class="btn" :disabled="running" @click="clear">清空</button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">快捷语句</div>
      <div class="presets">
        <button
          v-for="p in presets"
          :key="p.label"
          type="button"
          class="chip"
          :class="{ danger: p.danger }"
          @click="sql = p.sql"
        >
          {{ p.label }}
        </button>
      </div>
    </section>

    <section v-if="messages.length" class="panel">
      <div class="panel-title">执行结果</div>
      <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.type">{{ m.text }}</div>
    </section>

    <section v-if="result" class="panel">
      <div class="panel-title">
        {{ result.title }}
        <span class="count">{{ result.rows.length }} 行</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="c in result.columns" :key="c">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in result.rows" :key="i">
              <td v-for="c in result.columns" :key="c">{{ cell(row[c]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script>
import { initSQLite, getRecordDate, parseRecordDate } from './utils/sqliteDb.js';

export default {
  name: 'SqlConsolePage',
  data() {
    return {
      sql: '',
      running: false,
      messages: [],
      result: null
    };
  },
  computed: {
    presets() {
      const today = getRecordDate();
      const p2 = n => String(n).padStart(2, '0');
      const fmt = d => `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}`;
      const base = parseRecordDate(today) || new Date();
      const start28 = new Date(base);
      start28.setDate(start28.getDate() - 27);
      const start = fmt(start28);

      return [
        // 查询
        { label: '今日记录', sql: `SELECT * FROM treatment_records WHERE date = '${today}';` },
        { label: '今日饮水明细', sql: `SELECT date, time, amount, type FROM water_intake_records WHERE date = '${today}' ORDER BY time;` },
        { label: '今日血压', sql: `SELECT date, time, systolic, diastolic, heartRate FROM bp_measurements WHERE date = '${today}' ORDER BY time;` },
        { label: '今日处方', sql: `SELECT date, time, brand, conc, volumeIn, volumeOut, cycleTotal FROM pd_exchanges WHERE date = '${today}';` },
        { label: '最近10条治疗记录', sql: 'SELECT date, weight, waterIntake, otherIntake, urineOutput, otherOutput FROM treatment_records ORDER BY date DESC LIMIT 10;' },
        { label: '最近10条饮水', sql: 'SELECT date, time, amount, type FROM water_intake_records ORDER BY date DESC, time DESC LIMIT 10;' },
        { label: '各日饮水合计', sql: 'SELECT date, count(*) AS cnt, sum(amount) AS total FROM water_intake_records GROUP BY date ORDER BY date DESC LIMIT 14;' },
        { label: '最近28天饮水', sql: `SELECT date, sum(amount) AS total FROM water_intake_records WHERE date >= '${start}' GROUP BY date ORDER BY date;` },
        { label: '最近28天超滤', sql: `SELECT date, weight, totalTreatmentVolume, urineOutput, dayUltrafiltration FROM treatment_records WHERE date >= '${start}' ORDER BY date;` },
        { label: '表结构', sql: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;" },
        { label: '全部字段', sql: 'PRAGMA table_info(treatment_records);' },
        { label: '数据库统计', sql: "SELECT 'treatment_records' AS t, count(*) AS n FROM treatment_records UNION ALL SELECT 'water_intake_records', count(*) FROM water_intake_records UNION ALL SELECT 'pd_exchanges', count(*) FROM pd_exchanges UNION ALL SELECT 'bp_measurements', count(*) FROM bp_measurements UNION ALL SELECT 'medications', count(*) FROM medications;" },
        // 诊断
        { label: '日期格式检查', sql: "SELECT '治疗记录横杠' AS t, count(*) AS n FROM treatment_records WHERE date LIKE '%-%' UNION ALL SELECT '饮水横杠', count(*) FROM water_intake_records WHERE date LIKE '%-%' UNION ALL SELECT '处方横杠', count(*) FROM pd_exchanges WHERE date LIKE '%-%' UNION ALL SELECT '血压横杠', count(*) FROM bp_measurements WHERE date LIKE '%-%';" },
        { label: '饮水汇总行', sql: "SELECT date, time, amount FROM water_intake_records WHERE time = '汇总' ORDER BY date DESC LIMIT 30;" },
        { label: '继承污染排查', sql: "SELECT a.date AS 日期, a.amount AS 汇总值, (SELECT sum(b.amount) FROM water_intake_records b WHERE b.date = (SELECT max(c.date) FROM water_intake_records c WHERE c.date < a.date) AND b.time <> '汇总') AS 前一日明细合计 FROM water_intake_records a WHERE a.time = '汇总' ORDER BY a.date DESC LIMIT 20;" },
        { label: '重复日期检查', sql: 'SELECT date, count(*) AS n FROM treatment_records GROUP BY date HAVING count(*) > 1;' },
        { label: '记录饮水为空', sql: "SELECT date, waterIntake FROM treatment_records WHERE waterIntake IS NULL OR trim(waterIntake) = '' ORDER BY date DESC LIMIT 20;" },
        { label: '完全空记录', sql: "SELECT date FROM treatment_records WHERE coalesce(trim(weight),'') = '' AND coalesce(trim(waterIntake),'') = '' AND coalesce(trim(urineOutput),'') = '' ORDER BY date DESC LIMIT 20;" },
        { label: '各表条数按日', sql: 'SELECT date, count(*) AS n FROM treatment_records GROUP BY date ORDER BY date DESC LIMIT 28;' },
        // 维护（危险，会立即生效）
        { label: '删今日饮水', danger: true, sql: `DELETE FROM water_intake_records WHERE date = '${today}';` },
        { label: '清今日记录饮水', danger: true, sql: `UPDATE treatment_records SET waterIntake = '' WHERE date = '${today}';` },
        { label: '删今日治疗记录', danger: true, sql: `DELETE FROM treatment_records WHERE date = '${today}';` },
        { label: '横杠改斜杠', danger: true, sql: "UPDATE treatment_records SET date = replace(date, '-', '/') WHERE date LIKE '%-%'; UPDATE water_intake_records SET date = replace(date, '-', '/') WHERE date LIKE '%-%'; UPDATE pd_exchanges SET date = replace(date, '-', '/') WHERE date LIKE '%-%'; UPDATE bp_measurements SET date = replace(date, '-', '/') WHERE date LIKE '%-%'; UPDATE medications SET date = replace(date, '-', '/') WHERE date LIKE '%-%';" },
        { label: '删空记录', danger: true, sql: "DELETE FROM treatment_records WHERE coalesce(trim(weight),'') = '' AND coalesce(trim(waterIntake),'') = '' AND coalesce(trim(urineOutput),'') = '' AND coalesce(trim(otherIntake),'') = '' AND coalesce(trim(otherOutput),'') = '';" },
        { label: '查看修复标记', sql: 'SELECT key, value FROM app_meta;' }
      ];
    }
  },
  methods: {
    cell(v) {
      return v === null || v === undefined ? '' : String(v);
    },
    clear() {
      this.sql = '';
      this.messages = [];
      this.result = null;
    },
    splitStatements(text) {
      return text
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    },
    async execute() {
      const statements = this.splitStatements(this.sql);
      if (statements.length === 0) {
        this.messages = [{ type: 'warn', text: '请输入 SQL 语句' }];
        return;
      }
      this.running = true;
      this.messages = [];
      this.result = null;
      try {
        const db = await initSQLite();
        if (!db) throw new Error('数据库未初始化');

        for (const statement of statements) {
          if (/^\s*select\s|^\s*pragma\s|^\s*with\s/i.test(statement)) {
            const res = await db.query(statement);
            const rows = res.values || [];
            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
            this.result = { title: statement.split('\n')[0].slice(0, 60), rows, columns };
            this.messages.push({ type: 'ok', text: '查询成功，共 ' + rows.length + ' 行' });
          } else {
            const res = await db.run(statement);
            const changes = res && res.changes ? res.changes.changes : 0;
            this.messages.push({
              type: 'ok',
              text: '执行成功，影响 ' + (changes === undefined ? '—' : changes) + ' 行'
            });
          }
        }
      } catch (error) {
        this.messages.push({ type: 'err', text: '执行失败：' + error.message });
      } finally {
        this.running = false;
        console.log(`[${new Date().toISOString()}] SQL 控制台执行: ${this.sql}`);
      }
    }
  }
};
</script>

<style scoped>
.sql-page {
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
.panel {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.06);
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.count {
  font-weight: 400;
  font-size: 12px;
  color: #6b7280;
}
.editor {
  width: 100%;
  min-height: 130px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px;
  font-family: Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #111827;
  background: #fafafa;
  box-sizing: border-box;
  resize: vertical;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.btn {
  flex: 1;
  padding: 10px 0;
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
.btn:disabled {
  opacity: 0.6;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid #dbeafe;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
}
.chip.danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
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
.table-wrap {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}
th,
td {
  border: 1px solid #e5e7eb;
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  color: #111827;
}
th {
  background: #f9fafb;
  color: #374151;
  font-weight: 600;
  position: sticky;
  top: 0;
}
</style>
