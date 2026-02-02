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
          <p class="hero-title">AI 業務平台</p>
        </div>
        <p class="hero-subtitle">請使用您的帳號登入系統。</p>
      </div>
    </aside>

    <section class="login-panel">
      <header class="panel-header">
        <p class="panel-title">歡迎回來</p>
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

.auth-message {
  margin-top: 1.5rem;
  text-align: center;
  color: #2563eb;
  font-weight: 500;
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
