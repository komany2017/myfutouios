<template>
  <div class="consent-mask">
    <div class="consent-card">
      <h1 class="title">隐私政策与用户协议</h1>
      <p class="lead">
        欢迎使用「腹透记录」。在开始记录前，请阅读并同意以下内容：
      </p>

      <ul class="points">
        <li>本应用<strong>不收集、不上传</strong>任何个人信息，全部数据仅保存在你的手机本地。</li>
        <li>本应用<strong>不申请</strong>位置、相机、麦克风、通讯录、短信等权限，也不申请「所有文件访问」权限。</li>
        <li>记录的健康数据属于敏感个人信息，仅在设备本地处理，你可随时查看、修改、导出或删除。</li>
        <li>本应用仅用于个人记录，<strong>不提供诊断或治疗建议</strong>，治疗方案请遵医嘱。</li>
      </ul>

      <p class="links">
        请阅读
        <router-link to="/privacy">《隐私政策》</router-link>
        与
        <router-link to="/agreement">《用户协议》</router-link>
        了解完整内容。
      </p>

      <div class="actions">
        <button type="button" class="btn primary" @click="$emit('accept')">同意并继续</button>
        <button type="button" class="btn plain" @click="showDecline = true">不同意</button>
      </div>

      <p v-if="showDecline" class="decline-tip">
        若你不同意，本应用无法处理任何数据，你可以直接关闭应用。你随时可以清除应用数据后重新选择。
      </p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PrivacyConsent',
  data() {
    return { showDecline: false };
  }
};
</script>

<style scoped>
.consent-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #f4f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}
.consent-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 16px;
  padding: 22px 18px 18px;
  box-shadow: 0 8px 30px rgba(31, 42, 55, 0.1);
}
.title {
  margin: 0 0 12px;
  font-size: 17px;
  font-weight: 600;
  color: #1f2a37;
  text-align: center;
}
.lead {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.6;
  color: #4b5563;
}
.points {
  margin: 0 0 12px;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
  color: #4b5563;
}
.points li {
  margin-bottom: 6px;
}
.points strong {
  color: #1f2a37;
}
.links {
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.6;
  color: #6b7280;
}
.links a {
  color: #4f7df3;
  text-decoration: none;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.btn {
  height: 44px;
  border-radius: 22px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.btn.primary {
  background: linear-gradient(135deg, #5b7cf7 0%, #7b9bfb 100%);
  color: #fff;
}
.btn.plain {
  background: #f2f4f7;
  color: #6b7280;
}
.decline-tip {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #b45309;
  background: #fffbeb;
  border-radius: 8px;
  padding: 10px 12px;
}
</style>
