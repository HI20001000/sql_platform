<script setup>
import { getCurrentInstance, ref } from 'vue'
import { useLoginAnimation } from '../scripts/useLoginAnimation.js'
import { useLoginForm } from '../scripts/useLoginForm.js'

const heroRef = ref(null)
const canvasRef = ref(null)
const router = getCurrentInstance().appContext.config.globalProperties.$router

const {
  activeTab,
  loginEmail,
  loginPassword,
  rememberMe,
  registerEmail,
  registerPassword,
  registerPasswordConfirm,
  registerCode,
  authMessage,
  resendCooldown,
  switchTab,
  handleLogin,
  requestCode,
  handleRegister,
} = useLoginForm({ router })

useLoginAnimation({ heroRef, canvasRef })
</script>

<template>
  <div class="login-page">
    <aside class="login-hero" ref="heroRef">
      <canvas class="hero-canvas" ref="canvasRef" aria-hidden="true"></canvas>
      <div class="hero-content">
        <div class="hero-title-row">
          <img class="logo-image" src="/src/imgs/web_icon.png" alt="InnerAI" />
          <p class="hero-title">AI業務_工作平台_v1.0</p>
        </div>
        <p class="hero-subtitle">以「任務、會議、跟進」為核心的協作管理系統，整合以下能力：</p>
        <ul class="hero-list">
          <li>在「新增任務」建立任務（含跟進內容）</li>
          <li>在「首頁」追蹤當日時間線與待辦</li>
          <li>指派跟進人並更新狀態</li>
          <li>在「上傳會議記錄」整理資料</li>
        </ul>
      </div>
    </aside>

    <section class="login-panel">
      <header class="panel-header">
        <p class="panel-title">{{ activeTab === 'login' ? '歡迎回來' : '建立新帳號' }}</p>
        <p class="panel-subtitle">請輸入你的帳號資訊以繼續。</p>
      </header>

      <div class="tab-group">
        <button
          type="button"
          :class="['tab', { active: activeTab === 'login' }]"
          @click="switchTab('login')"
        >
          登入
        </button>
        <button
          type="button"
          :class="['tab', { active: activeTab === 'register' }]"
          @click="switchTab('register')"
        >
          註冊
        </button>
      </div>

      <template v-if="activeTab === 'login'">
        <form class="login-form" @submit.prevent="handleLogin">
          <div class="form-grid">
            <label class="field">
              <span>電子郵件</span>
              <input
                v-model="loginEmail"
                type="email"
                placeholder="name@company.com"
              />
            </label>

            <label class="field">
              <span>密碼</span>
              <input v-model="loginPassword" type="password" placeholder="••••••••" />
            </label>
          </div>

          <div class="helper-row">
            <label class="checkbox">
              <input v-model="rememberMe" type="checkbox" />
              <span>記住我</span>
            </label>
            <a class="link" href="#">忘記密碼？</a>
          </div>

          <button class="primary-button" type="submit">登入帳號</button>
        </form>
      </template>

      <template v-else>
        <form class="login-form" @submit.prevent="handleRegister">
          <div class="form-grid">
            <label class="field">
              <span>電子郵件</span>
              <input
                v-model="registerEmail"
                type="email"
                placeholder="name@company.com"
              />
            </label>

            <label class="field">
              <span>密碼</span>
              <input v-model="registerPassword" type="password" placeholder="••••••••" />
            </label>

            <label class="field">
              <span>確認密碼</span>
              <input
                v-model="registerPasswordConfirm"
                type="password"
                placeholder="再次輸入密碼"
              />
            </label>

            <div class="field">
              <span>郵件驗證</span>
              <div class="code-row">
                <input v-model="registerCode" type="text" placeholder="輸入驗證碼" />
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="resendCooldown > 0"
                  @click="requestCode"
                >
                  {{ resendCooldown > 0 ? `再次發送 (${resendCooldown}s)` : '取得驗證碼' }}
                </button>
              </div>
            </div>
          </div>

          <button class="primary-button" type="submit">建立帳號</button>
        </form>
      </template>

      <p v-if="authMessage" class="auth-message">{{ authMessage }}</p>

      <p class="switch-text">
        {{ activeTab === 'login' ? '還沒有帳號？' : '已經有帳號？' }}
        <button
          class="link-button"
          type="button"
          @click="switchTab(activeTab === 'login' ? 'register' : 'login')"
        >
          {{ activeTab === 'login' ? '免費註冊' : '立即登入' }}
        </button>
      </p>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  background: #f6f7fb;
}

.login-hero {
  position: relative;
  background: #0b1220;
  color: #fff;
  padding: 5rem 8vw;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
}

.hero-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.9;
}

.hero-content {
  max-width: 520px;
  display: grid;
  gap: 1.25rem;
  text-align: left;
  position: relative;
  z-index: 2;
}

.hero-title-row {
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
}

.logo-image {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  object-fit: cover;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.35);
}

.hero-title {
  font-size: 2.4rem;
  font-weight: 600;
  margin: 0;
}

.hero-subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
  line-height: 1.6;
}

.hero-list {
  margin: 0;
  padding-left: 1.25rem;
  color: rgba(255, 255, 255, 0.75);
  display: grid;
  gap: 0.6rem;
  font-size: 0.95rem;
}

.login-panel {
  background: #ffffff;
  padding: 4.5rem 10vw;
  display: grid;
  align-content: center;
}

.panel-header {
  margin-bottom: 2rem;
}

.panel-title {
  font-size: 1.7rem;
  font-weight: 600;
  margin: 0;
  color: #0f172a;
}

.panel-subtitle {
  margin: 0.5rem 0 0;
  color: #64748b;
}

.tab-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  background: #f1f5f9;
  border-radius: 14px;
  padding: 0.35rem;
  margin-bottom: 2rem;
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.tab {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  text-align: center;
  border: none;
  background: transparent;
  padding: 0.7rem 1rem;
  border-radius: 12px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab.active {
  background: #ffffff;
  color: #111827;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.form-grid {
  display: grid;
  gap: 1.1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  font-weight: 500;
  color: #111827;
}

.field span {
  font-size: 0.9rem;
  color: #475569;
}

.field input {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background: #fff;
}

.field input::placeholder {
  color: #94a3b8;
}

.code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
}

.field input:focus {
  outline: none;
  border-color: #5b8cff;
  box-shadow: 0 0 0 4px rgba(91, 140, 255, 0.15);
  background: #fff;
}

.helper-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  color: #6b7280;
}

.checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.link {
  color: #5b8cff;
  text-decoration: none;
  font-weight: 500;
}

.primary-button {
  background: #1f2937;
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.2);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.primary-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 18px 30px rgba(15, 23, 42, 0.25);
}

.secondary-button {
  appearance: none;
  min-width: 120px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 0.85rem;
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.secondary-button:hover {
  border-color: #cbd5e1;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
}

.switch-text {
  margin-top: 2rem;
  text-align: center;
  color: #6b7280;
  font-size: 0.95rem;
}

.auth-message {
  margin-top: 1.5rem;
  text-align: center;
  color: #2563eb;
  font-weight: 500;
}

.link-button {
  background: none;
  border: none;
  color: #5b8cff;
  font-weight: 600;
  cursor: pointer;
  margin-left: 0.5rem;
}

@media (min-width: 960px) {
  .login-page {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  }
}

@media (max-width: 640px) {
  .login-page {
    grid-template-columns: minmax(0, 1fr);
  }

  .login-hero {
    padding: 3rem 8vw 2.5rem;
  }

  .login-panel {
    padding: 2.5rem 8vw 3rem;
  }
}
</style>
